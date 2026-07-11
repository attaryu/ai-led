// ami-assessment/frontend/components/upload/led-card.tsx
'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { UploadTile } from '@/components/shared/upload-tile'
import { DropZone } from './drop-zone'
import { useUploadStatus } from '@/hooks/use-upload-status'
import { uploadLed } from '@/lib/api'

export function LedCard() {
  const [file, setFile] = useState<File | null>(null)
  const queryClient = useQueryClient()
  const { data: status } = useUploadStatus()

  const mutation = useMutation({
    mutationFn: () => uploadLed(file!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['upload-status'] })
    },
    onError: (err: Error) => {
      toast.error('Upload LED gagal', { description: err.message })
    },
  })

  const state = status?.led_index_state ?? 'idle'
  const isReady = state === 'ready'
  const isIndexing = state === 'indexing'

  return (
    <UploadTile
      title="2. Dokumen LED (PDF)"
      description="Laporan Evaluasi Diri — narasi kualitatif program studi"
      status={
        isReady ? (
          <Badge className="bg-green-100 text-green-700 hover:bg-green-100">
            ✓ {status?.led_chunk_count} chunks
          </Badge>
        ) : state === 'error' ? (
          <Badge variant="destructive">Indexing gagal</Badge>
        ) : (
          <Badge variant="secondary">Belum diunggah</Badge>
        )
      }
    >
      <DropZone
        accept={['.pdf']}
        chosenFileName={file?.name ?? null}
        onFileSelected={setFile}
        disabled={mutation.isPending || isIndexing}
      />
      <Button
        disabled={!file || mutation.isPending || isIndexing}
        onClick={() => mutation.mutate()}
      >
        {mutation.isPending ? 'Mengunggah…' : 'Unggah & Indeks'}
      </Button>

      {isIndexing && (
        <div className="space-y-1">
          <div className="text-sm text-muted-foreground">
            Mengindeks LED ke vector store…
          </div>
          <Progress value={60} />
        </div>
      )}
      {state === 'error' && status?.led_error && (
        <p className="text-sm text-destructive">{status.led_error}</p>
      )}
    </UploadTile>
  )
}
