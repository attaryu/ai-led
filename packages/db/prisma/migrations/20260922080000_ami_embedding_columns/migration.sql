-- AMI assessment (ariel) embeds with paraphrase-multilingual-MiniLM-L12-v2 (384-d) into its own columns;
-- writing (dimas) keeps bge-m3 `embedding`. The LED index is read only by AMI, so its bge-m3 column goes nullable.
ALTER TABLE "writing_led_chunk_embeddings" ALTER COLUMN "embedding" DROP NOT NULL;
ALTER TABLE "writing_led_chunk_embeddings" ADD COLUMN "embedding_ami" vector(384);
ALTER TABLE "evidence_chunk_embeddings" ADD COLUMN "embedding_ami" vector(384);
CREATE INDEX "writing_led_chunk_embeddings_embedding_ami_idx" ON "writing_led_chunk_embeddings" USING hnsw ("embedding_ami" vector_cosine_ops);
CREATE INDEX "evidence_chunk_embeddings_embedding_ami_idx" ON "evidence_chunk_embeddings" USING hnsw ("embedding_ami" vector_cosine_ops);
