"""Integration tests for db.postgres_client — real local Postgres (the same
one apps/backend uses), not mocked. Mocking psycopg2 would only prove we
called .execute() with *some* string; the property that actually matters
here (tenant isolation, upsert-on-conflict, cascade delete) only means
something against a real database with real FK constraints.

Skips if DATABASE_URL isn't set or the DB isn't reachable — same fallback
pattern as tests/ingestion/test_led_chunker.py's SentenceTransformer skip.
"""

from __future__ import annotations

import os
import uuid

import pytest

pytestmark = pytest.mark.skipif(
    not os.environ.get("DATABASE_URL"), reason="DATABASE_URL not set"
)


@pytest.fixture()
def conn():
    """A raw connection checked out from the pool, in autocommit mode — for
    test setup/teardown SQL that doesn't go through tenant_cursor (no RLS
    scoping needed for fixture rows under BYPASSRLS)."""
    import db.connection as conn_mod

    conn_mod.reset_pool()
    try:
        pool = conn_mod._get_pool()
        c = pool.getconn()
    except Exception as exc:
        pytest.skip(f"Postgres unavailable: {exc}")
    c.autocommit = True
    yield c
    pool.putconn(c)
    conn_mod.reset_pool()


@pytest.fixture()
def fixture_ids(conn):
    """Insert a throwaway tenant/program-studi/dokumen/user, clean up after."""
    tenant_id = f"test-tenant-{uuid.uuid4().hex[:8]}"
    program_studi_id = f"test-prodi-{uuid.uuid4().hex[:8]}"
    dokumen_id = f"test-dok-{uuid.uuid4().hex[:8]}"
    user_id = f"test-user-{uuid.uuid4().hex[:8]}"

    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO org_tenants (id, university_name) VALUES (%s, %s)",
            (tenant_id, "Test University"),
        )
        cur.execute(
            """
            INSERT INTO org_study_programs
                (id, tenant_id, name, code, level, faculty, program_head, accreditation_rank)
            VALUES (%s, %s, %s, %s, 'S1', %s, %s, 'BAIK')
            """,
            (program_studi_id, tenant_id, "Test Prodi", "TP", "Test Fakultas", "Test Ketua"),
        )
        cur.execute(
            """
            INSERT INTO writing_led_documents (id, study_program_id, title, academic_year, overall_status)
            VALUES (%s, %s, %s, %s, 'DRAFT')
            """,
            (dokumen_id, program_studi_id, "Test LED", "2026/2027"),
        )
        cur.execute(
            """
            INSERT INTO org_users (id, tenant_id, full_name, email, password_hash, role)
            VALUES (%s, %s, %s, %s, %s, 'PENJAMIN_MUTU')
            """,
            (user_id, tenant_id, "Test User", f"{user_id}@example.com", "hash"),
        )

    yield {"tenant_id": tenant_id, "dokumen_id": dokumen_id, "user_id": user_id}

    with conn.cursor() as cur:
        cur.execute("DELETE FROM org_users WHERE id = %s", (user_id,))
        cur.execute("DELETE FROM writing_led_documents WHERE id = %s", (dokumen_id,))
        cur.execute("DELETE FROM org_study_programs WHERE id = %s", (program_studi_id,))
        cur.execute("DELETE FROM org_tenants WHERE id = %s", (tenant_id,))


