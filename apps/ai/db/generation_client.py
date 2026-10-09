"""Postgres access for the GENERASI_BAB pipeline — reads pedoman/rubrik
reference data, writes BabDraft/GenerationRun/RagasScore, and updates
BabDokumen's active state (packages/db/prisma/schema.prisma). Same pooled
connection as db/postgres_client.py and vectorstore/pgvector_store.py
(db/connection.py).

BabDokumen rows are never created here — they already exist by the time a
GENERASI_BAB job runs (created via NestJS's existing bab-dokumen module,
Week 2). This module only reads the one it's told about and writes the
results of generating into it.

Every function takes `tenant_id` (keyword-only) and runs inside
db.connection.tenant_cursor(tenant_id) for RLS's `app.tenant_id` session
var. `tenant_id=None` for the bootstrap lookups that discover tenant_id in
the first place (get_bab_dokumen), the login-style get_user_nama, and
global reference data with no tenant column at all (get_pedoman_for_bab).
"""

from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from db.connection import tenant_cursor

logger = logging.getLogger(__name__)


def get_user_nama(user_id: str) -> str:
    with tenant_cursor(None) as cur:
        cur.execute('SELECT full_name FROM org_users WHERE id = %s', (user_id,))
        row = cur.fetchone()
    return row["full_name"] if row else "Unknown"


