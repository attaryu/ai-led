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
        cur.execute('SELECT nama_lengkap FROM "user" WHERE id = %s', (user_id,))
        row = cur.fetchone()
    return row["nama_lengkap"] if row else "Unknown"


def get_bab_dokumen(bab_id: str) -> Optional[dict]:
    """Return {id, dokumen_id, urutan_bab, judul_bab, konten_kerja, tenant_id}, or None."""
    with get_conn().cursor() as cur:
        cur.execute(
            """
            SELECT bd.id, bd.dokumen_id, bd.urutan_bab, bd.judul_bab, bd.konten_kerja, ps.tenant_id
            FROM bab_dokumen bd
            JOIN dokumen_led dl ON dl.id = bd.dokumen_id
            JOIN program_studi ps ON ps.id = dl.program_studi_id
            WHERE bd.id = %s
            """,
            (bab_id,),
        )
        row = cur.fetchone()
    return dict(row) if row else None


def get_pedoman_for_bab(urutan_bab: int) -> list[dict]:
    """Guideline text points relevant to this chapter number.

    urutan_bab is a matching key here, not a FK (see schema.prisma's own
    note on PanduanDetailBab) — plain relational lookup, no vector search:
    pedoman/rubric are structured reference data, not free-text documents.
    """
    with get_conn().cursor() as cur:
        cur.execute(
            """
            SELECT pd.kode_poin, pd.judul_poin, pd.isi_teks, pr.judul AS sumber
            FROM panduan_detail_bab pdb
            JOIN panduan_detail pd ON pd.id = pdb.panduan_detail_id
            JOIN panduan_referensi pr ON pr.id = pd.panduan_id
            WHERE pdb.urutan_bab = %s
            """,
            (urutan_bab,),
        )
        return [dict(r) for r in cur.fetchall()]


def get_rubrik_for_bab(urutan_bab: int) -> list[dict]:
    """Scoring rubric criteria relevant to this chapter number."""
    with get_conn().cursor() as cur:
        cur.execute(
            """
            SELECT rk.id, rk.kode_kriteria, rk.deskripsi
            FROM rubrik_kriteria_bab rkb
            JOIN rubrik_kriteria rk ON rk.id = rkb.kriteria_id
            WHERE rkb.urutan_bab = %s
            """,
            (urutan_bab,),
        )
        return [dict(r) for r in cur.fetchall()]


def get_rubrik_levels(kriteria_ids: list[str]) -> dict[str, list[dict]]:
    """RubrikLevel rows (skor 4..0) for a set of criteria, grouped by kriteria_id."""
    if not kriteria_ids:
        return {}
    with get_conn().cursor() as cur:
        cur.execute(
            "SELECT kriteria_id, skor, deskripsi FROM rubrik_level WHERE kriteria_id = ANY(%s) ORDER BY skor DESC",
            (kriteria_ids,),
        )
        by_kriteria: dict[str, list[dict]] = {}
        for row in cur.fetchall():
            by_kriteria.setdefault(row["kriteria_id"], []).append(
                {"skor": row["skor"], "deskripsi": row["deskripsi"]}
            )
    return by_kriteria


def get_bab_draft(bab_draft_id: str) -> Optional[dict]:
    """Return {id, bab_id, konten_snapshot}, or None."""
    with get_conn().cursor() as cur:
        cur.execute(
            "SELECT id, bab_id, konten_snapshot FROM bab_draft WHERE id = %s",
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
    """Delete existing HasilSkorKriteria for this exact target, insert fresh
    rows — "main timpa" semantics matching every other active-state field in
    this schema (see BabDokumen.kontenKerja, BuktiDukungBab). Re-running the
    simulation for the same scope replaces its previous result, not appends.

    rows: [{kriteria_id, skor_didapat, justifikasi}].
    """
    with get_conn().cursor() as cur:
        if target_tipe == "BAB_AKTIF":
            cur.execute(
                "DELETE FROM hasil_skor_kriteria WHERE bab_id = %s AND target_tipe = 'BAB_AKTIF'",
                (bab_id,),
            )
        else:
            cur.execute(
                "DELETE FROM hasil_skor_kriteria WHERE bab_draft_id = %s AND target_tipe = 'BAB_DRAFT'",
                (bab_draft_id,),
            )

        inserted = []
        for row in rows:
            row_id = str(uuid.uuid4())
            cur.execute(
                """
                INSERT INTO hasil_skor_kriteria
                    (id, kriteria_id, target_tipe, bab_id, bab_draft_id, skor_didapat,
                     justifikasi, dijalankan_oleh_user_id, dijalankan_oleh_nama)
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
    """Insert a new AI-sourced BabDraft (checkpoint), versi = max+1 for this bab."""
    draft_id = str(uuid.uuid4())
    with get_conn().cursor() as cur:
        cur.execute("SELECT COALESCE(MAX(versi), 0) AS v FROM bab_draft WHERE bab_id = %s", (bab_id,))
        next_versi = cur.fetchone()["v"] + 1

        cur.execute(
            """
            INSERT INTO bab_draft
                (id, bab_id, dibuat_oleh_user_id, versi, konten_snapshot, sumber,
                 referensi_chunk_ids, dibuat_oleh_nama)
            VALUES (%s, %s, %s, %s, %s, 'AI', %s, %s)
            RETURNING id, versi
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
    policy as every other active-state field in this schema."""
    with get_conn().cursor() as cur:
        cur.execute(
            """
            UPDATE bab_dokumen
            SET konten_kerja = %s, checkpoint_aktif_id = %s
            WHERE id = %s
            """,
            (json.dumps(konten_kerja), checkpoint_aktif_id, bab_id),
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
            INSERT INTO generation_runs
                (id, bab_draft_id, model, pedoman_used, rubric_used, checklist,
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
            INSERT INTO ragas_scores
                (id, target_tipe, bab_id, bab_draft_id, metrik, jumlah_chunk, dihitung_pada)
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
            INSERT INTO chat_messages (id, bab_dokumen_id, user_id, role, message)
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
            FROM chat_messages
            WHERE bab_dokumen_id = %s
            ORDER BY created_at ASC
            LIMIT %s
            """,
            (bab_id, limit),
        )
        return [dict(r) for r in cur.fetchall()]
