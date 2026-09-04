-- CreateEnum
CREATE TYPE "ChapterSectionStatus" AS ENUM ('PENDING', 'GENERATING', 'GENERATED', 'ERROR');

-- CreateTable: LLM-generated per-bab outline sections (worker.py::_handle_generasi_outline_bab / _handle_generasi_bab)
CREATE TABLE "writing_chapter_sections" (
    "id" TEXT NOT NULL,
    "chapter_id" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "guidance" TEXT NOT NULL,
    "status" "ChapterSectionStatus" NOT NULL DEFAULT 'PENDING',
    "content" JSONB,
    "model" TEXT,
    "error" TEXT,
    "generated_at" TIMESTAMP(3),

    CONSTRAINT "writing_chapter_sections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "writing_chapter_sections_chapter_id_order_key" ON "writing_chapter_sections"("chapter_id", "order");

-- AddForeignKey
ALTER TABLE "writing_chapter_sections" ADD CONSTRAINT "writing_chapter_sections_chapter_id_fkey" FOREIGN KEY ("chapter_id") REFERENCES "writing_document_chapters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
