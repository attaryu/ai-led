-- dimas: document recommendation is per section, not per chapter.
ALTER TABLE "writing_document_recommendations" ADD COLUMN "chapter_section_id" TEXT;
CREATE INDEX "writing_document_recommendations_chapter_section_id_idx" ON "writing_document_recommendations"("chapter_section_id");
ALTER TABLE "writing_document_recommendations" ADD CONSTRAINT "writing_document_recommendations_chapter_section_id_fkey" FOREIGN KEY ("chapter_section_id") REFERENCES "writing_chapter_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
