"""Confirm step for PANDUAN_LAM structure extraction (worker.py::
_handle_ingestion_struktur_dokumen parks its result in
guide_references.structure_staging instead of committing it directly).

Scoped to the Panduan (ReferenceGuide row, guideId) itself, not one
AccreditationSet -- a Panduan is reusable across many sets
(AccreditationSet.panduanId), so every set pointing at it sees the same
staged/committed structure.

GET  /structure/{guideId}/preview  -- staged (or, once confirmed, the real
    committed) bab/sub-bab/sub-sub-bab tree, for the "Pilih Struktur
    Pedoman" checklist modal.
POST /structure/{guideId}/confirm  -- commit only the checked node ids into
    ChapterTemplate/SubBabTemplate; the rest are discarded.

Runs synchronous (not an RQ job) -- pure DB read/filter/write, same
reasoning dimas gave for his equivalent endpoint (`57a55b0`,
api/routes/panduan.py). tenant_id is trusted from the caller like chat.py:
apps/ai has no auth of its own, NestJS's proxy route is the real
gatekeeper (see api/routes/chat.py's docstring)."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from db.postgres_client import (
    confirm_structure_staging,
    get_accreditation_set_tenant,
    get_reference_guide_tenant,
    get_structure_preview,
)
from ingestion.section_criterion_linker import relink_for_set

router = APIRouter(prefix="/structure", tags=["structure"])


class StructureNode(BaseModel):
    id: str
    parent_id: str | None
    level: int
    order: int
    title: str
    marker: str | None = None
    guidance: str | None = None
    lkps_needed: bool = False
    lkps_list: list[str] = []
    # gap #2: cuma berarti utk node yang SUDAH commit -- node staging (belum
    # punya baris SubBabTemplate sungguhan) selalu True, lihat postgres_client.py.
    is_active: bool = True


class StructurePreviewResponse(BaseModel):
    status: str
    nodes: list[StructureNode]


@router.get("/{guide_id}/preview", response_model=StructurePreviewResponse)
async def preview_structure(guide_id: str):
    tenant_id = get_reference_guide_tenant(guide_id)
    if tenant_id is None:
        raise HTTPException(404, "Panduan tidak ditemukan")

    result = get_structure_preview(tenant_id, guide_id)
    if result is None:
        raise HTTPException(404, "Panduan tidak ditemukan")
    return result


class ConfirmStructureRequest(BaseModel):
    accepted_ids: list[str]


@router.post("/{guide_id}/confirm")
async def confirm_structure(guide_id: str, body: ConfirmStructureRequest):
    tenant_id = get_reference_guide_tenant(guide_id)
    if tenant_id is None:
        raise HTTPException(404, "Panduan tidak ditemukan")

    try:
        count = confirm_structure_staging(tenant_id, guide_id, set(body.accepted_ids))
    except ValueError as e:
        raise HTTPException(409, str(e))

    return {"guideId": guide_id, "count": count}


@router.post("/sets/{set_id}/relink")
async def relink_set(set_id: str):
    """Hitung ulang jangkar section<->kriteria satu set -- dipanggil NestJS saat Panduan set diganti
    (tidak ada ekstraksi/konfirmasi baru yang memicunya). `links` null = prasyarat belum lengkap
    (rubrik/struktur belum SIAP); itu bukan galat, penautan jalan sendiri saat yang lain selesai."""
    tenant_id = get_accreditation_set_tenant(set_id)
    if tenant_id is None:
        raise HTTPException(404, "Instrumen akreditasi tidak ditemukan")
    return {"setId": set_id, "links": relink_for_set(tenant_id, set_id)}
