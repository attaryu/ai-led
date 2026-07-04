// ami-assessment/frontend/lib/types.ts

// ── Upload (mirrors backend/api/routes/upload.py) ───────────────────────────
export interface UploadStatusResponse {
  matrix_uploaded: boolean
  matrix_rubric_count: number
  matrix_error: string | null
  led_uploaded: boolean
  lkps_uploaded: boolean
  laporan_uploaded: boolean
  led_index_state: 'idle' | 'indexing' | 'ready' | 'error'
  led_chunk_count: number
  led_error: string | null
}

export interface MatrixUploadResponse {
  message: string
  filename: string
  rubric_count: number
  cache_path: string
}

export interface LedUploadResponse {
  message: string
  filename: string
  size_bytes: number
}

export interface LkpsUploadResponse {
  message: string
  filename: string
  sheet_count: number
  non_empty_sheets: number
}

export interface LaporanUploadResponse {
  message: string
  filename: string
  laporan_path: string
  size_bytes: number
}

// ── Assessment (mirrors backend/api/routes/assessment.py) ───────────────────
export interface StartAssessmentResponse {
  session_id: string
  total_indicators: number
  message: string
}

export interface SessionStatusResponse {
  session_id: string
  status: string
  total_indicators: number
  completed_indicators: number
  error?: string | null
}

export interface IndicatorResultItem {
  indicator_no: number
  kriteria?: string | null
  score?: number | null
  justification?: string | null
  confidence?: number | null
  error?: string | null
}

export interface SessionResultsResponse {
  session_id: string
  status: string
  total_indicators: number
  completed_indicators: number
  results: IndicatorResultItem[]
}

export interface SessionSummary {
  session_id: string
  status: string
  total_indicators: number
  completed_indicators: number
  created_at?: string | null
  updated_at?: string | null
  avg_score?: number | null
  error?: string | null
}

// ── Eval (mirrors backend/api/routes/eval.py) ────────────────────────────────
export interface EvalRunRequest {
  session_id?: string
  n_indicators: number
  metrics: string[]
  reference_path?: string
}

export interface EvalRunResponse {
  eval_id: string
  message: string
  n_indicators: number
}

export interface EvalResultResponse {
  eval_id: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  n_samples?: number | null
  session_id?: string | null
  scores?: Record<string, number> | null
  per_indicator?: unknown[] | null
  provider?: string | null
  model?: string | null
  started_at?: string | null
  finished_at?: string | null
  progress_stage?: string | null
  progress_current?: number | null
  progress_total?: number | null
  error?: string | null
}

export interface EvalConfigResponse {
  judge_provider: string
  judge_model: string
  assessment_provider: string
  assessment_model: string
}

// ── Client-only (not from the backend) ───────────────────────────────────────
export interface EvalHistoryEntry {
  eval_id: string
  provider?: string
  model?: string
  n_samples?: number
  scores: Record<string, number>
  finished_at: string
}
