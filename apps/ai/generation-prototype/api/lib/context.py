"""Resolve konteks aplikasi (system user + program studi tunggal) dan mapping
section_id -> urutan_bab, dipakai bersama oleh generator.py, routes/sections.py,
routes/chat.py, routes/export.py.

Aplikasi ini single-tenant/single-prodi (sesuai seed migrate_to_postgres.py):
1 TENANT, 1 PROGRAM_STUDI -- TAPI banyak DOKUMEN_LED boleh ada sekaligus utk
prodi itu (multi-dokumen per user, lihat routes/led_documents.py). Jadi
`dokumen_id` TIDAK lagi di-resolve otomatis/global -- selalu dioper eksplisit
dari path URL frontend (/led-documents/{dokumen_id}/...), lihat
list_dokumen_led()/create_dokumen_led()/get_dokumen_led() di bawah.

`urutan_bab` tiap section SELALU sama dengan index (mulai 1) di
lib.outline.get_sections() -- outline.py jadi satu-satunya sumber kebenaran
urutan (document-independent, tidak terikat ke dokumen_led manapun).
"""
from functools import lru_cache
from typing import Dict, List, Optional

from .db import conn
from .outline import get_sections

SYSTEM_EMAIL = "system@led-generator.local"


@lru_cache(maxsize=1)
def _section_id_to_urutan() -> dict:
    return {s["id"]: i + 1 for i, s in enumerate(get_sections())}


def get_urutan_bab(section_id: str) -> Optional[int]:
    return _section_id_to_urutan().get(section_id)


def get_active_dokumen_id() -> str:
    """LEGACY -- dokumen LED PERTAMA milik prodi aktif (bukan lru_cache lagi,
    karena "dokumen aktif tunggal" bukan konsep valid lagi begitu 1 prodi
    boleh punya banyak dokumen_led). Dipertahankan HANYA sbg startup
    existence-check (main.py) & fallback skrip lama -- endpoint LED yang
    berjalan (routes/sections.py dkk) HARUS pakai dokumen_id eksplisit dari
    path URL, BUKAN fungsi ini."""
    with conn() as con:
        row = con.execute(
            "SELECT id FROM dokumen_led WHERE program_studi_id = %s ORDER BY id LIMIT 1",
            (get_active_program_studi_id(),),
        ).fetchone()
    if row is None:
        raise RuntimeError(
            "Tabel dokumen_led kosong utk prodi aktif. Buat dokumen LED baru dulu "
            "lewat POST /led-documents (atau jalankan scripts/migrate_to_postgres.py "
            "utk seed data induk)."
        )
    return row["id"]


def list_dokumen_led() -> List[Dict]:
    """Semua dokumen LED milik prodi aktif -- dipakai halaman daftar LED."""
    with conn() as con:
        rows = con.execute(
            """SELECT id, judul, tahun_akademik, status_keseluruhan
               FROM dokumen_led WHERE program_studi_id = %s ORDER BY judul""",
            (get_active_program_studi_id(),),
        ).fetchall()
    # id dari psycopg berupa objek UUID -- konversi ke str supaya cocok dgn
    # response_model Pydantic (DokumenLedOut.id: str) di routes/led_documents.py.
    return [{**dict(r), "id": str(r["id"])} for r in rows]


def create_dokumen_led(judul: str, tahun_akademik: str) -> Dict:
    with conn() as con:
        row = con.execute(
            """INSERT INTO dokumen_led (program_studi_id, judul, tahun_akademik)
               VALUES (%s, %s, %s)
               RETURNING id, judul, tahun_akademik, status_keseluruhan""",
            (get_active_program_studi_id(), judul, tahun_akademik),
        ).fetchone()
    return {**dict(row), "id": str(row["id"])}


def get_dokumen_led(dokumen_id: str) -> Optional[Dict]:
    """1 dokumen LED, discope ke prodi aktif -- None kalau tidak ada ATAU
    bukan milik prodi ini (dipakai sbg guard 404 di semua route LED)."""
    with conn() as con:
        row = con.execute(
            """SELECT id, judul, tahun_akademik, status_keseluruhan
               FROM dokumen_led WHERE id = %s AND program_studi_id = %s""",
            (dokumen_id, get_active_program_studi_id()),
        ).fetchone()
    return {**dict(row), "id": str(row["id"])} if row else None


@lru_cache(maxsize=1)
def get_system_user_id() -> str:
    with conn() as con:
        row = con.execute(
            "SELECT id FROM app_user WHERE email = %s LIMIT 1", (SYSTEM_EMAIL,)
        ).fetchone()
    if row is None:
        raise RuntimeError(
            "User system tidak ditemukan. Jalankan scripts/migrate_to_postgres.py dulu."
        )
    return row["id"]


@lru_cache(maxsize=1)
def get_active_program_studi_id() -> str:
    """Dipakai routes/documents.py: dokumen yg diupload lewat halaman Document
    diberi owner_tipe='PROGRAM_STUDI' (bukan 'TENANT' spt data institusional
    lama hasil import_chunks.py), krn upload dari UI ini scoped ke prodi
    yg sedang aktif dikerjakan."""
    with conn() as con:
        row = con.execute("SELECT id FROM program_studi ORDER BY id LIMIT 1").fetchone()
    if row is None:
        raise RuntimeError(
            "Tabel program_studi kosong. Jalankan scripts/migrate_to_postgres.py dulu."
        )
    return row["id"]


def get_bab_dokumen_id(dokumen_id: str, section_id: str, model: str) -> Optional[str]:
    """Cari id bab_dokumen utk (dokumen_id, section_id, model). None kalau
    belum pernah dibuat (section ini belum pernah digenerate dgn model ini)."""
    urutan = get_urutan_bab(section_id)
    if urutan is None:
        return None
    with conn() as con:
        row = con.execute(
            """SELECT id FROM bab_dokumen
               WHERE dokumen_id = %s AND urutan_bab = %s AND model = %s""",
            (dokumen_id, urutan, model),
        ).fetchone()
    return row["id"] if row else None
