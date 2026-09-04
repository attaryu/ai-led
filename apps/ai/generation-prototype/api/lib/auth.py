"""Guard akses berbasis role -- BELUM ada login sungguhan. Semua request
dianggap berasal dari 1 user statis tetap (lihat lib/context.py::SYSTEM_EMAIL).
Aturan akses mengikuti tabel role di database.md #2 USER:

  ADMIN         -> tidak ada akses LED sama sekali (403 total)
  PIMPINAN      -> read-only LED (GET boleh, method lain 403)
  PENJAMIN_MUTU -> akses penuh
  PENYUSUN      -> akses penuh

Endpoint /documents (bukti dukung evidence) TIDAK dibatasi role sama sekali
-- dependency ini HANYA dipasang di routes/sections.py, chat.py, export.py.
"""
from functools import lru_cache

from fastapi import Depends, HTTPException, Request

from .context import SYSTEM_EMAIL
from .db import conn

READ_ONLY_ROLES = {"PIMPINAN"}
FULL_ACCESS_ROLES = {"PENJAMIN_MUTU", "PENYUSUN"}
NO_ACCESS_ROLES = {"ADMIN"}


@lru_cache(maxsize=1)
def get_current_user() -> dict:
    """Resolve user statis. Role TIDAK di-cache lewat lru_cache murni waktu-proses
    supaya perubahan role langsung di DB (mis. utk testing) tetap butuh restart
    proses api -- konsisten dgn pola get_system_user_id()/get_active_program_studi_id()
    di context.py (get_active_dokumen_id() TIDAK lagi lru_cache sejak multi-dokumen)."""
    with conn() as con:
        row = con.execute(
            """SELECT id, nama_lengkap, email, role, tenant_id, program_studi_id
               FROM app_user WHERE email = %s LIMIT 1""",
            (SYSTEM_EMAIL,),
        ).fetchone()
    if row is None:
        raise RuntimeError(
            "User system tidak ditemukan. Jalankan scripts/migrate_to_postgres.py dulu."
        )
    return dict(row)


def require_led_access(request: Request) -> dict:
    """FastAPI dependency: pasang di route function via Depends(require_led_access).
    Raise 403 kalau role tidak berhak akses LED sesuai method request."""
    user = get_current_user()
    role = user["role"]

    if role in NO_ACCESS_ROLES:
        raise HTTPException(403, f"Role {role} tidak memiliki akses ke LED")

    if role in READ_ONLY_ROLES and request.method != "GET":
        raise HTTPException(403, f"Role {role} hanya dapat melihat (read-only)")

    return user
