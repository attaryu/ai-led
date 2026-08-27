"""Postgres access for the GENERASI_BAB pipeline — reads pedoman/rubrik
reference data, writes BabDraft/GenerationRun/RagasScore, and updates
BabDokumen's active state (packages/db/prisma/schema.prisma). Same shared
connection as db/postgres_client.py and vectorstore/pgvector_store.py.

BabDokumen rows are never created here — they already exist by the time a
GENERASI_BAB job runs (created via NestJS's existing bab-dokumen module,
Week 2). This module only reads the one it's told about and writes the
results of generating into it.
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Optional

from db.connection import get_conn


def get_user_nama(user_id: str) -> str:
    with get_conn().cursor() as cur:
        cur.execute('SELECT full_name FROM org_users WHERE id = %s', (user_id,))
        row = cur.fetchone()
    return row["full_name"] if row else "Unknown"


def get_bab_dokumen(bab_id: str) -> Optional[dict]:
    """Return {id, document_id, chapter_order, chapter_title, working_content,
    tenant_id, study_program_id}, or None."""
    with get_conn().cursor() as cur:
        cur.execute(
            """
            SELECT bd.id, bd.document_id, bd.chapter_order, bd.chapter_title, bd.working_content,
                   ps.tenant_id, ps.id AS study_program_id
            FROM writing_document_chapters bd
            JOIN writing_led_documents dl ON dl.id = bd.document_id
            JOIN org_study_programs ps ON ps.id = dl.study_program_id
            WHERE bd.id = %s
            """,
            (bab_id,),
        )
        row = cur.fetchone()
    return dict(row) if row else None


def get_pedoman_for_bab(urutan_bab: int) -> list[dict]:
    """Guideline text points relevant to this chapter number.

    urutan_bab is a matching key here, not a FK (see schema.prisma's own
    note on GuideDetailChapter) — plain relational lookup, no vector search:
    pedoman/rubric are structured reference data, not free-text documents.
    """
    with get_conn().cursor() as cur:
        cur.execute(
            """
            SELECT gd.point_code, gd.point_title, gd.content_text, rg.title AS sumber
            FROM guide_detail_chapters gdc
            JOIN guide_details gd ON gd.id = gdc.guide_detail_id
            JOIN guide_references rg ON rg.id = gd.guide_id
            WHERE gdc.chapter_order = %s
            """,
            (urutan_bab,),
        )
        return [dict(r) for r in cur.fetchall()]


def get_rubrik_for_bab(urutan_bab: int) -> list[dict]:
    """Scoring rubric criteria relevant to this chapter number."""
    with get_conn().cursor() as cur:
        cur.execute(
            """
            SELECT rc.id, rc.criterion_code, rc.description
            FROM rubric_criterion_chapters rcc
            JOIN rubric_criteria rc ON rc.id = rcc.criterion_id
            WHERE rcc.chapter_order = %s
            """,
            (urutan_bab,),
        )
        return [dict(r) for r in cur.fetchall()]


def get_rubrik_levels(kriteria_ids: list[str]) -> dict[str, list[dict]]:
    """RubricLevel rows (score 4..0) for a set of criteria, grouped by criterion_id."""
    if not kriteria_ids:
        return {}
    with get_conn().cursor() as cur:
        cur.execute(
            "SELECT criterion_id, score, description FROM rubric_levels WHERE criterion_id = ANY(%s) ORDER BY score DESC",
            (kriteria_ids,),
        )
        by_kriteria: dict[str, list[dict]] = {}
        for row in cur.fetchall():
            by_kriteria.setdefault(row["criterion_id"], []).append(
                {"score": row["score"], "description": row["description"]}
            )
    return by_kriteria


def get_bab_draft(bab_draft_id: str) -> Optional[dict]:
    """Return {id, chapter_id, content_snapshot}, or None."""
    with get_conn().cursor() as cur:
        cur.execute(
            "SELECT id, chapter_id, content_snapshot FROM writing_chapter_drafts WHERE id = %s",
            (bab_draft_id,),
        )
        row = cur.fetchone()
    return dict(row) if row else None


def replace_hasil_skor_kriteria(
    target_tipe: str,
    bab_id: Optional[str],
    bab_draft_id: Optional[str],
    rows: list[dict],
    dijalankan_oleh_user_id: str,
    dijalankan_oleh_nama: str,
) -> list[dict]:
    """Delete existing CriterionScoreResult for this exact target, insert fresh
    rows — "main timpa" semantics matching every other active-state field in
    this schema (see BabDokumen.kontenKerja, BuktiDukungBab). Re-running the
    simulation for the same scope replaces its previous result, not appends.

    rows: [{kriteria_id, skor_didapat, justifikasi}].
    """
    with get_conn().cursor() as cur:
        if target_tipe == "BAB_AKTIF":
            cur.execute(
                "DELETE FROM rubric_score_results WHERE chapter_id = %s AND target_type = 'BAB_AKTIF'",
                (bab_id,),
            )
        else:
            cur.execute(
                "DELETE FROM rubric_score_results WHERE draft_id = %s AND target_type = 'BAB_DRAFT'",
                (bab_draft_id,),
            )

        inserted = []
        for row in rows:
            row_id = str(uuid.uuid4())
            cur.execute(
                """
                INSERT INTO rubric_score_results
                    (id, criterion_id, target_type, chapter_id, draft_id, score_obtained,
                     justification, run_by_user_id, run_by_name)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id
                """,
                (
                    row_id,
                    row["kriteria_id"],
                    target_tipe,
                    bab_id,
                    bab_draft_id,
                    row["skor_didapat"],
                    row.get("justifikasi"),
                    dijalankan_oleh_user_id,
                    dijalankan_oleh_nama,
                ),
            )
            inserted.append(dict(cur.fetchone()))
    return inserted


def create_bab_draft(
    bab_id: str,
    dibuat_oleh_user_id: str,
    dibuat_oleh_nama: str,
    konten_snapshot: dict,
    referensi_chunk_ids: Optional[list[str]] = None,
) -> dict:
    """Insert a new AI-sourced BabDraft (checkpoint), version = max+1 for this bab."""
    draft_id = str(uuid.uuid4())
    with get_conn().cursor() as cur:
        cur.execute(
            "SELECT COALESCE(MAX(version), 0) AS v FROM writing_chapter_drafts WHERE chapter_id = %s",
            (bab_id,),
        )
        next_versi = cur.fetchone()["v"] + 1

        cur.execute(
            """
            INSERT INTO writing_chapter_drafts
                (id, chapter_id, created_by_user_id, version, content_snapshot, source,
                 reference_chunk_ids, created_by_name)
            VALUES (%s, %s, %s, %s, %s, 'AI', %s, %s)
            RETURNING id, version
            """,
            (
                draft_id,
                bab_id,
                dibuat_oleh_user_id,
                next_versi,
                json.dumps(konten_snapshot),
                ",".join(referensi_chunk_ids) if referensi_chunk_ids else None,
                dibuat_oleh_nama,
            ),
        )
        return dict(cur.fetchone())


def update_bab_dokumen_aktif(bab_id: str, konten_kerja: dict, checkpoint_aktif_id: str) -> None:
    """Overwrite the chapter's active content — same 'always overwrite'
    policy as every other active-state field in this schema.

    `last_saved_at` set explicitly: schema.prisma declares it @updatedAt,
    but that's a Prisma CLIENT convenience (stamped by Prisma's own query
    engine on .update() calls), not a Postgres trigger — raw SQL from this
    module bypasses it entirely and silently leaves the column frozen at
    whatever it was last set to (traced live: a chapter regenerated today
    still showed 'last_saved_at' from its original seed date, days earlier,
    because nothing here had ever set it)."""
    with get_conn().cursor() as cur:
        cur.execute(
            """
            UPDATE writing_document_chapters
            SET working_content = %s, active_checkpoint_id = %s, last_saved_at = NOW()
            WHERE id = %s
            """,
            (json.dumps(konten_kerja), checkpoint_aktif_id, bab_id),
        )


def link_evidence_to_chapter_and_draft(
    chapter_id: str, draft_id: str, evidence_ids: list[str]
) -> None:
    """Records which confirmed Bukti Dukung actually backed one generate —
    evidence_chapter_links/evidence_draft_links (schema.prisma), what
    apps/web reads for 'chapter.buktiDukung' (the count shown after
    generate, and the checkbox baseline restored on reload). No-op if
    evidence_ids is empty (chapter never went through recommend+confirm,
    or nothing was selected) — never was writing anything here before this,
    which silently broke both of those regardless of whether evidence was
    actually retrieved for the prompt.

    evidence_chapter_links is the chapter's ACTIVE state (docs/database.md
    §8) — replaced wholesale each regenerate, same 'always overwrite'
    policy as update_bab_dokumen_aktif. evidence_draft_links is this one
    draft's permanent record — inserted once, never touched again.
    """
    if not evidence_ids:
        return

    with get_conn().cursor() as cur:
        cur.execute(
            "SELECT id, document_name, file_type FROM evidence_files WHERE id = ANY(%s)",
            (evidence_ids,),
        )
        rows = cur.fetchall()
        if not rows:
            return

        cur.execute(
            "DELETE FROM evidence_chapter_links WHERE chapter_id = %s", (chapter_id,)
        )
        for row in rows:
            cur.execute(
                """
                INSERT INTO evidence_chapter_links
                    (id, evidence_id, chapter_id, document_name, file_type)
                VALUES (%s, %s, %s, %s, %s)
                """,
                (str(uuid.uuid4()), row["id"], chapter_id, row["document_name"], row["file_type"]),
            )
            cur.execute(
                """
                INSERT INTO evidence_draft_links
                    (id, evidence_id, draft_id, document_name, file_type)
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT (evidence_id, draft_id) DO NOTHING
                """,
                (str(uuid.uuid4()), row["id"], draft_id, row["document_name"], row["file_type"]),
            )


def create_generation_run(
    bab_draft_id: str,
    model: str,
    pedoman_used: list[dict],
    rubric_used: list[dict],
    checklist: list[str],
    chunks_used: list[dict],
    judge_result: Optional[dict],
    prompt_full: str,
    latency_sec: float,
    token_count: int,
) -> dict:
    run_id = str(uuid.uuid4())
    with get_conn().cursor() as cur:
        cur.execute(
            """
            INSERT INTO writing_generation_runs
                (id, chapter_draft_id, model, guidelines_used, rubric_used, checklist,
                 chunks_used, judge_result, prompt_full, latency_sec, token_count)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id
            """,
            (
                run_id,
                bab_draft_id,
                model,
                json.dumps(pedoman_used),
                json.dumps(rubric_used),
                json.dumps(checklist),
                json.dumps(chunks_used),
                json.dumps(judge_result) if judge_result is not None else None,
                prompt_full,
                latency_sec,
                token_count,
            ),
        )
        return dict(cur.fetchone())


def create_ragas_score(
    bab_id: str,
    bab_draft_id: str,
    metrik: dict[str, float],
    jumlah_chunk: int,
) -> dict:
    """target_tipe=BAB_AKTIF — this row is for the chapter's current active
    state, not a permanent checkpoint score (that's a separate call with
    target_tipe=BAB_DRAFT, not needed for this job's DoD)."""
    score_id = str(uuid.uuid4())
    with get_conn().cursor() as cur:
        cur.execute(
            """
            INSERT INTO writing_ragas_scores
                (id, target_type, chapter_id, chapter_draft_id, metrics, chunk_count, computed_at)
            VALUES (%s, 'BAB_AKTIF', %s, %s, %s, %s, %s)
            RETURNING id
            """,
            (score_id, bab_id, bab_draft_id, json.dumps(metrik), jumlah_chunk, datetime.now(timezone.utc)),
        )
        return dict(cur.fetchone())


def save_chat_message(bab_id: str, user_id: str, role: str, message: str) -> dict:
    """role is 'USER' or 'ASSISTANT' (ChatRole enum)."""
    msg_id = str(uuid.uuid4())
    with get_conn().cursor() as cur:
        cur.execute(
            """
            INSERT INTO writing_chat_messages (id, chapter_id, user_id, role, message)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING id, created_at
            """,
            (msg_id, bab_id, user_id, role, message),
        )
        return dict(cur.fetchone())


def get_chat_history(bab_id: str, limit: int = 50) -> list[dict]:
    with get_conn().cursor() as cur:
        cur.execute(
            """
            SELECT id, user_id, role, message, created_at
            FROM writing_chat_messages
            WHERE chapter_id = %s
            ORDER BY created_at ASC
            LIMIT %s
            """,
            (bab_id, limit),
        )
        return [dict(r) for r in cur.fetchall()]


def get_evidence_filenames(evidence_ids: list[str]) -> dict[str, str]:
    """id -> documentName map for Bukti Dukung citation labels in the
    GENERASI_BAB prompt — evidence chunks carry no filename of their own
    (vectorstore/pgvector_evidence_store.py::search_evidence only returns
    bukti_dukung_id)."""
    if not evidence_ids:
        return {}
    with get_conn().cursor() as cur:
        cur.execute(
            "SELECT id, document_name FROM evidence_files WHERE id = ANY(%s)",
            (evidence_ids,),
        )
        return {row["id"]: row["document_name"] for row in cur.fetchall()}


def get_confirmed_recommendation(chapter_draft_id: str) -> Optional[dict]:
    """The DIKONFIRMASI DocumentRecommendation row for this draft — evidence
    scope for GENERASI_BAB (selectedEvidenceIds). None if this chapter was
    generated without going through recommend-documents first (manual
    generate, still supported — see worker.py::_handle_generasi_bab)."""
    with get_conn().cursor() as cur:
        cur.execute(
            """
            SELECT id, document_query, lkps_needed, lkps_sufficient, lkps_evidence_query,
                   candidate_folders, recommendation_text, selected_evidence_ids,
                   pedoman_used, rubric_used, lkps_used, status, created_at
            FROM writing_document_recommendations
            WHERE chapter_draft_id = %s AND status = 'DIKONFIRMASI'
            LIMIT 1
            """,
            (chapter_draft_id,),
        )
        row = cur.fetchone()
    return dict(row) if row else None


def create_document_recommendation(
    chapter_draft_id: str,
    document_query: list[str],
    lkps_needed: bool,
    lkps_sufficient: Optional[bool],
    lkps_evidence_query: Optional[list[str]],
    candidate_folders: list[dict],
    recommendation_text: str,
    pedoman_used: list[dict],
    rubric_used: list[dict],
    lkps_used: list[dict],
    items: list[dict],
) -> dict:
    """Supersede any prior DIKONFIRMASI recommendation on this draft (Dimas's
    reuse-draft-then-supersede semantics — a no-op UPDATE when there isn't
    one), then insert the new DIREKOMENDASIKAN row + its RecommendationItem
    cards. selectedEvidenceIds starts empty — filled in later by the
    (separate) confirm step."""
    rec_id = str(uuid.uuid4())
    with get_conn().cursor() as cur:
        cur.execute(
            """UPDATE writing_document_recommendations SET status = 'DIGANTIKAN'
               WHERE chapter_draft_id = %s AND status = 'DIKONFIRMASI'""",
            (chapter_draft_id,),
        )
        cur.execute(
            """
            INSERT INTO writing_document_recommendations
                (id, chapter_draft_id, document_query, lkps_needed, lkps_sufficient,
                 lkps_evidence_query, candidate_folders, recommendation_text,
                 selected_evidence_ids, pedoman_used, rubric_used, lkps_used, status)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'DIREKOMENDASIKAN')
            RETURNING id, created_at
            """,
            (
                rec_id,
                chapter_draft_id,
                json.dumps(document_query),
                lkps_needed,
                lkps_sufficient,
                json.dumps(lkps_evidence_query) if lkps_evidence_query is not None else None,
                json.dumps(candidate_folders),
                recommendation_text,
                json.dumps([]),
                json.dumps(pedoman_used),
                json.dumps(rubric_used),
                json.dumps(lkps_used),
            ),
        )
        row = dict(cur.fetchone())
        for i, it in enumerate(items):
            cur.execute(
                """
                INSERT INTO writing_recommendation_items
                    (id, recommendation_id, label, reason, "order")
                VALUES (%s, %s, %s, %s, %s)
                """,
                (str(uuid.uuid4()), rec_id, it.get("label", ""), it.get("reason"), i),
            )
    return {"id": rec_id, "created_at": row["created_at"]}
