// ami-assessment/frontend/lib/store.ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { EvalHistoryEntry } from './types'

interface AppStore {
  sessionId: string | null
  setSessionId: (id: string | null) => void
  evalHistory: EvalHistoryEntry[]
  addEvalRun: (entry: EvalHistoryEntry) => void
  removeEvalRun: (evalId: string) => void
  clearEvalHistory: () => void
}

export const useAppStore = create<AppStore>()(
  persist(
    (set) => ({
      sessionId: null,
      setSessionId: (id) => set({ sessionId: id }),
      evalHistory: [],
      addEvalRun: (entry) =>
        set((state) => ({ evalHistory: [...state.evalHistory, entry] })),
      removeEvalRun: (evalId) =>
        set((state) => ({
          evalHistory: state.evalHistory.filter((e) => e.eval_id !== evalId),
        })),
      clearEvalHistory: () => set({ evalHistory: [] }),
    }),
    {
      name: 'ami_ragas_history_v1',
      partialize: (state) => ({ evalHistory: state.evalHistory }),
    }
  )
)
