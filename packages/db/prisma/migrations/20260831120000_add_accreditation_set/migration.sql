-- CreateEnum
CREATE TYPE "AccreditationSetStatus" AS ENUM ('DRAF', 'SIAP');

-- CreateEnum
CREATE TYPE "RubricScoreType" AS ENUM ('KUALITATIF', 'KUANTITATIF', 'KOMPOSIT');

-- DropIndex
DROP INDEX "document_registry_embedding_hnsw_idx";

-- DropIndex
DROP INDEX "bukti_dukung_chunk_embeddings_embedding_hnsw_idx";

-- DropIndex
DROP INDEX "led_chunk_embeddings_embedding_hnsw_idx";

-- AlterTable
ALTER TABLE "assessment_indicator_results" RENAME CONSTRAINT "indicator_results_pkey" TO "assessment_indicator_results_pkey";

-- AlterTable
ALTER TABLE "assessment_reasoning_steps" RENAME CONSTRAINT "reasoning_steps_pkey" TO "assessment_reasoning_steps_pkey";

-- AlterTable
ALTER TABLE "evidence_chapter_links" RENAME CONSTRAINT "bukti_dukung_bab_pkey" TO "evidence_chapter_links_pkey";

-- AlterTable
ALTER TABLE "evidence_chunk_embeddings" RENAME CONSTRAINT "bukti_dukung_chunk_embeddings_pkey" TO "evidence_chunk_embeddings_pkey";

-- AlterTable
ALTER TABLE "evidence_draft_links" RENAME CONSTRAINT "bukti_dukung_draft_pkey" TO "evidence_draft_links_pkey";

-- AlterTable
ALTER TABLE "evidence_files" RENAME CONSTRAINT "bukti_dukung_pkey" TO "evidence_files_pkey";

-- AlterTable
ALTER TABLE "guide_detail_chapters" RENAME CONSTRAINT "panduan_detail_bab_pkey" TO "guide_detail_chapters_pkey";

-- AlterTable
ALTER TABLE "guide_details" RENAME CONSTRAINT "panduan_detail_pkey" TO "guide_details_pkey";

-- AlterTable
ALTER TABLE "guide_references" RENAME CONSTRAINT "panduan_referensi_pkey" TO "guide_references_pkey";
ALTER TABLE "guide_references" ADD COLUMN     "accreditation_set_id" TEXT;

-- AlterTable
ALTER TABLE "infra_jobs" RENAME CONSTRAINT "jobs_pkey" TO "infra_jobs_pkey";

-- AlterTable
ALTER TABLE "org_study_programs" RENAME CONSTRAINT "program_studi_pkey" TO "org_study_programs_pkey";

-- AlterTable
ALTER TABLE "org_tenants" RENAME CONSTRAINT "tenant_pkey" TO "org_tenants_pkey";

-- AlterTable
ALTER TABLE "org_users" RENAME CONSTRAINT "user_pkey" TO "org_users_pkey";

-- Existing 64 rows predate accreditation_set_id/indicator_no/criterion_group/score_type
-- (all NOT NULL below), and rubric_score_results referencing them is empty (verified
-- live against the dev DB) -- wipe and let
-- packages/db/prisma/seed-rubric-criteria.ts fully repopulate them scoped to the new
-- default "LAM Teknik (Default)" AccreditationSet right after this migration runs.
DELETE FROM "rubric_score_results";
DELETE FROM "rubric_criterion_chapters";
DELETE FROM "rubric_levels";
DELETE FROM "rubric_criteria";

-- AlterTable
ALTER TABLE "rubric_criteria" RENAME CONSTRAINT "rubrik_kriteria_pkey" TO "rubric_criteria_pkey";
ALTER TABLE "rubric_criteria"
ADD COLUMN     "accreditation_set_id" TEXT NOT NULL,
ADD COLUMN     "criterion_group" TEXT NOT NULL,
ADD COLUMN     "formula" TEXT,
ADD COLUMN     "indicator_no" INTEGER NOT NULL,
ADD COLUMN     "lkps_table_refs" TEXT[],
ADD COLUMN     "score_type" "RubricScoreType" NOT NULL,
ADD COLUMN     "sub_score_formula" TEXT;

-- AlterTable
ALTER TABLE "rubric_criterion_chapters" RENAME CONSTRAINT "rubrik_kriteria_bab_pkey" TO "rubric_criterion_chapters_pkey";

