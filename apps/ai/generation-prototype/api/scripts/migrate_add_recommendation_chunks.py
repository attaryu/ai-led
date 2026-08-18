"""ALTER schema utk tambah pedoman_used/rubric_used/lkps_used ke
bab_document_recommendation di DB dev yg sudah berjalan (bukan fresh volume,
yg sudah dapat kolom ini otomatis dari db/schema.sql). Idempotent (ADD
COLUMN IF NOT EXISTS).

Jalankan: docker compose exec api python scripts/migrate_add_recommendation_chunks.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from lib.db import _pool  # noqa: E402

DDL = """
ALTER TABLE bab_document_recommendation
    ADD COLUMN IF NOT EXISTS pedoman_used JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS rubric_used  JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS lkps_used    JSONB NOT NULL DEFAULT '[]'::jsonb;
"""


def main():
    _pool.open(wait=True, timeout=30)
    with _pool.connection() as con:
        con.execute(DDL)
        con.commit()
    print("[OK] bab_document_recommendation.pedoman_used/rubric_used/lkps_used siap (idempotent).")


if __name__ == "__main__":
    main()
