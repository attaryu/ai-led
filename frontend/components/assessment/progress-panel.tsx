// ami-assessment/frontend/components/assessment/progress-panel.tsx
'use client'

import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { StatCard } from '@/components/shared/stat-card'
import { useAppStore } from '@/lib/store'
import { useAssessmentStatus } from '@/hooks/use-assessment-polling'

const STATUS_LABEL: Record<string, string> = {
  running: 'Berjalan',
  completed: 'Selesai ✓',
  failed: 'Gagal',
}

const STATUS_COLOR: Record<string, string> = {
  running: 'text-amber-600',
  completed: 'text-green-600',
  failed: 'text-destructive',
}

export function ProgressPanel() {
  const sessionId = useAppStore((s) => s.sessionId)
  const { data: status } = useAssessmentStatus(sessionId)
  const queryClient = useQueryClient()
  // Track which session we've already invalidated for, so we fire exactly once per completed session.
  const invalidatedForRef = useRef<string | null>(null)

  useEffect(() => {
    if (status?.status === 'completed' && sessionId && invalidatedForRef.current !== sessionId) {
      invalidatedForRef.current = sessionId
      queryClient.invalidateQueries({ queryKey: ['assessment-list'] })
    }
  }, [status?.status, sessionId, queryClient])

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
          <StatCard label="Total Indikator" value={status.total_indicators} />
          <StatCard label="Selesai Dinilai" value={done} />
          <StatCard
            label="Status"
            value={STATUS_LABEL[status.status] ?? status.status}
            valueClassName={STATUS_COLOR[status.status] ?? ''}
          />
        </div>
        <Progress value={pct} />
        <p className="text-sm text-muted-foreground">
          {status.status === 'completed'
            ? `Semua ${total} indikator berhasil dinilai. Klik langkah "Hasil" untuk melihat tabel skor.`
            : status.status === 'failed'
              ? status.error || 'Pipeline gagal.'
              : `${done} dari ${total} indikator selesai (${pct}%)`}
        </p>
      </CardContent>
    </Card>
  )
}