-- AlterTable
ALTER TABLE "rubric_levels" RENAME CONSTRAINT "rubrik_level_pkey" TO "rubric_levels_pkey";

-- AlterTable
ALTER TABLE "rubric_score_results" RENAME CONSTRAINT "hasil_skor_kriteria_pkey" TO "rubric_score_results_pkey";

-- AlterTable
ALTER TABLE "writing_chapter_drafts" RENAME CONSTRAINT "bab_draft_pkey" TO "writing_chapter_drafts_pkey";

-- AlterTable
ALTER TABLE "writing_chat_messages" RENAME CONSTRAINT "chat_messages_pkey" TO "writing_chat_messages_pkey";

-- AlterTable
ALTER TABLE "writing_document_chapters" RENAME CONSTRAINT "bab_dokumen_pkey" TO "writing_document_chapters_pkey";

-- AlterTable
ALTER TABLE "writing_eval_results" RENAME CONSTRAINT "eval_results_pkey" TO "writing_eval_results_pkey";

-- AlterTable
ALTER TABLE "writing_generation_runs" RENAME CONSTRAINT "generation_runs_pkey" TO "writing_generation_runs_pkey";

-- AlterTable
ALTER TABLE "writing_led_chunk_embeddings" RENAME CONSTRAINT "led_chunk_embeddings_pkey" TO "writing_led_chunk_embeddings_pkey";

-- AlterTable
ALTER TABLE "writing_led_documents" RENAME CONSTRAINT "dokumen_led_pkey" TO "writing_led_documents_pkey";
ALTER TABLE "writing_led_documents" ADD COLUMN     "accreditation_set_id" TEXT;

-- AlterTable
ALTER TABLE "writing_ragas_scores" RENAME CONSTRAINT "ragas_scores_pkey" TO "writing_ragas_scores_pkey";

-- CreateTable
CREATE TABLE "accreditation_sets" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "nama" TEXT NOT NULL,
    "lembaga" TEXT NOT NULL,
    "tahun_siklus" INTEGER NOT NULL,
    "status" "AccreditationSetStatus" NOT NULL DEFAULT 'DRAF',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accreditation_sets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "accreditation_sets_tenant_id_idx" ON "accreditation_sets"("tenant_id");

-- CreateIndex
CREATE INDEX "guide_references_accreditation_set_id_idx" ON "guide_references"("accreditation_set_id");

-- CreateIndex
CREATE UNIQUE INDEX "rubric_criteria_accreditation_set_id_indicator_no_key" ON "rubric_criteria"("accreditation_set_id", "indicator_no");

-- CreateIndex
CREATE INDEX "writing_led_documents_accreditation_set_id_idx" ON "writing_led_documents"("accreditation_set_id");

-- RenameForeignKey
ALTER TABLE "assessment_indicator_results" RENAME CONSTRAINT "indicator_results_session_id_fkey" TO "assessment_indicator_results_session_id_fkey";

-- RenameForeignKey
ALTER TABLE "assessment_reasoning_steps" RENAME CONSTRAINT "reasoning_steps_session_id_fkey" TO "assessment_reasoning_steps_session_id_fkey";

-- RenameForeignKey
ALTER TABLE "assessment_sessions" RENAME CONSTRAINT "assessment_sessions_dokumen_id_fkey" TO "assessment_sessions_document_id_fkey";

-- RenameForeignKey
ALTER TABLE "assessment_sessions" RENAME CONSTRAINT "assessment_sessions_laporan_bukti_dukung_id_fkey" TO "assessment_sessions_report_evidence_id_fkey";

-- RenameForeignKey
ALTER TABLE "assessment_verdicts" RENAME CONSTRAINT "assessment_verdicts_ditinjau_oleh_user_id_fkey" TO "assessment_verdicts_reviewed_by_user_id_fkey";

-- RenameForeignKey
ALTER TABLE "assessment_verdicts" RENAME CONSTRAINT "assessment_verdicts_dokumen_id_fkey" TO "assessment_verdicts_document_id_fkey";

-- RenameForeignKey
ALTER TABLE "assessment_verdicts" RENAME CONSTRAINT "assessment_verdicts_sesi_id_saat_ditinjau_fkey" TO "assessment_verdicts_session_id_at_review_fkey";

