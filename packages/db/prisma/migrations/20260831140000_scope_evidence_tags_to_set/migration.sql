-- DropIndex
DROP INDEX "evidence_indicator_tags_evidence_id_indicator_no_key";

-- DropIndex
DROP INDEX "evidence_indicator_tags_indicator_no_idx";

-- AlterTable
ALTER TABLE "evidence_indicator_tags" ADD COLUMN     "accreditation_set_id" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "evidence_indicator_tags_accreditation_set_id_indicator_no_idx" ON "evidence_indicator_tags"("accreditation_set_id", "indicator_no");

-- CreateIndex
CREATE UNIQUE INDEX "evidence_indicator_tags_evidence_id_accreditation_set_id_in_key" ON "evidence_indicator_tags"("evidence_id", "accreditation_set_id", "indicator_no");

-- AddForeignKey
ALTER TABLE "evidence_indicator_tags" ADD CONSTRAINT "evidence_indicator_tags_accreditation_set_id_fkey" FOREIGN KEY ("accreditation_set_id") REFERENCES "accreditation_sets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
