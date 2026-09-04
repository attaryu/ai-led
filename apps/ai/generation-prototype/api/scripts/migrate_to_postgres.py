"""Migrasi 1x-jalan: SQLite led.db lama (drafts) -> PostgreSQL skema baru.

Dijalankan manual (bukan bagian startup FastAPI):
    docker compose run --rm api python scripts/migrate_to_postgres.py --dry-run
    docker compose run --rm api python scripts/migrate_to_postgres.py

Idempotent guard: kalau tabel `tenant` sudah berisi data, skrip menolak
jalan lagi (kecuali --force) supaya tidak double-insert.

Seed data induk dibuat sekali: 1 TENANT, 1 USER "system", 1 PROGRAM_STUDI,
1 DOKUMEN_LED. 210 BAB_DOKUMEN dibangun dari lib.outline.get_sections()
(urutan array = urutan_bab, deterministik). Untuk tiap (section_id, model)
unik di drafts lama: 1 baris BAB_DOKUMEN + 1 baris BAB_DRAFT checkpoint.

chat_messages & eval_results lama TIDAK dimigrasikan (dikonfirmasi 0 baris
isi keduanya) -- led.db dibiarkan apa adanya sbg arsip.
"""
import argparse
import json
import os
import sqlite3
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # /app

from lib.outline import get_sections  # noqa: E402
from lib.db import _pool  # noqa: E402

LEGACY_DB_PATH = os.environ.get("LEGACY_DB_PATH", "/data/led.db")

TENANT_NAME = "Politeknik Elektronika Negeri Surabaya"
PRODI_NAME = "PJJ Teknik Telekomunikasi"
DOKUMEN_JUDUL = "Laporan Evaluasi Diri PJJ Teknik Telekomunikasi"
DOKUMEN_TAHUN = "2026/2027"
SYSTEM_EMAIL = "system@led-generator.local"
SYSTEM_NAMA = "system"

JSON_FIELDS = ("pedoman_used", "rubric_used", "checklist", "chunks_used", "judge_result")


def _load_legacy_drafts():
    if not Path(LEGACY_DB_PATH).exists():
        print(f"[WARN] {LEGACY_DB_PATH} tidak ditemukan, tidak ada draft lama utk dimigrasi.")
        return []
    con = sqlite3.connect(LEGACY_DB_PATH)
    con.row_factory = sqlite3.Row
    rows = [dict(r) for r in con.execute("SELECT * FROM drafts ORDER BY section_id, model")]
    con.close()
    return rows


