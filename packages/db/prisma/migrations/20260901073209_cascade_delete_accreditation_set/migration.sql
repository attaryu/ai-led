-- DropForeignKey
ALTER TABLE "evidence_indicator_tags" DROP CONSTRAINT "evidence_indicator_tags_accreditation_set_id_fkey";

-- DropForeignKey
ALTER TABLE "guide_detail_chapters" DROP CONSTRAINT "guide_detail_chapters_guide_detail_id_fkey";

-- DropForeignKey
ALTER TABLE "guide_details" DROP CONSTRAINT "guide_details_guide_id_fkey";

-- DropForeignKey
ALTER TABLE "guide_references" DROP CONSTRAINT "guide_references_accreditation_set_id_fkey";

-- DropForeignKey
ALTER TABLE "rubric_criteria" DROP CONSTRAINT "rubric_criteria_accreditation_set_id_fkey";

-- DropForeignKey
ALTER TABLE "rubric_criterion_chapters" DROP CONSTRAINT "rubric_criterion_chapters_criterion_id_fkey";

-- DropForeignKey
ALTER TABLE "rubric_levels" DROP CONSTRAINT "rubric_levels_criterion_id_fkey";

-- DropForeignKey
ALTER TABLE "rubric_score_results" DROP CONSTRAINT "rubric_score_results_criterion_id_fkey";

-- AddForeignKey
ALTER TABLE "evidence_indicator_tags" ADD CONSTRAINT "evidence_indicator_tags_accreditation_set_id_fkey" FOREIGN KEY ("accreditation_set_id") REFERENCES "accreditation_sets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rubric_criteria" ADD CONSTRAINT "rubric_criteria_accreditation_set_id_fkey" FOREIGN KEY ("accreditation_set_id") REFERENCES "accreditation_sets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rubric_levels" ADD CONSTRAINT "rubric_levels_criterion_id_fkey" FOREIGN KEY ("criterion_id") REFERENCES "rubric_criteria"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rubric_criterion_chapters" ADD CONSTRAINT "rubric_criterion_chapters_criterion_id_fkey" FOREIGN KEY ("criterion_id") REFERENCES "rubric_criteria"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rubric_score_results" ADD CONSTRAINT "rubric_score_results_criterion_id_fkey" FOREIGN KEY ("criterion_id") REFERENCES "rubric_criteria"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guide_references" ADD CONSTRAINT "guide_references_accreditation_set_id_fkey" FOREIGN KEY ("accreditation_set_id") REFERENCES "accreditation_sets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guide_details" ADD CONSTRAINT "guide_details_guide_id_fkey" FOREIGN KEY ("guide_id") REFERENCES "guide_references"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guide_detail_chapters" ADD CONSTRAINT "guide_detail_chapters_guide_detail_id_fkey" FOREIGN KEY ("guide_detail_id") REFERENCES "guide_details"("id") ON DELETE CASCADE ON UPDATE CASCADE;
