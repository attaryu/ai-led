// ami-assessment/frontend/components/shared/upload-tile.tsx
import type { ReactNode } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface UploadTileProps {
  title: string
  description: string
  status: ReactNode
  children: ReactNode
}

export function UploadTile({ title, description, status, children }: UploadTileProps) {
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        {status}
      </CardHeader>
      <CardContent className="space-y-3">{children}</CardContent>
    </Card>
  )
}
