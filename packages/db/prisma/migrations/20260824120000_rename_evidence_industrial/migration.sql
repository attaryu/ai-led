-- Hand-written rename migration (DB naming cleanup, group 3: evidence_*).
-- Same reasoning as org_*/writing_*: Prisma's diff engine can't tell a
-- simultaneous rename+field-change from DROP+CREATE. Every statement below
-- is a pure RENAME, matching schema.prisma's Evidence/EvidenceChapterLink/
-- EvidenceDraftLink/EvidenceChunkEmbedding.
--
-- Ripple note: bukti_dukung_id FK columns on assessment_sessions (group 6,
-- not yet renamed) are untouched here — Postgres table renames don't break
-- existing FK constraints.

-- BuktiDukung -> Evidence / evidence_files
ALTER TABLE "bukti_dukung" RENAME TO "evidence_files";
ALTER TABLE "evidence_files" RENAME COLUMN "owner_tipe" TO "owner_type";
ALTER TABLE "evidence_files" RENAME COLUMN "nama_dokumen" TO "document_name";
ALTER TABLE "evidence_files" RENAME COLUMN "tipe_file" TO "file_type";
ALTER TABLE "evidence_files" RENAME COLUMN "ukuran_bytes" TO "size_bytes";
ALTER TABLE "evidence_files" RENAME COLUMN "status_ekstraksi" TO "extraction_status";
ALTER TABLE "evidence_files" RENAME COLUMN "catatan_gagal" TO "failure_note";
ALTER TABLE "evidence_files" RENAME COLUMN "diunggah_oleh_user_id" TO "uploaded_by_user_id";
ALTER TABLE "evidence_files" RENAME COLUMN "diunggah_oleh_nama" TO "uploaded_by_name";
ALTER TABLE "evidence_files" RENAME COLUMN "waktu_diunggah" TO "uploaded_at";

-- BuktiDukungBab -> EvidenceChapterLink / evidence_chapter_links
ALTER TABLE "bukti_dukung_bab" RENAME TO "evidence_chapter_links";
ALTER TABLE "evidence_chapter_links" RENAME COLUMN "bukti_dukung_id" TO "evidence_id";
ALTER TABLE "evidence_chapter_links" RENAME COLUMN "bab_dokumen_id" TO "chapter_id";
ALTER TABLE "evidence_chapter_links" RENAME COLUMN "nama_dokumen" TO "document_name";
ALTER TABLE "evidence_chapter_links" RENAME COLUMN "tipe_file" TO "file_type";

-- BuktiDukungDraft -> EvidenceDraftLink / evidence_draft_links
ALTER TABLE "bukti_dukung_draft" RENAME TO "evidence_draft_links";
ALTER TABLE "evidence_draft_links" RENAME COLUMN "bukti_dukung_id" TO "evidence_id";
ALTER TABLE "evidence_draft_links" RENAME COLUMN "bab_draft_id" TO "draft_id";
ALTER TABLE "evidence_draft_links" RENAME COLUMN "nama_dokumen" TO "document_name";
ALTER TABLE "evidence_draft_links" RENAME COLUMN "tipe_file" TO "file_type";

-- BuktiDukungChunkEmbedding -> EvidenceChunkEmbedding / evidence_chunk_embeddings
ALTER TABLE "bukti_dukung_chunk_embeddings" RENAME TO "evidence_chunk_embeddings";
ALTER TABLE "evidence_chunk_embeddings" RENAME COLUMN "bukti_dukung_id" TO "evidence_id";
