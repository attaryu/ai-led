// ami-assessment/frontend/hooks/use-upload-status.ts
import { useQuery } from '@tanstack/react-query'
import { getUploadStatus } from '@/lib/api'

export function useUploadStatus() {
  return useQuery({
    queryKey: ['upload-status'],
    queryFn: getUploadStatus,
    refetchInterval: (query) =>
      query.state.data?.led_index_state === 'indexing' ? 3000 : false,
  })
}
