"""Endpoint outline + draft per section, discope ke 1 dokumen_led eksplisit
dari path URL (/led-documents/{dokumen_id}/sections/...) -- 1 prodi bisa
punya banyak dokumen LED sekaligus, lihat lib/context.py & routes/led_documents.py.
Response shape dipertahankan sama seperti versi single-dokumen lama supaya
frontend tidak perlu berubah selain menambahkan dokumen_id di path."""
import json
import os
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from redis import Redis
from rq import Queue

from lib.auth import require_led_access
from lib.db import conn
from lib.context import get_dokumen_led, get_urutan_bab, get_system_user_id
from lib.outline import get_sections, get_section
from lib.generator import generate_section, recommend_documents, SectionNotGeneratableError
from lib.prose import doc_to_text, EMPTY_DOC

router = APIRouter(prefix="/led-documents/{dokumen_id}/sections", tags=["sections"])


def _require_dokumen(dokumen_id: str) -> dict:
    doc = get_dokumen_led(dokumen_id)
    if not doc:
        raise HTTPException(404, "Dokumen LED tidak ditemukan")
    return doc

REDIS_URL = os.environ.get("REDIS_URL", "redis://redis:6379")
_redis = Redis.from_url(REDIS_URL)
_queue = Queue("documents", connection=_redis)


class GenerateRequest(BaseModel):
    model: str
    overwrite: bool = False
    selected_bukti_dukung_ids: List[str] = []
    # Kalau diisi, TIMPA versi bab_draft ini langsung (bukan bikin versi
    # baru) -- dipakai "Regenerate" dari tab Dokumen Pendukung yg menimpa
    # versi yg sedang dibuka user (lihat generator.py::generate_section).
    draft_id: Optional[str] = None


class RecommendRequest(BaseModel):
    model: str
    # Kalau diisi, reuse draft KOSONG ini (jgn bikin bab_draft baru) --
    # dipakai tombol "Rekomendasikan Ulang" pada draft yg SUDAH kosong,
    # supaya tidak menumpuk draft kosong tiap kali user retry.
    draft_id: Optional[str] = None


class CreateEmptyDraftRequest(BaseModel):
    model: str


class ConfirmSelectionRequest(BaseModel):
    recommendation_id: str
    bukti_dukung_ids: List[str] = []
    folder_paths: List[str] = []


class UpdateDraftRequest(BaseModel):
    draft_text: Dict[str, Any]   # ProseMirror doc JSON, mis. {"type": "doc", "content": [...]}
    model: str


class ApproveRequest(BaseModel):
    model: str


def _draft_len(konten_kerja: dict) -> int:
    return len(doc_to_text((konten_kerja or {}).get("draft_text")))


@router.get("")
def list_sections(dokumen_id: str, model: Optional[str] = None, _user=Depends(require_led_access)):
    """List outline + status (per model jika diberikan)."""
    _require_dokumen(dokumen_id)
    sections = get_sections()
    with conn() as con:
        if model:
            rows = con.execute(
                """SELECT urutan_bab, model, status, konten_kerja
                   FROM bab_dokumen WHERE dokumen_id=%s AND model=%s""",
                (dokumen_id, model)).fetchall()
        else:
            rows = con.execute(
                """SELECT urutan_bab, model, status, konten_kerja
                   FROM bab_dokumen WHERE dokumen_id=%s""",
                (dokumen_id,)).fetchall()

    urutan_to_id = {i + 1: s["id"] for i, s in enumerate(sections)}
    by_id = {}
    for r in rows:
        sid = urutan_to_id.get(r["urutan_bab"])
        if sid is None:
            continue
        by_id.setdefault(sid, []).append({
            "section_id": sid,
            "model":      r["model"],
            "status":     r["status"],
            "draft_len":  _draft_len(r["konten_kerja"]),
        })

    out = []
    for s in sections:
        out.append({
            "id":         s["id"],
            "title":      s["title"],
            "full_title": s.get("full_title", s["title"]),
            "marker":     s.get("marker", ""),
            "level":      s.get("level", ""),
            "depth":      s.get("depth", 0),
            "page":       s.get("page", 0),
            "parent_id":  s.get("parent_id"),
            "breadcrumb": s.get("breadcrumb", []),
            "drafts":     by_id.get(s["id"], []),
        })
    return out


