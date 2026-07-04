// ami-assessment/frontend/hooks/use-assessment-results.ts
import { useQuery } from '@tanstack/react-query'
import { getAssessmentResults } from '@/lib/api'

export function useAssessmentResults(sessionId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['assessment-results', sessionId],
    queryFn: () => getAssessmentResults(sessionId!),
    enabled: !!sessionId && enabled,
  })
}
