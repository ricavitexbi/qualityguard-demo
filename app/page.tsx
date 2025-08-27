'use client'

import dynamic from 'next/dynamic'

const QualityGuardAI = dynamic(() => import('./QualityGuardAI.jsx'), {
  ssr: false,
})

export default function Home() {
  return <QualityGuardAI />
}