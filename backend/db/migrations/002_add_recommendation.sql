-- ============================================================================
-- AMI Assessment — Add recommendation column
-- Migration: 002_add_recommendation
--
-- Apply via Supabase Dashboard → SQL Editor, or:
--   psql $DATABASE_URL -f db/migrations/002_add_recommendation.sql
-- ============================================================================

ALTER TABLE indicator_results
    ADD COLUMN IF NOT EXISTS recommendation TEXT;
