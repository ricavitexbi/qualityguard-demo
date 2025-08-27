'use client'

import React, { useState, useEffect, useRef } from 'react';
import { 
  FileText, AlertTriangle, CheckCircle, TrendingUp, Activity, 
  Download, RefreshCw, AlertCircle, BarChart3, Brain, Zap,
  Database, Bell, Shield, Upload, Save, Check, X,
  ArrowUp, ArrowDown, Clock, ChevronRight, Settings,
  FileSearch, History, Gauge, Server, CloudOff, Wifi, WifiOff,
  TrendingDown, Eye, Filter, Calendar, Search, PlayCircle,
  PauseCircle, AlertOctagon, Info, ChevronDown, BarChart2,
  LineChart, Users, Package, Wrench, Target, Award
} from 'lucide-react';

// ============= SERVIÇOS DE API =============
class QualityControlAPI {
  constructor() {
    this.baseURL = 'http://localhost:5000/api';
    this.wsURL = 'ws://localhost:5000';
    this.ws = null;
    this.listeners = new Map();
    this.connectionStatus = 'connecting';
    this.offlineQueue = [];
  }

  async connect() {
    try {
      const response = await fetch(`${this.baseURL}/health`);
      if (response.ok) {
        this.connectionStatus = 'connected';
        this.setupWebSocket();
        this.processOfflineQueue();
        return true;
      }
    } catch (error) {
      this.connectionStatus = 'offline';
      console.log('Modo offline ativado');
      return false;
    }
  }

  setupWebSocket() {
    this.ws = new WebSocket(this.wsURL);
    
    this.ws.onopen = () => {
      console.log('WebSocket conectado');
      this.notifyListeners('connection', { status: 'connected' });
    };
    
    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      this.notifyListeners(data.type, data.payload);
    };
    
    this.ws.onerror = () => {
      this.connectionStatus = 'offline';
      this.notifyListeners('connection', { status: 'offline' });
    };
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  notifyListeners(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach(callback => callback(data));
    }
  }

  async getHistoricalData(params) {
    if (this.connectionStatus === 'offline') {
      return this.getOfflineData('historical', params);
    }
    
    try {
      const response = await fetch(`${this.baseURL}/measurements/historical`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
      });
      const data = await response.json();
      this.saveOfflineData('historical', params, data);
      return data;
    } catch (error) {
      return this.getOfflineData('historical', params);
    }
  }

  async runPredictiveAnalysis(measurements) {
    if (this.connectionStatus === 'offline') {
      return this.runOfflineAnalysis(measurements);
    }
    
    try {
      const response = await fetch(`${this.baseURL}/ml/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ measurements })
      });
      return await response.json();
    } catch (error) {
      return this.runOfflineAnalysis(measurements);
    }
  }

  async saveToDB(data) {
    if (this.connectionStatus === 'offline') {
      this.offlineQueue.push({ type: 'save', data, timestamp: Date.now() });
      this.saveToIndexedDB(data);
      return { success: true, offline: true };
    }
    
    try {
      const response = await fetch(`${this.baseURL}/measurements/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      return await response.json();
    } catch (error) {
      this.offlineQueue.push({ type: 'save', data, timestamp: Date.now() });
      return { success: true, offline: true };
    }
  }

  async processOfflineQueue() {
    if (this.offlineQueue.length === 0) return;
    
    for (const item of this.offlineQueue) {
      try {
        if (item.type === 'save') {
          await this.saveToDB(item.data);
        }
      } catch (error) {
        console.error('Erro ao processar fila offline:', error);
      }
    }
    this.offlineQueue = [];
  }

  // Análise offline básica
  runOfflineAnalysis(measurements) {
    const analysis = {
      anomalies: [],
      predictions: [],
      recommendations: []
    };
    
    measurements.forEach(m => {
      const deviation = Math.abs((m.value - m.nominal) / m.nominal) * 100;
      if (deviation > 5) {
        analysis.anomalies.push({
          parameter: m.parameter,
          severity: deviation > 10 ? 'HIGH' : 'MEDIUM',
          deviation: deviation.toFixed(2)
        });
      }
      
      if (m.cpk < 1.0) {
        analysis.predictions.push({
          type: 'process_capability',
          parameter: m.parameter,
          message: 'Processo não capaz - risco de não conformidade',
          confidence: 85
        });
      }
    });
    
    return analysis;
  }

  // IndexedDB para modo offline
  async saveToIndexedDB(data) {
    const db = await this.openDB();
    const tx = db.transaction(['measurements'], 'readwrite');
    await tx.objectStore('measurements').add({
      ...data,
      timestamp: Date.now(),
      synced: false
    });
  }

  async openDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('QualityGuardDB', 1);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('measurements')) {
          db.createObjectStore('measurements', { keyPath: 'id', autoIncrement: true });
        }
      };
    });
  }

  saveOfflineData(key, params, data) {
    localStorage.setItem(`qg_${key}_${JSON.stringify(params)}`, JSON.stringify({
      data,
      timestamp: Date.now()
    }));
  }

  getOfflineData(key, params) {
    const stored = localStorage.getItem(`qg_${key}_${JSON.stringify(params)}`);
    if (stored) {
      const { data } = JSON.parse(stored);
      return data;
    }
    return null;
  }
}

const api = new QualityControlAPI();