-- RenameForeignKey
ALTER TABLE "evidence_chapter_links" RENAME CONSTRAINT "bukti_dukung_bab_bab_dokumen_id_fkey" TO "evidence_chapter_links_chapter_id_fkey";

-- RenameForeignKey
ALTER TABLE "evidence_chapter_links" RENAME CONSTRAINT "bukti_dukung_bab_bukti_dukung_id_fkey" TO "evidence_chapter_links_evidence_id_fkey";

-- RenameForeignKey
ALTER TABLE "evidence_chunk_embeddings" RENAME CONSTRAINT "bukti_dukung_chunk_embeddings_bukti_dukung_id_fkey" TO "evidence_chunk_embeddings_evidence_id_fkey";

-- RenameForeignKey
ALTER TABLE "evidence_chunk_embeddings" RENAME CONSTRAINT "bukti_dukung_chunk_embeddings_tenant_id_fkey" TO "evidence_chunk_embeddings_tenant_id_fkey";

-- RenameForeignKey
ALTER TABLE "evidence_draft_links" RENAME CONSTRAINT "bukti_dukung_draft_bab_draft_id_fkey" TO "evidence_draft_links_draft_id_fkey";

-- RenameForeignKey
ALTER TABLE "evidence_draft_links" RENAME CONSTRAINT "bukti_dukung_draft_bukti_dukung_id_fkey" TO "evidence_draft_links_evidence_id_fkey";

-- RenameForeignKey
ALTER TABLE "evidence_files" RENAME CONSTRAINT "bukti_dukung_diunggah_oleh_user_id_fkey" TO "evidence_files_uploaded_by_user_id_fkey";

-- RenameForeignKey
ALTER TABLE "evidence_files" RENAME CONSTRAINT "bukti_dukung_program_studi_id_fkey" TO "evidence_files_study_program_id_fkey";

-- RenameForeignKey
ALTER TABLE "evidence_files" RENAME CONSTRAINT "bukti_dukung_tenant_id_fkey" TO "evidence_files_tenant_id_fkey";

-- RenameForeignKey
ALTER TABLE "guide_detail_chapters" RENAME CONSTRAINT "panduan_detail_bab_panduan_detail_id_fkey" TO "guide_detail_chapters_guide_detail_id_fkey";

-- RenameForeignKey
ALTER TABLE "guide_details" RENAME CONSTRAINT "panduan_detail_panduan_id_fkey" TO "guide_details_guide_id_fkey";

-- RenameForeignKey
ALTER TABLE "infra_jobs" RENAME CONSTRAINT "jobs_created_by_user_id_fkey" TO "infra_jobs_created_by_user_id_fkey";

-- RenameForeignKey
ALTER TABLE "infra_jobs" RENAME CONSTRAINT "jobs_tenant_id_fkey" TO "infra_jobs_tenant_id_fkey";

-- RenameForeignKey
ALTER TABLE "org_study_programs" RENAME CONSTRAINT "program_studi_tenant_id_fkey" TO "org_study_programs_tenant_id_fkey";

-- RenameForeignKey
ALTER TABLE "org_users" RENAME CONSTRAINT "user_program_studi_id_fkey" TO "org_users_study_program_id_fkey";

-- RenameForeignKey
ALTER TABLE "org_users" RENAME CONSTRAINT "user_tenant_id_fkey" TO "org_users_tenant_id_fkey";

-- RenameForeignKey
ALTER TABLE "rubric_criterion_chapters" RENAME CONSTRAINT "rubrik_kriteria_bab_kriteria_id_fkey" TO "rubric_criterion_chapters_criterion_id_fkey";

-- RenameForeignKey
ALTER TABLE "rubric_levels" RENAME CONSTRAINT "rubrik_level_kriteria_id_fkey" TO "rubric_levels_criterion_id_fkey";

-- RenameForeignKey
ALTER TABLE "rubric_score_results" RENAME CONSTRAINT "hasil_skor_kriteria_bab_draft_id_fkey" TO "rubric_score_results_draft_id_fkey";

-- RenameForeignKey
ALTER TABLE "rubric_score_results" RENAME CONSTRAINT "hasil_skor_kriteria_bab_id_fkey" TO "rubric_score_results_chapter_id_fkey";

