-- CreateEnum
CREATE TYPE "StatusRekomendasi" AS ENUM ('DIREKOMENDASIKAN', 'DIKONFIRMASI', 'DIGANTIKAN');

-- CreateTable: per-indicator evidence tagging (port of origin/ariel's scheme, row 63/70)
CREATE TABLE "evidence_indicator_tags" (
    "id" TEXT NOT NULL,
    "evidence_id" TEXT NOT NULL,
    "indicator_no" INTEGER NOT NULL,

    CONSTRAINT "evidence_indicator_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable: AI writing recommend->confirm flow (port of origin/led-wiriting(dimas))
CREATE TABLE "writing_document_recommendations" (
    "id" TEXT NOT NULL,
    "chapter_draft_id" TEXT NOT NULL,
    "document_query" JSONB NOT NULL,
    "lkps_needed" BOOLEAN NOT NULL,
    "lkps_sufficient" BOOLEAN,
    "lkps_evidence_query" JSONB,
    "candidate_folders" JSONB NOT NULL,
    "recommendation_text" TEXT,
    "selected_evidence_ids" JSONB NOT NULL,
    "pedoman_used" JSONB NOT NULL,
    "rubric_used" JSONB NOT NULL,
    "lkps_used" JSONB NOT NULL,
    "status" "StatusRekomendasi" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "writing_document_recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "writing_recommendation_items" (
    "id" TEXT NOT NULL,
    "recommendation_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "reason" TEXT,
    "order" INTEGER NOT NULL,

    CONSTRAINT "writing_recommendation_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable: bge-m3 folder-level semantic index (1024-dim, separate from the
-- MiniLM/384 evidence_chunk_embeddings/led_chunk_embeddings tables — different
-- embedding model, matches origin/led-wiriting(dimas)'s document_registry collection.
CREATE TABLE "document_registry" (
    "id" TEXT NOT NULL,
    "owner_type" "OwnerTipe" NOT NULL,
    "tenant_id" TEXT,
    "study_program_id" TEXT,
    "folder_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "embedding" vector(1024) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_registry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "evidence_indicator_tags_indicator_no_idx" ON "evidence_indicator_tags"("indicator_no");

-- CreateIndex
CREATE UNIQUE INDEX "evidence_indicator_tags_evidence_id_indicator_no_key" ON "evidence_indicator_tags"("evidence_id", "indicator_no");

-- CreateIndex
CREATE INDEX "writing_document_recommendations_chapter_draft_id_idx" ON "writing_document_recommendations"("chapter_draft_id");

-- Only one CONFIRMED recommendation may be active per draft at a time (re-recommend
-- marks the prior confirmed row DIGANTIKAN first) — Prisma schema can't express a
-- partial unique index, so it lives here instead of as @@unique in schema.prisma.
CREATE UNIQUE INDEX "writing_document_recommendations_confirmed_per_draft_key"
    ON "writing_document_recommendations" ("chapter_draft_id")
    WHERE "status" = 'DIKONFIRMASI';

-- CreateIndex
CREATE UNIQUE INDEX "document_registry_folder_id_key" ON "document_registry"("folder_id");

-- CreateIndex
CREATE INDEX "document_registry_tenant_id_idx" ON "document_registry"("tenant_id");

-- CreateIndex
CREATE INDEX "document_registry_study_program_id_idx" ON "document_registry"("study_program_id");

-- AddForeignKey
ALTER TABLE "evidence_indicator_tags" ADD CONSTRAINT "evidence_indicator_tags_evidence_id_fkey" FOREIGN KEY ("evidence_id") REFERENCES "evidence_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "writing_document_recommendations" ADD CONSTRAINT "writing_document_recommendations_chapter_draft_id_fkey" FOREIGN KEY ("chapter_draft_id") REFERENCES "writing_chapter_drafts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "writing_recommendation_items" ADD CONSTRAINT "writing_recommendation_items_recommendation_id_fkey" FOREIGN KEY ("recommendation_id") REFERENCES "writing_document_recommendations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_registry" ADD CONSTRAINT "document_registry_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "evidence_folders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Vector similarity index, same rationale as led_chunk_embeddings_embedding_hnsw_idx
-- and bukti_dukung_chunk_embeddings_embedding_hnsw_idx.
CREATE INDEX "document_registry_embedding_hnsw_idx" ON "document_registry"
    USING hnsw ("embedding" vector_cosine_ops);
