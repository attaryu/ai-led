// ami-assessment/frontend/app/page.tsx
'use client'

import { useState } from 'react'
import { MatrixCard } from '@/components/upload/matrix-card'
import { LedCard } from '@/components/upload/led-card'
import { LkpsCard } from '@/components/upload/lkps-card'
import { LaporanCard } from '@/components/upload/laporan-card'
import { StartCard } from '@/components/assessment/start-card'
import { ProgressPanel } from '@/components/assessment/progress-panel'
import { ResultsTable } from '@/components/assessment/results-table'
import { HistoryPanel } from '@/components/history/history-panel'
import { RagasPanel } from '@/components/eval/ragas-panel'

export default function Home() {
  const [laporanPath, setLaporanPath] = useState<string | null>(null)

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">AMI Assessment</h1>
        <p className="text-muted-foreground">
          Penilaian Akreditasi Program Studi — LAM Teknik (Automated)
        </p>
      </div>

      <div className="space-y-4">
        <MatrixCard />
        <LedCard />
        <LkpsCard />
        <LaporanCard onUploaded={setLaporanPath} />
        <StartCard laporanPath={laporanPath} />
      </div>

      <ProgressPanel />
      <HistoryPanel />
      <ResultsTable />
      <RagasPanel />
    </main>
  )
}
