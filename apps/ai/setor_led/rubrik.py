"""Rubrik indikator untuk setor ke LED: pemuatan lewat `criterion_code` dan penentuan skor 0-4.

Hanya MEMBACA data rubrik (tabel rubric_criteria/rubric_levels); graph dan tool AMI tidak diubah.
"""

from __future__ import annotations

import ast
import json
import re
from dataclasses import dataclass

from agent.tools.formula_tool import compute_formula_score
from db.postgres_client import get_rubric_criteria_by_code
from ingestion.matrix_parser import skor_minimum_dari_level
from setor_led.schema import SetorLedError


@dataclass(frozen=True)
class RubrikIndikator:
    kode: str
    deskripsi: str
    score_type: str  # "KUALITATIF" | "KUANTITATIF" | "KOMPOSIT" (literal enum Postgres)
    levels: dict[int, str]  # skor 0-4 -> deskripsi level
    formula: str | None
    sub_score_formula: str | None

    @property
    def skor_minimum(self) -> float:
        """Batas bawah dari teks level ("Tidak ada skor kurang dari 2"); 0 bila tidak ada. Pembacaannya dipakai bersama
        AMI (ingestion.matrix_parser.skor_minimum_dari_level)."""
        return skor_minimum_dari_level(self.levels)


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


# Rumus bersih: aritmetika sederhana yang bisa langsung dievaluasi kode. Rumus rubrik lain berupa prosa (definisi
# beberapa variabel turunan + aturan bersyarat); untuk itu model yang menuliskan ekspresinya.
_KALI = re.compile(r"\s[xX]\s")
# "AxB" tanpa spasi berarti A kali B di rubrik nyata, tetapi bagi kode itu satu nama variabel: jangan dianggap bersih.
_KALI_RAPAT = re.compile(r"(?<=[A-Z0-9)])x(?=[A-Z0-9(])")
# Titik di antara digit dan tepat tiga digit lagi = pemisah ribuan ("5.000.000"); rubrik memakai koma untuk desimal.
_RIBUAN = re.compile(r"(?<=\d)\.(?=\d{3}(?!\d))")
_DESIMAL_KOMA = re.compile(r"(?<=\d),(?=\d)")
_KARAKTER_BOLEH = re.compile(r"[\sA-Za-z0-9_+\-*/().]+")
_ADA_HURUF = re.compile(r"[A-Za-z]")
NAMA_VARIABEL = re.compile(r"[A-Za-z][A-Za-z0-9_]*")  # tanpa garis bawah di depan: tidak ada nama dunder
MAKS_PANJANG_RUMUS = 80
_OPERATOR_BOLEH = (ast.Add, ast.Sub, ast.Mult, ast.Div)


def ekspresi_bersih(formula: str | None) -> str | None:
    """Ekspresi aritmetika Python dari `formula` bila rumusnya aritmetika sederhana; None untuk prosa, angka
    saja ("4"), kosong, atau yang tidak lolos `variabel_ekspresi`."""
    if not formula or not formula.strip():
        return None
    teks = _KALI.sub(" * ", formula.strip())
    teks = _DESIMAL_KOMA.sub(".", _RIBUAN.sub("", teks))
    if _KALI_RAPAT.search(teks):
        return None
    teks = teks.rstrip(" .")  # titik penutup kalimat ("2 + (0,2 x NLP) .") membuat eval SyntaxError
    if len(teks) >= MAKS_PANJANG_RUMUS or not _KARAKTER_BOLEH.fullmatch(teks) or not _ADA_HURUF.search(teks):
        return None
    try:
        variabel_ekspresi(teks)
    except SetorLedError:
        return None
    return teks


def variabel_ekspresi(ekspresi: str) -> list[str]:
    """Nama variabel unik dalam ekspresi, urut kemunculan. Ekspresi hanya boleh berisi angka, nama variabel biasa,
    `+ - * /`, minus unary, dan tanda kurung (tanpa pangkat, atribut, pemanggilan, perbandingan, atau kondisi): itu
    satu-satunya yang boleh sampai ke eval di compute_formula_score. Selain itu SetorLedError."""
    try:
        pohon = ast.parse(ekspresi.strip(), mode="eval")
    except SyntaxError as exc:
        raise SetorLedError(f"Ekspresi skor tidak valid: {exc.msg}") from None
    nama: list[tuple[int, str]] = []
    for node in ast.walk(pohon):
        if isinstance(node, (ast.Expression, ast.BinOp, ast.Load, ast.USub, ast.UAdd, *_OPERATOR_BOLEH)):
            continue
        if isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.USub, ast.UAdd)):
            continue
        if isinstance(node, ast.Constant) and type(node.value) in (int, float):
            continue
        if isinstance(node, ast.Name) and NAMA_VARIABEL.fullmatch(node.id):
            nama.append((node.col_offset, node.id))
            continue
        raise SetorLedError(f"Ekspresi skor hanya boleh berisi angka, variabel, + - * / dan kurung: {ekspresi.strip()!r}")
    return list(dict.fromkeys(n for _, n in sorted(nama)))


def mode_penilaian(rubrik: RubrikIndikator) -> str:
    """"rumus_bersih" | "rumus_prosa" | "level". Raise SetorLedError bila indikator tidak bisa dinilai: skor tidak
    ditebak dari rubrik yang tidak punya dasar."""
    if ekspresi_bersih(rubrik.formula):
        return "rumus_bersih"
    if rubrik.formula and _ADA_HURUF.search(rubrik.formula):
        return "rumus_prosa"
    if any(teks.strip() for teks in rubrik.levels.values()):
        return "level"
    if rubrik.sub_score_formula:
        raise SetorLedError(f"Indikator '{rubrik.kode}' komposit tanpa level sendiri -- pilih sub-indikatornya")
    raise SetorLedError(f"Rubrik '{rubrik.kode}' tidak punya level 0-4")


def hitung_skor_rumus(ekspresi: str, variabel: dict[str, float]) -> float:
    """Skor dari `compute_formula_score` (hasil di-clamp 0-4, dibulatkan 2 digit)."""
    hasil = json.loads(compute_formula_score.invoke({"formula_expression": ekspresi, "variables": variabel}))
    if "error" in hasil:
        raise SetorLedError(f"Rumus gagal dihitung: {hasil['error']}")
    return float(hasil["clamped_score"])
