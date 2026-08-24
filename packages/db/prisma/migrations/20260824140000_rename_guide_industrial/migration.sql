-- Group 5 of the DB naming cleanup: guide_* module prefix + English field names.
-- Pure renames only (no drop/create) so existing rows and FK constraints survive.

-- panduan_referensi -> guide_references
ALTER TABLE "panduan_referensi" RENAME TO "guide_references";
ALTER TABLE "guide_references" RENAME COLUMN "tipe" TO "type";
ALTER TABLE "guide_references" RENAME COLUMN "judul" TO "title";
ALTER TABLE "guide_references" RENAME COLUMN "tipe_file" TO "file_type";
ALTER TABLE "guide_references" RENAME COLUMN "dibuat_pada" TO "created_at";

-- panduan_detail -> guide_details
ALTER TABLE "panduan_detail" RENAME TO "guide_details";
ALTER TABLE "guide_details" RENAME COLUMN "panduan_id" TO "guide_id";
ALTER TABLE "guide_details" RENAME COLUMN "kode_poin" TO "point_code";
ALTER TABLE "guide_details" RENAME COLUMN "judul_poin" TO "point_title";
ALTER TABLE "guide_details" RENAME COLUMN "isi_teks" TO "content_text";

-- panduan_detail_bab -> guide_detail_chapters
ALTER TABLE "panduan_detail_bab" RENAME TO "guide_detail_chapters";
ALTER TABLE "guide_detail_chapters" RENAME COLUMN "panduan_detail_id" TO "guide_detail_id";
ALTER TABLE "guide_detail_chapters" RENAME COLUMN "urutan_bab" TO "chapter_order";
