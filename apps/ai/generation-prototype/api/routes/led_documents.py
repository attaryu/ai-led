"""Endpoint daftar & manajemen dokumen LED. 1 prodi (user statis, lihat
lib/auth.py) bisa punya BANYAK dokumen_led sekaligus -- halaman utama
frontend (LedListPage.jsx) menampilkan tabel ini, klik judul masuk ke
editor (/led/{dokumen_id}) yang menjalankan endpoint routes/sections.py,
chat.py, export.py dengan dokumen_id eksplisit dari path URL."""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from lib.auth import require_led_access
from lib.context import create_dokumen_led, get_dokumen_led, list_dokumen_led

router = APIRouter(prefix="/led-documents", tags=["led-documents"])


class DokumenLedOut(BaseModel):
    id: str
    judul: str
    tahun_akademik: str
    status_keseluruhan: str


class CreateDokumenLedRequest(BaseModel):
    judul: str
    tahun_akademik: str


@router.get("", response_model=List[DokumenLedOut])
def list_documents(_user=Depends(require_led_access)):
    return list_dokumen_led()


@router.post("", response_model=DokumenLedOut)
def create_document(req: CreateDokumenLedRequest, _user=Depends(require_led_access)):
    judul = req.judul.strip()
    tahun_akademik = req.tahun_akademik.strip()
    if not judul:
        raise HTTPException(400, "Judul tidak boleh kosong")
    if not tahun_akademik:
        raise HTTPException(400, "Tahun akademik tidak boleh kosong")
    return create_dokumen_led(judul, tahun_akademik)


@router.get("/{dokumen_id}", response_model=DokumenLedOut)
def get_document(dokumen_id: str, _user=Depends(require_led_access)):
    doc = get_dokumen_led(dokumen_id)
    if not doc:
        raise HTTPException(404, "Dokumen LED tidak ditemukan")
    return doc