def test_sub_indicators_with_same_number_do_not_overwrite_each_other(fixture_ids, conn):
    """43.I dan 43.II berbagi indicator_no: hasil, langkah penalaran, dan status 'selesai' dikunci
    per (nomor, sub) -- sub kedua TIDAK menimpa sub pertama."""
    import db.postgres_client as pc

    tenant_id = fixture_ids["tenant_id"]
    session_id = f"test-session-{uuid.uuid4().hex[:8]}"
    pc.create_session(
        session_id,
        tenant_id=tenant_id,
        dokumen_id=fixture_ids["dokumen_id"],
        created_by_user_id=fixture_ids["user_id"],
        total_indicators=2,
    )
    try:
        pc.log_indicator_result(tenant_id, session_id, indicator_no=43, sub_no="I", score=3.0, justification="akademik", confidence=0.9)
        pc.log_indicator_result(tenant_id, session_id, indicator_no=43, sub_no="II", score=1.0, justification="non akademik", confidence=0.8)
        pc.log_reasoning_step(tenant_id, session_id, indicator_no=43, sub_no="II", step_index=0, content="langkah II")
        # menilai ulang sub I menimpa sub I saja
        pc.log_indicator_result(tenant_id, session_id, indicator_no=43, sub_no="I", score=4.0, justification="akademik v2", confidence=0.9)

        hasil = {(r["indicator_no"], r["sub_no"]): r for r in pc.get_indicator_results(tenant_id, session_id)}
        assert set(hasil) == {(43, "I"), (43, "II")}
        assert hasil[(43, "I")]["score"] == 4.0 and hasil[(43, "I")]["justification"] == "akademik v2"
        assert hasil[(43, "II")]["score"] == 1.0 and hasil[(43, "II")]["justification"] == "non akademik"
        assert pc.get_completed_indicator_numbers(tenant_id, session_id) == {(43, "I"), (43, "II")}

        pc.log_indicator_result(tenant_id, session_id, indicator_no=44, sub_no="I", score=None, justification=None, confidence=None, error="gagal")
        assert pc.get_completed_indicator_numbers(tenant_id, session_id, retry_failed=True) == {(43, "I"), (43, "II")}
        assert (44, "I") in pc.get_completed_indicator_numbers(tenant_id, session_id)
    finally:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM assessment_sessions WHERE id = %s", (session_id,))


def test_session_lifecycle_and_upsert(fixture_ids, conn):
    import db.postgres_client as pc

    tenant_id = fixture_ids["tenant_id"]
    session_id = f"test-session-{uuid.uuid4().hex[:8]}"
    try:
        pc.create_session(
            session_id,
            tenant_id=tenant_id,
            dokumen_id=fixture_ids["dokumen_id"],
            created_by_user_id=fixture_ids["user_id"],
            total_indicators=3,
        )
        sess = pc.get_session(tenant_id, session_id)
        assert sess is not None
        assert sess["status"] == "running"
        assert sess["total_indicators"] == 3

        pc.log_indicator_result(tenant_id, session_id, indicator_no=1, score=3.5, justification="j1", confidence=0.9)
        pc.log_indicator_result(
            tenant_id, session_id, indicator_no=1, score=4.0, justification="j1-updated", confidence=0.95,
            model="deepseek-r1:32b", sources_used={"led_chunks": [{"page": 3}], "lkps_tables": [], "evidence_documents": []},
        )
        pc.log_indicator_result(tenant_id, session_id, indicator_no=2, score=2.0, justification="j2", confidence=0.5)
        pc.log_reasoning_step(tenant_id, session_id, indicator_no=1, step_index=0, content="step0")

        assert pc.get_completed_indicator_numbers(tenant_id, session_id) == {(1, ""), (2, "")}

        results = pc.get_indicator_results(tenant_id, session_id)
        r1 = next(r for r in results if r["indicator_no"] == 1)
        assert r1["score"] == 4.0, "upsert (ON CONFLICT) should overwrite, not duplicate"
        assert r1["justification"] == "j1-updated"
        assert r1["model"] == "deepseek-r1:32b"
        assert r1["sources_used"] == {"led_chunks": [{"page": 3}], "lkps_tables": [], "evidence_documents": []}

        pc.update_session_status(tenant_id, session_id, "completed", completed_indicators=2)
        sess2 = pc.get_session(tenant_id, session_id)
        assert sess2["status"] == "completed"
        assert sess2["completed_indicators"] == 2

        quality = {
            "scores": {"faithfulness": 0.9, "context_recall": 0.5},
            "per_indicator": [{"indicator_no": 1, "context_recall": 0.5, "faithfulness": 0.9}],
            "total_chunks": 4,
            "model": "deepseek-r1:32b",
            "finished_at": "2026-09-02T00:00:00+00:00",
        }
        pc.save_session_quality(tenant_id, session_id, quality)
        with conn.cursor() as cur:
            cur.execute("SELECT kualitas FROM assessment_sessions WHERE id = %s", (session_id,))
            assert cur.fetchone()["kualitas"] == quality, "overwritten in place, not appended"

        sessions = pc.list_sessions(limit=50)
        found = next(s for s in sessions if s["session_id"] == session_id)
        assert found["avg_score"] == 3.0  # (4.0 + 2.0) / 2
    finally:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM assessment_sessions WHERE id = %s", (session_id,))


