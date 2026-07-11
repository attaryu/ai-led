// ami-assessment/frontend/app/(shell)/page.tsx
'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/layout/page-header'
import { StepperNav } from '@/components/layout/stepper-nav'
import { MatrixCard } from '@/components/upload/matrix-card'
import { LedCard } from '@/components/upload/led-card'
import { LkpsCard } from '@/components/upload/lkps-card'
import { LaporanCard } from '@/components/upload/laporan-card'
import { StartCard } from '@/components/assessment/start-card'
import { ProgressPanel } from '@/components/assessment/progress-panel'
import { ResultsTable } from '@/components/assessment/results-table'
import { useAppStore } from '@/lib/store'
import { useUploadStatus } from '@/hooks/use-upload-status'
import { useAssessmentStatus } from '@/hooks/use-assessment-polling'

const WIZARD_STEPS = [
  { step: 1, label: 'Upload Dokumen' },
  { step: 2, label: 'Jalankan Penilaian' },
  { step: 3, label: 'Hasil' },
]

export default function Home() {
  const [laporanPath, setLaporanPathState] = useState<string | null>(null)

  useEffect(() => {
    const stored = sessionStorage.getItem('ami_laporan_path')
    if (stored) setLaporanPathState(stored)
  }, [])

  function setLaporanPath(path: string) {
    setLaporanPathState(path)
    sessionStorage.setItem('ami_laporan_path', path)
  }
  const [displayedStep, setDisplayedStep] = useState(1)
  const [followUnlocked, setFollowUnlocked] = useState(true)

  const sessionId = useAppStore((s) => s.sessionId)
  const { data: uploadStatus } = useUploadStatus()
  const { data: assessmentStatus } = useAssessmentStatus(sessionId)

  const uploadsReady = !!(
    uploadStatus?.matrix_uploaded &&
    uploadStatus?.led_index_state === 'ready' &&
    uploadStatus?.lkps_uploaded
  )

  const unlockedStep = assessmentStatus?.status === 'completed' ? 3 : uploadsReady ? 2 : 1
  const currentStep = followUnlocked ? unlockedStep : displayedStep

  function goToStep(step: number) {
    if (step > unlockedStep) return
    setDisplayedStep(step)
    setFollowUnlocked(step === unlockedStep)
  }

  function goNext() {
    goToStep(currentStep + 1)
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <PageHeader
        title="AMI Assessment"
        description="Penilaian Akreditasi Program Studi — LAM Teknik (Automated)"
      />

      <StepperNav
        steps={WIZARD_STEPS}
        current={currentStep}
        unlockedUpTo={unlockedStep}
        onStepClick={goToStep}
      />

      {currentStep === 1 && (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <MatrixCard />
            <LedCard />
            <LkpsCard />
            <LaporanCard onUploaded={setLaporanPath} />
          </div>
          <div className="flex justify-end">
            <Button disabled={!uploadsReady} onClick={goNext}>
              Lanjut →
            </Button>
          </div>
        </div>
      )}

      {currentStep === 2 && (
        <div className="space-y-4">
          <StartCard laporanPath={laporanPath} />
          <ProgressPanel />
        </div>
      )}

      {currentStep === 3 && <ResultsTable />}
    </div>
  )
}
