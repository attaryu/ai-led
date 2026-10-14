"""Tests for POST /assessment/{session_id}/judge and GET /assessment/judge/{judge_id}.

Semua I/O dipatch di tingkat fungsi (db.postgres_client.* sebagaimana diimpor ke
api.routes.assessment_judge, dan run_judge); TestClient menunggu BackgroundTasks selesai
sebelum mengembalikan respons, jadi status akhir bisa langsung dibaca.
"""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

GROUNDED = {"grounded": True, "hallucinated_claims": [], "missing_facts": [], "notes": "ok"}


def _row(no, sub="", *, score=3.0, error=None, evidence="bukti", verdict=None):
    return {
        "indicator_no": no,
        "sub_no": sub,
        "score": score,
        "justification": f"klaim {no}",
        "error": error,
        "judge_evidence": evidence,
        "judge_verdict": verdict,
    }


@pytest.fixture()
def env():
    rows: list[dict] = []
    with (
        patch("api.routes.assessment_judge.get_session", return_value={"tenant_id": "t1", "session_id": "s1"}),
        patch("api.routes.assessment_judge.get_judge_rows", side_effect=lambda tenant_id, session_id: rows),
        patch("api.routes.assessment_judge._judge_model_name", return_value="judge-model"),
        patch("api.routes.assessment_judge.run_judge", return_value=dict(GROUNDED)) as run_judge,
        patch("api.routes.assessment_judge.set_judge_verdict", return_value=True) as set_verdict,
    ):
        yield SimpleNamespace(rows=rows, run_judge=run_judge, set_verdict=set_verdict)


def _post(body):
    from main import app

    with TestClient(app) as c:
        resp = c.post("/assessment/s1/judge", json=body)
        status = c.get(f"/assessment/judge/{resp.json()['judge_id']}").json() if resp.status_code == 200 else None
    return resp, status


def test_session_wide_skips_unjudgeable_and_already_judged_rows(env):
    env.rows.extend(
        [
            _row(1),
            _row(2, verdict={"grounded": True}),  # sudah dijudge: bukan total, bukan skipped
            _row(3, evidence=None),  # sesi lama
            _row(4, score=None),  # tidak ada skor
            _row(5, evidence=""),  # bukti kosong yang sah: HARUS dijudge
            _row(6, error="gagal"),
        ]
    )

    resp, status = _post({})

    assert resp.status_code == 200
    assert resp.json()["total"] == 2
    assert resp.json()["skipped"] == 3
    assert {c.args for c in env.run_judge.call_args_list} == {("klaim 1", "bukti"), ("klaim 5", "")}
    assert status["status"] == "completed"
    assert (status["done"], status["failed"], status["skipped"], status["total"]) == (2, 0, 3, 2)
    assert status["session_id"] == "s1"


def test_stored_verdict_carries_model_and_timestamp(env):
    env.rows.append(_row(1, "I"))

    _post({})

    (args,) = [c.args for c in env.set_verdict.call_args_list]
    assert args[:5] == ("t1", "s1", 1, "I", "klaim 1")
    stored = args[5]
    assert stored["grounded"] is True
    assert stored["judge_model"] == "judge-model"
    assert stored["judged_at"].endswith("+00:00")


def test_explicit_list_reruns_an_already_judged_row_and_ignores_the_rest(env):
    env.rows.extend([_row(1), _row(2, verdict={"grounded": False})])

    resp, status = _post({"indicators": [{"indicator_no": 2, "sub_no": ""}]})

    assert resp.json()["total"] == 1
    assert [c.args for c in env.run_judge.call_args_list] == [("klaim 2", "bukti")]
    assert status["done"] == 1


def test_explicit_list_counts_unknown_indicators_as_skipped(env):
    env.rows.append(_row(1))

    resp, _ = _post({"indicators": [{"indicator_no": 1}, {"indicator_no": 99, "sub_no": "II"}]})

    assert (resp.json()["total"], resp.json()["skipped"]) == (1, 1)


def test_judge_error_is_not_persisted_and_counts_as_failed(env):
    env.rows.append(_row(1))
    env.run_judge.return_value = {"error": "judge unreachable"}

    _, status = _post({})

    env.set_verdict.assert_not_called()
    assert (status["done"], status["failed"]) == (1, 1)
    assert status["status"] == "completed"


def test_stale_verdict_rejected_by_the_justification_guard_counts_as_failed(env):
    env.rows.append(_row(1))
    env.set_verdict.return_value = False  # dinilai ulang saat judge berjalan

    _, status = _post({})

    assert (status["done"], status["failed"]) == (1, 1)


@pytest.mark.parametrize("raw", ["abc", "0", "-3"])
def test_malformed_or_non_positive_parallelism_still_completes(env, monkeypatch, raw):
    # "abc" -> fallback 5; "0"/"-3" -> dijepit ke 1 (Semaphore(0) akan menggantung selamanya).
    monkeypatch.setenv("ASSESSMENT_MAX_PARALLEL", raw)
    env.rows.extend([_row(1), _row(2), _row(3)])

    _, status = _post({})

    assert status["status"] == "completed"
    assert (status["total"], status["done"], status["failed"]) == (3, 3, 0)


def test_failure_outside_judge_one_marks_the_run_failed_not_running(env):
    env.rows.append(_row(1))

    def boom(*coros, **kwargs):
        for c in coros:
            c.close()
        raise RuntimeError("boom")

    with patch("api.routes.assessment_judge.asyncio.gather", side_effect=boom):
        _, status = _post({})

    assert status["status"] == "failed"
    assert status["error"] == "boom"


def test_setup_failure_marks_the_run_failed_not_running(env):
    # Setup (semaphore/loop) kini di dalam try: galat di sana tidak boleh meninggalkan 'running'.
    env.rows.append(_row(1))

    with patch("api.routes.assessment_judge.asyncio.Semaphore", side_effect=RuntimeError("setup rusak")):
        _, status = _post({})

    assert status["status"] == "failed"
    assert status["error"] == "setup rusak"


def test_session_with_only_old_rows_completes_immediately_without_calling_the_judge(env):
    env.rows.extend([_row(1, evidence=None), _row(2, evidence=None)])

    resp, status = _post({})

    assert (resp.json()["total"], resp.json()["skipped"]) == (0, 2)
    env.run_judge.assert_not_called()
    assert status["status"] == "completed"


def test_unknown_session_returns_404():
    from main import app

    with patch("api.routes.assessment_judge.get_session", return_value=None):
        with TestClient(app) as c:
            resp = c.post("/assessment/nope/judge", json={})

    assert resp.status_code == 404


def test_unknown_judge_id_returns_404():
    from main import app

    with TestClient(app) as c:
        assert c.get("/assessment/judge/tidak-ada").status_code == 404
