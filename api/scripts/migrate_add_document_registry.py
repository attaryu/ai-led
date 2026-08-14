"""ALTER schema utk tambah document_registry + bab_document_recommendation
di DB dev yg sudah berjalan (bukan fresh volume, yg sudah dapat tabel ini
otomatis dari db/schema.sql). Idempotent (CREATE TABLE/INDEX IF NOT EXISTS).

Jalankan: docker compose exec api python scripts/migrate_add_document_registry.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from lib.db import _pool  # noqa: E402

DDL = """
CREATE TABLE IF NOT EXISTS document_registry (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chunk_id          TEXT NOT NULL UNIQUE,
    folder_path       TEXT NOT NULL,
    folder_name       TEXT NOT NULL,
    document_text     TEXT NOT NULL,
    document_count    INTEGER NOT NULL DEFAULT 0,
    dibuat_pada       TIMESTAMPTZ NOT NULL DEFAULT now(),
    diperbarui_pada   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_document_registry_folder ON document_registry(folder_path);

CREATE TABLE IF NOT EXISTS bab_document_recommendation (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dokumen_id            UUID NOT NULL REFERENCES dokumen_led(id) ON DELETE CASCADE,
    urutan_bab            INTEGER NOT NULL,
    model                 TEXT NOT NULL,
    document_query        JSONB NOT NULL DEFAULT '[]'::jsonb,
    lkps_needed           BOOLEAN NOT NULL DEFAULT FALSE,
    lkps_sufficient       BOOLEAN,
    lkps_evidence_query   JSONB,
    candidate_folders     JSONB NOT NULL DEFAULT '[]'::jsonb,
    recommendation_text   TEXT,
    selected_folder_paths JSONB NOT NULL DEFAULT '[]'::jsonb,
    status                TEXT NOT NULL DEFAULT 'recommended'
                              CHECK (status IN ('recommended','confirmed','superseded')),
    dibuat_pada           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bab_doc_rec_lookup
    ON bab_document_recommendation(dokumen_id, urutan_bab, model, dibuat_pada DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_bab_doc_rec_confirmed
    ON bab_document_recommendation(dokumen_id, urutan_bab, model) WHERE status = 'confirmed';
"""


def main():
    _pool.open(wait=True, timeout=30)
    with _pool.connection() as con:
        con.execute(DDL)
        con.commit()
    print("[OK] document_registry + bab_document_recommendation siap (idempotent).")


if __name__ == "__main__":
    main()
