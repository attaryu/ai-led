// ami-assessment/frontend/hooks/use-assessment-list.ts
import { useQuery } from '@tanstack/react-query'
import { listAssessmentSessions } from '@/lib/api'

export function useAssessmentList() {
  return useQuery({
    queryKey: ['assessment-list'],
    queryFn: listAssessmentSessions,
  })
}
