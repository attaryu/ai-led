-- Jangkar penghubung Panduan <-> matriks penilaian (lihat komentar model
-- SetSectionCriterionLink di schema.prisma). Tanpa RLS, sama seperti
-- sub_bab_templates / rubric_criterion_groups: terisolasi lewat accreditation_set.

CREATE TYPE "SectionLinkMethod" AS ENUM ('JUDUL_SAMA', 'KEYWORD_INDIKATOR', 'URUTAN', 'MANUAL');
CREATE TYPE "SectionLinkStatus" AS ENUM ('OTOMATIS', 'PERLU_TINJAU', 'DIKONFIRMASI');

CREATE TABLE "set_section_criterion_links" (
    "id" TEXT NOT NULL,
    "accreditation_set_id" TEXT NOT NULL,
    "sub_bab_template_id" TEXT NOT NULL,
    "criterion_group_id" TEXT NOT NULL,
    "match_method" "SectionLinkMethod" NOT NULL,
    "confidence" DOUBLE PRECISION,
    "status" "SectionLinkStatus" NOT NULL DEFAULT 'OTOMATIS',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "set_section_criterion_links_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "set_section_criterion_links_set_template_key"
    ON "set_section_criterion_links"("accreditation_set_id", "sub_bab_template_id");
CREATE INDEX "set_section_criterion_links_criterion_group_id_idx"
    ON "set_section_criterion_links"("criterion_group_id");

ALTER TABLE "set_section_criterion_links" ADD CONSTRAINT "set_section_criterion_links_accreditation_set_id_fkey"
    FOREIGN KEY ("accreditation_set_id") REFERENCES "accreditation_sets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "set_section_criterion_links" ADD CONSTRAINT "set_section_criterion_links_sub_bab_template_id_fkey"
    FOREIGN KEY ("sub_bab_template_id") REFERENCES "sub_bab_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "set_section_criterion_links" ADD CONSTRAINT "set_section_criterion_links_criterion_group_id_fkey"
    FOREIGN KEY ("criterion_group_id") REFERENCES "rubric_criterion_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