def test_get_session_returns_none_for_unknown_id(fixture_ids):
    import db.postgres_client as pc

    assert pc.get_session(fixture_ids["tenant_id"], "does-not-exist") is None


def test_get_completed_indicator_numbers_empty_for_unknown_session():
    import db.postgres_client as pc

    assert pc.get_completed_indicator_numbers(None, "does-not-exist") == set()


def test_get_document_accreditation_set_none_when_unset(fixture_ids):
    import db.postgres_client as pc

    assert pc.get_document_accreditation_set(fixture_ids["dokumen_id"]) is None


def test_get_rubric_criteria_for_set(fixture_ids, conn):
    import db.postgres_client as pc

    tenant_id = fixture_ids["tenant_id"]
    set_id = f"test-set-{uuid.uuid4().hex[:8]}"
    criterion_id = f"test-criterion-{uuid.uuid4().hex[:8]}"
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO accreditation_sets (id, tenant_id, nama, lembaga, tahun_siklus, status, updated_at)
                VALUES (%s, %s, %s, %s, %s, 'SIAP', now())
                """,
                (set_id, tenant_id, "Test Set", "Test Lembaga", 2026),
            )
            cur.execute(
                """
                INSERT INTO rubric_criteria
                    (id, accreditation_set_id, indicator_no, criterion_code, criterion_group,
                     description, score_type, lkps_table_refs, formula, sub_score_formula)
                VALUES (%s, %s, 1, 'C1', 'Kelompok A', 'Indikator uji komposit',
                        'KOMPOSIT', %s, NULL, '((I x 2) + II) / 3')
                """,
                (criterion_id, set_id, ["Tabel 1"]),
            )
            cur.execute(
                "INSERT INTO rubric_levels (id, criterion_id, score, description) VALUES (%s, %s, 4, %s)",
                (f"{criterion_id}-lvl4", criterion_id, "Sangat baik"),
            )
            cur.execute(
                "INSERT INTO rubric_levels (id, criterion_id, score, description) VALUES (%s, %s, 0, %s)",
                (f"{criterion_id}-lvl0", criterion_id, "Tidak ada"),
            )
            cur.execute(
                "UPDATE writing_led_documents SET accreditation_set_id = %s WHERE id = %s",
                (set_id, fixture_ids["dokumen_id"]),
            )

        assert pc.get_document_accreditation_set(fixture_ids["dokumen_id"]) == set_id

        rubrics = pc.get_rubric_criteria_for_set(tenant_id, set_id)
        assert len(rubrics) == 1
        r = rubrics[0]
        assert r.no == 1
        assert r.kriteria == "Kelompok A"
        assert r.indikator == "Indikator uji komposit"
        # Enum comes back translated to the lowercase English vocabulary the
        # LLM prompt/tests were built against, not the Postgres KOMPOSIT literal.
        assert r.score_type == "composite"
        assert r.score_criteria == {4: "Sangat baik", 0: "Tidak ada"}
        assert r.formula is None
        assert r.sub_score_formula == "((I x 2) + II) / 3"
        assert r.lkps_table_ref == ["Tabel 1"]

        assert pc.get_rubric_criteria_for_set(tenant_id, "does-not-exist") == []
    finally:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE writing_led_documents SET accreditation_set_id = NULL WHERE id = %s",
                (fixture_ids["dokumen_id"],),
            )
            cur.execute("DELETE FROM rubric_levels WHERE criterion_id = %s", (criterion_id,))
            cur.execute("DELETE FROM rubric_criteria WHERE id = %s", (criterion_id,))
            cur.execute("DELETE FROM accreditation_sets WHERE id = %s", (set_id,))


def _staged_nodes_fixture():
    """2 bab, "Laporan Evaluasi Diri" (2) has 2 sub-bab, "Kriteria" (2.2) has
    2 sub-sub-bab -- enough depth to exercise cascade-exclusion."""
    return [
        {"id": "1", "parent_id": None, "level": 1, "order": 1, "title": "Pendahuluan", "guidance": None},
        {"id": "2", "parent_id": None, "level": 1, "order": 2, "title": "Laporan Evaluasi Diri", "guidance": None},
        {"id": "2.1", "parent_id": "2", "level": 2, "order": 1, "title": "Rasional", "guidance": "G1"},
        {"id": "2.2", "parent_id": "2", "level": 2, "order": 2, "title": "Kriteria", "guidance": "G2"},
        {"id": "2.2.1", "parent_id": "2.2", "level": 3, "order": 1, "title": "Diferensiasi Misi", "guidance": "G3"},
        {"id": "2.2.2", "parent_id": "2.2", "level": 3, "order": 2, "title": "Akuntabilitas", "guidance": "G4"},
    ]


def test_confirm_structure_staging_commits_only_accepted_nodes(fixture_ids, conn):
    import db.postgres_client as pc

    tenant_id = fixture_ids["tenant_id"]
    guide_id = f"test-guide-{uuid.uuid4().hex[:8]}"
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO guide_references (id, tenant_id, type, title, file_url, file_type)
                VALUES (%s, %s, 'PANDUAN_LAM', %s, %s, 'pdf')
                """,
                (guide_id, tenant_id, "Test Panduan", "test/panduan.pdf"),
            )

        pc.save_structure_staging(tenant_id, guide_id, _staged_nodes_fixture())

        with conn.cursor() as cur:
            cur.execute(
                "SELECT structure_parse_status, structure_staging FROM guide_references WHERE id = %s",
                (guide_id,),
            )
            row = cur.fetchone()
        assert row["structure_parse_status"] == "MENUNGGU_KONFIRMASI"
        assert len(row["structure_staging"]) == 6

        preview = pc.get_structure_preview(tenant_id, guide_id)
        assert preview["status"] == "MENUNGGU_KONFIRMASI"
        assert len(preview["nodes"]) == 6

        # Accept everything under "Laporan Evaluasi Diri" EXCEPT "Kriteria"
        # (2.2) -- its checked children (2.2.1/2.2.2) stay, hung off the nearest
        # checked ancestor (dimas confirm_panduan keeps every checked node).
        # Drop "Pendahuluan" (1) outright.
        accepted = {"2", "2.1", "2.2.1", "2.2.2"}
        count = pc.confirm_structure_staging(tenant_id, guide_id, accepted)
        assert count == 1  # 1 top-level chapter kept ("Laporan Evaluasi Diri")

        with conn.cursor() as cur:
            cur.execute(
                "SELECT title FROM chapter_templates WHERE guide_id = %s", (guide_id,)
            )
            assert [r["title"] for r in cur.fetchall()] == ["Laporan Evaluasi Diri"]

            cur.execute(
                """SELECT sb.title FROM sub_bab_templates sb
                   JOIN chapter_templates ct ON ct.id = sb.chapter_template_id
                   WHERE ct.guide_id = %s ORDER BY sb.title""",
                (guide_id,),
            )
            # "Kriteria" itself is gone; its checked children moved up under the BAB.
            assert [r["title"] for r in cur.fetchall()] == ["Akuntabilitas", "Diferensiasi Misi", "Rasional"]

            cur.execute(
                "SELECT structure_parse_status, structure_staging FROM guide_references WHERE id = %s",
                (guide_id,),
            )
            row = cur.fetchone()
        assert row["structure_parse_status"] == "SIAP"
        assert row["structure_staging"] is None
    finally:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM guide_references WHERE id = %s", (guide_id,))


