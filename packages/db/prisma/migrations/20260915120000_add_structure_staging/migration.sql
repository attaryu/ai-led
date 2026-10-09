-- AlterEnum
ALTER TYPE "StatusEkstraksi" ADD VALUE 'MENUNGGU_KONFIRMASI';

-- AlterTable
ALTER TABLE "accreditation_sets" ADD COLUMN     "structure_staging" JSONB;
