"""Bentuk data proses "setor ke LED" (job SETOR_LED): input IKU, validasi keluaran LLM, dan
bentuk hasil per IKU yang dikembalikan sebagai return value job (Job.result).

Sengaja terpisah dari agent/ (AMI): Evaluasi di sini kategori tetap tiga nilai, bukan skor rubrik 0-4.
"""

from __future__ import annotations

from dataclasses import dataclass

EVALUASI: tuple[str, ...] = ("MELAMPAUI", "MEMENUHI", "BELUM_MEMENUHI")
BELUM_MEMENUHI = "BELUM_MEMENUHI"
NARASI_INTI: tuple[str, ...] = (
    "analisisKetercapaian",
    "usulanTargetTahunDepan",
    "strategiPencapaian",
    "sarprasDibutuhkan",
)
NARASI_TAMBAHAN: tuple[str, ...] = ("faktorPendukung", "faktorPenghambat", "akarMasalah", "tindakLanjut")


class SetorLedError(Exception):
    """Kegagalan satu IKU yang pesannya aman ditampilkan ke pengguna (masuk ke field `error`)."""


@dataclass(frozen=True)
class IkuInput:
    kode: str
    indikator: str
    target: str


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
        if nilai["kode"] in terlihat:
            raise ValueError(f"Kode IKU duplikat: {nilai['kode']}")
        terlihat.add(nilai["kode"])
        hasil.append(IkuInput(**nilai))
    return hasil


def _ambil_teks(sumber: dict, kunci: tuple[str, ...]) -> dict[str, str]:
    hasil: dict[str, str] = {}
    for k in kunci:
        isi = sumber.get(k)
        if not isinstance(isi, str) or not isi.strip():
            raise SetorLedError(f"Bagian '{k}' kosong dari model")
        hasil[k] = isi.strip()
    return hasil


def validasi_keluaran_llm(data: object) -> tuple[str, dict[str, str], dict[str, str] | None]:
    """JSON tahap 2 -> (evaluasi, narasi inti, tambahan atau None). Bagian tambahan wajib hanya bila
    BELUM_MEMENUHI dan diabaikan bila tidak. Raise SetorLedError bila tidak valid."""
    if not isinstance(data, dict):
        raise SetorLedError("Model tidak mengembalikan JSON yang bisa dibaca")

    evaluasi = data.get("evaluasi")
    if evaluasi not in EVALUASI:
        raise SetorLedError(f"Evaluasi di luar daftar yang diizinkan: {evaluasi!r}")

    inti = _ambil_teks(data, NARASI_INTI)
    tambahan = None
    if evaluasi == BELUM_MEMENUHI:
        sumber = data.get("tambahan")
        if not isinstance(sumber, dict):
            raise SetorLedError(
                "Bagian tambahan (faktor pendukung/penghambat, akar masalah, tindak lanjut) "
                "wajib untuk IKU yang belum memenuhi standar"
            )
        tambahan = _ambil_teks(sumber, NARASI_TAMBAHAN)
    return evaluasi, inti, tambahan


def hasil_sukses(
    kode: str, capaian: dict, evaluasi: str, inti: dict[str, str], tambahan: dict[str, str] | None
) -> dict:
    hasil = {
        "kode": kode,
        "capaian": {"nilai": capaian["nilai"], "sumber": capaian["sumber"]},
        "evaluasi": evaluasi,
        **inti,
    }
    if tambahan:
        hasil["tambahan"] = tambahan
    return hasil


def hasil_gagal(kode: str, pesan: str) -> dict:
    return {"kode": kode, "error": pesan}
