-- Satu rekomendasi DIKONFIRMASI per BAGIAN, bukan per draft.
--
-- Indeks lama `confirmed_per_draft_key` membatasi satu DIKONFIRMASI per chapter_draft_id.
-- Sejak rekomendasi dibuat per section (semua section satu bab menumpang draft/checkpoint
-- aktif yang sama), mengonfirmasi section kedua di bab yang sama gagal dengan P2002.
-- Worker sudah menggantikan (DIGANTIKAN) baris DIKONFIRMASI milik section yang sama
-- sebelum menyisipkan yang baru, jadi keunikan per section konsisten dengan itu.
DROP INDEX IF EXISTS "writing_document_recommendations_confirmed_per_draft_key";

-- Rekomendasi tingkat bab (tanpa section): tetap satu DIKONFIRMASI per draft.
CREATE UNIQUE INDEX "writing_document_recommendations_confirmed_per_draft_key"
  ON "writing_document_recommendations" ("chapter_draft_id")
  WHERE "status" = 'DIKONFIRMASI' AND "chapter_section_id" IS NULL;

-- Rekomendasi per section: satu DIKONFIRMASI per (draft, section).
CREATE UNIQUE INDEX "writing_document_recommendations_confirmed_per_section_key"
  ON "writing_document_recommendations" ("chapter_draft_id", "chapter_section_id")
  WHERE "status" = 'DIKONFIRMASI' AND "chapter_section_id" IS NOT NULL;
