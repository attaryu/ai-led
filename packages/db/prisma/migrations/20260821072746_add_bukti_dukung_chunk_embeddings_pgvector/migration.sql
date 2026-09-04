-- CreateTable
CREATE TABLE "bukti_dukung_chunk_embeddings" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "bukti_dukung_id" TEXT NOT NULL,
    "chunk_id" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "embedding" vector(384) NOT NULL,
    "confidence" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bukti_dukung_chunk_embeddings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bukti_dukung_chunk_embeddings_tenant_id_bukti_dukung_id_idx" ON "bukti_dukung_chunk_embeddings"("tenant_id", "bukti_dukung_id");

-- CreateIndex
CREATE UNIQUE INDEX "bukti_dukung_chunk_embeddings_bukti_dukung_id_chunk_id_key" ON "bukti_dukung_chunk_embeddings"("bukti_dukung_id", "chunk_id");

-- AddForeignKey
ALTER TABLE "bukti_dukung_chunk_embeddings" ADD CONSTRAINT "bukti_dukung_chunk_embeddings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bukti_dukung_chunk_embeddings" ADD CONSTRAINT "bukti_dukung_chunk_embeddings_bukti_dukung_id_fkey" FOREIGN KEY ("bukti_dukung_id") REFERENCES "bukti_dukung"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Vector similarity index, same rationale as led_chunk_embeddings_embedding_hnsw_idx.
CREATE INDEX "bukti_dukung_chunk_embeddings_embedding_hnsw_idx" ON "bukti_dukung_chunk_embeddings"
    USING hnsw ("embedding" vector_cosine_ops);