@router.get("/{section_id}")
def get_section_detail(dokumen_id: str, section_id: str, model: Optional[str] = None,
                       _user=Depends(require_led_access)):
    """Detail 1 section (semua model atau filter model)."""
    _require_dokumen(dokumen_id)
    section = get_section(section_id)
    if not section:
        raise HTTPException(404, f"Section {section_id} not found")
    urutan_bab = get_urutan_bab(section_id)
    with conn() as con:
        if model:
            rows = con.execute(
                """SELECT * FROM bab_dokumen
                   WHERE dokumen_id=%s AND urutan_bab=%s AND model=%s""",
                (dokumen_id, urutan_bab, model)).fetchall()
        else:
            rows = con.execute(
                """SELECT * FROM bab_dokumen
                   WHERE dokumen_id=%s AND urutan_bab=%s""",
                (dokumen_id, urutan_bab)).fetchall()

    drafts = []
    for r in rows:
        kk = r["konten_kerja"] or {}
        drafts.append({
            "id":             r["id"],
            "section_id":     section_id,
            "section_title":  r["judul_bab"],
            "model":          r["model"],
            "draft_text":     kk.get("draft_text") or EMPTY_DOC,
            "pedoman_used":   kk.get("pedoman_used"),
            "rubric_used":    kk.get("rubric_used"),
            "checklist":      kk.get("checklist"),
            "chunks_used":    kk.get("chunks_used"),
            "judge_result":   kk.get("judge_result"),
            "prompt_full":    kk.get("prompt_full"),
            "latency_sec":    kk.get("latency_sec"),
            "token_count":    kk.get("token_count"),
            "status":         r["status"],
            "updated_at":     r["terakhir_disimpan"],
        })
    return {"id": section["id"], "title": section["title"], "drafts": drafts}


@router.get("/{section_id}/draft-versions")
def list_draft_versions(dokumen_id: str, section_id: str, model: str,
                        _user=Depends(require_led_access)):
    """Daftar histori versi draft (bab_draft) utk 1 section+model -- RINGKAS
    saja (tanpa draft_text penuh), dipakai tampilan card 'Draft 1'/'Draft 2'
    dst di panel tengah. Urut versi terbaru dulu."""
    _require_dokumen(dokumen_id)
    urutan_bab = get_urutan_bab(section_id)
    if urutan_bab is None:
        raise HTTPException(404, f"Section {section_id} not found")
    with conn() as con:
        bab_row = con.execute(
            """SELECT id, checkpoint_aktif_id, status FROM bab_dokumen
               WHERE dokumen_id=%s AND urutan_bab=%s AND model=%s""",
            (dokumen_id, urutan_bab, model),
        ).fetchone()
        if not bab_row:
            return {"drafts": [], "active_draft_id": None}
        rows = con.execute(
            """SELECT id, versi, sumber, dibuat_pada,
                      konten_snapshot->'draft_text' AS draft_text
               FROM bab_draft WHERE bab_id = %s ORDER BY versi DESC""",
            (bab_row["id"],),
        ).fetchall()
    return {
        "bab_id": bab_row["id"],
        "status": bab_row["status"],
        "active_draft_id": bab_row["checkpoint_aktif_id"],
        "drafts": [{
            "id":          r["id"],
            "versi":       r["versi"],
            "sumber":      r["sumber"],
            "dibuat_pada": r["dibuat_pada"],
            "preview":     doc_to_text(r["draft_text"])[:160],
            "is_active":   r["id"] == bab_row["checkpoint_aktif_id"],
        } for r in rows],
    }


