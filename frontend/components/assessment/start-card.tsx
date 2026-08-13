// ami-assessment/frontend/components/assessment/start-card.tsx
'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useUploadStatus } from '@/hooks/use-upload-status'
import { useAppStore } from '@/lib/store'
import { startAssessment } from '@/lib/api'

interface StartCardProps {
  laporanPath: string | null
}

export function StartCard({ laporanPath }: StartCardProps) {
  const { data: status } = useUploadStatus()
  const setSessionId = useAppStore((s) => s.setSessionId)
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: () => startAssessment(laporanPath ? { laporan_path: laporanPath } : {}),
    onSuccess: (data) => {
      setSessionId(data.session_id)
      queryClient.invalidateQueries({ queryKey: ['assessment-list'] })
    },
    onError: (err: Error) => {
      toast.error('Gagal memulai penilaian', { description: err.message })
    },
  })

  const allReady = !!(status?.matrix_uploaded && status?.led_index_state === 'ready' && status?.lkps_uploaded)

  return (
    <Card>
      <CardHeader>
        <CardTitle>5. Mulai Penilaian</CardTitle>
        <CardDescription>Jalankan agen AI untuk menilai indikator secara paralel</CardDescription>
      </CardHeader>
      <CardContent>
        <Button
          className="w-full"
          size="lg"
          disabled={!allReady || mutation.isPending || !!mutation.data}
          onClick={() => mutation.mutate()}
        >
          {mutation.data
            ? 'Penilaian Berjalan…'
            : mutation.isPending
              ? 'Memulai…'
              : 'Mulai Penilaian Otomatis'}
        </Button>
      </CardContent>
    </Card>
  )
}
