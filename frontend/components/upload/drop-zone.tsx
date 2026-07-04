// ami-assessment/frontend/components/upload/drop-zone.tsx
'use client'

import { useRef, useState } from 'react'
import { cn } from '@/lib/utils'

interface DropZoneProps {
  accept: string[]
  onFileSelected: (file: File) => void
  chosenFileName: string | null
  disabled?: boolean
}

export function DropZone({ accept, onFileSelected, chosenFileName, disabled }: DropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragOver, setIsDragOver] = useState(false)

  function isAcceptedFile(name: string) {
    const lower = name.toLowerCase()
    return accept.some((ext) => lower.endsWith(ext))
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setIsDragOver(false)
    const file = e.dataTransfer.files[0]
    if (!file) return
    if (!isAcceptedFile(file.name)) return
    onFileSelected(file)
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => !disabled && inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault()
        setIsDragOver(true)
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
      className={cn(
        'rounded-md border-2 border-dashed border-muted-foreground/30 p-5 text-center text-sm text-muted-foreground cursor-pointer transition-colors',
        isDragOver && 'border-primary bg-primary/5 text-primary',
        disabled && 'pointer-events-none opacity-50'
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept.join(',')}
        className="hidden"
        disabled={disabled}
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onFileSelected(file)
        }}
      />
      <div>Klik atau seret file ke sini</div>
      {chosenFileName && (
        <div className="mt-1 font-medium text-foreground">{chosenFileName}</div>
      )}
    </div>
  )
}
