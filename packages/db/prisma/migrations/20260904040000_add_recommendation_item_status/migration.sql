-- CreateEnum
CREATE TYPE "StatusItemRekomendasi" AS ENUM ('DIREKOMENDASIKAN', 'DIGUNAKAN', 'TIDAK_DIPERLUKAN');

-- AlterTable
ALTER TABLE "writing_recommendation_items" ADD COLUMN     "status" "StatusItemRekomendasi" NOT NULL DEFAULT 'DIREKOMENDASIKAN';
