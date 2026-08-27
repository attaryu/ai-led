"""Migrasi data (BUKAN DDL): konversi draft_text lama (plain string) di
bab_dokumen.konten_kerja dan bab_draft.konten_snapshot jadi ProseMirror doc
JSON (dict), memakai konversi yg SAMA (lib/prose.py::text_to_doc) yg dipakai
_synthesize()/chat revise -- supaya draft lama render identik di editor
TipTap baru tanpa perlu regenerate.

Idempotent: baris yg draft_text-nya SUDAH dict (bukan str) dilewati (WHERE
jsonb_typeof(...) = 'string' di query SELECT membatasi baris yg perlu
dikonversi -- re-run aman, tidak menimpa ulang baris yg sudah bertipe doc).

Jalankan: docker compose exec api python scripts/migrate_prose_to_tiptap.py
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from lib.db import _pool          # noqa: E402
from lib.prose import text_to_doc  # noqa: E402


def _migrate_table(con, table: str, jsonb_col: str) -> int:
    """Baca semua baris yg draft_text-nya masih STRING (jsonb_typeof='string'),
    konversi via text_to_doc, tulis balik dict-nya ke kolom yg sama (key lain
    di dalam objek jsonb TIDAK disentuh -- hanya draft_text yg diganti)."""
    rows = con.execute(
        f"""SELECT id, {jsonb_col} AS kk FROM {table}
            WHERE jsonb_typeof({jsonb_col}->'draft_text') = 'string'"""
    ).fetchall()

    n = 0
    for row in rows:
        kk = row["kk"] or {}
        old_text = kk.get("draft_text") or ""
        kk["draft_text"] = text_to_doc(old_text)
        con.execute(
            f"UPDATE {table} SET {jsonb_col} = %s WHERE id = %s",
            (json.dumps(kk, ensure_ascii=False), row["id"]),
        )
        n += 1
    return n


def main():
    _pool.open(wait=True, timeout=30)
    with _pool.connection() as con:
        n_bab = _migrate_table(con, "bab_dokumen", "konten_kerja")
        n_draft = _migrate_table(con, "bab_draft", "konten_snapshot")
        con.commit()
    print(f"[OK] Konversi draft_text -> ProseMirror doc JSON selesai: "
          f"{n_bab} baris bab_dokumen, {n_draft} baris bab_draft.")


if __name__ == "__main__":
    main()
