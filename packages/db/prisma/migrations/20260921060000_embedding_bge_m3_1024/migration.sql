-- Embedding MiniLM (384-d) -> BAAI/bge-m3 (1024-d), matching led-wiriting(dimas) 140d8ae.
-- 384-d vectors cannot be converted to 1024-d. This migration never deletes data: if any embedding
-- row exists it aborts, and the operator clears those tables deliberately, then re-ingests
-- (apps/ai/scripts/reindex_embeddings.py) after migrating.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "writing_led_chunk_embeddings")
     OR EXISTS (SELECT 1 FROM "evidence_chunk_embeddings")
     OR EXISTS (SELECT 1 FROM "lkps_chunk_embeddings") THEN
    RAISE EXCEPTION 'Embedding tables still hold 384-d vectors; clear writing_led_chunk_embeddings, evidence_chunk_embeddings and lkps_chunk_embeddings first, then re-run the migration and re-ingest.';
  END IF;
END $$;

DROP INDEX IF EXISTS "lkps_chunk_embeddings_embedding_hnsw_idx";

ALTER TABLE "writing_led_chunk_embeddings" ALTER COLUMN "embedding" TYPE vector(1024);
ALTER TABLE "evidence_chunk_embeddings" ALTER COLUMN "embedding" TYPE vector(1024);
ALTER TABLE "lkps_chunk_embeddings" ALTER COLUMN "embedding" TYPE vector(1024);

CREATE INDEX "lkps_chunk_embeddings_embedding_hnsw_idx" ON "lkps_chunk_embeddings"
    USING hnsw ("embedding" vector_cosine_ops);
