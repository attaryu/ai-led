// ami-assessment/frontend/lib/api.ts
import type {
  UploadStatusResponse,
  MatrixUploadResponse,
  LedUploadResponse,
  LkpsUploadResponse,
  LaporanUploadResponse,
  StartAssessmentResponse,
  SessionStatusResponse,
  SessionResultsResponse,
  SessionSummary,
  EvalRunRequest,
  EvalRunResponse,
  EvalResultResponse,
  EvalConfigResponse,
} from './types'

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, init)
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(body.detail || res.statusText)
  }
  return res.json() as Promise<T>
}

async function apiUpload<T>(path: string, file: File): Promise<T> {
  const formData = new FormData()
  formData.append('file', file)
  return apiFetch<T>(path, { method: 'POST', body: formData })
}

// ── Upload ────────────────────────────────────────────────────────────────
export const getUploadStatus = () => apiFetch<UploadStatusResponse>('/upload/status')
export const uploadMatrix = (file: File) => apiUpload<MatrixUploadResponse>('/upload/matrix', file)
export const uploadLed = (file: File) => apiUpload<LedUploadResponse>('/upload/led', file)
export const uploadLkps = (file: File) => apiUpload<LkpsUploadResponse>('/upload/lkps', file)
export const uploadLaporan = (file: File) => apiUpload<LaporanUploadResponse>('/upload/laporan', file)

// ── Assessment ────────────────────────────────────────────────────────────
export const startAssessment = (body: { laporan_path?: string }) =>
  apiFetch<StartAssessmentResponse>('/assessment/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

export const getAssessmentStatus = (sessionId: string) =>
  apiFetch<SessionStatusResponse>(`/assessment/${sessionId}/status`)

export const getAssessmentResults = (sessionId: string) =>
  apiFetch<SessionResultsResponse>(`/assessment/${sessionId}/results`)

export const listAssessmentSessions = () =>
  apiFetch<SessionSummary[]>('/assessment/list?limit=50')

// ── Eval ──────────────────────────────────────────────────────────────────
export const runEval = (body: EvalRunRequest) =>
  apiFetch<EvalRunResponse>('/eval/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

export const getEvalResults = (evalId: string) =>
  apiFetch<EvalResultResponse>(`/eval/${evalId}/results`)

export const getEvalConfig = () => apiFetch<EvalConfigResponse>('/eval/config')
