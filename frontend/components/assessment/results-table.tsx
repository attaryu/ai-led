// ami-assessment/frontend/components/assessment/results-table.tsx
'use client'

import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useAppStore } from '@/lib/store'
import { useAssessmentStatus } from '@/hooks/use-assessment-polling'
import { useAssessmentResults } from '@/hooks/use-assessment-results'
import { ResultsPdfButton } from './results-pdf-button'

const SCORE_STYLES: Record<number, string> = {
  0: 'bg-red-100 text-red-700 hover:bg-red-100',
  1: 'bg-red-100 text-red-700 hover:bg-red-100',
  2: 'bg-amber-100 text-amber-800 hover:bg-amber-100',
  3: 'bg-sky-100 text-sky-700 hover:bg-sky-100',
  4: 'bg-green-100 text-green-800 hover:bg-green-100',
}

function ScorePill({ score }: { score?: number | null }) {
  if (score == null) return <Badge variant="secondary">–</Badge>
  const rounded = Math.round(score)
  return <Badge className={SCORE_STYLES[rounded] ?? ''}>{score.toFixed(1)}</Badge>
}

export function ResultsTable() {
  const sessionId = useAppStore((s) => s.sessionId)
  const { data: status } = useAssessmentStatus(sessionId)
  const { data: results } = useAssessmentResults(sessionId, status?.status === 'completed')

  if (!results) return null

  const validScores = results.results.filter((r) => r.score != null).map((r) => r.score!)
  const avgScore = validScores.length
    ? (validScores.reduce((a, b) => a + b, 0) / validScores.length).toFixed(2)
    : '–'

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Hasil Penilaian</CardTitle>
        <ResultsPdfButton results={results} avgScore={avgScore} />
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Total: <strong>{results.total_indicators}</strong> indikator • Skor rata-rata:{' '}
          <strong>{avgScore}</strong>
        </p>
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10 text-center">No</TableHead>
                <TableHead>Kriteria</TableHead>
                <TableHead className="w-16 text-center">Skor</TableHead>
                <TableHead>Justifikasi</TableHead>
                <TableHead>Rekomendasi</TableHead>
                <TableHead className="w-16 text-center">Conf.</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {results.results.map((r) => (
                <TableRow key={r.indicator_no}>
                  <TableCell className="text-center font-semibold">{r.indicator_no}</TableCell>
                  <TableCell>{r.kriteria || '—'}</TableCell>
                  <TableCell className="text-center">
                    <ScorePill score={r.score} />
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    {r.error ? (
                      <span className="italic text-destructive">Error: {r.error}</span>
                    ) : (
                      r.justification || '—'
                    )}
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    {r.error ? '—' : r.recommendation || '—'}
                  </TableCell>
                  <TableCell className="text-center text-muted-foreground">
                    {r.confidence != null ? r.confidence.toFixed(2) : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}