def _build_konten_kerja(row: dict) -> dict:
    payload = {
        "model": row["model"],
        "draft_text": row["draft_text"],
        "prompt_full": row.get("prompt_full"),
        "latency_sec": row.get("latency_sec"),
        "token_count": row.get("token_count"),
        "legacy_draft_id": row.get("id"),
        "legacy_created_at": row.get("created_at"),
        "legacy_updated_at": row.get("updated_at"),
    }
    for f in JSON_FIELDS:
        raw = row.get(f)
        if raw:
            try:
                payload[f] = json.loads(raw)
            except (TypeError, json.JSONDecodeError):
                payload[f] = raw
        else:
            payload[f] = None
    return payload


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--force", action="store_true", help="jalan meski tenant sudah ada (HATI-HATI, bisa duplikat)")
    args = ap.parse_args()

    sections = get_sections()
    print(f"Outline: {len(sections)} section (sumber kebenaran urutan_bab).")
    if len(sections) == 0:
        print("[ERROR] outline kosong -- cek LED_STRUCT_PATH.")
        sys.exit(1)
    section_id_to_urutan = {s["id"]: i + 1 for i, s in enumerate(sections)}
    section_id_to_title = {s["id"]: s["full_title"] for s in sections}

    legacy_rows = _load_legacy_drafts()
    print(f"Drafts lama (SQLite): {len(legacy_rows)} baris.")

    unmapped = [r["section_id"] for r in legacy_rows if r["section_id"] not in section_id_to_urutan]
    if unmapped:
        print(f"[WARN] {len(unmapped)} baris drafts dgn section_id tidak ketemu di outline saat ini, akan di-skip:")
        for sid in sorted(set(unmapped)):
            print(f"    - {sid}")
    legacy_rows = [r for r in legacy_rows if r["section_id"] in section_id_to_urutan]

    n_bab_dokumen_planned = len(sections)
    n_drafts_planned = len(legacy_rows)
    print(f"\nRencana: {n_bab_dokumen_planned} baris BAB_DOKUMEN (1 per section, model diisi saat draft muncul),")
    print(f"         {n_drafts_planned} baris draft lama -> masing2 1 BAB_DOKUMEN(section,model) + 1 BAB_DRAFT checkpoint.")

    if args.dry_run:
        print("\n[DRY RUN] Tidak ada perubahan ditulis ke database.")
        return

    _pool.open(wait=True, timeout=30)
    with _pool.connection() as con:
        con.execute("BEGIN")
        try:
            existing = con.execute("SELECT count(*) AS n FROM tenant").fetchone()["n"]
            if existing > 0 and not args.force:
                print(f"[ABORT] Tabel tenant sudah berisi {existing} baris. "
                      "Skrip ini sudah pernah dijalankan -- pakai --force kalau yakin ingin jalan lagi.")
                con.rollback()
                sys.exit(1)

            # 1. Seed data induk
            tenant_id = con.execute(
                "INSERT INTO tenant (nama_universitas) VALUES (%s) RETURNING id",
                (TENANT_NAME,),
            ).fetchone()["id"]

            system_user_id = con.execute(
                """INSERT INTO app_user (tenant_id, nama_lengkap, email, password_hash, role)
                   VALUES (%s, %s, %s, %s, 'ADMIN') RETURNING id""",
                (tenant_id, SYSTEM_NAMA, SYSTEM_EMAIL, str(uuid.uuid4())),
            ).fetchone()["id"]

            prodi_id = con.execute(
                "INSERT INTO program_studi (tenant_id, nama) VALUES (%s, %s) RETURNING id",
                (tenant_id, PRODI_NAME),
            ).fetchone()["id"]

            dokumen_id = con.execute(
                """INSERT INTO dokumen_led (program_studi_id, judul, tahun_akademik, status_keseluruhan)
                   VALUES (%s, %s, %s, 'DRAFT') RETURNING id""",
                (prodi_id, DOKUMEN_JUDUL, DOKUMEN_TAHUN),
            ).fetchone()["id"]

            print(f"Seed: tenant={tenant_id} user={system_user_id} prodi={prodi_id} dokumen={dokumen_id}")

            # 2. Kelompokkan draft lama per section_id supaya tiap model dapat baris BAB_DOKUMEN sendiri
            by_section = {}
            for row in legacy_rows:
                by_section.setdefault(row["section_id"], []).append(row)

            n_bab_dokumen_created = 0
            n_bab_draft_created = 0
            bab_dokumen_ids = {}  # (section_id, model) -> bab_dokumen id

            for sid, rows_for_section in by_section.items():
                urutan = section_id_to_urutan[sid]
                judul = section_id_to_title[sid]
                for row in rows_for_section:
                    model = row["model"]
                    konten_kerja = _build_konten_kerja(row)
                    status = row.get("status") or "draft"

                    bab_id = con.execute(
                        """INSERT INTO bab_dokumen
                               (dokumen_id, urutan_bab, judul_bab, model, status, konten_kerja, terakhir_disimpan)
                           VALUES (%s, %s, %s, %s, %s, %s, %s)
                           RETURNING id""",
                        (dokumen_id, urutan, judul, model, status,
                         json.dumps(konten_kerja, ensure_ascii=False), row.get("updated_at")),
                    ).fetchone()["id"]
                    n_bab_dokumen_created += 1
                    bab_dokumen_ids[(sid, model)] = bab_id

                    draft_id = con.execute(
                        """INSERT INTO bab_draft
                               (bab_id, dibuat_oleh_user_id, model, versi, label,
                                konten_snapshot, sumber, dibuat_pada)
                           VALUES (%s, %s, %s, 1, %s, %s, 'AI', %s)
                           RETURNING id""",
                        (bab_id, system_user_id, model,
                         "Migrasi dari SQLite legacy",
                         json.dumps(konten_kerja, ensure_ascii=False), row.get("created_at")),
                    ).fetchone()["id"]
                    n_bab_draft_created += 1

                    con.execute(
                        "UPDATE bab_dokumen SET checkpoint_aktif_id = %s WHERE id = %s",
                        (draft_id, bab_id),
                    )

            # 3. Section yang TIDAK punya draft lama sama sekali -> tetap butuh baris BAB_DOKUMEN
            #    supaya urutan_bab 1..210 lengkap (dgn model placeholder kosong ditandai jelas).
            #    TIDAK dibuat di sini: tanpa draft nyata, tidak ada 'model' yang valid utk diisi
            #    (kolom model NOT NULL). Section2 ini akan otomatis mendapat baris BAB_DOKUMEN saat
            #    pertama kali di-generate lewat generator.py (INSERT ... ON CONFLICT).

            con.commit()
            print(f"\n[OK] Selesai. BAB_DOKUMEN dibuat: {n_bab_dokumen_created}, BAB_DRAFT dibuat: {n_bab_draft_created}")
            print(f"     Section tanpa draft lama (belum py baris BAB_DOKUMEN, akan dibuat saat generate pertama): "
                  f"{len(sections) - len(by_section)}")
        except Exception:
            con.rollback()
            raise


if __name__ == "__main__":
    main()
