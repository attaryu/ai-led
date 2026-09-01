-- AlterTable
ALTER TABLE "accreditation_sets" ADD COLUMN "structure_parse_status" "StatusEkstraksi" NOT NULL DEFAULT 'SIAP';
ALTER TABLE "accreditation_sets" ADD COLUMN "structure_parse_error" TEXT;

-- CreateTable: struktur bab resmi diekstrak LLM dari PANDUAN_LAM (worker.py::_handle_ingestion_struktur_dokumen)
CREATE TABLE "chapter_templates" (
    "id" TEXT NOT NULL,
    "accreditation_set_id" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "title" TEXT NOT NULL,

    CONSTRAINT "chapter_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sub_bab_templates" (
    "id" TEXT NOT NULL,
    "chapter_template_id" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "guidance" TEXT NOT NULL,

    CONSTRAINT "sub_bab_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "chapter_templates_accreditation_set_id_order_key" ON "chapter_templates"("accreditation_set_id", "order");

-- CreateIndex
CREATE UNIQUE INDEX "sub_bab_templates_chapter_template_id_order_key" ON "sub_bab_templates"("chapter_template_id", "order");

-- AddForeignKey
ALTER TABLE "chapter_templates" ADD CONSTRAINT "chapter_templates_accreditation_set_id_fkey" FOREIGN KEY ("accreditation_set_id") REFERENCES "accreditation_sets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sub_bab_templates" ADD CONSTRAINT "sub_bab_templates_chapter_template_id_fkey" FOREIGN KEY ("chapter_template_id") REFERENCES "chapter_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
