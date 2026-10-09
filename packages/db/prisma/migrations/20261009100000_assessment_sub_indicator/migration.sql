-- Hasil penilaian, langkah penalaran, dan keputusan reviewer kini dikunci per SUB-INDIKATOR.
--
-- Satu nomor indikator bisa punya beberapa baris rubrik (43.I dan 43.II). Dengan kunci (session, indicator_no)
-- hasil sub-indikator kedua menimpa yang pertama. `sub_no` '' = tanpa sub; baris lama otomatis ''.
ALTER TABLE "assessment_indicator_results" ADD COLUMN "sub_no" TEXT NOT NULL DEFAULT '';
ALTER TABLE "assessment_reasoning_steps"    ADD COLUMN "sub_no" TEXT NOT NULL DEFAULT '';
ALTER TABLE "assessment_verdicts"           ADD COLUMN "sub_no" TEXT NOT NULL DEFAULT '';

DROP INDEX IF EXISTS "assessment_indicator_results_session_id_indicator_no_key";
CREATE UNIQUE INDEX "assessment_indicator_results_session_id_indicator_no_sub_no_key"
  ON "assessment_indicator_results" ("session_id", "indicator_no", "sub_no");

DROP INDEX IF EXISTS "assessment_verdicts_document_id_indicator_no_key";
CREATE UNIQUE INDEX "assessment_verdicts_document_id_indicator_no_sub_no_key"
  ON "assessment_verdicts" ("document_id", "indicator_no", "sub_no");
