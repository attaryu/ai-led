-- CreateTable
CREATE TABLE "assessment_verdicts" (
    "id" TEXT NOT NULL,
    "dokumen_id" TEXT NOT NULL,
    "indikator_no" INTEGER NOT NULL,
    "skor_final" DECIMAL(5,2) NOT NULL,
    "catatan" TEXT,
    "skor_mesin_saat_ditinjau" DECIMAL(5,2),
    "sesi_id_saat_ditinjau" TEXT NOT NULL,
    "ditinjau_oleh_user_id" TEXT NOT NULL,
    "ditinjau_oleh_nama" TEXT NOT NULL,
    "ditinjau_pada" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assessment_verdicts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "assessment_verdicts_dokumen_id_indikator_no_key" ON "assessment_verdicts"("dokumen_id", "indikator_no");

-- AddForeignKey
ALTER TABLE "assessment_verdicts" ADD CONSTRAINT "assessment_verdicts_dokumen_id_fkey" FOREIGN KEY ("dokumen_id") REFERENCES "dokumen_led"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_verdicts" ADD CONSTRAINT "assessment_verdicts_sesi_id_saat_ditinjau_fkey" FOREIGN KEY ("sesi_id_saat_ditinjau") REFERENCES "assessment_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_verdicts" ADD CONSTRAINT "assessment_verdicts_ditinjau_oleh_user_id_fkey" FOREIGN KEY ("ditinjau_oleh_user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