// ============= COMPONENTES DE ALERTAS =============
const RealTimeAlerts = ({ alerts, onDismiss, onAction }) => {
  const [filter, setFilter] = useState('all');
  
  const filteredAlerts = alerts.filter(alert => {
    if (filter === 'all') return true;
    return alert.severity === filter;
  });
  
  const getSeverityIcon = (severity) => {
    switch(severity) {
      case 'CRITICAL': return <AlertOctagon className="w-5 h-5 text-red-600" />;
      case 'HIGH': return <AlertTriangle className="w-5 h-5 text-orange-600" />;
      case 'MEDIUM': return <AlertCircle className="w-5 h-5 text-yellow-600" />;
      default: return <Info className="w-5 h-5 text-blue-600" />;
    }
  };
  
  const getSeverityColor = (severity) => {
    switch(severity) {
      case 'CRITICAL': return 'bg-red-50 border-red-200';
      case 'HIGH': return 'bg-orange-50 border-orange-200';
      case 'MEDIUM': return 'bg-yellow-50 border-yellow-200';
      default: return 'bg-blue-50 border-blue-200';
    }
  };
  
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center">
            <Bell className="w-5 h-5 mr-2 text-red-500 animate-pulse" />
            Alertas em Tempo Real
            {filteredAlerts.length > 0 && (
              <span className="ml-2 px-2 py-1 text-xs bg-red-100 text-red-700 rounded-full">
                {filteredAlerts.length}
              </span>
            )}
          </h3>
          <div className="flex items-center space-x-2">
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="text-sm border-gray-300 rounded-lg"
            >
              <option value="all">Todos</option>
              <option value="CRITICAL">Crítico</option>
              <option value="HIGH">Alto</option>
              <option value="MEDIUM">Médio</option>
              <option value="LOW">Baixo</option>
            </select>
          </div>
        </div>
      </div>
      
      <div className="max-h-96 overflow-y-auto">
        {filteredAlerts.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <CheckCircle className="w-12 h-12 mx-auto mb-3 text-green-500" />
            <p>Nenhum alerta ativo</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {filteredAlerts.map((alert) => (
              <div key={alert.id} className={`p-4 ${getSeverityColor(alert.severity)}`}>
                <div className="flex items-start space-x-3">
                  {getSeverityIcon(alert.severity)}
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-medium text-gray-900">{alert.title}</h4>
                      <span className="text-xs text-gray-500">{alert.timestamp}</span>
                    </div>
                    <p className="text-sm text-gray-600 mt-1">{alert.message}</p>
                    
                    {alert.predictions && (
                      <div className="mt-2 p-2 bg-white bg-opacity-50 rounded">
                        <p className="text-xs font-medium text-purple-700">
                          Predição ML: {alert.predictions.message}
                        </p>
                        <p className="text-xs text-purple-600">
                          Confiança: {alert.predictions.confidence}%
                        </p>
                      </div>
                    )}
                    
                    {alert.suggestedActions && (
                      <div className="mt-2">
                        <p className="text-xs font-medium text-gray-700 mb-1">Ações Sugeridas:</p>
                        <ul className="text-xs text-gray-600 space-y-1">
                          {alert.suggestedActions.map((action, idx) => (
                            <li key={idx} className="flex items-center">
                              <ChevronRight className="w-3 h-3 mr-1" />
                              {action}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    
                    <div className="mt-3 flex items-center space-x-2">
                      <button
                        onClick={() => onAction(alert)}
                        className="text-xs px-3 py-1 bg-white rounded border border-gray-300 hover:bg-gray-50"
                      >
                        Tomar Ação
                      </button>
                      <button
                        onClick={() => onDismiss(alert.id)}
                        className="text-xs text-gray-500 hover:text-gray-700"
                      >
                        Dispensar
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ============= COMPONENTE DE ANÁLISE HISTÓRICA =============
const HistoricalAnalysis = ({ data, onRefresh }) => {
  const [timeRange, setTimeRange] = useState('7d');
  const [loading, setLoading] = useState(false);
  
  const handleRefresh = async () => {
    setLoading(true);
    await onRefresh(timeRange);
    setLoading(false);
  };
  
  if (!data) return null;
  
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-gray-900 flex items-center">
          <Database className="w-5 h-5 mr-2" />
          Análise Histórica Local
        </h3>
        <div className="flex items-center space-x-3">
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value)}
            className="text-sm border-gray-300 rounded-lg"
          >
            <option value="24h">Últimas 24h</option>
            <option value="7d">Últimos 7 dias</option>
            <option value="30d">Últimos 30 dias</option>
            <option value="90d">Últimos 90 dias</option>
          </select>
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="p-2 hover:bg-gray-100 rounded-lg disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>
      
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-blue-50 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <BarChart3 className="w-8 h-8 text-blue-600" />
            <span className="text-xs text-blue-600">+12%</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{data.totalMeasurements?.toLocaleString()}</p>
          <p className="text-sm text-gray-600">Total Medições</p>
          <p className="text-xs text-blue-600 mt-1">100% dados locais</p>
        </div>
        
        <div className="bg-green-50 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <Gauge className="w-8 h-8 text-green-600" />
            <TrendingUp className="w-4 h-4 text-green-500" />
          </div>
          <p className="text-2xl font-bold text-gray-900">{data.avgCpk?.toFixed(2)}</p>
          <p className="text-sm text-gray-600">Cpk Médio</p>
          <p className="text-xs text-green-600 mt-1">Processo capaz</p>
        </div>
        
        <div className="bg-purple-50 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <Brain className="w-8 h-8 text-purple-600" />
            <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded">ML</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{data.predictions?.length || 0}</p>
          <p className="text-sm text-gray-600">Predições Ativas</p>
          <p className="text-xs text-purple-600 mt-1">Modelo atualizado</p>
        </div>
        
        <div className="bg-red-50 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <AlertTriangle className="w-8 h-8 text-red-600" />
            <span className="text-xs text-red-600">Ação</span>
          </div>
          <p className="text-2xl font-bold text-red-600">{data.anomalies?.length || 0}</p>
          <p className="text-sm text-gray-600">Anomalias</p>
          <p className="text-xs text-red-600 mt-1">Requer atenção</p>
        </div>
      </div>
      
      {/* Gráfico de Controle */}
      <div className="bg-gray-50 rounded-lg p-4">
        <h4 className="text-sm font-medium text-gray-700 mb-3">Gráfico de Controle - Últimas 100 Medições</h4>
        <ControlChart data={data.controlChartData} />
      </div>
      
      {/* Predições ML */}
      {data.predictions && data.predictions.length > 0 && (
        <div className="mt-6 bg-purple-50 border border-purple-200 rounded-lg p-4">
          <div className="flex items-start space-x-3">
            <Brain className="w-5 h-5 text-purple-600 mt-0.5" />
            <div className="flex-1">
              <h4 className="font-medium text-purple-900">Predições Baseadas em ML</h4>
              <div className="mt-2 space-y-2">
                {data.predictions.map((pred, idx) => (
                  <div key={idx} className="flex items-center justify-between">
                    <p className="text-sm text-purple-700">
                      {pred.parameter}: {pred.prediction}
                    </p>
                    <span className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded">
                      {pred.confidence}% confiança • {pred.basedOn}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ============= COMPONENTE DE GRÁFICO DE CONTROLE =============
const ControlChart = ({ data }) => {
  if (!data || data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-gray-400">
        <LineChart className="w-8 h-8 mr-2" />
        <span>Aguardando dados...</span>
      </div>
    );
  }
  
  // Cálculo de limites de controle
  const values = data.map(d => d.value);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const stdDev = Math.sqrt(values.map(x => Math.pow(x - mean, 2)).reduce((a, b) => a + b) / values.length);
  const ucl = mean + 3 * stdDev;
  const lcl = mean - 3 * stdDev;
  
  const maxValue = Math.max(...values, ucl);
  const minValue = Math.min(...values, lcl);
  const range = maxValue - minValue;
  
  return (
    <div className="relative h-64">
      <svg className="w-full h-full">
        {/* Grid */}
        <defs>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#e5e7eb" strokeWidth="1"/>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
        
        {/* Limites de controle */}
        <line 
          x1="0" 
          y1={`${((maxValue - ucl) / range) * 100}%`}
          x2="100%" 
          y2={`${((maxValue - ucl) / range) * 100}%`}
          stroke="#ef4444" 
          strokeDasharray="5,5" 
          strokeWidth="2"
        />
        <line 
          x1="0" 
          y1={`${((maxValue - mean) / range) * 100}%`}
          x2="100%" 
          y2={`${((maxValue - mean) / range) * 100}%`}
          stroke="#10b981" 
          strokeWidth="2"
        />
        <line 
          x1="0" 
          y1={`${((maxValue - lcl) / range) * 100}%`}
          x2="100%" 
          y2={`${((maxValue - lcl) / range) * 100}%`}
          stroke="#ef4444" 
          strokeDasharray="5,5" 
          strokeWidth="2"
        />
        
        {/* Linha de dados */}
        <polyline
          fill="none"
          stroke="#3b82f6"
          strokeWidth="2"
          points={data.map((d, i) => 
            `${(i / (data.length - 1)) * 100}%,${((maxValue - d.value) / range) * 100}%`
          ).join(' ')}
        />
        
        {/* Pontos de dados */}
        {data.map((d, i) => {
          const isOutOfControl = d.value > ucl || d.value < lcl;
          return (
            <circle
              key={i}
              cx={`${(i / (data.length - 1)) * 100}%`}
              cy={`${((maxValue - d.value) / range) * 100}%`}
              r="4"
              fill={isOutOfControl ? '#ef4444' : '#3b82f6'}
              stroke="white"
              strokeWidth="2"
            />
          );
        })}
      </svg>
      
      {/* Labels */}
      <div className="absolute top-0 right-0 text-xs text-gray-500">
        UCL: {ucl.toFixed(3)}
      </div>
      <div className="absolute top-1/2 right-0 text-xs text-gray-500">
        Média: {mean.toFixed(3)}
      </div>
      <div className="absolute bottom-0 right-0 text-xs text-gray-500">
        LCL: {lcl.toFixed(3)}
      </div>
    </div>
  );
};

// ============= COMPONENTE PRINCIPAL =============
const QualityGuardAI = () => {
  const [currentView, setCurrentView] = useState('dashboard');
  const [connectionStatus, setConnectionStatus] = useState('checking');
  const [qualityData, setQualityData] = useState(null);
  const [historicalData, setHistoricalData] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [exportStatus, setExportStatus] = useState('idle');
  const [showExportModal, setShowExportModal] = useState(false);
  const [selectedMeasurements, setSelectedMeasurements] = useState([]);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastSync, setLastSync] = useState(null);
  
  // Mock data inicial
  const mockQualityData = {
    current: {
      pdfFile: 'QG1_MOTOR_DIESEL_HD_T1_26072025.pdf',
      timestamp: new Date().toLocaleString('pt-BR'),
      qualityGate: 'QG-1',
      productType: 'Motor Diesel HD 2.8L',
      serialNumber: 'SCA-2507-M-0847',
      batchId: 'LOTE-2607-001',
      operator: 'João Silva - ID: 4521',
      shift: 'Turno 1 (06:00-14:00)',
      measurements: [
        {
          id: 'DIM001',
          parameter: 'Diâmetro do Eixo Principal',
          category: 'Dimensional',
          value: 25.083,
          nominal: 25.000,
          upperLimit: 25.050,
          lowerLimit: 24.950,
          status: 'warning',
          cpk: 1.12,
          exported: false
        },
        {
          id: 'DIM002',
          parameter: 'Comprimento Total do Bloco',
          category: 'Dimensional',
          value: 150.124,
          nominal: 150.000,
          upperLimit: 150.200,
          lowerLimit: 149.800,
          status: 'ok',
          cpk: 1.89,
          exported: false
        },
        {
          id: 'ANG001',
          parameter: 'Ângulo de Inclinação',
          category: 'Angular',
          value: 89.200,
          nominal: 90.000,
          upperLimit: 90.500,
          lowerLimit: 89.500,
          status: 'critical',
          cpk: 0.87,
          exported: false
        },
        {
          id: 'DIM003',
          parameter: 'Diâmetro do Furo Central',
          category: 'Dimensional',
          value: 8.152,
          nominal: 8.000,
          upperLimit: 8.080,
          lowerLimit: 7.920,
          status: 'critical',
          cpk: 0.65,
          exported: false
        },
        {
          id: 'SUP001',
          parameter: 'Rugosidade Superficial Ra',
          category: 'Superfície',
          value: 1.2,
          nominal: 1.5,
          upperLimit: 1.8,
          lowerLimit: 0.8,
          status: 'ok',
          cpk: 2.15,
          exported: false
        }
      ]
    },
    statistics: {
      totalInspected: 15420,
      passRate: 94.2,
      avgCpk: 1.33,
      trendsDetected: 3,
      criticalAlerts: 2,
      dbSyncStatus: 'connected',
      lastSync: new Date().toLocaleString('pt-BR'),
      pendingExports: 12
    }
  };
  
  // Mock de dados históricos
  const mockHistoricalData = {
    totalMeasurements: 487293,
    avgCpk: 1.35,
    predictions: [
      {
        parameter: 'Ângulo de Inclinação',
        prediction: 'Saída de especificação em 3 turnos',
        confidence: 89,
        basedOn: '1,247 medições similares'
      },
      {
        parameter: 'Diâmetro do Furo Central',
        prediction: 'Desgaste crítico em ~150 peças',
        confidence: 92,
        basedOn: '3,891 casos históricos'
      }
    ],
    anomalies: [
      { parameter: 'DIM003', severity: 'HIGH', deviation: '9.1%' },
      { parameter: 'ANG001', severity: 'MEDIUM', deviation: '6.3%' }
    ],
    controlChartData: Array.from({ length: 100 }, (_, i) => ({
      index: i,
      value: 25.0 + (Math.random() - 0.5) * 0.1
    }))
  };
  
  // Inicialização
  useEffect(() => {
    initializeSystem();
    
    return () => {
      if (api.ws) {
        api.ws.close();
      }
    };
  }, []);
  
  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh) return;
    
    const interval = setInterval(() => {
      refreshData();
    }, 5000);
    
    return () => clearInterval(interval);
  }, [autoRefresh]);
  
  const initializeSystem = async () => {
    // Verificar conexão com servidor local
    const isConnected = await api.connect();
    setConnectionStatus(isConnected ? 'connected' : 'offline');
    
    // Configurar listeners WebSocket
    api.on('alert', (alert) => {
      handleNewAlert(alert);
    });
    
    api.on('measurement', (data) => {
      updateMeasurementData(data);
    });
    
    api.on('connection', (data) => {
      setConnectionStatus(data.status);
    });
    
    // Carregar dados iniciais
    await loadInitialData();
  };
  
  const loadInitialData = async () => {
    // Usar mock data por enquanto
    setQualityData(mockQualityData);
    
    // Tentar carregar dados históricos
    const historical = await api.getHistoricalData({
      dateRange: '30d',
      productType: mockQualityData.current.productType
    });
    
    setHistoricalData(historical || mockHistoricalData);
    
    // Executar análise preditiva
    const analysis = await api.runPredictiveAnalysis(mockQualityData.current.measurements);
    if (analysis) {
      processAnalysisResults(analysis);
    }
  };
  
  const refreshData = async () => {
    setLastSync(new Date().toLocaleString('pt-BR'));
    
    // Simular atualização de dados
    setQualityData(prev => ({
      ...prev,
      statistics: {
        ...prev.statistics,
        totalInspected: prev.statistics.totalInspected + Math.floor(Math.random() * 5),
        lastSync: new Date().toLocaleString('pt-BR')
      }
    }));
  };
  
  const handleNewAlert = (alert) => {
    const newAlert = {
      ...alert,
      id: Date.now(),
      timestamp: new Date().toLocaleTimeString('pt-BR')
    };
    
    setAlerts(prev => [newAlert, ...prev].slice(0, 20));
    
    // Som para alertas críticos
    if (alert.severity === 'CRITICAL') {
      playAlertSound();
    }
    
    // Notificação do navegador
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('QualityGuard AI - Alerta', {
        body: alert.message,
        icon: '/icon.png'
      });
    }
  };
  
  const playAlertSound = () => {
    const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBTGH0fPTgjMGHm7A7+OZURE');
    audio.play().catch(e => console.log('Erro ao tocar som:', e));
  };
  
  const updateMeasurementData = (data) => {
    setQualityData(prev => ({
      ...prev,
      current: {
        ...prev.current,
        measurements: data.measurements || prev.current.measurements
      }
    }));
  };
  
  const processAnalysisResults = (analysis) => {
    if (analysis.anomalies && analysis.anomalies.length > 0) {
      analysis.anomalies.forEach(anomaly => {
        handleNewAlert({
          severity: anomaly.severity,
          title: 'Anomalia Detectada',
          message: `${anomaly.parameter}: Desvio de ${anomaly.deviation}%`,
          type: 'ANOMALY'
        });
      });
    }
    
    if (analysis.predictions && analysis.predictions.length > 0) {
      analysis.predictions.forEach(pred => {
        if (pred.confidence > 80) {
          handleNewAlert({
            severity: 'MEDIUM',
            title: 'Predição ML',
            message: pred.message,
            predictions: pred,
            type: 'PREDICTION'
          });
        }
      });
    }
  };
  
  const handleExportToDatabase = async () => {
    setExportStatus('exporting');
    
    const dataToExport = {
      measurements: selectedMeasurements.length > 0 
        ? qualityData.current.measurements.filter(m => selectedMeasurements.includes(m.id))
        : qualityData.current.measurements,
      metadata: {
        batchId: qualityData.current.batchId,
        operator: qualityData.current.operator,
        shift: qualityData.current.shift,
        timestamp: qualityData.current.timestamp
      }
    };
    
    const result = await api.saveToDB(dataToExport);
    
    if (result.success) {
      setExportStatus('success');
      
      // Atualizar status de exportação
      setQualityData(prev => ({
        ...prev,
        current: {
          ...prev.current,
          measurements: prev.current.measurements.map(m => ({
            ...m,
            exported: selectedMeasurements.includes(m.id) || selectedMeasurements.length === 0
          }))
        },
        statistics: {
          ...prev.statistics,
          pendingExports: Math.max(0, prev.statistics.pendingExports - (selectedMeasurements.length || prev.current.measurements.length))
        }
      }));
      
      setTimeout(() => {
        setShowExportModal(false);
        setExportStatus('idle');
        setSelectedMeasurements([]);
      }, 2000);
    } else {
      setExportStatus('error');
    }
  };
  
  const toggleMeasurementSelection = (id) => {
    setSelectedMeasurements(prev => 
      prev.includes(id) 
        ? prev.filter(m => m !== id)
        : [...prev, id]
    );
  };
  
  const handleAlertDismiss = (alertId) => {
    setAlerts(prev => prev.filter(a => a.id !== alertId));
  };
  
  const handleAlertAction = (alert) => {
    console.log('Ação tomada para alerta:', alert);
    // Implementar ações específicas
  };
  
  const handleHistoricalRefresh = async (timeRange) => {
    const data = await api.getHistoricalData({
      dateRange: timeRange,
      productType: qualityData?.current?.productType
    });
    
    if (data) {
      setHistoricalData(data);
    }
  };
  
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b sticky top-0 z-40">
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              <div className="flex items-center">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-lg flex items-center justify-center mr-3">
                  <Shield className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-gray-900">QUALITYGUARD AI</h1>
                  <p className="text-xs text-gray-500">Sistema Inteligente de Controle de Qualidade</p>
                </div>
              </div>
              <div className="h-8 w-px bg-gray-200"></div>
              <nav className="flex space-x-6">
                <button 
                  onClick={() => setCurrentView('dashboard')}
                  className={`text-sm font-medium ${currentView === 'dashboard' ? 'text-blue-600' : 'text-gray-600 hover:text-gray-900'}`}
                >
                  Dashboard QC
                </button>
                <button 
                  onClick={() => setCurrentView('inspection')}
                  className={`text-sm font-medium ${currentView === 'inspection' ? 'text-blue-600' : 'text-gray-600 hover:text-gray-900'}`}
                >
                  Inspeção Atual
                </button>
                <button 
                  onClick={() => setCurrentView('alerts')}
                  className={`text-sm font-medium ${currentView === 'alerts' ? 'text-blue-600' : 'text-gray-600 hover:text-gray-900'} flex items-center`}
                >
                  <Bell className="w-4 h-4 mr-1" />
                  Alertas
                  {alerts.filter(a => a.severity === 'CRITICAL' || a.severity === 'HIGH').length > 0 && (
                    <span className="ml-2 px-2 py-0.5 text-xs bg-red-100 text-red-700 rounded-full animate-pulse">
                      {alerts.filter(a => a.severity === 'CRITICAL' || a.severity === 'HIGH').length}
                    </span>
                  )}
                </button>
                <button 
                  onClick={() => setCurrentView('database')}
                  className={`text-sm font-medium ${currentView === 'database' ? 'text-blue-600' : 'text-gray-600 hover:text-gray-900'} flex items-center`}
                >
                  <Database className="w-4 h-4 mr-1" />
                  Base de Dados
                  {qualityData?.statistics?.pendingExports > 0 && (
                    <span className="ml-2 px-2 py-0.5 text-xs bg-amber-100 text-amber-700 rounded-full">
                      {qualityData.statistics.pendingExports}
                    </span>
                  )}
                </button>
              </nav>
            </div>
            <div className="flex items-center space-x-4">
              <div className={`flex items-center px-3 py-1 rounded-full text-sm ${
                connectionStatus === 'connected' 
                  ? 'bg-green-100 text-green-700' 
                  : connectionStatus === 'offline'
                  ? 'bg-gray-100 text-gray-700'
                  : 'bg-yellow-100 text-yellow-700'
              }`}>
                {connectionStatus === 'connected' ? (
                  <>
                    <Wifi className="w-4 h-4 mr-2" />
                    <span>Servidor Local</span>
                  </>
                ) : connectionStatus === 'offline' ? (
                  <>
                    <WifiOff className="w-4 h-4 mr-2" />
                    <span>Modo Offline</span>
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    <span>Conectando...</span>
                  </>
                )}
              </div>
              <button 
                onClick={() => setAutoRefresh(!autoRefresh)}
                className={`p-2 rounded-lg ${autoRefresh ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-600'}`}
                title={autoRefresh ? 'Auto-refresh ativo' : 'Auto-refresh inativo'}
              >
                {autoRefresh ? <PlayCircle className="w-5 h-5" /> : <PauseCircle className="w-5 h-5" />}
              </button>
              <button className="p-2 hover:bg-gray-100 rounded-lg">
                <Settings className="w-5 h-5 text-gray-600" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="px-4 sm:px-6 lg:px-8 py-6">
        {currentView === 'dashboard' && qualityData && (
          <div className="space-y-6">
            {/* Quality Gate Status */}
            <div className="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-lg p-6 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold mb-2">Quality Gate 1 - Status Tempo Real</h2>
                  <p className="text-blue-100">
                    Motor Diesel HD 2.8L • Turno 1 • {qualityData.statistics.totalInspected.toLocaleString()} inspeções realizadas
                  </p>
                  {lastSync && (
                    <p className="text-xs text-blue-200 mt-1">
                      Última atualização: {lastSync}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <div className="text-4xl font-bold">{qualityData.statistics.passRate}%</div>
                  <p className="text-blue-100">Taxa de Aprovação</p>
                </div>
              </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-2">
                  <Gauge className="w-8 h-8 text-blue-600" />
                  <span className="text-xs text-gray-500">Cpk Médio</span>
                </div>
                <p className="text-3xl font-bold text-gray-900">{qualityData.statistics.avgCpk}</p>
                <p className="text-sm text-gray-600">Capabilidade do Processo</p>
                <div className="mt-2 text-xs">
                  <span className={`${qualityData.statistics.avgCpk >= 1.33 ? 'text-green-600' : 'text-amber-600'}`}>
                    {qualityData.statistics.avgCpk >= 1.33 ? '✓ Processo Capaz' : '⚠ Atenção Necessária'}
                  </span>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-2">
                  <Brain className="w-8 h-8 text-purple-600" />
                  <TrendingUp className="w-4 h-4 text-green-500" />
                </div>
                <p className="text-3xl font-bold text-gray-900">{qualityData.statistics.trendsDetected}</p>
                <p className="text-sm text-gray-600">Tendências Detectadas</p>
                <div className="mt-2 text-xs text-purple-600">IA Analisando</div>
              </div>

              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-2">
                  <AlertTriangle className="w-8 h-8 text-red-600" />
                  <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded">Ação</span>
                </div>
                <p className="text-3xl font-bold text-red-600">{qualityData.statistics.criticalAlerts}</p>
                <p className="text-sm text-gray-600">Alertas Críticos</p>
                <div className="mt-2 text-xs text-red-600">Requer atenção imediata</div>
              </div>

              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-2">
                  <Database className="w-8 h-8 text-green-600" />
                  <Clock className="w-4 h-4 text-gray-400" />
                </div>
                <p className="text-3xl font-bold text-gray-900">{qualityData.statistics.pendingExports}</p>
                <p className="text-sm text-gray-600">Dados Pendentes</p>
                <div className="mt-2 text-xs text-gray-500">Última sync: {qualityData.statistics.lastSync}</div>
              </div>
            </div>

            {/* Análise Histórica */}
            <HistoricalAnalysis 
              data={historicalData} 
              onRefresh={handleHistoricalRefresh}
            />

            {/* Alertas em Tempo Real */}
            <RealTimeAlerts 
              alerts={alerts}
              onDismiss={handleAlertDismiss}
              onAction={handleAlertAction}
            />
          </div>
        )}

        {currentView === 'inspection' && qualityData && (
          <div className="space-y-6">
            {/* Inspection Header */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 mb-4">Informações da Inspeção</h2>
                  <dl className="space-y-2">
                    <div className="flex justify-between">
                      <dt className="text-sm text-gray-500">PDF Origem:</dt>
                      <dd className="text-sm font-medium text-gray-900">{qualityData.current.pdfFile}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-sm text-gray-500">Quality Gate:</dt>
                      <dd className="text-sm font-medium text-gray-900">{qualityData.current.qualityGate}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-sm text-gray-500">Produto:</dt>
                      <dd className="text-sm font-medium text-gray-900">{qualityData.current.productType}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-sm text-gray-500">Número de Série:</dt>
                      <dd className="text-sm font-medium text-gray-900">{qualityData.current.serialNumber}</dd>
                    </div>
                  </dl>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Contexto da Produção</h3>
                  <dl className="space-y-2">
                    <div className="flex justify-between">
                      <dt className="text-sm text-gray-500">Lote:</dt>
                      <dd className="text-sm font-medium text-gray-900">{qualityData.current.batchId}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-sm text-gray-500">Operador:</dt>
                      <dd className="text-sm font-medium text-gray-900">{qualityData.current.operator}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-sm text-gray-500">Turno:</dt>
                      <dd className="text-sm font-medium text-gray-900">{qualityData.current.shift}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-sm text-gray-500">Timestamp:</dt>
                      <dd className="text-sm font-medium text-gray-900">{qualityData.current.timestamp}</dd>
                    </div>
                  </dl>
                </div>
              </div>
              <div className="mt-6 flex justify-end space-x-3">
                <button className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center">
                  <FileSearch className="w-4 h-4 mr-2" />
                  Ver PDF Original
                </button>
                <button 
                  onClick={() => setShowExportModal(true)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center"
                >
                  <Database className="w-4 h-4 mr-2" />
                  Exportar para Banco de Dados
                </button>
              </div>
            </div>

            {/* Measurements Table */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">Resultados da Análise de Qualidade</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        <input 
                          type="checkbox" 
                          className="rounded border-gray-300"
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedMeasurements(qualityData.current.measurements.map(m => m.id));
                            } else {
                              setSelectedMeasurements([]);
                            }
                          }}
                        />
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Parâmetro
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Valor Medido
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Especificação
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Cpk
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status QC
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Base de Dados
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {qualityData.current.measurements.map((measurement) => {
                      const isWithinSpec = measurement.value <= measurement.upperLimit && measurement.value >= measurement.lowerLimit;
                      
                      return (
                        <tr key={measurement.id} className={!isWithinSpec ? 'bg-red-50' : ''}>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <input 
                              type="checkbox"
                              checked={selectedMeasurements.includes(measurement.id)}
                              onChange={() => toggleMeasurementSelection(measurement.id)}
                              className="rounded border-gray-300"
                            />
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div>
                              <p className="text-sm font-medium text-gray-900">{measurement.parameter}</p>
                              <p className="text-xs text-gray-500">{measurement.id} • {measurement.category}</p>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`text-sm font-mono font-medium ${
                              measurement.status === 'ok' ? 'text-gray-900' : 
                              measurement.status === 'warning' ? 'text-amber-600' : 'text-red-600'
                            }`}>
                              {measurement.value.toFixed(3)}
                              {measurement.value > measurement.nominal ? 
                                <ArrowUp className="w-3 h-3 inline ml-1 text-red-500" /> : 
                                <ArrowDown className="w-3 h-3 inline ml-1 text-blue-500" />
                              }
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 font-mono">
                            {measurement.nominal.toFixed(3)} 
                            <span className="text-xs text-gray-500">
                              {' '}(+{(measurement.upperLimit - measurement.nominal).toFixed(3)} / 
                              {(measurement.lowerLimit - measurement.nominal).toFixed(3)})
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`text-sm font-medium ${
                              measurement.cpk >= 1.33 ? 'text-green-600' : 
                              measurement.cpk >= 1.0 ? 'text-amber-600' : 'text-red-600'
                            }`}>
                              {measurement.cpk.toFixed(2)}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              measurement.status === 'ok' ? 'bg-green-100 text-green-800' :
                              measurement.status === 'warning' ? 'bg-amber-100 text-amber-800' :
                              'bg-red-100 text-red-800'
                            }`}>
                              {measurement.status === 'ok' ? 'Aprovado' : 
                               measurement.status === 'warning' ? 'Atenção' : 'Reprovado'}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {measurement.exported ? (
                              <span className="inline-flex items-center text-xs text-green-600">
                                <Check className="w-3 h-3 mr-1" />
                                Exportado
                              </span>
                            ) : (
                              <span className="inline-flex items-center text-xs text-gray-500">
                                <Clock className="w-3 h-3 mr-1" />
                                Pendente
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {currentView === 'alerts' && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Central de Alertas e Notificações</h2>
              <div className="grid grid-cols-4 gap-4 mb-6">
                <div className="text-center">
                  <div className="text-3xl font-bold text-red-600">
                    {alerts.filter(a => a.severity === 'CRITICAL').length}
                  </div>
                  <p className="text-sm text-gray-600">Críticos</p>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-orange-600">
                    {alerts.filter(a => a.severity === 'HIGH').length}
                  </div>
                  <p className="text-sm text-gray-600">Alto</p>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-yellow-600">
                    {alerts.filter(a => a.severity === 'MEDIUM').length}
                  </div>
                  <p className="text-sm text-gray-600">Médio</p>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-blue-600">
                    {alerts.filter(a => a.severity === 'LOW').length}
                  </div>
                  <p className="text-sm text-gray-600">Baixo</p>
                </div>
              </div>
            </div>
            
            <RealTimeAlerts 
              alerts={alerts}
              onDismiss={handleAlertDismiss}
              onAction={handleAlertAction}
            />
          </div>
        )}

        {currentView === 'database' && (
          <div className="space-y-6">
            {/* Database Status */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 flex items-center">
                    <Server className="w-5 h-5 mr-2 text-gray-600" />
                    Base de Dados Local - Quality Control
                  </h2>
                  <p className="text-sm text-gray-500 mt-1">
                    Servidor: QC-DB-LOCAL • PostgreSQL 14.2 • 100% On-Premise
                  </p>
                </div>
                <div className="flex items-center space-x-2">
                  <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                    connectionStatus === 'connected' 
                      ? 'bg-green-100 text-green-800' 
                      : 'bg-gray-100 text-gray-800'
                  }`}>
                    <div className={`w-2 h-2 rounded-full mr-2 ${
                      connectionStatus === 'connected' ? 'bg-green-500 animate-pulse' : 'bg-gray-500'
                    }`}></div>
                    {connectionStatus === 'connected' ? 'Conectado' : 'Offline'}
                  </span>
                  <CloudOff className="w-5 h-5 text-gray-400" />
                </div>
              </div>

              <div className="grid grid-cols-4 gap-4">
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-500">Total de Registros</p>
                  <p className="text-2xl font-bold text-gray-900">487,293</p>
                  <p className="text-xs text-green-600 mt-1">+1,247 hoje</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-500">Produtos Únicos</p>
                  <p className="text-2xl font-bold text-gray-900">18</p>
                  <p className="text-xs text-gray-600 mt-1">Modelos de motor</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-500">Dados Pendentes</p>
                  <p className="text-2xl font-bold text-amber-600">{qualityData?.statistics?.pendingExports || 0}</p>
                  <p className="text-xs text-amber-600 mt-1">Aguardando exportação</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-500">Espaço Utilizado</p>
                  <p className="text-2xl font-bold text-gray-900">127 GB</p>
                  <p className="text-xs text-gray-600 mt-1">42% da capacidade</p>
                </div>
              </div>
            </div>

            {/* Export Queue */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
              <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">Fila de Exportação</h3>
                <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center text-sm">
                  <Upload className="w-4 h-4 mr-2" />
                  Exportar Todos
                </button>
              </div>
              <div className="p-6">
                <div className="space-y-3">
                  {[1, 2, 3].map((item) => (
                    <div key={item} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                      <div className="flex items-center space-x-4">
                        <FileText className="w-5 h-5 text-gray-400" />
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            QG1_MOTOR_DIESEL_HD_T{item}_2607202{5 - item}.pdf
                          </p>
                          <p className="text-xs text-gray-500">
                            {5 + item} medições • Processado há {item * 2} horas
                          </p>
                        </div>
                      </div>
                      <span className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded">
                        Pendente
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Database Schema Info */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <Database className="w-5 h-5 text-blue-600 mt-0.5" />
                <div>
                  <h4 className="font-medium text-blue-900">Estrutura de Dados Otimizada</h4>
                  <p className="text-sm text-blue-700 mt-1">
                    Tabelas: measurements, products, batches, operators, predictions, anomalies, alerts
                  </p>
                  <p className="text-sm text-blue-700">
                    Índices otimizados para análise temporal e detecção de padrões
                  </p>
                  <p className="text-sm text-blue-700">
                    Modelos ML treinados com {historicalData?.totalMeasurements?.toLocaleString() || '487,293'} registros históricos
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Export Modal */}
      {showExportModal && (
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Exportar para Base de Dados Local</h3>
            </div>
            <div className="p-6">
              {exportStatus === 'idle' && (
                <>
                  <div className="mb-4">
                    <p className="text-sm text-gray-600">
                      {selectedMeasurements.length > 0 
                        ? `${selectedMeasurements.length} medições selecionadas para exportação`
                        : 'Todas as medições serão exportadas'
                      }
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      Destino: PostgreSQL Local (localhost:5432/qualityguard)
                    </p>
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <span className="text-sm text-gray-700">Dados de medição</span>
                      <Check className="w-4 h-4 text-green-600" />
                    </div>
                    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <span className="text-sm text-gray-700">Metadados do lote</span>
                      <Check className="w-4 h-4 text-green-600" />
                    </div>
                    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <span className="text-sm text-gray-700">Contexto de produção</span>
                      <Check className="w-4 h-4 text-green-600" />
                    </div>
                    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <span className="text-sm text-gray-700">Análises e predições ML</span>
                      <Check className="w-4 h-4 text-green-600" />
                    </div>
                  </div>
                </>
              )}
              
              {exportStatus === 'exporting' && (
                <div className="text-center py-8">
                  <div className="w-16 h-16 mx-auto mb-4">
                    <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                  </div>
                  <p className="text-gray-600">Exportando dados para base local...</p>
                  <p className="text-xs text-gray-500 mt-1">PostgreSQL: localhost:5432</p>
                </div>
              )}
              
              {exportStatus === 'success' && (
                <div className="text-center py-8">
                  <div className="w-16 h-16 mx-auto mb-4 bg-green-100 rounded-full flex items-center justify-center">
                    <Check className="w-8 h-8 text-green-600" />
                  </div>
                  <p className="text-gray-900 font-medium">Dados exportados com sucesso!</p>
                  <p className="text-sm text-gray-600 mt-1">Base de dados atualizada</p>
                </div>
              )}
              
              {exportStatus === 'error' && (
                <div className="text-center py-8">
                  <div className="w-16 h-16 mx-auto mb-4 bg-red-100 rounded-full flex items-center justify-center">
                    <X className="w-8 h-8 text-red-600" />
                  </div>
                  <p className="text-gray-900 font-medium">Erro na exportação</p>
                  <p className="text-sm text-gray-600 mt-1">Verifique a conexão com o banco</p>
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end space-x-3">
              {exportStatus === 'idle' && (
                <>
                  <button
                    onClick={() => setShowExportModal(false)}
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleExportToDatabase}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center"
                  >
                    <Database className="w-4 h-4 mr-2" />
                    Confirmar Exportação
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default QualityGuardAI;