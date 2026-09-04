-- Group 4 of the DB naming cleanup: rubric_* module prefix + English field names.
-- Pure renames only (no drop/create) so existing rows and FK constraints survive.

-- rubrik_kriteria -> rubric_criteria
ALTER TABLE "rubrik_kriteria" RENAME TO "rubric_criteria";
ALTER TABLE "rubric_criteria" RENAME COLUMN "kode_kriteria" TO "criterion_code";
ALTER TABLE "rubric_criteria" RENAME COLUMN "deskripsi" TO "description";

-- rubrik_level -> rubric_levels
ALTER TABLE "rubrik_level" RENAME TO "rubric_levels";
ALTER TABLE "rubric_levels" RENAME COLUMN "kriteria_id" TO "criterion_id";
ALTER TABLE "rubric_levels" RENAME COLUMN "skor" TO "score";
ALTER TABLE "rubric_levels" RENAME COLUMN "deskripsi" TO "description";

-- rubrik_kriteria_bab -> rubric_criterion_chapters
ALTER TABLE "rubrik_kriteria_bab" RENAME TO "rubric_criterion_chapters";
ALTER TABLE "rubric_criterion_chapters" RENAME COLUMN "kriteria_id" TO "criterion_id";
ALTER TABLE "rubric_criterion_chapters" RENAME COLUMN "urutan_bab" TO "chapter_order";

-- hasil_skor_kriteria -> rubric_score_results
ALTER TABLE "hasil_skor_kriteria" RENAME TO "rubric_score_results";
ALTER TABLE "rubric_score_results" RENAME COLUMN "kriteria_id" TO "criterion_id";
ALTER TABLE "rubric_score_results" RENAME COLUMN "target_tipe" TO "target_type";
ALTER TABLE "rubric_score_results" RENAME COLUMN "bab_id" TO "chapter_id";
ALTER TABLE "rubric_score_results" RENAME COLUMN "bab_draft_id" TO "draft_id";
ALTER TABLE "rubric_score_results" RENAME COLUMN "skor_didapat" TO "score_obtained";
ALTER TABLE "rubric_score_results" RENAME COLUMN "justifikasi" TO "justification";
ALTER TABLE "rubric_score_results" RENAME COLUMN "dijalankan_oleh_user_id" TO "run_by_user_id";
ALTER TABLE "rubric_score_results" RENAME COLUMN "dijalankan_oleh_nama" TO "run_by_name";
ALTER TABLE "rubric_score_results" RENAME COLUMN "dijalankan_pada" TO "run_at";