def test_confirm_and_preview_keep_levels_beyond_three(fixture_ids, conn):
    """dimas: every Panduan node is a section at any depth -- confirm must commit level 4/5 and the
    committed preview must report their real depth."""
    import db.postgres_client as pc

    tenant_id = fixture_ids["tenant_id"]
    guide_id = f"test-guide-{uuid.uuid4().hex[:8]}"
    nodes = [
        {"id": "1", "parent_id": None, "level": 1, "order": 1, "title": "BAB", "guidance": None},
        {"id": "1.1", "parent_id": "1", "level": 2, "order": 1, "title": "A", "guidance": "g2"},
        {"id": "1.1.1", "parent_id": "1.1", "level": 3, "order": 1, "title": "A.1", "guidance": "g3"},
        {"id": "1.1.1.1", "parent_id": "1.1.1", "level": 4, "order": 1, "title": "Satu", "guidance": "g4"},
        {"id": "1.1.1.1.1", "parent_id": "1.1.1.1", "level": 5, "order": 1, "title": "a", "guidance": "g5"},
    ]
    try:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO guide_references (id, tenant_id, type, title, file_url, file_type)
                   VALUES (%s, %s, 'PANDUAN_LAM', 'Test Panduan', 'test/p.pdf', 'pdf')""",
                (guide_id, tenant_id),
            )
        pc.save_structure_staging(tenant_id, guide_id, nodes)
        pc.confirm_structure_staging(tenant_id, guide_id, {n["id"] for n in nodes})

        preview = pc.get_structure_preview(tenant_id, guide_id)
        assert sorted((n["title"], n["level"]) for n in preview["nodes"]) == [
            ("A", 2), ("A.1", 3), ("BAB", 1), ("Satu", 4), ("a", 5),
        ]
    finally:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM sub_bab_templates WHERE chapter_template_id IN "
                "(SELECT id FROM chapter_templates WHERE guide_id = %s)", (guide_id,),
            )
            cur.execute("DELETE FROM chapter_templates WHERE guide_id = %s", (guide_id,))
            cur.execute("DELETE FROM guide_references WHERE id = %s", (guide_id,))


def test_confirm_structure_staging_rejects_when_not_pending(fixture_ids, conn):
    import db.postgres_client as pc

    tenant_id = fixture_ids["tenant_id"]
    guide_id = f"test-guide-{uuid.uuid4().hex[:8]}"
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO guide_references (id, tenant_id, type, title, file_url, file_type)
                VALUES (%s, %s, 'PANDUAN_LAM', %s, %s, 'pdf')
                """,
                (guide_id, tenant_id, "Test Panduan", "test/panduan.pdf"),
            )
        with pytest.raises(ValueError):
            pc.confirm_structure_staging(tenant_id, guide_id, {"1"})
    finally:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM guide_references WHERE id = %s", (guide_id,))


