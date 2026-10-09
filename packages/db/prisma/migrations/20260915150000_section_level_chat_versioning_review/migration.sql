-- Chat/versioning/approve-lock move from bab-level (DocumentChapter) to
-- section-level (ChapterSection), matching dimas's bab_dokumen/bab_draft
-- granularity. ChapterDraft (bab-level, scoring/RAGAS) stays untouched.
-- Hand-written (not `prisma migrate dev` -- checksum drift on the previous
-- migration blocked its shadow-DB comparison; this uses `migrate deploy`
-- instead, which doesn't re-diff already-applied migrations).

ALTER TABLE "writing_chapter_sections"
  ADD COLUMN "active_checkpoint_id" TEXT,
  ADD COLUMN "locked" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "quality_assurance_note" TEXT,
  ADD COLUMN "noted_by_name" TEXT,
  ADD COLUMN "noted_at" TIMESTAMP(3),
  ADD COLUMN "review_submitted_at" TIMESTAMP(3);

CREATE TABLE "writing_section_drafts" (
    "id" TEXT NOT NULL,
    "section_id" TEXT NOT NULL,
    "created_by_user_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "label" TEXT,
    "content_snapshot" JSONB NOT NULL,
    "source" "SumberDraft" NOT NULL,
    "created_by_name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "writing_section_drafts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "writing_section_drafts_section_id_version_key" ON "writing_section_drafts"("section_id", "version");
CREATE INDEX "writing_section_drafts_section_id_idx" ON "writing_section_drafts"("section_id");

ALTER TABLE "writing_section_drafts"
  ADD CONSTRAINT "writing_section_drafts_section_id_fkey"
  FOREIGN KEY ("section_id") REFERENCES "writing_chapter_sections"("id") ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE "writing_section_drafts"
  ADD CONSTRAINT "writing_section_drafts_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "org_users"("id") ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE "writing_chapter_sections"
  ADD CONSTRAINT "writing_chapter_sections_active_checkpoint_id_fkey"
  FOREIGN KEY ("active_checkpoint_id") REFERENCES "writing_section_drafts"("id") ON UPDATE CASCADE ON DELETE SET NULL;

-- writing_chat_messages is empty in every environment this has run in so
-- far (chat feature never shipped a UI that wrote to it) -- clean rename,
-- no data to carry over.
ALTER TABLE "writing_chat_messages" DROP CONSTRAINT "writing_chat_messages_chapter_id_fkey";
ALTER TABLE "writing_chat_messages" RENAME COLUMN "chapter_id" TO "section_id";
DROP INDEX "writing_chat_messages_chapter_id_idx";
CREATE INDEX "writing_chat_messages_section_id_idx" ON "writing_chat_messages"("section_id");
ALTER TABLE "writing_chat_messages"
  ADD CONSTRAINT "writing_chat_messages_section_id_fkey"
  FOREIGN KEY ("section_id") REFERENCES "writing_chapter_sections"("id") ON UPDATE CASCADE ON DELETE RESTRICT;
