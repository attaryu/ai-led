// ami-assessment/frontend/components/eval/ragas-panel.tsx
'use client'

import { useEffect, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Progress } from '@/components/ui/progress'
import { getEvalConfig, runEval } from '@/lib/api'
import { useEvalResults } from '@/hooks/use-eval-polling'
import { useAppStore } from '@/lib/store'
import { CompareTable } from './compare-table'

const ALL_METRICS = ['faithfulness', 'answer_relevancy', 'context_precision', 'context_recall']

const STAGE_LABELS: Record<string, string> = {
  starting: 'Mempersiapkan…',
  building_samples: 'Mengumpulkan bukti & ground truth',
  evaluating: 'Menjalankan metrik RAGAS',
  completed: 'Selesai',
}

export function RagasPanel() {
  const [nIndicators, setNIndicators] = useState(5)
  const [sessionIdInput, setSessionIdInput] = useState('')
  const [metrics, setMetrics] = useState<string[]>(ALL_METRICS)
  const [evalId, setEvalId] = useState<string | null>(null)

  const addEvalRun = useAppStore((s) => s.addEvalRun)
  const storeSessionId = useAppStore((s) => s.sessionId)

  const { data: config } = useQuery({ queryKey: ['eval-config'], queryFn: getEvalConfig })
  const { data: evalResult } = useEvalResults(evalId)

  const mutation = useMutation({
    mutationFn: () =>
      runEval({
        n_indicators: nIndicators,
        metrics,
        session_id: sessionIdInput || undefined,
      }),
    onSuccess: (data) => setEvalId(data.eval_id),
    onError: (err: Error) => toast.error('Gagal memulai evaluasi RAGAS', { description: err.message }),
  })

  useEffect(() => {
    if (evalResult?.status === 'completed' && evalResult.scores) {
      addEvalRun({
        eval_id: evalResult.eval_id,
        provider: evalResult.provider ?? undefined,
        model: evalResult.model ?? undefined,
        n_samples: evalResult.n_samples ?? undefined,
        scores: evalResult.scores,
        finished_at: evalResult.finished_at ?? new Date().toISOString(),
      })
    }
  }, [evalResult, addEvalRun])

  function toggleMetric(metric: string) {
    setMetrics((prev) =>
      prev.includes(metric) ? prev.filter((m) => m !== metric) : [...prev, metric]
    )
  }

  const isPolling = !!evalId && evalResult?.status !== 'completed' && evalResult?.status !== 'failed'

  return (
    <Card>
      <CardHeader>
        <CardTitle>Evaluasi RAGAS — Bandingkan Model</CardTitle>
        <CardDescription>
          Ukur kualitas RAG (faithfulness, answer relevancy, context precision/recall).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-6 rounded-md border p-3 text-sm">
          <div>
            Model dinilai: <strong>{config?.assessment_model ?? '—'}</strong> (
            {config?.assessment_provider ?? '—'})
          </div>
          <div>
            Judge RAGAS: <strong>{config?.judge_model ?? '—'}</strong> ({config?.judge_provider ?? '—'})
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="eval-n">Jumlah indikator (1–78)</Label>
            <Input
              id="eval-n"
              type="number"
              min={1}
              max={78}
              value={nIndicators}
              onChange={(e) => setNIndicators(Number(e.target.value) || 5)}
            />
          </div>
          <div>
            <Label htmlFor="eval-session">Session ID (opsional)</Label>
            <Input
              id="eval-session"
              placeholder="Pakai justifikasi dari session ini"
              value={sessionIdInput}
              onChange={(e) => setSessionIdInput(e.target.value)}
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          {ALL_METRICS.map((m) => (
            <label key={m} className="flex items-center gap-2 rounded-full border px-3 py-1 text-sm">
              <Checkbox checked={metrics.includes(m)} onCheckedChange={() => toggleMetric(m)} />
              {m}
            </label>
          ))}
        </div>

        <Button
          disabled={metrics.length === 0 || mutation.isPending || isPolling}
          onClick={() => mutation.mutate()}
        >
          Jalankan RAGAS
        </Button>

        {(isPolling || evalResult?.status === 'completed') && evalResult && (
          <div className="space-y-1">
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>{STAGE_LABELS[evalResult.progress_stage ?? ''] ?? evalResult.status}</span>
              <span>
                {evalResult.progress_current ?? 0}/{evalResult.progress_total ?? '?'}
              </span>
            </div>
            <Progress
              value={
                evalResult.progress_total
                  ? Math.round(((evalResult.progress_current ?? 0) / evalResult.progress_total) * 100)
                  : 5
              }
            />
          </div>
        )}
        {evalResult?.status === 'failed' && (
          <p className="text-sm text-destructive">Gagal: {evalResult.error}</p>
        )}

        <CompareTable />
      </CardContent>
    </Card>
  )
}
