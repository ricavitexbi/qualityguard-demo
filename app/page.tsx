'use client'

import dynamic from 'next/dynamic'

const QualityGuardAI = dynamic(() => import('./QualityGuardAI'), {
  ssr: false,
})

export default function Home() {
  return <QualityGuardAI />
}