-- Pilihan bukti dukung per section yang BISA DIUBAH (termasuk di-uncheck).
-- evidence_chapter_links / evidence_draft_links tetap jadi catatan historis
-- append-only; kolom ini yang menyimpan "apa yang dicentang sekarang".
-- Nullable: baris lama jatuh ke daftar link sebagai centang awal.
ALTER TABLE "writing_chapter_sections" ADD COLUMN "selected_evidence_ids" JSONB;