def test_reference_guide_reusable_across_accreditation_sets(fixture_ids, conn):
    """The whole point of gap #1: one committed Panduan (guide_references +
    its chapter_templates) can be pointed at by many AccreditationSet rows
    at once via AccreditationSet.panduanId -- no per-set copy needed."""
    import db.postgres_client as pc

    tenant_id = fixture_ids["tenant_id"]
    guide_id = f"test-guide-{uuid.uuid4().hex[:8]}"
    set_a = f"test-set-a-{uuid.uuid4().hex[:8]}"
    set_b = f"test-set-b-{uuid.uuid4().hex[:8]}"
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO guide_references (id, tenant_id, type, title, file_url, file_type)
                VALUES (%s, %s, 'PANDUAN_LAM', %s, %s, 'pdf')
                """,
                (guide_id, tenant_id, "Shared Panduan", "test/panduan.pdf"),
            )
            for set_id, nama in ((set_a, "Set A"), (set_b, "Set B")):
                cur.execute(
                    """
                    INSERT INTO accreditation_sets
                        (id, tenant_id, nama, lembaga, tahun_siklus, status, panduan_id, updated_at)
                    VALUES (%s, %s, %s, %s, 2026, 'SIAP', %s, now())
                    """,
                    (set_id, tenant_id, nama, "Test Lembaga", guide_id),
                )

        pc.save_structure_staging(tenant_id, guide_id, _staged_nodes_fixture())
        pc.confirm_structure_staging(tenant_id, guide_id, {"1", "2", "2.1", "2.2", "2.2.1", "2.2.2"})

        assert pc.get_reference_guide_tenant(guide_id) == tenant_id

        # Both sets resolve to the SAME committed structure -- one commit,
        # two consumers, no duplication.
        for set_id in (set_a, set_b):
            with conn.cursor() as cur:
                cur.execute("SELECT panduan_id FROM accreditation_sets WHERE id = %s", (set_id,))
                assert cur.fetchone()["panduan_id"] == guide_id
            struktur = pc.get_structure_preview(tenant_id, guide_id)
            assert struktur["status"] == "SIAP"
            assert len(struktur["nodes"]) == 6
    finally:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM accreditation_sets WHERE id IN (%s, %s)", (set_a, set_b))
            cur.execute("DELETE FROM guide_references WHERE id = %s", (guide_id,))


def test_get_chapter_template_subbab_excludes_inactive_nodes(fixture_ids, conn):
    """gap #2: toggling SubBabTemplate.isActive off excludes that node (and,
    since it's no longer in `rows` for a child to attach under, everything
    beneath it) from future outline generation -- without touching
    ChapterTemplate/committed data or re-extracting anything."""
    import db.generation_client as gc
    import db.postgres_client as pc

    tenant_id = fixture_ids["tenant_id"]
    guide_id = f"test-guide-{uuid.uuid4().hex[:8]}"
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO guide_references (id, tenant_id, type, title, file_url, file_type)
                VALUES (%s, %s, 'PANDUAN_LAM', %s, %s, 'pdf')
                """,
                (guide_id, tenant_id, "Test Panduan", "test/panduan.pdf"),
            )
        pc.save_structure_staging(tenant_id, guide_id, _staged_nodes_fixture())
        pc.confirm_structure_staging(tenant_id, guide_id, {"1", "2", "2.1", "2.2", "2.2.1", "2.2.2"})

        struktur = gc.get_chapter_template_subbab(tenant_id, guide_id, 2)
        assert {s["title"] for s in struktur} == {"Rasional", "Kriteria"}

        with conn.cursor() as cur:
            cur.execute(
                "UPDATE sub_bab_templates SET is_active = false WHERE title = 'Kriteria'"
            )

        struktur = gc.get_chapter_template_subbab(tenant_id, guide_id, 2)
        # "Kriteria" gone, and its 2 children ("Diferensiasi Misi"/"Akuntabilitas")
        # went with it -- they'd have nothing to attach under.
        assert {s["title"] for s in struktur} == {"Rasional"}
    finally:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM guide_references WHERE id = %s", (guide_id,))


