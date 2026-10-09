-- LED upload via R2 file key + worker job (architecture rule 3), no more multipart to apps/ai.
ALTER TABLE "writing_led_documents" ADD COLUMN "led_file_key" TEXT;

ALTER TYPE "JobType" ADD VALUE 'INGESTION_LED';