-- RenameForeignKey
ALTER TABLE "rubric_score_results" RENAME CONSTRAINT "hasil_skor_kriteria_dijalankan_oleh_user_id_fkey" TO "rubric_score_results_run_by_user_id_fkey";

-- RenameForeignKey
ALTER TABLE "rubric_score_results" RENAME CONSTRAINT "hasil_skor_kriteria_kriteria_id_fkey" TO "rubric_score_results_criterion_id_fkey";

-- RenameForeignKey
ALTER TABLE "writing_chapter_drafts" RENAME CONSTRAINT "bab_draft_bab_id_fkey" TO "writing_chapter_drafts_chapter_id_fkey";

-- RenameForeignKey
ALTER TABLE "writing_chapter_drafts" RENAME CONSTRAINT "bab_draft_dibuat_oleh_user_id_fkey" TO "writing_chapter_drafts_created_by_user_id_fkey";

-- RenameForeignKey
ALTER TABLE "writing_chat_messages" RENAME CONSTRAINT "chat_messages_bab_dokumen_id_fkey" TO "writing_chat_messages_chapter_id_fkey";

-- RenameForeignKey
ALTER TABLE "writing_chat_messages" RENAME CONSTRAINT "chat_messages_user_id_fkey" TO "writing_chat_messages_user_id_fkey";

-- RenameForeignKey
ALTER TABLE "writing_document_chapters" RENAME CONSTRAINT "bab_dokumen_checkpoint_aktif_id_fkey" TO "writing_document_chapters_active_checkpoint_id_fkey";

-- RenameForeignKey
ALTER TABLE "writing_document_chapters" RENAME CONSTRAINT "bab_dokumen_dokumen_id_fkey" TO "writing_document_chapters_document_id_fkey";

-- RenameForeignKey
ALTER TABLE "writing_eval_results" RENAME CONSTRAINT "eval_results_generation_run_id_fkey" TO "writing_eval_results_generation_run_id_fkey";

-- RenameForeignKey
ALTER TABLE "writing_generation_runs" RENAME CONSTRAINT "generation_runs_bab_draft_id_fkey" TO "writing_generation_runs_chapter_draft_id_fkey";

-- RenameForeignKey
ALTER TABLE "writing_led_chunk_embeddings" RENAME CONSTRAINT "led_chunk_embeddings_dokumen_id_fkey" TO "writing_led_chunk_embeddings_document_id_fkey";

-- RenameForeignKey
ALTER TABLE "writing_led_chunk_embeddings" RENAME CONSTRAINT "led_chunk_embeddings_tenant_id_fkey" TO "writing_led_chunk_embeddings_tenant_id_fkey";

-- RenameForeignKey
ALTER TABLE "writing_led_documents" RENAME CONSTRAINT "dokumen_led_program_studi_id_fkey" TO "writing_led_documents_study_program_id_fkey";

-- RenameForeignKey
ALTER TABLE "writing_ragas_scores" RENAME CONSTRAINT "ragas_scores_bab_draft_id_fkey" TO "writing_ragas_scores_chapter_draft_id_fkey";

-- RenameForeignKey
ALTER TABLE "writing_ragas_scores" RENAME CONSTRAINT "ragas_scores_bab_id_fkey" TO "writing_ragas_scores_chapter_id_fkey";

-- AddForeignKey
ALTER TABLE "writing_led_documents" ADD CONSTRAINT "writing_led_documents_accreditation_set_id_fkey" FOREIGN KEY ("accreditation_set_id") REFERENCES "accreditation_sets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accreditation_sets" ADD CONSTRAINT "accreditation_sets_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "org_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rubric_criteria" ADD CONSTRAINT "rubric_criteria_accreditation_set_id_fkey" FOREIGN KEY ("accreditation_set_id") REFERENCES "accreditation_sets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guide_references" ADD CONSTRAINT "guide_references_accreditation_set_id_fkey" FOREIGN KEY ("accreditation_set_id") REFERENCES "accreditation_sets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "indicator_results_session_id_indicator_no_key" RENAME TO "assessment_indicator_results_session_id_indicator_no_key";

-- RenameIndex
ALTER INDEX "reasoning_steps_session_id_indicator_no_idx" RENAME TO "assessment_reasoning_steps_session_id_indicator_no_idx";

-- RenameIndex
ALTER INDEX "assessment_verdicts_dokumen_id_indikator_no_key" RENAME TO "assessment_verdicts_document_id_indicator_no_key";

