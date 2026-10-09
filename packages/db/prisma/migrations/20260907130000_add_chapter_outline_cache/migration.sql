-- CreateTable
CREATE TABLE "chapter_outline_cache" (
    "id" TEXT NOT NULL,
    "accreditation_set_id" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "sections" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chapter_outline_cache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "chapter_outline_cache_accreditation_set_id_order_key" ON "chapter_outline_cache"("accreditation_set_id", "order");

-- AddForeignKey
ALTER TABLE "chapter_outline_cache" ADD CONSTRAINT "chapter_outline_cache_accreditation_set_id_fkey" FOREIGN KEY ("accreditation_set_id") REFERENCES "accreditation_sets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
