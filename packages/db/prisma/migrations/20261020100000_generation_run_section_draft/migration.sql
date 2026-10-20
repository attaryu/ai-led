-- Checklist/sumber/penilaian milik DRAFT, bukan milik "generate terakhir" section: tiap GenerationRun
-- kini menunjuk SectionDraft yang dihasilkannya. Pembaca memilih run lewat draft yang sedang aktif.

ALTER TABLE "writing_generation_runs" ADD COLUMN "section_draft_id" TEXT;

CREATE UNIQUE INDEX "writing_generation_runs_section_draft_id_key"
    ON "writing_generation_runs"("section_draft_id");

ALTER TABLE "writing_generation_runs" ADD CONSTRAINT "writing_generation_runs_section_draft_id_fkey"
    FOREIGN KEY ("section_draft_id") REFERENCES "writing_section_drafts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill baris lama. Worker membuat draft AI SEKETIKA sebelum membuat run-nya (selisih puluhan
-- milidetik), jadi dipasangkan lewat waktu: draft AI section yang sama dengan created_at paling dekat
-- sebelum run, dalam jendela 5 detik. Yang tidak ada pasangannya (draft sudah dihapus) dibiarkan NULL.
WITH r AS (
    SELECT id, section_id, created_at FROM "writing_generation_runs" WHERE section_id IS NOT NULL
),
pair AS (
    SELECT DISTINCT ON (r.id) r.id AS run_id, d.id AS draft_id
    FROM r
    JOIN "writing_section_drafts" d
      ON d.section_id = r.section_id
     AND d.source = 'AI'
     AND d.created_at <= r.created_at
     AND d.created_at > r.created_at - INTERVAL '5 seconds'
    ORDER BY r.id, d.created_at DESC
),
unik AS (
    SELECT DISTINCT ON (draft_id) run_id, draft_id FROM pair ORDER BY draft_id, run_id
)
UPDATE "writing_generation_runs" g SET "section_draft_id" = unik.draft_id FROM unik WHERE g.id = unik.run_id;
