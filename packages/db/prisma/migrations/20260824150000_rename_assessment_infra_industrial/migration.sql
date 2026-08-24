-- Group 6 (final) of the DB naming cleanup: assessment_*/infra_* field cleanup
-- and module-prefix rename for the two tables that weren't already prefixed.
-- Pure renames only (no drop/create) so existing rows and FK constraints survive.

-- jobs -> infra_jobs (already English fields, table rename only)
ALTER TABLE "jobs" RENAME TO "infra_jobs";

-- assessment_sessions (name kept) — field cleanup
ALTER TABLE "assessment_sessions" RENAME COLUMN "dokumen_id" TO "document_id";
ALTER TABLE "assessment_sessions" RENAME COLUMN "laporan_bukti_dukung_id" TO "report_evidence_id";
ALTER TABLE "assessment_sessions" RENAME COLUMN "sumber_led" TO "led_source";
ALTER TABLE "assessment_sessions" RENAME COLUMN "lkps_bukti_dukung_id" TO "lkps_evidence_id";

-- indicator_results -> assessment_indicator_results (already English fields, table rename only)
ALTER TABLE "indicator_results" RENAME TO "assessment_indicator_results";

-- reasoning_steps -> assessment_reasoning_steps (already English fields, table rename only)
ALTER TABLE "reasoning_steps" RENAME TO "assessment_reasoning_steps";

-- assessment_verdicts (name kept) — field cleanup
ALTER TABLE "assessment_verdicts" RENAME COLUMN "dokumen_id" TO "document_id";
ALTER TABLE "assessment_verdicts" RENAME COLUMN "indikator_no" TO "indicator_no";
ALTER TABLE "assessment_verdicts" RENAME COLUMN "skor_final" TO "final_score";
ALTER TABLE "assessment_verdicts" RENAME COLUMN "catatan" TO "note";
ALTER TABLE "assessment_verdicts" RENAME COLUMN "skor_mesin_saat_ditinjau" TO "machine_score_at_review";
ALTER TABLE "assessment_verdicts" RENAME COLUMN "sesi_id_saat_ditinjau" TO "session_id_at_review";
ALTER TABLE "assessment_verdicts" RENAME COLUMN "ditinjau_oleh_user_id" TO "reviewed_by_user_id";
ALTER TABLE "assessment_verdicts" RENAME COLUMN "ditinjau_oleh_nama" TO "reviewed_by_name";
ALTER TABLE "assessment_verdicts" RENAME COLUMN "ditinjau_pada" TO "reviewed_at";
