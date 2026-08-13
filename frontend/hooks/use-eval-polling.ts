// ami-assessment/frontend/hooks/use-eval-polling.ts
import { useQuery } from '@tanstack/react-query'
import { getEvalResults } from '@/lib/api'

export function useEvalResults(evalId: string | null) {
  return useQuery({
    queryKey: ['eval-results', evalId],
    queryFn: () => getEvalResults(evalId!),
    enabled: !!evalId,
    refetchInterval: (query) => {
      const s = query.state.data?.status
      return s === 'completed' || s === 'failed' ? false : 3000
    },
  })
}
