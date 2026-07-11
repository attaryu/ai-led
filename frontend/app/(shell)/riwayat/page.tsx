// ami-assessment/frontend/app/(shell)/riwayat/page.tsx
import { PageHeader } from '@/components/layout/page-header'
import { HistoryPanel } from '@/components/history/history-panel'

export default function RiwayatPage() {
  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Riwayat Penilaian"
        description="Daftar sesi penilaian yang pernah dijalankan"
      />
      <HistoryPanel />
    </div>
  )
}