@router.get("/{section_id}/draft-versions/{draft_id}")
def get_draft_version(dokumen_id: str, section_id: str, draft_id: str,
                      _user=Depends(require_led_access)):
    """Isi lengkap 1 versi draft (bab_draft.konten_snapshot) -- dipakai mode
    baca setelah user klik salah satu card versi."""
    _require_dokumen(dokumen_id)
    with conn() as con:
        row = con.execute(
            """SELECT bd.id, bd.versi, bd.sumber, bd.dibuat_pada, bd.konten_snapshot,
                      bd.status AS draft_status,
                      bab.checkpoint_aktif_id, bab.status AS bab_status
               FROM bab_draft bd
               JOIN bab_dokumen bab ON bab.id = bd.bab_id
               WHERE bd.id = %s AND bab.dokumen_id = %s""",
            (draft_id, dokumen_id),
        ).fetchone()
    if not row:
        raise HTTPException(404, "Draft version tidak ditemukan")
    kk = row["konten_snapshot"] or {}
    return {
        "id":             row["id"],
        "versi":          row["versi"],
        "sumber":         row["sumber"],
        "dibuat_pada":    row["dibuat_pada"],
        "is_active":      row["id"] == row["checkpoint_aktif_id"],
        # status draft ITU SENDIRI ('EMPTY'/'FILLED') -- dipakai frontend
        # (DocumentPane.jsx) memutuskan tampilkan narasi vs pesan draft
        # kosong. bab_status ('draft'/'approved', status SECTION/checkpoint
        # aktif) dikirim terpisah, JANGAN ditimpa jadi satu field "status"
        # (sempat jadi bug: frontend cek status==='FILLED' tapi backend
        # kirim bab_status='approved', jadi narasi tidak pernah tertampil
        # walau draft_text sudah terisi).
        "status":         row["draft_status"],
        "bab_status":     row["bab_status"],
        "draft_text":     kk.get("draft_text") or EMPTY_DOC,
        "pedoman_used":   kk.get("pedoman_used"),
        "rubric_used":    kk.get("rubric_used"),
        "checklist":      kk.get("checklist"),
        "chunks_used":    kk.get("chunks_used"),
        "judge_result":   kk.get("judge_result"),
        "latency_sec":    kk.get("latency_sec"),
    }


@router.post("/{section_id}/draft-versions/empty")
def create_empty_draft(dokumen_id: str, section_id: str, req: CreateEmptyDraftRequest,
                       _user=Depends(require_led_access)):
    """'Buat Draft Baru (Kosong)': user manual bikin versi baru TANPA isi
    (tanpa lewat alur rekomendasi) -- sumber='MANUAL', status='EMPTY'. Jadi
    checkpoint aktif baru (konsisten dgn semantik 'draft baru selalu aktif'
    di seluruh alur ini, lihat generator.py::_save_recommendation/_save_to_db)."""
    _require_dokumen(dokumen_id)
    urutan_bab = get_urutan_bab(section_id)
    if urutan_bab is None:
        raise HTTPException(404, f"Section {section_id} not found")
    section = get_section(section_id)
    with conn() as con:
        bab_row = con.execute(
            """INSERT INTO bab_dokumen (dokumen_id, urutan_bab, judul_bab, model, status, konten_kerja, terakhir_disimpan)
               VALUES (%s, %s, %s, %s, 'draft', '{}'::jsonb, now())
               ON CONFLICT (dokumen_id, urutan_bab, model) DO UPDATE SET
                   terakhir_disimpan = bab_dokumen.terakhir_disimpan
               RETURNING id""",
            (dokumen_id, urutan_bab, section["title"], req.model),
        ).fetchone()
        bab_id = bab_row["id"]
        versi_row = con.execute(
            "SELECT COALESCE(MAX(versi), 0) + 1 AS next_versi FROM bab_draft WHERE bab_id = %s",
            (bab_id,),
        ).fetchone()
        versi = versi_row["next_versi"]
        draft_row = con.execute(
            """INSERT INTO bab_draft
                   (bab_id, dibuat_oleh_user_id, model, versi, konten_snapshot, sumber, status, dibuat_pada)
               VALUES (%s, %s, %s, %s, '{}'::jsonb, 'MANUAL', 'EMPTY', now())
               RETURNING id""",
            (bab_id, get_system_user_id(), req.model, versi),
        ).fetchone()
        con.execute("UPDATE bab_dokumen SET checkpoint_aktif_id = %s WHERE id = %s", (draft_row["id"], bab_id))
    return {"status": "ok", "id": draft_row["id"], "versi": versi}


