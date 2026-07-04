// ami-assessment/frontend/components/assessment/progress-panel.tsx
'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { useAppStore } from '@/lib/store'
import { useAssessmentStatus } from '@/hooks/use-assessment-polling'

export function ProgressPanel() {
  const sessionId = useAppStore((s) => s.sessionId)
  const { data: status } = useAssessmentStatus(sessionId)

  if (!sessionId || !status) return null

  const total = status.total_indicators || 1
  const done = status.completed_indicators || 0
  const pct = Math.round((done / total) * 100)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Progres Penilaian</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-md border p-3">
            <div className="text-2xl font-bold">{status.total_indicators}</div>
            <div className="text-xs text-muted-foreground">Total Indikator</div>
          </div>
          <div className="rounded-md border p-3">
            <div className="text-2xl font-bold">{done}</div>
            <div className="text-xs text-muted-foreground">Selesai Dinilai</div>
          </div>
          <div className="rounded-md border p-3">
            <div className="text-2xl font-bold capitalize">{status.status}</div>
            <div className="text-xs text-muted-foreground">Status</div>
          </div>
        </div>
        <Progress value={pct} />
        <p className="text-sm text-muted-foreground">
          {status.status === 'completed'
            ? `Semua ${total} indikator berhasil dinilai. Tabel hasil di bawah.`
            : status.status === 'failed'
              ? status.error || 'Pipeline gagal.'
              : `${done} dari ${total} indikator selesai (${pct}%)`}
        </p>
      </CardContent>
    </Card>
  )
}
