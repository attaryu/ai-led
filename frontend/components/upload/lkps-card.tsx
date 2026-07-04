// ami-assessment/frontend/components/upload/lkps-card.tsx
'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { DropZone } from './drop-zone'
import { useUploadStatus } from '@/hooks/use-upload-status'
import { uploadLkps } from '@/lib/api'

export function LkpsCard() {
  const [file, setFile] = useState<File | null>(null)
  const queryClient = useQueryClient()
  const { data: status } = useUploadStatus()

  const mutation = useMutation({
    mutationFn: () => uploadLkps(file!),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['upload-status'] })
      toast.success(`LKPS dimuat: ${data.non_empty_sheets} sheet berisi data.`)
    },
    onError: (err: Error) => {
      toast.error('Upload LKPS gagal', { description: err.message })
    },
  })

  const isReady = !!status?.lkps_uploaded

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div>
          <CardTitle>3. Data LKPS (Excel)</CardTitle>
          <CardDescription>
            Laporan Kinerja Program Studi — 50 tabel kuantitatif
          </CardDescription>
        </div>
        {isReady ? (
          <Badge className="bg-green-100 text-green-700 hover:bg-green-100">✓ tersimpan</Badge>
        ) : (
          <Badge variant="secondary">Belum diunggah</Badge>
        )}
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
          {mutation.isPending ? 'Mengunggah…' : 'Unggah & Muat'}
        </Button>
      </CardContent>
    </Card>
  )
}