@router.post("/{section_id}/draft-versions/{draft_id}/duplicate")
def duplicate_draft_version(dokumen_id: str, section_id: str, draft_id: str,
                            _user=Depends(require_led_access)):
    """'Simpan Sebagai Draft': salin SEMUA data terkait 1 versi -- konten_snapshot
    + bab_referensi_chunk (BAB_DRAFT) + bukti_dukung_draft + rekomendasi
    (bab_document_recommendation + bab_recommendation_item, disalin sbg
    record BARU berstatus 'recommended' -- BUKAN ikut 'confirmed', supaya
    draft baru ini tidak langsung dianggap siap-generate tanpa review, dan
    tidak bentrok uq_bab_doc_rec_confirmed_per_draft) -- jadi versi BARU
    (versi=max+1, sumber='MANUAL', status = status draft sumber: duplikat
    draft kosong tetap kosong, duplikat draft terisi tetap terisi). TIDAK
    otomatis jadi draft aktif. 1 subbab boleh punya banyak draft independen.

    `bukti_dukung_bab` (evidence draft AKTIF section, bukan per-draft)
    SENGAJA tidak disalin -- draft baru (belum tentu aktif) tidak boleh
    "membajak" evidence link draft aktif yg lain (sama spt guard
    is_active_target di generator.py::_save_to_db)."""
    _require_dokumen(dokumen_id)
    with conn() as con:
        src = con.execute(
            """SELECT bd.bab_id, bd.konten_snapshot, bd.status, bd.model
               FROM bab_draft bd JOIN bab_dokumen bab ON bab.id = bd.bab_id
               WHERE bd.id = %s AND bab.dokumen_id = %s""",
            (draft_id, dokumen_id),
        ).fetchone()
        if not src:
            raise HTTPException(404, "Draft version tidak ditemukan")

        versi_row = con.execute(
            "SELECT COALESCE(MAX(versi), 0) + 1 AS next_versi FROM bab_draft WHERE bab_id = %s",
            (src["bab_id"],),
        ).fetchone()
        new_versi = versi_row["next_versi"]
        new_draft = con.execute(
            """INSERT INTO bab_draft
                   (bab_id, dibuat_oleh_user_id, model, versi, konten_snapshot, sumber, status, dibuat_pada)
               VALUES (%s, %s, %s, %s, %s, 'MANUAL', %s, now())
               RETURNING id""",
            (src["bab_id"], get_system_user_id(), src["model"], new_versi,
             json.dumps(src["konten_snapshot"], ensure_ascii=False), src["status"]),
        ).fetchone()
        new_draft_id = new_draft["id"]

        # --- bab_referensi_chunk (BAB_DRAFT rows saja -- BAB_AKTIF milik
        # draft AKTIF section ini, tidak relevan disalin ke draft baru).
        ref_rows = con.execute(
            """SELECT target_tipe, tipe_sumber, chunk_id, urutan, distance
               FROM bab_referensi_chunk WHERE bab_draft_id = %s""",
            (draft_id,),
        ).fetchall()
        if ref_rows:
            with con.cursor() as cur:
                cur.executemany(
                    """INSERT INTO bab_referensi_chunk
                           (bab_id, bab_draft_id, target_tipe, tipe_sumber, chunk_id, urutan, distance)
                       VALUES (NULL, %s, %s, %s, %s, %s, %s)""",
                    [(new_draft_id, r["target_tipe"], r["tipe_sumber"], r["chunk_id"], r["urutan"], r["distance"])
                     for r in ref_rows],
                )

        # --- bukti_dukung_draft (dokumen evidence yg terkait ke draft ini).
        bd_rows = con.execute(
            "SELECT bukti_dukung_id FROM bukti_dukung_draft WHERE bab_draft_id = %s",
            (draft_id,),
        ).fetchall()
        if bd_rows:
            with con.cursor() as cur:
                cur.executemany(
                    """INSERT INTO bukti_dukung_draft (bukti_dukung_id, bab_draft_id)
                       VALUES (%s, %s) ON CONFLICT DO NOTHING""",
                    [(r["bukti_dukung_id"], new_draft_id) for r in bd_rows],
                )

        # --- bab_document_recommendation + bab_recommendation_item (kalau
        # draft sumber punya rekomendasi terikat, salin sbg record BARU).
        rec_row = con.execute(
            """SELECT * FROM bab_document_recommendation
               WHERE bab_draft_id = %s ORDER BY dibuat_pada DESC LIMIT 1""",
            (draft_id,),
        ).fetchone()
        if rec_row:
            urutan_bab = get_urutan_bab(section_id)
            new_rec = con.execute(
                """INSERT INTO bab_document_recommendation
                       (dokumen_id, urutan_bab, model, bab_draft_id, document_query, lkps_needed,
                        lkps_sufficient, lkps_evidence_query, candidate_folders,
                        recommendation_text, selected_folder_paths, selected_bukti_dukung_ids,
                        pedoman_used, rubric_used, lkps_used, status)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'recommended')
                   RETURNING id""",
                (dokumen_id, urutan_bab, src["model"], new_draft_id,
                 json.dumps(rec_row["document_query"], ensure_ascii=False), rec_row["lkps_needed"],
                 rec_row["lkps_sufficient"],
                 json.dumps(rec_row["lkps_evidence_query"], ensure_ascii=False) if rec_row["lkps_evidence_query"] is not None else None,
                 json.dumps(rec_row["candidate_folders"], ensure_ascii=False),
                 rec_row["recommendation_text"],
                 json.dumps(rec_row["selected_folder_paths"], ensure_ascii=False),
                 json.dumps(rec_row["selected_bukti_dukung_ids"], ensure_ascii=False),
                 json.dumps(rec_row["pedoman_used"], ensure_ascii=False),
                 json.dumps(rec_row["rubric_used"], ensure_ascii=False),
                 json.dumps(rec_row["lkps_used"], ensure_ascii=False)),
            ).fetchone()
            items = con.execute(
                """SELECT label, reason, urutan FROM bab_recommendation_item
                   WHERE recommendation_id = %s ORDER BY urutan""",
                (rec_row["id"],),
            ).fetchall()
            if items:
                with con.cursor() as cur:
                    cur.executemany(
                        """INSERT INTO bab_recommendation_item (recommendation_id, label, reason, urutan)
                           VALUES (%s, %s, %s, %s)""",
                        [(new_rec["id"], it["label"], it["reason"], it["urutan"]) for it in items],
                    )

    return {"status": "ok", "id": new_draft_id, "versi": new_versi}


