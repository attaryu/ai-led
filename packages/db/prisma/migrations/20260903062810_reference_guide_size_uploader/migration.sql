-- AlterTable
ALTER TABLE "guide_references" ADD COLUMN     "size_bytes" INTEGER,
ADD COLUMN     "uploaded_by_name" TEXT,
ADD COLUMN     "uploaded_by_user_id" TEXT;

-- AddForeignKey
ALTER TABLE "guide_references" ADD CONSTRAINT "guide_references_uploaded_by_user_id_fkey" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "org_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