-- RenameIndex
ALTER INDEX "bukti_dukung_bab_bukti_dukung_id_bab_dokumen_id_key" RENAME TO "evidence_chapter_links_evidence_id_chapter_id_key";

-- RenameIndex
ALTER INDEX "bukti_dukung_chunk_embeddings_bukti_dukung_id_chunk_id_key" RENAME TO "evidence_chunk_embeddings_evidence_id_chunk_id_key";

-- RenameIndex
ALTER INDEX "bukti_dukung_chunk_embeddings_tenant_id_bukti_dukung_id_idx" RENAME TO "evidence_chunk_embeddings_tenant_id_evidence_id_idx";

-- RenameIndex
ALTER INDEX "bukti_dukung_draft_bukti_dukung_id_bab_draft_id_key" RENAME TO "evidence_draft_links_evidence_id_draft_id_key";

-- RenameIndex
ALTER INDEX "bukti_dukung_program_studi_id_idx" RENAME TO "evidence_files_study_program_id_idx";

-- RenameIndex
ALTER INDEX "bukti_dukung_tenant_id_idx" RENAME TO "evidence_files_tenant_id_idx";

-- RenameIndex
ALTER INDEX "jobs_queue_name_bull_job_id_key" RENAME TO "infra_jobs_queue_name_bull_job_id_key";

-- RenameIndex
ALTER INDEX "jobs_tenant_id_status_idx" RENAME TO "infra_jobs_tenant_id_status_idx";

-- RenameIndex
ALTER INDEX "program_studi_tenant_id_idx" RENAME TO "org_study_programs_tenant_id_idx";

-- RenameIndex
ALTER INDEX "user_email_key" RENAME TO "org_users_email_key";

-- RenameIndex
ALTER INDEX "user_tenant_id_idx" RENAME TO "org_users_tenant_id_idx";

-- RenameIndex
ALTER INDEX "rubrik_kriteria_bab_kriteria_id_urutan_bab_key" RENAME TO "rubric_criterion_chapters_criterion_id_chapter_order_key";

-- RenameIndex
ALTER INDEX "rubrik_level_kriteria_id_skor_key" RENAME TO "rubric_levels_criterion_id_score_key";

-- RenameIndex
ALTER INDEX "hasil_skor_kriteria_bab_draft_id_idx" RENAME TO "rubric_score_results_draft_id_idx";

-- RenameIndex
ALTER INDEX "hasil_skor_kriteria_bab_id_idx" RENAME TO "rubric_score_results_chapter_id_idx";

-- RenameIndex
ALTER INDEX "bab_draft_bab_id_idx" RENAME TO "writing_chapter_drafts_chapter_id_idx";

-- RenameIndex
ALTER INDEX "bab_draft_bab_id_versi_key" RENAME TO "writing_chapter_drafts_chapter_id_version_key";

-- RenameIndex
ALTER INDEX "chat_messages_bab_dokumen_id_idx" RENAME TO "writing_chat_messages_chapter_id_idx";

-- RenameIndex
ALTER INDEX "bab_dokumen_dokumen_id_urutan_bab_key" RENAME TO "writing_document_chapters_document_id_chapter_order_key";

-- RenameIndex
ALTER INDEX "eval_results_generation_run_id_key" RENAME TO "writing_eval_results_generation_run_id_key";

-- RenameIndex
ALTER INDEX "generation_runs_bab_draft_id_key" RENAME TO "writing_generation_runs_chapter_draft_id_key";

-- RenameIndex
ALTER INDEX "led_chunk_embeddings_dokumen_id_chunk_id_key" RENAME TO "writing_led_chunk_embeddings_document_id_chunk_id_key";

-- RenameIndex
ALTER INDEX "led_chunk_embeddings_tenant_id_dokumen_id_idx" RENAME TO "writing_led_chunk_embeddings_tenant_id_document_id_idx";

-- RenameIndex
ALTER INDEX "dokumen_led_program_studi_id_idx" RENAME TO "writing_led_documents_study_program_id_idx";

-- RenameIndex
ALTER INDEX "ragas_scores_bab_draft_id_idx" RENAME TO "writing_ragas_scores_chapter_draft_id_idx";

-- RenameIndex
ALTER INDEX "ragas_scores_bab_id_idx" RENAME TO "writing_ragas_scores_chapter_id_idx";
