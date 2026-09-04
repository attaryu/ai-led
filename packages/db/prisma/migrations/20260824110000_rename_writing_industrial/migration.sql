-- Hand-written rename migration (DB naming cleanup, group 2: writing_*).
-- Same reasoning as the org_* migration: Prisma's diff engine can't tell a
-- simultaneous rename+field-change from DROP+CREATE. Every statement below
-- is a pure RENAME, matching schema.prisma's LedDocument/DocumentChapter/
-- ChapterDraft/GenerationRun/RagasScore/ChatMessage/EvalResult/LedChunkEmbedding.
--
-- Ripple note: bab_dokumen_id/bab_draft_id/dokumen_id FK columns on tables
-- OUTSIDE this group (bukti_dukung_bab, bukti_dukung_draft, hasil_skor_kriteria,
-- assessment_sessions, assessment_verdicts) are untouched here — Postgres
-- table renames don't break existing FK constraints, and those columns get
-- renamed in their own group's migration later.

-- DokumenLed -> LedDocument / writing_led_documents
ALTER TABLE "dokumen_led" RENAME TO "writing_led_documents";
ALTER TABLE "writing_led_documents" RENAME COLUMN "judul" TO "title";
ALTER TABLE "writing_led_documents" RENAME COLUMN "tahun_akademik" TO "academic_year";
ALTER TABLE "writing_led_documents" RENAME COLUMN "status_keseluruhan" TO "overall_status";
ALTER TABLE "writing_led_documents" RENAME COLUMN "tenggat" TO "deadline";
ALTER TABLE "writing_led_documents" RENAME COLUMN "dibuat_pada" TO "created_at";

-- BabDokumen -> DocumentChapter / writing_document_chapters
ALTER TABLE "bab_dokumen" RENAME TO "writing_document_chapters";
ALTER TABLE "writing_document_chapters" RENAME COLUMN "dokumen_id" TO "document_id";
ALTER TABLE "writing_document_chapters" RENAME COLUMN "urutan_bab" TO "chapter_order";
ALTER TABLE "writing_document_chapters" RENAME COLUMN "judul_bab" TO "chapter_title";
ALTER TABLE "writing_document_chapters" RENAME COLUMN "konten_kerja" TO "working_content";
ALTER TABLE "writing_document_chapters" RENAME COLUMN "checkpoint_aktif_id" TO "active_checkpoint_id";
ALTER TABLE "writing_document_chapters" RENAME COLUMN "catatan_penjamin_mutu" TO "quality_assurance_note";
ALTER TABLE "writing_document_chapters" RENAME COLUMN "catatan_oleh_nama" TO "noted_by_name";
ALTER TABLE "writing_document_chapters" RENAME COLUMN "catatan_pada" TO "noted_at";
ALTER TABLE "writing_document_chapters" RENAME COLUMN "diajukan_review_pada" TO "review_submitted_at";
ALTER TABLE "writing_document_chapters" RENAME COLUMN "terakhir_disimpan" TO "last_saved_at";

-- BabDraft -> ChapterDraft / writing_chapter_drafts
ALTER TABLE "bab_draft" RENAME TO "writing_chapter_drafts";
ALTER TABLE "writing_chapter_drafts" RENAME COLUMN "bab_id" TO "chapter_id";
ALTER TABLE "writing_chapter_drafts" RENAME COLUMN "dibuat_oleh_user_id" TO "created_by_user_id";
ALTER TABLE "writing_chapter_drafts" RENAME COLUMN "versi" TO "version";
ALTER TABLE "writing_chapter_drafts" RENAME COLUMN "konten_snapshot" TO "content_snapshot";
ALTER TABLE "writing_chapter_drafts" RENAME COLUMN "sumber" TO "source";
ALTER TABLE "writing_chapter_drafts" RENAME COLUMN "referensi_chunk_ids" TO "reference_chunk_ids";
ALTER TABLE "writing_chapter_drafts" RENAME COLUMN "dibuat_oleh_nama" TO "created_by_name";
ALTER TABLE "writing_chapter_drafts" RENAME COLUMN "dibuat_pada" TO "created_at";

-- GenerationRun / writing_generation_runs
ALTER TABLE "generation_runs" RENAME TO "writing_generation_runs";
ALTER TABLE "writing_generation_runs" RENAME COLUMN "bab_draft_id" TO "chapter_draft_id";
ALTER TABLE "writing_generation_runs" RENAME COLUMN "pedoman_used" TO "guidelines_used";

-- RagasScore / writing_ragas_scores
ALTER TABLE "ragas_scores" RENAME TO "writing_ragas_scores";
ALTER TABLE "writing_ragas_scores" RENAME COLUMN "target_tipe" TO "target_type";
ALTER TABLE "writing_ragas_scores" RENAME COLUMN "bab_id" TO "chapter_id";
ALTER TABLE "writing_ragas_scores" RENAME COLUMN "bab_draft_id" TO "chapter_draft_id";
ALTER TABLE "writing_ragas_scores" RENAME COLUMN "metrik" TO "metrics";
ALTER TABLE "writing_ragas_scores" RENAME COLUMN "jumlah_chunk" TO "chunk_count";
ALTER TABLE "writing_ragas_scores" RENAME COLUMN "dihitung_pada" TO "computed_at";

-- ChatMessage / writing_chat_messages
ALTER TABLE "chat_messages" RENAME TO "writing_chat_messages";
ALTER TABLE "writing_chat_messages" RENAME COLUMN "bab_dokumen_id" TO "chapter_id";

-- EvalResult / writing_eval_results (no column changes)
ALTER TABLE "eval_results" RENAME TO "writing_eval_results";

-- LedChunkEmbedding / writing_led_chunk_embeddings
ALTER TABLE "led_chunk_embeddings" RENAME TO "writing_led_chunk_embeddings";
ALTER TABLE "writing_led_chunk_embeddings" RENAME COLUMN "dokumen_id" TO "document_id";
