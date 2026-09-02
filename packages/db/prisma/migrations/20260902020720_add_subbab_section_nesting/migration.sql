-- DropIndex
DROP INDEX "sub_bab_templates_chapter_template_id_order_key";

-- DropIndex
DROP INDEX "writing_chapter_sections_chapter_id_order_key";

-- AlterTable
ALTER TABLE "sub_bab_templates" ADD COLUMN     "parent_id" TEXT;

-- AlterTable
ALTER TABLE "writing_chapter_sections" ADD COLUMN     "parent_id" TEXT;

-- CreateIndex
CREATE INDEX "sub_bab_templates_chapter_template_id_parent_id_idx" ON "sub_bab_templates"("chapter_template_id", "parent_id");

-- CreateIndex
CREATE INDEX "writing_chapter_sections_chapter_id_parent_id_idx" ON "writing_chapter_sections"("chapter_id", "parent_id");

-- AddForeignKey
ALTER TABLE "writing_chapter_sections" ADD CONSTRAINT "writing_chapter_sections_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "writing_chapter_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sub_bab_templates" ADD CONSTRAINT "sub_bab_templates_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "sub_bab_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
