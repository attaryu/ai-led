"""Rubrik indikator untuk setor ke LED: pemuatan lewat `criterion_code` dan penentuan skor 0-4.

Hanya MEMBACA data rubrik (tabel rubric_criteria/rubric_levels); graph dan tool AMI tidak diubah.
"""

from __future__ import annotations

from dataclasses import dataclass

from db.postgres_client import get_rubric_criteria_by_code
from setor_led.schema import SetorLedError


@dataclass(frozen=True)
class RubrikIndikator:
    kode: str
    deskripsi: str
    score_type: str  # "KUALITATIF" | "KUANTITATIF" | "KOMPOSIT" (literal enum Postgres)
    levels: dict[int, str]  # skor 0-4 -> deskripsi level
    formula: str | None
    sub_score_formula: str | None


def muat_rubrik(tenant_id: str, accreditation_set_id: str, kode: str) -> RubrikIndikator:
    """Rubrik indikator `kode` di Instrumen Akreditasi dokumen. Nol baris atau lebih dari satu -> SetorLedError:
    skor tidak boleh ditebak dari rubrik yang salah."""
    baris = get_rubric_criteria_by_code(tenant_id, accreditation_set_id, kode)
    if not baris:
        raise SetorLedError(f"Rubrik untuk kode '{kode}' tidak ditemukan di Instrumen Akreditasi dokumen")
    if len(baris) > 1:
        raise SetorLedError(f"Kode '{kode}' ambigu di rubrik ({len(baris)} baris)")
    b = baris[0]
    return RubrikIndikator(
        kode=b["criterion_code"],
        deskripsi=b["description"],
        score_type=b["score_type"],
        levels=dict(b["levels"]),
        formula=b["formula"],
        sub_score_formula=b["sub_score_formula"],
    )
