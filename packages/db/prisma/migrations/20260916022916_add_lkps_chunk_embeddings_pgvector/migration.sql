-- CreateTable
CREATE TABLE "lkps_chunk_embeddings" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "chunk_id" TEXT NOT NULL,
    "sheet" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "embedding" vector(384) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lkps_chunk_embeddings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lkps_chunk_embeddings_tenant_id_document_id_idx" ON "lkps_chunk_embeddings"("tenant_id", "document_id");

-- CreateIndex
CREATE UNIQUE INDEX "lkps_chunk_embeddings_document_id_chunk_id_key" ON "lkps_chunk_embeddings"("document_id", "chunk_id");

-- AddForeignKey
ALTER TABLE "lkps_chunk_embeddings" ADD CONSTRAINT "lkps_chunk_embeddings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "org_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lkps_chunk_embeddings" ADD CONSTRAINT "lkps_chunk_embeddings_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "writing_led_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Vector similarity index, same rationale as led_chunk_embeddings_embedding_hnsw_idx.
CREATE INDEX "lkps_chunk_embeddings_embedding_hnsw_idx" ON "lkps_chunk_embeddings"
    USING hnsw ("embedding" vector_cosine_ops);
