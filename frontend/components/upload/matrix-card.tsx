// ami-assessment/frontend/components/upload/matrix-card.tsx
'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { UploadTile } from '@/components/shared/upload-tile'
import { DropZone } from './drop-zone'
import { useUploadStatus } from '@/hooks/use-upload-status'
import { uploadMatrix } from '@/lib/api'

export function MatrixCard() {
  const [file, setFile] = useState<File | null>(null)
  const queryClient = useQueryClient()
  const { data: status } = useUploadStatus()

  const mutation = useMutation({
    mutationFn: () => uploadMatrix(file!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['upload-status'] })
    },
    onError: (err: Error) => {
      toast.error('Upload Matriks gagal', { description: err.message })
    },
  })

  const isReady = !!status?.matrix_uploaded

  return (
    <UploadTile
      title="1. Matriks Penilaian (PDF)"
      description="Rubrik penilaian dari LAM — sumber kriteria dan skor 0–4"
      status={
        isReady ? (
          <Badge className="bg-green-100 text-green-700 hover:bg-green-100">
            ✓ {status?.matrix_rubric_count} rubrik
          </Badge>
        ) : (
          <Badge variant="secondary">Belum diunggah</Badge>
        )
      }
    >
      <DropZone
        accept={['.pdf']}
        chosenFileName={file?.name ?? null}
        onFileSelected={setFile}
        disabled={mutation.isPending}
      />
      <Button disabled={!file || mutation.isPending} onClick={() => mutation.mutate()}>
        {mutation.isPending ? 'Mem-parse…' : 'Unggah & Parse'}
      </Button>
    </UploadTile>
  )
}
