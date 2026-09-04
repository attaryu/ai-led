"""Profil user statis -- dipakai frontend sekali di root utk tahu role,
lalu menentukan menu/halaman apa yg ditampilkan (mis. sembunyikan menu LED
kalau role ADMIN). Lihat lib/auth.py utk aturan akses lengkap."""
from fastapi import APIRouter

from lib.auth import get_current_user
from lib.db import conn

router = APIRouter(tags=["me"])


@router.get("/me")
def get_me():
    user = get_current_user()
    with conn() as con:
        tenant = con.execute(
            "SELECT nama_universitas FROM tenant WHERE id = %s", (user["tenant_id"],)
        ).fetchone()
        prodi = con.execute(
            "SELECT nama FROM program_studi WHERE id = %s", (user["program_studi_id"],)
        ).fetchone() if user["program_studi_id"] else None

    return {
        "id": str(user["id"]),
        "nama_lengkap": user["nama_lengkap"],
        "email": user["email"],
        "role": user["role"],
        "tenant_nama": tenant["nama_universitas"] if tenant else None,
        "program_studi_nama": prodi["nama"] if prodi else None,
    }