@router.post("/{section_id}/draft-versions/{draft_id}/activate")
def activate_draft_version(dokumen_id: str, section_id: str, draft_id: str,
                           _user=Depends(require_led_access)):
    """'Jadikan Draft Aktif': set checkpoint_aktif_id + salin konten_snapshot
    versi ini ke bab_dokumen.konten_kerja (supaya draft aktif konsisten
    dgn versi terpilih di semua endpoint yg baca bab_dokumen langsung,
    mis. get_section_detail/generate/approve)."""
    _require_dokumen(dokumen_id)
    with conn() as con:
        row = con.execute(
            """SELECT bd.bab_id, bd.konten_snapshot
               FROM bab_draft bd JOIN bab_dokumen bab ON bab.id = bd.bab_id
               WHERE bd.id = %s AND bab.dokumen_id = %s""",
            (draft_id, dokumen_id),
        ).fetchone()
        if not row:
            raise HTTPException(404, "Draft version tidak ditemukan")
        con.execute(
            """UPDATE bab_dokumen SET checkpoint_aktif_id = %s, konten_kerja = %s,
                      terakhir_disimpan = now()
               WHERE id = %s""",
            (draft_id, json.dumps(row["konten_snapshot"], ensure_ascii=False), row["bab_id"]),
        )
    return {"status": "ok"}


@router.delete("/{section_id}/draft-versions/{draft_id}")
def delete_draft_version(dokumen_id: str, section_id: str, draft_id: str,
                         _user=Depends(require_led_access)):
    """Hapus 1 versi draft. Kalau SETELAH hapus masih ada versi lain tersisa
    UNTUK bab_id ini (baik yg dihapus tadi draft aktif ATAUPUN bukan --
    checkpoint_aktif_id bisa saja sudah NULL/stale dari operasi sebelumnya,
    jangan cuma andalkan flag was_active), versi TERBARU tersisa otomatis
    jadi aktif baru. Kalau TIDAK ADA versi tersisa sama sekali, baris
    bab_dokumen itu sendiri DIHAPUS (bukan cuma di-reset konten_kerja='{}')
    -- section harus kembali PERSIS ke kondisi 'belum pernah punya draft'
    (spt sblm generate pertama). Menyisakan baris kosong ternyata bikin
    GET section_detail tetap mengembalikan objek draft (draft_text='' tapi
    truthy), sehingga frontend salah kira section 'punya draft'. FK terkait
    (bab_chat_message, bukti_dukung_bab, bab_document_recommendation MILIK
    draft ini, dst) semua ON DELETE CASCADE -- hapus draft otomatis
    membersihkan rekomendasi dokumennya juga, user bisa minta rekomendasi
    baru dari draft baru tanpa mempengaruhi draft lain di section yang sama."""
    _require_dokumen(dokumen_id)
    with conn() as con:
        row = con.execute(
            """SELECT bd.bab_id
               FROM bab_draft bd JOIN bab_dokumen bab ON bab.id = bd.bab_id
               WHERE bd.id = %s AND bab.dokumen_id = %s""",
            (draft_id, dokumen_id),
        ).fetchone()
        if not row:
            raise HTTPException(404, "Draft version tidak ditemukan")
        bab_id = row["bab_id"]

        con.execute("DELETE FROM bab_draft WHERE id = %s", (draft_id,))

        next_row = con.execute(
            """SELECT id, konten_snapshot FROM bab_draft
               WHERE bab_id = %s ORDER BY versi DESC LIMIT 1""",
            (bab_id,),
        ).fetchone()

        new_active_id = None
        if next_row:
            new_active_id = next_row["id"]
            con.execute(
                """UPDATE bab_dokumen SET checkpoint_aktif_id = %s, konten_kerja = %s,
                          terakhir_disimpan = now()
                   WHERE id = %s""",
                (new_active_id, json.dumps(next_row["konten_snapshot"], ensure_ascii=False), bab_id),
            )
        else:
            con.execute(
                "DELETE FROM bab_dokumen WHERE id = %s",
                (bab_id,),
            )
    return {"status": "ok", "new_active_id": new_active_id}


