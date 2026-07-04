// ami-assessment/frontend/components/upload/laporan-card.tsx
'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { DropZone } from './drop-zone'
import { useUploadStatus } from '@/hooks/use-upload-status'
import { uploadLaporan } from '@/lib/api'

interface LaporanCardProps {
  onUploaded: (laporanPath: string) => void
}

export function LaporanCard({ onUploaded }: LaporanCardProps) {
  const [file, setFile] = useState<File | null>(null)
  const queryClient = useQueryClient()
  const { data: status } = useUploadStatus()

  const mutation = useMutation({
    mutationFn: () => uploadLaporan(file!),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['upload-status'] })
      onUploaded(data.laporan_path)
    },
    onError: (err: Error) => {
      toast.error('Upload Laporan AK gagal', { description: err.message })
    },
  })

  const isReady = !!status?.laporan_uploaded

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div>
          <CardTitle>4. Laporan AK (Excel) — Opsional</CardTitle>
          <CardDescription>
            Filter subset indikator yang dinilai. Kosongkan untuk menilai semua indikator dari matriks.
          </CardDescription>
        </div>
        <Badge variant={isReady ? 'default' : 'secondary'}>
          {isReady ? '✓ tersimpan' : 'Opsional'}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        <DropZone
          accept={['.xlsx', '.xls']}
          chosenFileName={file?.name ?? null}
          onFileSelected={setFile}
          disabled={mutation.isPending}
        />
        <Button
          disabled={!file || mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? 'Mengunggah…' : 'Unggah'}
        </Button>
      </CardContent>
    </Card>
  )
}
