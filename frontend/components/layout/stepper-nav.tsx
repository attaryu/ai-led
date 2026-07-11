// ami-assessment/frontend/components/layout/stepper-nav.tsx
'use client'

import { Fragment } from 'react'
import { cn } from '@/lib/utils'

export interface WizardStep {
  step: number
  label: string
}

interface StepperNavProps {
  steps: WizardStep[]
  current: number
  unlockedUpTo: number
  onStepClick: (step: number) => void
}

export function StepperNav({ steps, current, unlockedUpTo, onStepClick }: StepperNavProps) {
  return (
    <nav aria-label="Langkah penilaian" className="flex items-center">
      {steps.map((s, i) => {
        const isLast = i === steps.length - 1
        const isUnlocked = s.step <= unlockedUpTo
        const isCurrent = s.step === current
        const isComplete = s.step < unlockedUpTo

        return (
          <Fragment key={s.step}>
            <button
              type="button"
              disabled={!isUnlocked}
              onClick={() => onStepClick(s.step)}
              className={cn(
                'flex items-center gap-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40',
                isCurrent ? 'text-primary' : isComplete ? 'text-foreground' : 'text-muted-foreground'
              )}
            >
              <span
                className={cn(
                  'flex size-6 shrink-0 items-center justify-center rounded-full border text-xs',
                  isCurrent
                    ? 'border-primary bg-primary text-primary-foreground'
                    : isComplete
                      ? 'border-primary/40 bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground'
                )}
              >
                {isComplete ? '✓' : s.step}
              </span>
              {s.label}
            </button>
            {!isLast && <div className="mx-3 h-px flex-1 bg-border" />}
          </Fragment>
        )
      })}
    </nav>
  )
}
