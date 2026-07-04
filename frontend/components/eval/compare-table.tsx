// ami-assessment/frontend/components/eval/compare-table.tsx
'use client'

import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useAppStore } from '@/lib/store'

export function CompareTable() {
  const evalHistory = useAppStore((s) => s.evalHistory)
  const removeEvalRun = useAppStore((s) => s.removeEvalRun)
  const clearEvalHistory = useAppStore((s) => s.clearEvalHistory)

  if (evalHistory.length === 0) {
    return (
      <p className="rounded-md border p-6 text-center text-sm text-muted-foreground">
        Belum ada riwayat. Jalankan RAGAS untuk mulai membandingkan.
      </p>
    )
  }

  const allMetrics = Array.from(
    new Set(evalHistory.flatMap((h) => Object.keys(h.scores)))
  ).sort()

  const bestPerMetric: Record<string, number> = {}
  allMetrics.forEach((m) => {
    const vals = evalHistory.map((h) => h.scores[m]).filter((v) => typeof v === 'number')
    if (vals.length) bestPerMetric[m] = Math.max(...vals)
  })

  const sorted = [...evalHistory].sort((a, b) =>
    (b.finished_at || '').localeCompare(a.finished_at || '')
  )

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <strong className="text-sm">Riwayat Run</strong>
        <Button variant="link" size="sm" className="text-destructive" onClick={clearEvalHistory}>
          Hapus semua
        </Button>
      </div>
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Model</TableHead>
              <TableHead>Provider</TableHead>
              <TableHead>N</TableHead>
              {allMetrics.map((m) => (
                <TableHead key={m} className="text-center">
                  {m}
                </TableHead>
              ))}
              <TableHead>Selesai</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((h) => (
              <TableRow key={h.eval_id}>
                <TableCell>
                  <code className="text-xs">{h.model ?? '?'}</code>
                </TableCell>
                <TableCell>{h.provider ?? '?'}</TableCell>
                <TableCell>{h.n_samples ?? '—'}</TableCell>
                {allMetrics.map((m) => {
                  const v = h.scores[m]
                  const isBest = typeof v === 'number' && bestPerMetric[m] === v
                  return (
                    <TableCell
                      key={m}
                      className={`text-center font-medium ${isBest ? 'text-green-600' : ''}`}
                    >
                      {typeof v === 'number' ? v.toFixed(3) : '—'}
                    </TableCell>
                  )
                })}
                <TableCell className="text-xs text-muted-foreground">
                  {h.finished_at ? new Date(h.finished_at).toLocaleString('id-ID') : '—'}
                </TableCell>
                <TableCell>
                  <Button variant="link" size="sm" onClick={() => removeEvalRun(h.eval_id)}>
                    ×
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
