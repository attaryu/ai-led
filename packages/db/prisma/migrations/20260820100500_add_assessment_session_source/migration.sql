-- CreateEnum
CREATE TYPE "LedSourceMode" AS ENUM ('EDITOR', 'UNGGAHAN');

-- AlterTable
ALTER TABLE "assessment_sessions" ADD COLUMN "sumber_led" "LedSourceMode" NOT NULL DEFAULT 'EDITOR';
ALTER TABLE "assessment_sessions" ADD COLUMN "led_file_name" TEXT;
ALTER TABLE "assessment_sessions" ADD COLUMN "lkps_bukti_dukung_id" TEXT;
