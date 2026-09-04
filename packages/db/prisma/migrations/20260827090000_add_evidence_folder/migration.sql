-- AlterTable
ALTER TABLE "evidence_files" ADD COLUMN "folder_id" TEXT;

-- CreateTable
CREATE TABLE "evidence_folders" (
    "id" TEXT NOT NULL,
    "owner_type" "OwnerTipe" NOT NULL,
    "tenant_id" TEXT,
    "study_program_id" TEXT,
    "name" TEXT NOT NULL,
    "parent_id" TEXT,
    "created_by_user_id" TEXT NOT NULL,
    "created_by_name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evidence_folders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "evidence_folders_tenant_id_idx" ON "evidence_folders"("tenant_id");

-- CreateIndex
CREATE INDEX "evidence_folders_study_program_id_idx" ON "evidence_folders"("study_program_id");

-- CreateIndex
CREATE INDEX "evidence_folders_parent_id_idx" ON "evidence_folders"("parent_id");

-- CreateIndex
CREATE INDEX "evidence_files_folder_id_idx" ON "evidence_files"("folder_id");

-- AddForeignKey
ALTER TABLE "evidence_files" ADD CONSTRAINT "evidence_files_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "evidence_folders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_folders" ADD CONSTRAINT "evidence_folders_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "org_tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_folders" ADD CONSTRAINT "evidence_folders_study_program_id_fkey" FOREIGN KEY ("study_program_id") REFERENCES "org_study_programs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_folders" ADD CONSTRAINT "evidence_folders_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "evidence_folders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