@router.get("/{section_id}/recommendation")
def get_recommendation(dokumen_id: str, section_id: str, draft_id: Optional[str] = None,
                       model: Optional[str] = None, _user=Depends(require_led_access)):
    """Ambil rekomendasi milik draft_id (draft yg sedang dibuka di panel
    tengah) -- rekomendasi sekarang MILIK draft, bukan section, krn 1
    section boleh punya banyak draft dgn rekomendasi masing2 independen.
    Kalau draft_id tidak diberikan (mis. caller lama), fallback ke draft
    AKTIF section ini via model."""
    _require_dokumen(dokumen_id)
    urutan_bab = get_urutan_bab(section_id)
    if urutan_bab is None:
        raise HTTPException(404, f"Section {section_id} not found")
    with conn() as con:
        target_draft_id = draft_id
        if not target_draft_id and model:
            bab_row = con.execute(
                """SELECT checkpoint_aktif_id FROM bab_dokumen
                   WHERE dokumen_id=%s AND urutan_bab=%s AND model=%s""",
                (dokumen_id, urutan_bab, model)).fetchone()
            target_draft_id = bab_row["checkpoint_aktif_id"] if bab_row else None
        if not target_draft_id:
            raise HTTPException(404, "Belum ada draft untuk section ini")

        # Validasi target_draft_id BENAR2 milik (dokumen_id, section_id) ini --
        # draft_id datang dari client (query param), kalau client kirim
        # draft_id section/dokumen LAIN (mis. race kondisi pindah section di
        # frontend, closure lama sempat fetch sebelum state ter-update),
        # TANPA validasi ini query di bawah tetap ketemu & mengembalikan
        # rekomendasi milik draft/section yg SALAH (bug: rekomendasi section
        # sebelumnya "nyangkut" tampil di section baru).
        owner_row = con.execute(
            """SELECT bab.id FROM bab_draft bd JOIN bab_dokumen bab ON bab.id = bd.bab_id
               WHERE bd.id = %s AND bab.dokumen_id = %s AND bab.urutan_bab = %s""",
            (target_draft_id, dokumen_id, urutan_bab),
        ).fetchone()
        if not owner_row:
            raise HTTPException(404, "Draft tidak ditemukan untuk section ini")

        row = con.execute(
            """SELECT * FROM bab_document_recommendation
               WHERE bab_draft_id = %s AND status IN ('recommended', 'confirmed')
               ORDER BY dibuat_pada DESC LIMIT 1""",
            (target_draft_id,),
        ).fetchone()
        if not row:
            raise HTTPException(404, "Belum ada rekomendasi untuk draft ini")
        items = con.execute(
            """SELECT label, reason FROM bab_recommendation_item
               WHERE recommendation_id = %s ORDER BY urutan""",
            (row["id"],),
        ).fetchall()
    return {
        "recommendation_id":    row["id"],
        "bab_draft_id":         row["bab_draft_id"],
        "section_id":           section_id,
        "section_title":        get_section(section_id)["title"],
        "model":                row["model"],
        "document_query":       row["document_query"],
        "lkps_needed":          row["lkps_needed"],
        "pedoman_used":         row["pedoman_used"],
        "rubric_used":          row["rubric_used"],
        "lkps_used":            row["lkps_used"],
        "lkps_sufficient":      row["lkps_sufficient"],
        "lkps_evidence_query":  row["lkps_evidence_query"],
        "candidate_folders":    row["candidate_folders"],
        "recommendation_text":  row["recommendation_text"],
        "recommendation_items": [dict(it) for it in items],
        "selected_bukti_dukung_ids": row["selected_bukti_dukung_ids"],
        "status":               row["status"],
    }


