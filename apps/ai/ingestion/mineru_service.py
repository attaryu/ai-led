"""Klien untuk service `mineru` (apps/mineru/gateway.py) -- MinerU 4.x di container
sendiri, dialihkan antara GPU lokal dan API mineru.net lewat env MINERU_MODE di
sisi service (bukan di sini).

Dipakai oleh jalur bukti dukung (evidence_pipeline._process_pdf) dan rubrik
(matrix_mineru.parse_matrix_mineru). Keluarannya markdown MinerU 4.x lengkap
dengan penanda `<!-- page N of M -->`, sama dengan notebook.

Bila MINERU_SERVICE_URL kosong, pemanggil jatuh ke jalur lama (MinerU 3.4.5
in-process, evidence_mineru.mineru_extract_paged) -- lihat service_enabled().
"""
from __future__ import annotations

import os
from pathlib import Path

import httpx


def service_enabled() -> bool:
    return bool(os.environ.get("MINERU_SERVICE_URL", "").strip())


def parse_pdf(pdf_path: Path, start_page: int | None = None, mode: str | None = None, tier: str | None = None) -> str:
    """PDF -> markdown MinerU 4.x lewat service.

    start_page: halaman awal (1-based) -- sama dengan PAGE_START notebook rubrik;
    None = seluruh halaman (notebook evidence). mode/tier: override per
    permintaan (default dari environment service).
    """
    pdf_path = Path(pdf_path)
    url = os.environ["MINERU_SERVICE_URL"].rstrip("/") + "/parse"
    # Batas waktu keras di sisi klien: lebih panjang dari MINERU_WAIT_SEC service
    # (default 1800) supaya galat yang muncul datang dari service, bukan dari klien.
    timeout = float(os.environ.get("MINERU_TIMEOUT_SECONDS", "1800")) + 300

    data: dict = {}
    if start_page:
        data["start_page"] = str(start_page)
    if mode:
        data["mode"] = mode
    if tier:
        data["tier"] = tier

    try:
        with pdf_path.open("rb") as fh:
            resp = httpx.post(
                url, files={"file": (pdf_path.name, fh, "application/pdf")}, data=data, timeout=timeout
            )
    except httpx.HTTPError as exc:
        raise RuntimeError(
            f"Service MinerU tidak terjangkau ({url}): {exc}. "
            "Pastikan container `mineru` berjalan (docker compose up -d mineru)."
        ) from exc

    if resp.status_code != 200:
        try:
            detail = resp.json().get("detail", resp.text)
        except ValueError:
            detail = resp.text
        detail = str(detail)
        if "password" in detail.lower() or "Incorrect password" in detail:
            raise RuntimeError(
                f"{pdf_path.name} terkunci kata sandi -- hapus proteksi PDF-nya lalu unggah ulang."
            )
        raise RuntimeError(f"MinerU gagal untuk {pdf_path.name}: {detail[-800:]}")

    return resp.json()["markdown"]