def get_bab_dokumen(bab_id: str) -> Optional[dict]:
    """Return {id, document_id, chapter_order, chapter_title, working_content,
    tenant_id, study_program_id, study_program_name, university_name,
    accreditation_set_id, guide_id, lkps_evidence_id}, or None.

    study_program_name/university_name (port of Dimas's 766de26 institution
    context) let the checklist/generate prompts know which prodi/university
    this LED is for instead of writing fully generic narration.

    accreditation_set_id (nullable — LedDocument may not have picked a set)
    scopes get_rubrik_for_bab to THIS document's own set, not whichever set
    happens to share the same chapter_order. guide_id (nullable — the set may
    not have a Panduan attached, or have none at all) is that set's
    AccreditationSet.panduanId, what actually scopes get_chapter_template_subbab
    now that ChapterTemplate lives on the Panduan (ReferenceGuide), not the set.

    Bootstrap lookup — this is what callers use to DISCOVER tenant_id from
    a bab_id in the first place, so it runs with no tenant scoped yet.
    """
    with tenant_cursor(None) as cur:
        cur.execute(
            """
            SELECT bd.id, bd.document_id, bd.chapter_order, bd.chapter_title, bd.working_content,
                   bd.active_checkpoint_id AS checkpoint_aktif_id, ps.tenant_id, ps.id AS study_program_id, ps.name AS study_program_name,
                   t.university_name, dl.accreditation_set_id, acs.panduan_id AS guide_id,
                   -- dimas: pedoman sudah menyebut sheet LKPS yang dibutuhkan, jadi datanya harus ikut terlampir
                   -- walau dokumen belum memilih berkas LKPS -> jatuh ke LKPS prodi ini yang sudah SIAP.
                   COALESCE(dl.lkps_evidence_id, (
                       SELECT ef.id FROM evidence_files ef
                       WHERE ef.kind = 'LKPS' AND ef.study_program_id = ps.id
                         AND ef.extraction_status = 'SIAP'
                       ORDER BY ef.uploaded_at DESC LIMIT 1
                   )) AS lkps_evidence_id
            FROM writing_document_chapters bd
            JOIN writing_led_documents dl ON dl.id = bd.document_id
            JOIN org_study_programs ps ON ps.id = dl.study_program_id
            JOIN org_tenants t ON t.id = ps.tenant_id
            LEFT JOIN accreditation_sets acs ON acs.id = dl.accreditation_set_id
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
    Global reference data, no tenant column at all.
    """
    with tenant_cursor(None) as cur:
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


def get_rubrik_for_bab(
    tenant_id: str, urutan_bab: int, accreditation_set_id: Optional[str]
) -> list[dict]:
    """Scoring rubric criteria relevant to this chapter number, SCOPED to one
    AccreditationSet — chapter_order (1, 2, 3...) is only unique WITHIN a
    set, not across a tenant's sets, so this must always be filtered by
    accreditation_set_id or a tenant with 2+ sets sharing a chapter number
    gets both sets' criteria mixed together (a real bug found while wiring
    per-set dynamic chapter structures — see plan). `accreditation_set_id`
    None (LedDocument hasn't picked a set) -> no criteria, same as before.

    `criterion_group` is included for _handle_generasi_outline_bab's grouping
    (padanan Python dari apps/web's kelompokkanKriteria) — existing callers
    (checklist/generate/judge prompts) simply ignore the extra key.
    """
    if not accreditation_set_id:
        return []
    with tenant_cursor(tenant_id) as cur:
        cur.execute(
            """
            SELECT rc.id, rc.criterion_code, rc.criterion_group, rc.description
            FROM rubric_criterion_chapters rcc
            JOIN rubric_criteria rc ON rc.id = rcc.criterion_id
            WHERE rcc.chapter_order = %s AND rc.accreditation_set_id = %s
            """,
            (urutan_bab, accreditation_set_id),
        )
        return [dict(r) for r in cur.fetchall()]


def get_chapter_template_subbab(
    tenant_id: str, guide_id: Optional[str], urutan_bab: int
) -> list[dict]:
    """Sub-bab resmi (dikonfirmasi user, lihat api/routes/structure.py) dari
    struktur Panduan (ReferenceGuide, guide_id = AccreditationSet.panduanId)
    untuk bab ini -- worker.py::_handle_generasi_outline_bab menyalinnya APA
    ADANYA jadi ChapterSection, sumber TUNGGAL outline (bukan lagi konteks
    tambahan buat LLM -- tidak ada LLM di outline sejak penghapusan
    _build_outline_prompt). Kosong kalau dokumen belum punya set, set-nya
    belum pilih/upload Panduan, atau Panduan itu belum dikonfirmasi
    strukturnya -- _handle_generasi_outline_bab menolak (bukan fallback diam-diam)
    saat itu.

    Node dengan is_active=false (lihat SubBabTemplate.isActive) DIKECUALIKAN --
    toggle murah reviewer utk matiin 1 sub-bab dari outline BARU tanpa
    re-extract Panduan; matiin parent otomatis ikut ngilangin children-nya
    juga (children jadi tidak ke-attach ke mana pun karena parent-nya tidak
    ada di `rows`), tidak perlu cascading write terpisah.

    Cuma sub-bab teratas yang dibalikin, tiap satu bawa `children` (list
    dict serupa) buat sub-sub-bab-nya -- satu tingkat, sama seperti
    SubBabTemplate.parentId di schema.prisma."""
    if not guide_id:
        return []
    with tenant_cursor(tenant_id) as cur:
        cur.execute(
            """
            SELECT sbt.id, sbt.parent_id, sbt.title, sbt.marker, sbt.guidance, sbt.lkps_needed, sbt.lkps_list
            FROM sub_bab_templates sbt
            JOIN chapter_templates ct ON ct.id = sbt.chapter_template_id
            WHERE ct.guide_id = %s AND ct."order" = %s AND sbt.is_active = true
            ORDER BY sbt."order"
            """,
            (guide_id, urutan_bab),
        )
        rows = [dict(r) for r in cur.fetchall()]

    anak_dari: dict[str, list[dict]] = {}
    for r in rows:
        if r["parent_id"]:
            anak_dari.setdefault(r["parent_id"], []).append(r)
    for r in rows:
        r["children"] = anak_dari.get(r["id"], [])
    return [r for r in rows if not r["parent_id"]]


def get_rubrik_levels(tenant_id: str, kriteria_ids: list[str]) -> dict[str, list[dict]]:
    """RubricLevel rows (score 4..0) for a set of criteria, grouped by criterion_id."""
    if not kriteria_ids:
        return {}
    with tenant_cursor(tenant_id) as cur:
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


def get_bab_draft(tenant_id: str, bab_draft_id: str) -> Optional[dict]:
    """Return {id, chapter_id, content_snapshot}, or None."""
    with tenant_cursor(tenant_id) as cur:
        cur.execute(
            "SELECT id, chapter_id, content_snapshot FROM writing_chapter_drafts WHERE id = %s",
            (bab_draft_id,),
        )
        row = cur.fetchone()
    return dict(row) if row else None


def replace_hasil_skor_kriteria(
    tenant_id: str,
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
    with tenant_cursor(tenant_id) as cur:
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
    tenant_id: str,
    bab_id: str,
    dibuat_oleh_user_id: str,
    dibuat_oleh_nama: str,
    konten_snapshot: dict,
    referensi_chunk_ids: Optional[list[str]] = None,
) -> dict:
    """Insert a new AI-sourced BabDraft (checkpoint), version = max+1 for this bab."""
    draft_id = str(uuid.uuid4())
    with tenant_cursor(tenant_id) as cur:
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


def create_section_draft_ai(
    tenant_id: str, section_id: str, user_id: str, user_nama: str, content: dict
) -> dict:
    """dimas: every generate is a bab_draft version of THAT section -- new AI SectionDraft (version max+1)
    made the section's active checkpoint, so regenerating never loses the previous narrative."""
    draft_id = str(uuid.uuid4())
    with tenant_cursor(tenant_id) as cur:
        cur.execute(
            "SELECT COALESCE(MAX(version), 0) AS v FROM writing_section_drafts WHERE section_id = %s",
            (section_id,),
        )
        version = cur.fetchone()["v"] + 1
        cur.execute(
            """
            INSERT INTO writing_section_drafts
                (id, section_id, created_by_user_id, version, content_snapshot, source, created_by_name)
            VALUES (%s, %s, %s, %s, %s, 'AI', %s)
            """,
            (draft_id, section_id, user_id, version, json.dumps(content), user_nama),
        )
        cur.execute(
            "UPDATE writing_chapter_sections SET active_checkpoint_id = %s WHERE id = %s",
            (draft_id, section_id),
        )
    return {"id": draft_id, "version": version}


def clear_section_chat(tenant_id: str, section_id: str) -> None:
    """dimas generate_section deletes bab_chat_message on regenerate -- old turns are about the old text."""
    with tenant_cursor(tenant_id) as cur:
        cur.execute("DELETE FROM writing_chat_messages WHERE section_id = %s", (section_id,))


def update_bab_dokumen_aktif(
    tenant_id: str, bab_id: str, konten_kerja: dict, checkpoint_aktif_id: str
) -> None:
    """Overwrite the chapter's active content — same 'always overwrite'
    policy as every other active-state field in this schema.

    `last_saved_at` set explicitly: schema.prisma declares it @updatedAt,
    but that's a Prisma CLIENT convenience (stamped by Prisma's own query
    engine on .update() calls), not a Postgres trigger — raw SQL from this
    module bypasses it entirely and silently leaves the column frozen at
    whatever it was last set to (traced live: a chapter regenerated today
    still showed 'last_saved_at' from its original seed date, days earlier,
    because nothing here had ever set it)."""
    with tenant_cursor(tenant_id) as cur:
        cur.execute(
            """
            UPDATE writing_document_chapters
            SET working_content = %s, active_checkpoint_id = %s, last_saved_at = NOW()
            WHERE id = %s
            """,
            (json.dumps(konten_kerja), checkpoint_aktif_id, bab_id),
        )


def set_bab_dokumen_checkpoint_aktif(tenant_id: str, bab_id: str, checkpoint_aktif_id: str) -> None:
    """Point the chapter at a checkpoint without touching `working_content` (Dimas moves only the pointer)."""
    with tenant_cursor(tenant_id) as cur:
        cur.execute(
            "UPDATE writing_document_chapters SET active_checkpoint_id = %s, last_saved_at = NOW() WHERE id = %s",
            (checkpoint_aktif_id, bab_id),
        )


def get_chapter_sections(tenant_id: str, chapter_id: str) -> list[dict]:
    """Outline rows for one bab, in display order — empty list means no
    outline has been generated yet."""
    with tenant_cursor(tenant_id) as cur:
        cur.execute(
            """
            SELECT id, chapter_id, parent_id, "order", title, marker, guidance, status, content, model, error,
                   generated_at, lkps_needed, lkps_list
            FROM writing_chapter_sections
            WHERE chapter_id = %s
            ORDER BY "order" ASC
            """,
            (chapter_id,),
        )
        return [dict(r) for r in cur.fetchall()]


def get_chapter_section(tenant_id: str, section_id: str) -> Optional[dict]:
    with tenant_cursor(tenant_id) as cur:
        cur.execute(
            """
            SELECT id, chapter_id, "order", title, marker, guidance, status, content, table_spec, model, error,
                   generated_at, lkps_needed, lkps_list
            FROM writing_chapter_sections
            WHERE id = %s
            """,
            (section_id,),
        )
        row = cur.fetchone()
    return dict(row) if row else None


def get_section_for_chat(section_id: str) -> Optional[dict]:
    """Bootstrap lookup for the chat endpoint (section-scoped, dimas parity) —
    same no-tenant-yet pattern as get_bab_dokumen, joined one level deeper."""
    with tenant_cursor(None) as cur:
        cur.execute(
            """
            SELECT cs.id, cs.chapter_id, cs.title AS section_title, cs.content,
                   bd.document_id, bd.chapter_title, ps.tenant_id,
                   dl.study_program_id, dl.lkps_evidence_id
            FROM writing_chapter_sections cs
            JOIN writing_document_chapters bd ON bd.id = cs.chapter_id
            JOIN writing_led_documents dl ON dl.id = bd.document_id
            JOIN org_study_programs ps ON ps.id = dl.study_program_id
            WHERE cs.id = %s
            """,
            (section_id,),
        )
        row = cur.fetchone()
    return dict(row) if row else None


def get_prodi_evidence_ids(tenant_id: str, study_program_id: str) -> list[str]:
    """Bukti Dukung a prodi's chapter may draw from: its own files + tenant-wide ones (no prodi)."""
    with tenant_cursor(tenant_id) as cur:
        cur.execute(
            """SELECT id FROM evidence_files
               WHERE tenant_id = %s AND kind = 'BUKTI_DUKUNG'
                 AND (study_program_id = %s OR study_program_id IS NULL)""",
            (tenant_id, study_program_id),
        )
        return [r["id"] for r in cur.fetchall()]


def update_section_content(tenant_id: str, section_id: str, content: dict) -> None:
    """In-place revision by chat (dimas parity) -- no new SectionDraft version per turn."""
    with tenant_cursor(tenant_id) as cur:
        cur.execute(
            "UPDATE writing_chapter_sections SET content = %s WHERE id = %s",
            (json.dumps(content), section_id),
        )


def _insert_chapter_section(cur, chapter_id: str, parent_id: str | None, order: int, s: dict) -> list[dict]:
    """Insert satu writing_chapter_sections row, lalu anak-anaknya (rekursif,
    `s["subseksi"]`, sedalam apa pun) dengan parent_id mengarah ke row
    ini. Balikan: [row ini, *semua anaknya] (flat, buat dikumpulkan pemanggil)."""
    section_id = str(uuid.uuid4())
    cur.execute(
        """
        INSERT INTO writing_chapter_sections
            (id, chapter_id, parent_id, "order", title, marker, guidance, status, lkps_needed, lkps_list)
        VALUES (%s, %s, %s, %s, %s, %s, %s, 'PENDING', %s, %s)
        RETURNING id, chapter_id, parent_id, "order", title, marker, guidance, status, content, model, error,
                  generated_at, lkps_needed, lkps_list
        """,
        (
            section_id, chapter_id, parent_id, order, s["title"], s.get("marker"), s["guidance"],
            s.get("lkps_needed"), json.dumps(s.get("lkps_list") or []),
        ),
    )
    created = [dict(cur.fetchone())]
    for i, anak in enumerate(s.get("subseksi") or [], start=1):
        created += _insert_chapter_section(cur, chapter_id, section_id, i, anak)
    return created


def create_chapter_sections(
    tenant_id: str, chapter_id: str, sections: list[dict], overwrite: bool = False
) -> list[dict]:
    """Writes the outline (copied from ChapterTemplate/SubBabTemplate, see
    worker.py::_handle_generasi_outline_bab) as ordered PENDING rows.
    `sections` items may carry `subseksi` (one level of nested sub-sub-bab
    sections, mis. C.1/C.2 di bawah "Kriteria Akreditasi").

    Raises ValueError if the chapter already has sections and `overwrite` is
    not set (v1 rule — see plan: outline regenerate resets everything, no
    smart merge) rather than silently appending duplicates.
    """
    with tenant_cursor(tenant_id) as cur:
        cur.execute(
            "SELECT COUNT(*) AS n FROM writing_chapter_sections WHERE chapter_id = %s", (chapter_id,)
        )
        existing = cur.fetchone()["n"]
        if existing and not overwrite:
            raise ValueError(f"Bab {chapter_id} sudah punya {existing} section — pakai overwrite=true untuk mengganti")
        if existing:
            cur.execute("DELETE FROM writing_chapter_sections WHERE chapter_id = %s", (chapter_id,))

        created: list[dict] = []
        for i, s in enumerate(sections, start=1):
            created += _insert_chapter_section(cur, chapter_id, None, i, s)
        return created


def update_chapter_section(
    tenant_id: str,
    section_id: str,
    status: str,
    content: Optional[dict] = None,
    model: Optional[str] = None,
    error: Optional[str] = None,
) -> None:
    # ponytail: COALESCE utk content/model -- dulu ketiganya ditulis apa adanya,
    # jadi pemanggilan yang HANYA mengubah status (mis. status="GENERATING" di
    # awal _handle_generasi_bab) ikut menimpa content jadi NULL. Biasanya tidak
    # terasa karena beberapa detik kemudian generate menulisnya lagi -- tapi
    # kalau generate GAGAL, section tinggal kosong permanen walau narasinya
    # masih utuh di writing_section_drafts (kasus nyata 2026-10-01: section
    # "Prestasi mahasiswa di bidang non akademik", status ERROR, content kosong,
    # snapshot draft 2188 char). `error` sengaja TIDAK di-COALESCE: ia memang
    # harus bisa dikosongkan saat generate berikutnya berhasil.
    with tenant_cursor(tenant_id) as cur:
        cur.execute(
            """
            UPDATE writing_chapter_sections
            SET status = %s,
                content = COALESCE(%s, content),
                model = COALESCE(%s, model),
                error = %s,
                generated_at = CASE WHEN %s = 'GENERATED' THEN NOW() ELSE generated_at END
            WHERE id = %s
            """,
            (status, json.dumps(content) if content is not None else None, model, error, status, section_id),
        )


def link_evidence_to_chapter_and_draft(
    tenant_id: str, chapter_id: str, draft_id: str, evidence_ids: list[str]
) -> None:
    """Records which confirmed Bukti Dukung actually backed one generate —
    evidence_chapter_links/evidence_draft_links (schema.prisma), what
    apps/web reads for 'chapter.buktiDukung' (the count shown after
    generate, and the checkbox baseline restored on reload). No-op if
    evidence_ids is empty (chapter never went through recommend+confirm,
    or nothing was selected) — never was writing anything here before this,
    which silently broke both of those regardless of whether evidence was
    actually retrieved for the prompt.

    evidence_chapter_links = union of what every section of the chapter used
    (generate is per section now, so replacing it wholesale made the chapter
    show only the last section's evidence). evidence_draft_links is this one
    draft's permanent record — inserted once, never touched again.
    """
    if not evidence_ids:
        return

    with tenant_cursor(tenant_id) as cur:
        cur.execute(
            "SELECT id, document_name, file_type FROM evidence_files WHERE id = ANY(%s)",
            (evidence_ids,),
        )
        rows = cur.fetchall()
        if not rows:
            return

        for row in rows:
            cur.execute(
                """
                INSERT INTO evidence_chapter_links
                    (id, evidence_id, chapter_id, document_name, file_type)
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT (evidence_id, chapter_id) DO NOTHING
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
    tenant_id: str,
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
    section_id: Optional[str] = None,
    checklist_error: Optional[str] = None,
) -> dict:
    """`section_id` -- the ONE section this call actually generated (worker.py's
    `_handle_generasi_bab` is per-section) -- backs the citation hover-card
    (apps/web, read via NestJS/Prisma, not from here): `chunks_used` elements
    each carry a `citation_label` computed once in worker.py, so the reader
    never re-derives the folder-name-preference logic itself."""
    run_id = str(uuid.uuid4())
    with tenant_cursor(tenant_id) as cur:
        cur.execute(
            """
            INSERT INTO writing_generation_runs
                (id, chapter_draft_id, section_id, model, guidelines_used, rubric_used, checklist,
                 checklist_error, chunks_used, judge_result, prompt_full, latency_sec, token_count)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id
            """,
            (
                run_id,
                bab_draft_id,
                section_id,
                model,
                json.dumps(pedoman_used),
                json.dumps(rubric_used),
                json.dumps(checklist),
                checklist_error,
                json.dumps(chunks_used),
                json.dumps(judge_result) if judge_result is not None else None,
                prompt_full,
                latency_sec,
                token_count,
            ),
        )
        return dict(cur.fetchone())


def get_latest_generation_run_for_section(tenant_id: str, section_id: str) -> Optional[dict]:
    """Generate TERAKHIR satu section: id, draft-nya, chunk konteks, pedoman & checklist yang dipakainya.
    Dipakai penilaian RAGAS atas permintaan pengguna (worker.py::_handle_penilaian_ragas)."""
    with tenant_cursor(tenant_id) as cur:
        cur.execute(
            """
            SELECT id, chapter_draft_id, chunks_used, guidelines_used, checklist
            FROM writing_generation_runs
            WHERE section_id = %s
            ORDER BY created_at DESC
            LIMIT 1
            """,
            (section_id,),
        )
        row = cur.fetchone()
    return dict(row) if row else None


def update_generation_run_judge(tenant_id: str, run_id: str, judge_result: dict) -> None:
    """Menimpa `judge_result` satu GenerationRun -- dipakai penilaian RAGAS susulan
    (worker.py::_nilai_ragas_susulan) yang selesai SESUDAH generate-nya."""
    with tenant_cursor(tenant_id) as cur:
        cur.execute(
            "UPDATE writing_generation_runs SET judge_result = %s WHERE id = %s",
            (json.dumps(judge_result), run_id),
        )


def get_latest_section_judges(tenant_id: str, chapter_id: str) -> list[dict]:
    """judge_result of each section's most recent generate in this chapter (one per section)."""
    with tenant_cursor(tenant_id) as cur:
        cur.execute(
            """
            SELECT DISTINCT ON (gr.section_id) gr.judge_result
            FROM writing_generation_runs gr
            JOIN writing_chapter_drafts d ON d.id = gr.chapter_draft_id
            WHERE d.chapter_id = %s AND gr.section_id IS NOT NULL AND gr.judge_result IS NOT NULL
            ORDER BY gr.section_id, gr.created_at DESC
            """,
            (chapter_id,),
        )
        return [r["judge_result"] for r in cur.fetchall()]


def create_ragas_score(
    tenant_id: str,
    bab_id: str,
    bab_draft_id: str,
    metrik: dict[str, dict],
    jumlah_chunk: int,
) -> dict:
    """target_tipe=BAB_AKTIF — this row is for the chapter's current active
    state, not a permanent checkpoint score (that's a separate call with
    target_tipe=BAB_DRAFT, not needed for this job's DoD).

    `metrik` is worker.py::_judge_to_ragas_metrics's output —
    {metric_key: {"nilai": float, "alasan": str}}, not a bare float map."""
    score_id = str(uuid.uuid4())
    with tenant_cursor(tenant_id) as cur:
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


def save_chat_message(tenant_id: str, section_id: str, user_id: str, role: str, message: str) -> dict:
    """role is 'USER' or 'ASSISTANT' (ChatRole enum)."""
    msg_id = str(uuid.uuid4())
    with tenant_cursor(tenant_id) as cur:
        cur.execute(
            """
            INSERT INTO writing_chat_messages (id, section_id, user_id, role, message)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING id, created_at
            """,
            (msg_id, section_id, user_id, role, message),
        )
        return dict(cur.fetchone())


def get_chat_history(tenant_id: str, section_id: str, limit: int = 50) -> list[dict]:
    with tenant_cursor(tenant_id) as cur:
        cur.execute(
            """
            SELECT id, user_id, role, message, created_at
            FROM writing_chat_messages
            WHERE section_id = %s
            ORDER BY created_at ASC
            LIMIT %s
            """,
            (section_id, limit),
        )
        return [dict(r) for r in cur.fetchall()]


def get_evidence_citation_labels(tenant_id: str, evidence_ids: list[str]) -> dict[str, str]:
    """id -> citation label map for Bukti Dukung citation labels in the
    GENERASI_BAB prompt — evidence chunks carry no filename of their own
    (vectorstore/pgvector_evidence_store.py::search_evidence only returns
    bukti_dukung_id).

    Prefers the file's containing folder name over its filename (port of
    Dimas's 766de26 "document query": reviewers organize Bukti Dukung into
    folders like "SK Penetapan", so citing that grouping reads better than
    an arbitrary uploaded filename) — falls back to document_name for files
    uploaded outside any folder.
    """
    if not evidence_ids:
        return {}
    with tenant_cursor(tenant_id) as cur:
        cur.execute(
            """
            SELECT ef.id, ef.document_name, f.name AS folder_name
            FROM evidence_files ef
            LEFT JOIN evidence_folders f ON f.id = ef.folder_id
            WHERE ef.id = ANY(%s)
            """,
            (evidence_ids,),
        )
        return {
            row["id"]: row["folder_name"] or row["document_name"]
            for row in cur.fetchall()
        }


def get_confirmed_recommendation(
    tenant_id: str, chapter_draft_id: str, section_id: Optional[str] = None
) -> Optional[dict]:
    """The DIKONFIRMASI DocumentRecommendation row for this draft — evidence
    scope for GENERASI_BAB (selectedEvidenceIds). With `section_id`, that
    section's own recommendation (dimas: per section) wins over a legacy
    chapter-level row (chapter_section_id NULL); another section's row never
    matches. None if generated without recommend-documents (manual generate)."""
    with tenant_cursor(tenant_id) as cur:
        cur.execute(
            """
            SELECT id, chapter_section_id, document_query, lkps_needed, lkps_sufficient, lkps_evidence_query,
                   candidate_folders, recommendation_text, selected_evidence_ids,
                   pedoman_used, rubric_used, lkps_used, status, created_at
            FROM writing_document_recommendations
            WHERE chapter_draft_id = %s AND status = 'DIKONFIRMASI'
              AND (chapter_section_id IS NULL OR chapter_section_id = %s)
            ORDER BY chapter_section_id NULLS LAST, created_at DESC
            LIMIT 1
            """,
            (chapter_draft_id, section_id),
        )
        row = cur.fetchone()
    return dict(row) if row else None


def create_document_recommendation(
    tenant_id: str,
    chapter_draft_id: str,
    document_query: list[str],
    lkps_needed: bool,
    candidate_folders: list[dict],
    recommendation_text: str,
    pedoman_used: list[dict],
    rubric_used: list[dict],
    lkps_used: list[dict],
    items: list[dict],
    chapter_section_id: Optional[str] = None,
) -> dict:
    """Supersede any prior DIKONFIRMASI recommendation on this draft (Dimas's
    reuse-draft-then-supersede semantics — a no-op UPDATE when there isn't
    one), then insert the new DIREKOMENDASIKAN row + its RecommendationItem
    cards. selectedEvidenceIds starts empty — filled in later by the
    (separate) confirm step."""
    rec_id = str(uuid.uuid4())
    with tenant_cursor(tenant_id) as cur:
        # Per section: supersede that section's confirmed row (any draft); legacy chapter-level: by draft.
        if chapter_section_id:
            cur.execute(
                """UPDATE writing_document_recommendations SET status = 'DIGANTIKAN'
                   WHERE chapter_section_id = %s AND status = 'DIKONFIRMASI'""",
                (chapter_section_id,),
            )
        else:
            cur.execute(
                """UPDATE writing_document_recommendations SET status = 'DIGANTIKAN'
                   WHERE chapter_draft_id = %s AND chapter_section_id IS NULL AND status = 'DIKONFIRMASI'""",
                (chapter_draft_id,),
            )
        cur.execute(
            """
            INSERT INTO writing_document_recommendations
                (id, chapter_draft_id, chapter_section_id, document_query, lkps_needed,
                 candidate_folders, recommendation_text,
                 selected_evidence_ids, pedoman_used, rubric_used, lkps_used, status)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'DIREKOMENDASIKAN')
            RETURNING id, created_at
            """,
            (
                rec_id,
                chapter_draft_id,
                chapter_section_id,
                json.dumps(document_query),
                lkps_needed,
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


def get_recommendation_items(tenant_id: str, recommendation_id: str) -> list[dict]:
    """Items for the post-synthesis cross-check (worker.py::_cross_check_recommendation_items)
    to match against by label."""
    with tenant_cursor(tenant_id) as cur:
        cur.execute(
            """
            SELECT id, label, reason, "order", status
            FROM writing_recommendation_items
            WHERE recommendation_id = %s
            ORDER BY "order"
            """,
            (recommendation_id,),
        )
        return [dict(row) for row in cur.fetchall()]


def update_recommendation_item_status(tenant_id: str, item_id: str, status: str) -> None:
    """DIREKOMENDASIKAN -> DIGUNAKAN/TIDAK_DIPERLUKAN only -- caller (worker.py)
    enforces the one-way transition, this is a plain unconditional UPDATE."""
    with tenant_cursor(tenant_id) as cur:
        cur.execute(
            'UPDATE writing_recommendation_items SET status = %s WHERE id = %s',
            (status, item_id),
        )


def delete_recommendation_item(tenant_id: str, item_id: str) -> None:
    """Cross-check concluded the document is not needed (Dimas deletes the row instead of keeping status 2)."""
    with tenant_cursor(tenant_id) as cur:
        cur.execute("DELETE FROM writing_recommendation_items WHERE id = %s", (item_id,))


def insert_recommendation_items(
    tenant_id: str, recommendation_id: str, items: list[dict], start_order: int
) -> None:
    """Newly-discovered document needs found by the cross-check -- same INSERT
    shape as create_document_recommendation's item loop, continuing the
    existing `order` sequence."""
    with tenant_cursor(tenant_id) as cur:
        for i, it in enumerate(items):
            cur.execute(
                """
                INSERT INTO writing_recommendation_items
                    (id, recommendation_id, label, reason, "order")
                VALUES (%s, %s, %s, %s, %s)
                """,
                (str(uuid.uuid4()), recommendation_id, it.get("label", ""), it.get("reason"), start_order + i),
            )