@router.post("/{section_id}/recommend")
def recommend(dokumen_id: str, section_id: str, req: RecommendRequest,
              _user=Depends(require_led_access)):
    """Tahap 1 alur Document Recommendation: RAG Pedoman+Rubrik (+LKPS
    kondisional) -> query generation -> cari kandidat folder di
    Document Registry -> rekomendasi human-readable. Lihat lib/generator.py
    recommend_chain & database.md #9c."""
    _require_dokumen(dokumen_id)
    import traceback
    try:
        result = recommend_documents(dokumen_id, section_id, req.model, reuse_draft_id=req.draft_id)
    except SectionNotGeneratableError as e:
        raise HTTPException(400, str(e))
    except ValueError as e:
        raise HTTPException(404, str(e))
    except Exception as e:
        print(f"\n=== RECOMMEND ERROR section={section_id} model={req.model} ===")
        traceback.print_exc()
        print("=== END ERROR ===\n", flush=True)
        raise HTTPException(500, f"Recommend error: {type(e).__name__}: {e}")
    return result


@router.post("/{section_id}/recommend/confirm")
def confirm_recommendation(dokumen_id: str, section_id: str, req: ConfirmSelectionRequest,
                           _user=Depends(require_led_access)):
    """User konfirmasi folder/file evidence hasil rekomendasi (atau upload
    baru) sebelum narasi ditulis. Tandai bab_document_recommendation
    'confirmed' + enqueue proses on-demand utk file yg masih 'pending'."""
    _require_dokumen(dokumen_id)
    urutan_bab = get_urutan_bab(section_id)
    if urutan_bab is None:
        raise HTTPException(404, f"Section {section_id} not found")

    with conn() as con:
        rec = con.execute(
            """SELECT id, dokumen_id, urutan_bab, model FROM bab_document_recommendation
               WHERE id = %s AND dokumen_id = %s""",
            (req.recommendation_id, dokumen_id),
        ).fetchone()
        if not rec:
            raise HTTPException(404, "Rekomendasi tidak ditemukan")

        con.execute(
            """UPDATE bab_document_recommendation
               SET status = 'confirmed', selected_folder_paths = %s,
                   selected_bukti_dukung_ids = %s
               WHERE id = %s""",
            (json.dumps(req.folder_paths, ensure_ascii=False),
             json.dumps(req.bukti_dukung_ids, ensure_ascii=False),
             req.recommendation_id),
        )
        # Card rekomendasi (tab "Dokumen Pendukung") TETAP disimpan setelah
        # confirm -- user bisa Regenerate (pilih dokumen ulang) tanpa perlu
        # klik "Rekomendasikan Ulang" dari awal setiap kali.

        pending_ids = []
        if req.bukti_dukung_ids:
            rows = con.execute(
                """SELECT id FROM bukti_dukung
                   WHERE id = ANY(%s) AND status = 'pending'""",
                (req.bukti_dukung_ids,),
            ).fetchall()
            pending_ids = [str(r["id"]) for r in rows]

    for bid in pending_ids:
        _queue.enqueue("worker_tasks.process_document", bid, job_timeout=1800)

    return {
        "status": "confirmed",
        "recommendation_id": req.recommendation_id,
        "bukti_dukung_ids": req.bukti_dukung_ids,
        "enqueued": pending_ids,
    }


@router.post("/{section_id}/generate")
def generate(dokumen_id: str, section_id: str, req: GenerateRequest,
            _user=Depends(require_led_access)):
    """Tahap 2 alur Document Recommendation: Tulis Narasi -- synthesis +
    judge, evidence discope HANYA ke selected_bukti_dukung_ids (dikonfirmasi
    user via /recommend/confirm). Idempotent unless overwrite=true."""
    _require_dokumen(dokumen_id)
    import traceback
    try:
        result = generate_section(dokumen_id, section_id, req.model,
                                   selected_bukti_dukung_ids=req.selected_bukti_dukung_ids,
                                   overwrite=req.overwrite,
                                   target_draft_id=req.draft_id)
    except SectionNotGeneratableError as e:
        raise HTTPException(400, str(e))
    except ValueError as e:
        raise HTTPException(404, str(e))
    except Exception as e:
        # Log traceback ke stderr supaya keliatan di docker logs
        print(f"\n=== GENERATE ERROR section={section_id} model={req.model} ===")
        traceback.print_exc()
        print("=== END ERROR ===\n", flush=True)
        raise HTTPException(500, f"Generate error: {type(e).__name__}: {e}")
    return result


