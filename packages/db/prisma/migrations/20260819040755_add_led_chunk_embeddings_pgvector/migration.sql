-- Enable pgvector (image is pgvector/pgvector:pg16, extension ships in it)
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateTable
CREATE TABLE "led_chunk_embeddings" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "dokumen_id" TEXT NOT NULL,
    "chunk_id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "embedding" vector(384) NOT NULL,
    "page_start" INTEGER NOT NULL,
    "page_end" INTEGER NOT NULL,
    "para_start" INTEGER NOT NULL,
    "para_end" INTEGER NOT NULL,
    "section_heading" TEXT,
    "char_start" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "led_chunk_embeddings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "led_chunk_embeddings_tenant_id_dokumen_id_idx" ON "led_chunk_embeddings"("tenant_id", "dokumen_id");

-- CreateIndex
CREATE UNIQUE INDEX "led_chunk_embeddings_dokumen_id_chunk_id_key" ON "led_chunk_embeddings"("dokumen_id", "chunk_id");

-- AddForeignKey
ALTER TABLE "led_chunk_embeddings" ADD CONSTRAINT "led_chunk_embeddings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "led_chunk_embeddings" ADD CONSTRAINT "led_chunk_embeddings_dokumen_id_fkey" FOREIGN KEY ("dokumen_id") REFERENCES "dokumen_led"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Vector similarity index. Not strictly required for correctness — per-
-- document result sets are small enough that the tenant_id/dokumen_id
-- btree index above already makes an exact-KNN sequential scan fast — but
-- HNSW is the pgvector best-practice default so search stays fast as a
-- single document's chunk count grows.
CREATE INDEX "led_chunk_embeddings_embedding_hnsw_idx" ON "led_chunk_embeddings"
    USING hnsw ("embedding" vector_cosine_ops);