def test_lkps_needed_and_list_survive_confirm_and_outline_copy(fixture_ids, conn):
    """Port of Dimas 140d8ae: lkps_needed/lkps_list (from
    ingestion.panduan_chunker.detect_lkps) must flow staging -> committed
    SubBabTemplate -> outline-copied ChapterSection unchanged."""
    import db.generation_client as gc
    import db.postgres_client as pc

    tenant_id = fixture_ids["tenant_id"]
    guide_id = f"test-guide-{uuid.uuid4().hex[:8]}"
    chapter_id = f"test-chapter-{uuid.uuid4().hex[:8]}"
    staged = [
        {"id": "1", "parent_id": None, "level": 1, "order": 1, "title": "Laporan Evaluasi Diri",
         "guidance": None, "lkps_needed": False, "lkps_list": []},
        {"id": "1.1", "parent_id": "1", "level": 2, "order": 1, "title": "Rasional",
         "guidance": "Butuh Tabel 2a LKPS.", "lkps_needed": True, "lkps_list": ["2a"]},
        {"id": "1.2", "parent_id": "1", "level": 2, "order": 2, "title": "Peran Evaluasi Diri",
         "guidance": "Naratif murni.", "lkps_needed": False, "lkps_list": []},
    ]
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO guide_references (id, tenant_id, type, title, file_url, file_type)
                VALUES (%s, %s, 'PANDUAN_LAM', %s, %s, 'pdf')
                """,
                (guide_id, tenant_id, "Test Panduan", "test/panduan.pdf"),
            )
        pc.save_structure_staging(tenant_id, guide_id, staged)
        pc.confirm_structure_staging(tenant_id, guide_id, {"1", "1.1", "1.2"})

        struktur = gc.get_chapter_template_subbab(tenant_id, guide_id, 1)
        by_title = {s["title"]: s for s in struktur}
        assert by_title["Rasional"]["lkps_needed"] is True
        assert by_title["Rasional"]["lkps_list"] == ["2a"]
        assert by_title["Peran Evaluasi Diri"]["lkps_needed"] is False
        assert by_title["Peran Evaluasi Diri"]["lkps_list"] == []

        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO writing_document_chapters
                       (id, document_id, chapter_order, chapter_title, working_content, last_saved_at)
                   VALUES (%s, %s, 1, 'Bab 1', '{}'::jsonb, NOW())""",
                (chapter_id, fixture_ids["dokumen_id"]),
            )
        sections = [
            {"title": s["title"], "guidance": s["guidance"] or "", "lkps_needed": s["lkps_needed"],
             "lkps_list": s["lkps_list"], "subseksi": []}
            for s in struktur
        ]
        created = gc.create_chapter_sections(tenant_id, chapter_id, sections)
        by_title_section = {s["title"]: s for s in created}
        assert by_title_section["Rasional"]["lkps_needed"] is True
        assert by_title_section["Rasional"]["lkps_list"] == ["2a"]
        assert by_title_section["Peran Evaluasi Diri"]["lkps_needed"] is False
    finally:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM writing_chapter_sections WHERE chapter_id = %s", (chapter_id,))
            cur.execute("DELETE FROM writing_document_chapters WHERE id = %s", (chapter_id,))
            cur.execute("DELETE FROM guide_references WHERE id = %s", (guide_id,))


