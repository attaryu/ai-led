-- dimas: Panduan numbering ("C.1", "a)") kept per section.
ALTER TABLE "sub_bab_templates" ADD COLUMN "marker" TEXT;
ALTER TABLE "writing_chapter_sections" ADD COLUMN "marker" TEXT;
