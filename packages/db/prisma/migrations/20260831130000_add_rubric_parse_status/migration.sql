-- AlterEnum
ALTER TYPE "JobType" ADD VALUE 'INGESTION_RUBRIK_DOKUMEN';

-- AlterTable
ALTER TABLE "accreditation_sets" ADD COLUMN     "criteria_parse_error" TEXT,
ADD COLUMN     "criteria_parse_status" "StatusEkstraksi" NOT NULL DEFAULT 'SIAP';
