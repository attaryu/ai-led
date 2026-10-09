-- LKPS index per LKPS file (dimas lkps_id), built on upload -- no longer per document.
-- Old per-document rows cannot be mapped 1:1; they are rebuilt by INGESTION_LKPS
-- (upload / retry) or scripts/reindex_embeddings.py.
DELETE FROM "lkps_chunk_embeddings";

ALTER TABLE "lkps_chunk_embeddings" DROP CONSTRAINT "lkps_chunk_embeddings_document_id_fkey";
DROP INDEX "lkps_chunk_embeddings_tenant_id_document_id_idx";
DROP INDEX "lkps_chunk_embeddings_document_id_chunk_id_key";
ALTER TABLE "lkps_chunk_embeddings" DROP COLUMN "document_id";

ALTER TABLE "lkps_chunk_embeddings" ADD COLUMN "evidence_id" TEXT NOT NULL;
CREATE INDEX "lkps_chunk_embeddings_tenant_id_evidence_id_idx" ON "lkps_chunk_embeddings"("tenant_id", "evidence_id");
CREATE UNIQUE INDEX "lkps_chunk_embeddings_evidence_id_chunk_id_key" ON "lkps_chunk_embeddings"("evidence_id", "chunk_id");
ALTER TABLE "lkps_chunk_embeddings" ADD CONSTRAINT "lkps_chunk_embeddings_evidence_id_fkey"
    FOREIGN KEY ("evidence_id") REFERENCES "evidence_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Existing LKPS files have no index yet: GAGAL + note so the LKPS card offers "Proses ulang"
-- (retry enqueues INGESTION_LKPS). scripts/reindex_embeddings.py rebuilds them in bulk too.
UPDATE "evidence_files"
SET "extraction_status" = 'GAGAL', "failure_note" = 'Indeks LKPS perlu dibangun ulang -- klik Proses ulang.'
WHERE "kind" = 'LKPS';
