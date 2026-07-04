// ami-assessment/frontend/hooks/use-assessment-polling.ts
import { useQuery } from '@tanstack/react-query'
import { getAssessmentStatus } from '@/lib/api'

export function useAssessmentStatus(sessionId: string | null) {
  return useQuery({
    queryKey: ['assessment-status', sessionId],
    queryFn: () => getAssessmentStatus(sessionId!),
    enabled: !!sessionId,
    refetchInterval: (query) => {
      const s = query.state.data?.status
      return s === 'completed' || s === 'failed' ? false : 4000
    },
  })
}
