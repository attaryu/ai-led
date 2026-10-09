-- DropTable
-- Outline generation no longer calls an LLM (worker.py::_handle_generasi_outline_bab
-- now copies ChapterTemplate/SubBabTemplate directly), so nothing writes or
-- reads this cache anymore.
DROP TABLE "chapter_outline_cache";
