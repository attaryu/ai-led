-- LKPS files (dimas: separate `lkps` table per prodi) kept apart from Bukti Dukung.
CREATE TYPE "EvidenceKind" AS ENUM ('BUKTI_DUKUNG', 'LKPS');

ALTER TABLE "evidence_files" ADD COLUMN "kind" "EvidenceKind" NOT NULL DEFAULT 'BUKTI_DUKUNG';

-- Documents already pointing at an LKPS file: that file is an LKPS.
UPDATE "evidence_files" SET "kind" = 'LKPS'
WHERE "id" IN (SELECT "lkps_evidence_id" FROM "writing_led_documents" WHERE "lkps_evidence_id" IS NOT NULL);
