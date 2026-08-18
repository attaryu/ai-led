"""ALTER schema: pindahkan ownership bab_document_recommendation dari
section-level (dokumen_id, urutan_bab, model) ke draft-level (bab_draft_id) --
supaya hapus 1 draft otomatis hapus rekomendasi miliknya (CASCADE), user bisa
minta rekomendasi baru tanpa mempengaruhi draft lain. Idempotent (ADD COLUMN
IF NOT EXISTS / DROP INDEX IF EXISTS / CREATE INDEX IF NOT EXISTS).

Jalankan: docker compose exec api python scripts/migrate_add_draft_owned_recommendation.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from lib.db import _pool  # noqa: E402

DDL = """
ALTER TABLE bab_draft
    ALTER COLUMN konten_snapshot SET DEFAULT '{}'::jsonb;
ALTER TABLE bab_draft
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'EMPTY'
        CHECK (status IN ('EMPTY','FILLED'));

ALTER TABLE bab_document_recommendation
    ADD COLUMN IF NOT EXISTS bab_draft_id UUID REFERENCES bab_draft(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_bab_doc_rec_draft ON bab_document_recommendation(bab_draft_id);

DROP INDEX IF EXISTS uq_bab_doc_rec_confirmed;
CREATE UNIQUE INDEX IF NOT EXISTS uq_bab_doc_rec_confirmed_per_draft
    ON bab_document_recommendation(bab_draft_id)
    WHERE status = 'confirmed' AND bab_draft_id IS NOT NULL;
"""

# Backfill: baris bab_draft lama semua punya narasi (draft_text terisi) --
# tandai FILLED (bukan default EMPTY) supaya UI lama tidak salah kira draft
# lama "kosong".
BACKFILL = """
UPDATE bab_draft SET status = 'FILLED'
WHERE status = 'EMPTY'
  AND COALESCE(konten_snapshot->>'draft_text', '') <> '';
"""


def main():
    _pool.open(wait=True, timeout=30)
    with _pool.connection() as con:
        con.execute(DDL)
        con.execute(BACKFILL)
        con.commit()
    print("[OK] bab_draft.status + bab_document_recommendation.bab_draft_id siap (idempotent).")


if __name__ == "__main__":
    main()
