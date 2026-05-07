-- ============================================================================
-- AMI Assessment — Initial Supabase Schema
-- Migration: 001_initial_schema
--
-- Apply via Supabase Dashboard → SQL Editor, or:
--   psql $DATABASE_URL -f db/migrations/001_initial_schema.sql
--
-- Tables:
--   assessment_sessions  — one row per /assessment/start call
--   indicator_results    — one scored indicator per session
--   reasoning_steps      — chain-of-thought log per indicator
-- ============================================================================

-- ----------------------------------------------------------------------------
-- assessment_sessions
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS assessment_sessions (
    id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    session_id           TEXT        NOT NULL UNIQUE,
    laporan_path         TEXT        NOT NULL,
    total_indicators     INTEGER     NOT NULL DEFAULT 0,
    completed_indicators INTEGER     NOT NULL DEFAULT 0,
    status               TEXT        NOT NULL DEFAULT 'running'
                             CHECK (status IN ('running', 'completed', 'failed')),
    error                TEXT,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-update updated_at on every UPDATE
CREATE OR REPLACE FUNCTION _set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sessions_updated_at ON assessment_sessions;
CREATE TRIGGER trg_sessions_updated_at
    BEFORE UPDATE ON assessment_sessions
    FOR EACH ROW EXECUTE FUNCTION _set_updated_at();

-- Index for status polling
CREATE INDEX IF NOT EXISTS idx_sessions_status
    ON assessment_sessions (status);

-- ----------------------------------------------------------------------------
-- indicator_results
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS indicator_results (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    session_id    TEXT           NOT NULL
                      REFERENCES assessment_sessions (session_id) ON DELETE CASCADE,
    indicator_no  INTEGER        NOT NULL,
    score         NUMERIC(5, 2),          -- 0.00–4.00, NULL when error
    justification TEXT,
    confidence    NUMERIC(4, 3),          -- 0.000–1.000
    error         TEXT,
    created_at    TIMESTAMPTZ    NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_indicator_result UNIQUE (session_id, indicator_no)
);

CREATE INDEX IF NOT EXISTS idx_results_session
    ON indicator_results (session_id);

-- ----------------------------------------------------------------------------
-- reasoning_steps
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reasoning_steps (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    session_id    TEXT        NOT NULL,
    indicator_no  INTEGER     NOT NULL,
    step_index    INTEGER     NOT NULL,
    content       TEXT        NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_steps_session_indicator
    ON reasoning_steps (session_id, indicator_no);

-- ----------------------------------------------------------------------------
-- Row-Level Security (RLS)
--
-- Service-role key bypasses RLS, so the FastAPI backend (which uses the
-- service-role key) has full access.  Anon/authenticated clients cannot
-- read or write these tables.
-- ----------------------------------------------------------------------------
ALTER TABLE assessment_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE indicator_results   ENABLE ROW LEVEL SECURITY;
ALTER TABLE reasoning_steps     ENABLE ROW LEVEL SECURITY;

-- Service role always bypasses RLS — no policy needed for the backend.
-- Add read-only policies here if you expose a dashboard later:
--
-- CREATE POLICY "read own sessions"
--     ON assessment_sessions FOR SELECT
--     USING (auth.uid() IS NOT NULL);
