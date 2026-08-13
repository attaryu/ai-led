// ami-assessment/frontend/components/assessment/results-pdf-button.tsx
'use client'

import dynamic from 'next/dynamic'
import type { SessionResultsResponse } from '@/lib/types'

const ResultsPdfButtonInner = dynamic(
  () => import('./results-pdf-button-inner').then((mod) => mod.ResultsPdfButton),
  { ssr: false }
)

export function ResultsPdfButton(props: { results: SessionResultsResponse; avgScore: string }) {
  return <ResultsPdfButtonInner {...props} />
}
