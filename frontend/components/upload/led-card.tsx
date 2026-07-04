// ami-assessment/frontend/components/upload/led-card.tsx
'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
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
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div>
          <CardTitle>2. Dokumen LED (PDF)</CardTitle>
          <CardDescription>
            Laporan Evaluasi Diri — narasi kualitatif program studi
          </CardDescription>
        </div>
        {isReady ? (
          <Badge className="bg-green-100 text-green-700 hover:bg-green-100">
            ✓ {status?.led_chunk_count} chunks
          </Badge>
        ) : state === 'error' ? (
          <Badge variant="destructive">Indexing gagal</Badge>
        ) : (
          <Badge variant="secondary">Belum diunggah</Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
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
      </CardContent>
    </Card>
  )
}
