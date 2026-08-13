// ami-assessment/frontend/components/shared/stat-card.tsx
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface StatCardProps {
  label: string
  value: ReactNode
  valueClassName?: string
}

export function StatCard({ label, value, valueClassName }: StatCardProps) {
  return (
    <div className="rounded-md border p-3">
      <div className={cn('text-2xl font-bold', valueClassName)}>{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  )
}
