// ami-assessment/frontend/components/history/history-panel.tsx
'use client'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useAppStore } from '@/lib/store'
import { useAssessmentList } from '@/hooks/use-assessment-list'

const STATUS_LABEL: Record<string, string> = {
  completed: '✓ Selesai',
  running: '⏳ Berjalan',
  failed: '✗ Gagal',
}

export function HistoryPanel() {
  const { data: sessions, refetch, isLoading } = useAssessmentList()
  const setSessionId = useAppStore((s) => s.setSessionId)

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Riwayat Penilaian</CardTitle>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          Refresh
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Memuat riwayat…</p>
        ) : !sessions?.length ? (
          <p className="text-sm text-muted-foreground">
            Belum ada penilaian. Jalankan Step 5 untuk memulai.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Session ID</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-center">Progress</TableHead>
                  <TableHead className="text-center">Skor Rata²</TableHead>
                  <TableHead>Dibuat</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.map((s) => (
                  <TableRow key={s.session_id}>
                    <TableCell>
                      <code className="text-xs">{s.session_id.slice(0, 8)}…</code>
                    </TableCell>
                    <TableCell>
                      <Badge variant={s.status === 'failed' ? 'destructive' : 'secondary'}>
                        {STATUS_LABEL[s.status] ?? s.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      {s.completed_indicators}/{s.total_indicators}
                    </TableCell>
                    <TableCell className="text-center">
                      {s.avg_score != null ? s.avg_score.toFixed(2) : '—'}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {s.created_at ? new Date(s.created_at).toLocaleString('id-ID') : '—'}
                    </TableCell>
                    <TableCell>
                      <Button size="sm" onClick={() => setSessionId(s.session_id)}>
                        Lihat
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
