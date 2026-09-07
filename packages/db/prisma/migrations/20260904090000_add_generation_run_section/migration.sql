-- AlterTable
ALTER TABLE "writing_generation_runs" ADD COLUMN     "section_id" TEXT;

-- CreateIndex
CREATE INDEX "writing_generation_runs_section_id_created_at_idx" ON "writing_generation_runs"("section_id", "created_at");

-- AddForeignKey
ALTER TABLE "writing_generation_runs" ADD CONSTRAINT "writing_generation_runs_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "writing_chapter_sections"("id") ON DELETE SET NULL ON UPDATE CASCADE;