def test_judge_columns_roundtrip_stale_guard_and_rescore_clears_verdict(fixture_ids, conn):
    import db.postgres_client as pc

    tenant_id = fixture_ids["tenant_id"]
    session_id = str(uuid.uuid4())
    pc.create_session(
        session_id,
        tenant_id=tenant_id,
        dokumen_id=fixture_ids["dokumen_id"],
        created_by_user_id=fixture_ids["user_id"],
        total_indicators=1,
    )

    def _kolom():
        return [
            (r["indicator_no"], r["sub_no"], r["justification"], r["judge_evidence"], r["judge_verdict"])
            for r in pc.get_judge_rows(tenant_id, session_id)
        ]

    try:
        pc.log_indicator_result(
            tenant_id, session_id, indicator_no=1, score=3.0, justification="klaim A", confidence=0.9,
            judge_evidence="bukti A",
        )
        assert _kolom() == [(1, "", "klaim A", "bukti A", None)]

        assert pc.set_judge_verdict(tenant_id, session_id, 1, "", "klaim A", {"grounded": True}) is True
        assert _kolom()[0][4] == {"grounded": True}

        # penilaian ulang terjadi saat judge berjalan: justifikasi sudah berganti -> verdict kedaluwarsa ditolak
        assert pc.set_judge_verdict(tenant_id, session_id, 1, "", "klaim LAIN", {"grounded": False}) is False
        assert _kolom()[0][4] == {"grounded": True}

        # penilaian ulang mengosongkan verdict dan mengganti bukti (bukti kosong "" tetap "", bukan NULL)
        pc.log_indicator_result(
            tenant_id, session_id, indicator_no=1, score=2.0, justification="klaim B", confidence=0.8,
            judge_evidence="",
        )
        assert _kolom() == [(1, "", "klaim B", "", None)]

        # jalur galat: tanpa bukti -> NULL
        pc.log_indicator_result(
            tenant_id, session_id, indicator_no=1, score=None, justification=None, confidence=None, error="gagal",
        )
        assert _kolom()[0][3] is None
    finally:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM assessment_sessions WHERE id = %s", (session_id,))


def test_get_rubric_criteria_by_code_returns_levels(fixture_ids, conn):
    import db.postgres_client as pc

    tenant_id = fixture_ids["tenant_id"]
    set_id = f"test-set-{uuid.uuid4().hex[:8]}"
    criterion_id = f"test-criterion-{uuid.uuid4().hex[:8]}"
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO accreditation_sets (id, tenant_id, nama, lembaga, tahun_siklus, status, updated_at)
                VALUES (%s, %s, %s, %s, %s, 'SIAP', now())
                """,
                (set_id, tenant_id, "Test Set", "Test Lembaga", 2026),
            )
            cur.execute(
                """
                INSERT INTO rubric_criteria
                    (id, accreditation_set_id, indicator_no, criterion_code, criterion_group,
                     description, score_type, lkps_table_refs, formula, sub_score_formula)
                VALUES (%s, %s, 9, '9', 'Kelompok A', 'Indikator uji', 'KUANTITATIF', %s, '(2 x BOP) / 5.000.000', NULL)
                """,
                (criterion_id, set_id, ["Tabel 1"]),
            )
            cur.execute(
                "INSERT INTO rubric_levels (id, criterion_id, score, description) VALUES (%s, %s, 4, %s)",
                (f"{criterion_id}-lvl4", criterion_id, "Sangat baik"),
            )

        baris = pc.get_rubric_criteria_by_code(tenant_id, set_id, "9")
        assert baris == [
            {
                "criterion_code": "9",
                "description": "Indikator uji",
                "score_type": "KUANTITATIF",
                "formula": "(2 x BOP) / 5.000.000",
                "sub_score_formula": None,
                "levels": {4: "Sangat baik"},
            }
        ]
        assert pc.get_rubric_criteria_by_code(tenant_id, set_id, "tidak-ada") == []
    finally:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM rubric_levels WHERE criterion_id = %s", (criterion_id,))
            cur.execute("DELETE FROM rubric_criteria WHERE id = %s", (criterion_id,))
            cur.execute("DELETE FROM accreditation_sets WHERE id = %s", (set_id,))
