"""PostgreSQL connection pool. Single source of truth utk koneksi DB.

Schema TIDAK dibuat di sini (beda filosofi dari SQLite lama yang pakai
CREATE TABLE IF NOT EXISTS di init_db()) -- 17 tabel + FK kompleks dikelola
lewat db/schema.sql (auto-apply oleh image postgres saat volume pertama kali
dibuat) + scripts/migrate_to_postgres.py + scripts/import_chunks.py (data).
init_db() di sini cuma health-check koneksi supaya app gagal cepat & jelas
kalau Postgres belum siap/schema belum ter-apply.
"""
import os
from contextlib import contextmanager
from typing import Iterator

import psycopg
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://led:led@postgres:5432/led",
)

_pool = ConnectionPool(
    DATABASE_URL,
    min_size=1,
    max_size=10,
    kwargs={"row_factory": dict_row},
    open=False,
)


def init_db():
    """Health-check koneksi + pastikan schema (17 tabel) sudah ter-apply."""
    if _pool.closed:
        _pool.open(wait=True, timeout=30)
    with _pool.connection() as con:
        con.execute("SELECT 1")
        n_tables = con.execute(
            "SELECT count(*) AS n FROM information_schema.tables "
            "WHERE table_schema = 'public'"
        ).fetchone()["n"]
        if n_tables < 17:
            raise RuntimeError(
                f"Schema belum lengkap (hanya {n_tables}/17 tabel). "
                "Jalankan db/schema.sql dulu (docker compose up postgres "
                "dgn volume pgdata kosong akan auto-apply)."
            )


@contextmanager
def conn() -> Iterator[psycopg.Connection]:
    if _pool.closed:
        _pool.open(wait=True, timeout=30)
    with _pool.connection() as con:
        yield con   # psycopg3: commit on clean exit, rollback on exception (context manager bawaan)
