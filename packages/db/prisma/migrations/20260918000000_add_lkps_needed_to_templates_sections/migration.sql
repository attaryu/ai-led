-- Port of Dimas 140d8ae: needs_lkps/lkps_list precomputed once at Panduan
-- extraction time (ingestion/panduan_chunker.py::detect_lkps), replacing
-- worker.py's old runtime regex (_lkps_refs_in_pedoman). Not retroactive --
-- existing sub_bab_templates/writing_chapter_sections rows get NULL/[]
-- until the Panduan is re-extracted / the outline is regenerated (same
-- non-backfill precedent as prior structure-extraction migrations).

ALTER TABLE "sub_bab_templates"
    ADD COLUMN "lkps_needed" BOOLEAN,
    ADD COLUMN "lkps_list" JSONB NOT NULL DEFAULT '[]';

ALTER TABLE "writing_chapter_sections"
    ADD COLUMN "lkps_needed" BOOLEAN,
    ADD COLUMN "lkps_list" JSONB NOT NULL DEFAULT '[]';
