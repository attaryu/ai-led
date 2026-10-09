-- Panduan Penulisan (ReferenceGuide type=PANDUAN_LAM) becomes reusable across
-- AccreditationSet instead of owned 1:1 -- matches dimas's panduan_referensi
-- (many dokumen_led -> 1 Pedoman). Hand-written, not `prisma migrate dev`
-- auto-generated: two of the required-without-default columns below need a
-- data decision Prisma can't make on its own (tenant_id backfill; panduan_id
-- clean-cut, see below), so `migrate dev` correctly refused to run
-- non-interactively and this was written to match its printed diff.

-- 1. guide_references needs its own tenant_id: once a PANDUAN_LAM row can be
--    used by many AccreditationSet (not just the one that uploaded it), the
--    join through accreditation_set_id is no longer a reliable tenant-scope
--    path for isolation. Backfilled from the owning set (every existing row
--    still has accreditation_set_id set -- reuse wiring below is what starts
--    leaving it null going forward, not backdated).
ALTER TABLE "guide_references" ADD COLUMN "tenant_id" TEXT;

UPDATE "guide_references" rg
SET "tenant_id" = s."tenant_id"
FROM "accreditation_sets" s
WHERE rg."accreditation_set_id" = s."id";

-- Legacy rows predating Set Akreditasi (accreditation_set_id already null)
-- have no owning set to backfill from -- assign to the seed tenant, same
-- fallback dev-v1 already uses elsewhere for pre-multi-tenant data.
UPDATE "guide_references"
SET "tenant_id" = 'demo-tenant'
WHERE "tenant_id" IS NULL;

ALTER TABLE "guide_references" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "guide_references"
  ADD CONSTRAINT "guide_references_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "org_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "guide_references_tenant_id_idx" ON "guide_references"("tenant_id");

-- 2. Structure-extraction status moves from AccreditationSet to the guide
--    itself (worker.py::_handle_ingestion_struktur_dokumen) -- only
--    meaningful for type=PANDUAN_LAM rows, unused by TEMPLATE_LKPS/DOKUMEN_RUBRIK.
ALTER TABLE "guide_references" ADD COLUMN "structure_parse_status" "StatusEkstraksi" NOT NULL DEFAULT 'SIAP';
ALTER TABLE "guide_references" ADD COLUMN "structure_parse_error" TEXT;
ALTER TABLE "guide_references" ADD COLUMN "structure_staging" JSONB;

ALTER TABLE "accreditation_sets" DROP COLUMN "structure_parse_status";
ALTER TABLE "accreditation_sets" DROP COLUMN "structure_parse_error";
ALTER TABLE "accreditation_sets" DROP COLUMN "structure_staging";

-- 3. AccreditationSet.panduanId: which Panduan this set currently uses.
--    Clean cut, no backfill -- local dev DB only has 6 seed/test sets (see
--    tracker row 146 / memory), all lose their PANDUAN_LAM link here and
--    need to re-upload+re-confirm. Not attempted for production data.
ALTER TABLE "accreditation_sets" ADD COLUMN "panduan_id" TEXT;
ALTER TABLE "accreditation_sets"
  ADD CONSTRAINT "accreditation_sets_panduan_id_fkey"
  FOREIGN KEY ("panduan_id") REFERENCES "guide_references"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "accreditation_sets_panduan_id_idx" ON "accreditation_sets"("panduan_id");

-- 4. ChapterTemplate rescoped from AccreditationSet to ReferenceGuide (the
--    Panduan) -- Sets sharing a Panduan now automatically share its
--    structure. Same clean-cut call as step 3: existing 17 rows (all
--    belonging to those same seed/test sets) are dropped rather than
--    backfilled into synthetic per-set Panduan rows; ON DELETE CASCADE on
--    sub_bab_templates.chapter_template_id takes their children with them.
DELETE FROM "chapter_templates";

ALTER TABLE "chapter_templates" DROP CONSTRAINT "chapter_templates_accreditation_set_id_fkey";
DROP INDEX "chapter_templates_accreditation_set_id_order_key";
ALTER TABLE "chapter_templates" RENAME COLUMN "accreditation_set_id" TO "guide_id";
ALTER TABLE "chapter_templates"
  ADD CONSTRAINT "chapter_templates_guide_id_fkey"
  FOREIGN KEY ("guide_id") REFERENCES "guide_references"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chapter_templates" ADD CONSTRAINT "chapter_templates_guide_id_order_key" UNIQUE ("guide_id", "order");

-- 5. Gap: toggle a committed sub-bab node in/out of future outline
--    generation without re-extracting the whole Panduan.
ALTER TABLE "sub_bab_templates" ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT true;
