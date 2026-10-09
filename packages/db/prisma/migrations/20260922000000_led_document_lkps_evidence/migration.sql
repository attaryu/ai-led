-- Dimas parity: each LED document picks one LKPS (dokumen_led.lkps_id).
ALTER TABLE "writing_led_documents" ADD COLUMN "lkps_evidence_id" TEXT;

ALTER TABLE "writing_led_documents" ADD CONSTRAINT "writing_led_documents_lkps_evidence_id_fkey"
    FOREIGN KEY ("lkps_evidence_id") REFERENCES "evidence_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TYPE "JobType" ADD VALUE 'INGESTION_LKPS';