@router.put("/{section_id}/draft")
def update_draft(dokumen_id: str, section_id: str, req: UpdateDraftRequest,
                 _user=Depends(require_led_access)):
    """User edit manual draft."""
    _require_dokumen(dokumen_id)
    urutan_bab = get_urutan_bab(section_id)
    if urutan_bab is None:
        raise HTTPException(404, f"Section {section_id} not found")
    with conn() as con:
        row = con.execute(
            """SELECT id, konten_kerja FROM bab_dokumen
               WHERE dokumen_id=%s AND urutan_bab=%s AND model=%s""",
            (dokumen_id, urutan_bab, req.model)).fetchone()
        if not row:
            raise HTTPException(404, "Draft not found")
        kk = row["konten_kerja"] or {}
        kk["draft_text"] = req.draft_text
        con.execute(
            """UPDATE bab_dokumen SET konten_kerja=%s, terakhir_disimpan=now()
               WHERE id=%s""",
            (json.dumps(kk, ensure_ascii=False), row["id"]))
    return {"status": "ok"}


@router.delete("/{section_id}")
def delete_section_draft(dokumen_id: str, section_id: str, model: Optional[str] = None,
                         _user=Depends(require_led_access)):
    """Hapus draft section. Kalau model None, hapus semua model utk section ini.

    Beda dari SQLite lama: baris bab_dokumen benar2 DIHAPUS (bukan direset ke
    '{}'), karena satu baris memang 1:1 per (section, model) -- lebih dekat
    ke semantik lama "hapus draft ini sepenuhnya"."""
    _require_dokumen(dokumen_id)
    urutan_bab = get_urutan_bab(section_id)
    if urutan_bab is None:
        raise HTTPException(404, f"Section {section_id} not found")
    with conn() as con:
        if model:
            cur = con.execute(
                """DELETE FROM bab_dokumen
                   WHERE dokumen_id=%s AND urutan_bab=%s AND model=%s""",
                (dokumen_id, urutan_bab, model))
        else:
            cur = con.execute(
                """DELETE FROM bab_dokumen
                   WHERE dokumen_id=%s AND urutan_bab=%s""",
                (dokumen_id, urutan_bab))
        n_drafts = cur.rowcount
    return {"status": "ok", "drafts_deleted": n_drafts}


@router.delete("")
def delete_all_drafts(dokumen_id: str, model: Optional[str] = None,
                      _user=Depends(require_led_access)):
    """Hapus SEMUA drafts (filter per model kalau diberikan)."""
    _require_dokumen(dokumen_id)
    with conn() as con:
        # Hitung chat SEBELUM delete -- ON DELETE CASCADE bab_chat_message
        # ikut terhapus otomatis, rowcount-nya tidak bisa dibaca setelahnya.
        if model:
            n_chats = con.execute(
                """SELECT count(*) AS n FROM bab_chat_message
                   WHERE bab_id IN (SELECT id FROM bab_dokumen WHERE dokumen_id=%s AND model=%s)""",
                (dokumen_id, model)).fetchone()["n"]
            cur = con.execute(
                "DELETE FROM bab_dokumen WHERE dokumen_id=%s AND model=%s",
                (dokumen_id, model))
        else:
            n_chats = con.execute(
                """SELECT count(*) AS n FROM bab_chat_message
                   WHERE bab_id IN (SELECT id FROM bab_dokumen WHERE dokumen_id=%s)""",
                (dokumen_id,)).fetchone()["n"]
            cur = con.execute(
                "DELETE FROM bab_dokumen WHERE dokumen_id=%s", (dokumen_id,))
        n_drafts = cur.rowcount
    return {"status": "ok", "drafts_deleted": n_drafts, "chats_deleted": n_chats}


@router.post("/{section_id}/approve")
def approve(dokumen_id: str, section_id: str, req: ApproveRequest,
           _user=Depends(require_led_access)):
    _require_dokumen(dokumen_id)
    urutan_bab = get_urutan_bab(section_id)
    if urutan_bab is None:
        raise HTTPException(404, f"Section {section_id} not found")
    with conn() as con:
        cur = con.execute(
            """UPDATE bab_dokumen SET status='approved', terakhir_disimpan=now()
               WHERE dokumen_id=%s AND urutan_bab=%s AND model=%s""",
            (dokumen_id, urutan_bab, req.model))
        if cur.rowcount == 0:
            raise HTTPException(404, "Draft not found")
    return {"status": "approved"}
