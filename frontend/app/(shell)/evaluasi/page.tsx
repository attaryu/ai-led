// ami-assessment/frontend/app/(shell)/evaluasi/page.tsx
import { PageHeader } from '@/components/layout/page-header'
import { RagasPanel } from '@/components/eval/ragas-panel'

export default function EvaluasiPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <PageHeader
        title="Evaluasi RAGAS"
        description="Bandingkan kualitas retrieval & generation antar model"
      />
      <RagasPanel />
    </div>
  )
}
