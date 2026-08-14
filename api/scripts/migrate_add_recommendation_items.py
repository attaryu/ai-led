"""CREATE TABLE bab_recommendation_item di DB dev yg sudah berjalan (bukan
fresh volume, yg sudah dapat tabel ini otomatis dari db/schema.sql).
Idempotent (CREATE TABLE/INDEX IF NOT EXISTS).

Jalankan: docker compose exec api python scripts/migrate_add_recommendation_items.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from lib.db import _pool  # noqa: E402

DDL = """
CREATE TABLE IF NOT EXISTS bab_recommendation_item (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recommendation_id UUID NOT NULL REFERENCES bab_document_recommendation(id) ON DELETE CASCADE,
    label             TEXT NOT NULL,
    reason            TEXT,
    urutan            INTEGER NOT NULL DEFAULT 0,
    dibuat_pada       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bab_rec_item_lookup ON bab_recommendation_item(recommendation_id, urutan);
"""


def main():
    _pool.open(wait=True, timeout=30)
    with _pool.connection() as con:
        con.execute(DDL)
        con.commit()
    print("[OK] bab_recommendation_item siap (idempotent).")


if __name__ == "__main__":
    main()
