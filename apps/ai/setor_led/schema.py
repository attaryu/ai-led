"""Bentuk data proses "setor ke LED" (job SETOR_LED): input IKU, validasi keluaran LLM, dan
bentuk hasil per IKU yang dikembalikan sebagai return value job (Job.result).

Sengaja terpisah dari agent/ (AMI): hasil di sini berupa `score` 0-4 dari rubrik + narasi, tanpa capaian.
"""

from __future__ import annotations

import math
import re
from dataclasses import dataclass

NARASI_INTI: tuple[str, ...] = (
    "analisisKetercapaian",
    "usulanTargetTahunDepan",
    "strategiPencapaian",
    "sarprasDibutuhkan",
)
NARASI_TAMBAHAN: tuple[str, ...] = ("faktorPendukung", "faktorPenghambat", "akarMasalah", "tindakLanjut")
SKOR_MIN, SKOR_MAX = 0, 4
_TARGET_SKOR = re.compile(r"[0-4]")


class SetorLedError(Exception):
    """Kegagalan satu IKU yang pesannya aman ditampilkan ke pengguna (masuk ke field `error`)."""


@dataclass(frozen=True)
class IkuInput:
    kode: str
    indikator: str
    target: str  # skor target 0-4 sebagai teks ("3"); divalidasi parse_iku_list

    @property
    def target_skor(self) -> int:
        return int(self.target)


def parse_iku_list(raw: object) -> list[IkuInput]:
    """Payload job -> daftar IKU. Backend sudah memvalidasi; ini pengaman terakhir karena worker
    mempercayai payload apa adanya. Raise ValueError (pesan Indonesia) bila tidak valid."""
    if not isinstance(raw, list) or not raw:
        raise ValueError("ikuList kosong -- kirim minimal satu IKU")

    hasil: list[IkuInput] = []
    terlihat: set[str] = set()
    for nomor, item in enumerate(raw, start=1):
        if not isinstance(item, dict):
            raise ValueError(f"IKU ke-{nomor} bukan objek")
        nilai = {k: str(item.get(k) or "").strip() for k in ("kode", "indikator", "target")}
        for kunci, isi in nilai.items():
            if not isi:
                raise ValueError(f"IKU ke-{nomor}: '{kunci}' wajib diisi")
        if not _TARGET_SKOR.fullmatch(nilai["target"]):
            raise ValueError(f"IKU ke-{nomor}: 'target' harus bilangan bulat {SKOR_MIN}-{SKOR_MAX}")
        if nilai["kode"] in terlihat:
            raise ValueError(f"Kode IKU duplikat: {nilai['kode']}")
        terlihat.add(nilai["kode"])
        hasil.append(IkuInput(**nilai))
    return hasil


_SUDAH_BERNOMOR = re.compile(r"^\s*\d+[.)]\s")


def _ke_teks(isi: object) -> str:
    """Bagian narasi -> string. Model kadang menjawab daftar (strategiPencapaian/sarprasDibutuhkan) sebagai
    array JSON padahal kontraknya satu string berpenomoran; array berisi string digabung menjadi
    "1) ... 2) ..." (butir yang sudah bernomor dibiarkan), bukan ditolak sebagai kosong. Tipe lain tidak dilonggarkan."""
    if isinstance(isi, str):
        return isi.strip()
    if isinstance(isi, list) and isi and all(isinstance(x, str) for x in isi):
        butir = [x.strip() for x in isi if x.strip()]
        return " ".join(x if _SUDAH_BERNOMOR.match(x) else f"{i}) {x}" for i, x in enumerate(butir, start=1))
    return ""


def _ambil_teks(sumber: dict, kunci: tuple[str, ...]) -> dict[str, str]:
    hasil: dict[str, str] = {}
    for k in kunci:
        isi = _ke_teks(sumber.get(k))
        if not isi:
            raise SetorLedError(f"Bagian '{k}' kosong dari model")
        hasil[k] = isi
    return hasil


def validasi_skor(nilai: object) -> float:
    """Skor dari model atau rumus -> float dalam [0, 4]. Raise SetorLedError untuk yang bukan angka atau di luar rentang
    (bool, NaN, list, string kosong ditolak, bukan dipaksa jadi angka)."""
    if isinstance(nilai, bool) or not isinstance(nilai, (int, float, str)):
        raise SetorLedError(f"Skor bukan angka: {nilai!r}")
    try:
        angka = float(nilai)
    except ValueError:
        raise SetorLedError(f"Skor bukan angka: {nilai!r}") from None
    if math.isnan(angka) or not SKOR_MIN <= angka <= SKOR_MAX:
        raise SetorLedError(f"Skor di luar rentang {SKOR_MIN}-{SKOR_MAX}: {nilai!r}")
    return angka


def validasi_narasi(data: object, dengan_tambahan: bool) -> tuple[dict[str, str], dict[str, str] | None]:
    """JSON narasi -> (narasi inti, tambahan atau None). `tambahan` wajib lengkap hanya bila `dengan_tambahan`, dan
    diabaikan bila tidak. Raise SetorLedError bila tidak valid."""
    if not isinstance(data, dict):
        raise SetorLedError("Model tidak mengembalikan JSON yang bisa dibaca")
    inti = _ambil_teks(data, NARASI_INTI)
    if not dengan_tambahan:
        return inti, None
    sumber = data.get("tambahan")
    if not isinstance(sumber, dict):
        raise SetorLedError(
            "Bagian tambahan (faktor pendukung/penghambat, akar masalah, tindak lanjut) wajib karena capaian di bawah target"
        )
    return inti, _ambil_teks(sumber, NARASI_TAMBAHAN)


def hasil_sukses(
    kode: str, score: float, inti: dict[str, str], tambahan: dict[str, str] | None
) -> dict:
    """Hasil satu IKU: skor rubrik + narasi. Capaian sengaja tidak ikut (ditampilkan sisi UI)."""
    hasil = {"kode": kode, "score": score, **inti}
    if tambahan:
        hasil["tambahan"] = tambahan
    return hasil


def hasil_gagal(kode: str, pesan: str) -> dict:
    return {"kode": kode, "error": pesan}
