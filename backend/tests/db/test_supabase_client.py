"""Unit tests for db.supabase_client — all Supabase I/O is mocked."""

from __future__ import annotations

import os
from unittest.mock import MagicMock, call, patch

import pytest


# ── Fixtures ─────────────────────────────────────────────────────────────────


@pytest.fixture(autouse=True)
def reset_supabase_singleton():
    """Force get_supabase() to re-create the singleton for each test."""
    import db.supabase_client as sc
    sc._client = None
    yield
    sc._client = None


@pytest.fixture()
def fake_sb():
    """A MagicMock that mimics supabase.Client's fluent builder API."""
    sb = MagicMock()
    # Default chain: .table(...).insert(...).execute() etc. returns a MagicMock
    return sb


# ── get_supabase ──────────────────────────────────────────────────────────────


def test_get_supabase_raises_when_env_missing():
    import db.supabase_client as sc

    # Patch create_client so the env check runs before any network call
    with (
        patch("db.supabase_client.create_client", MagicMock()),
        patch.dict(os.environ, {}, clear=True),
    ):
        with pytest.raises(RuntimeError, match="SUPABASE_URL"):
            sc.get_supabase()


def test_get_supabase_creates_client_from_env():
    import db.supabase_client as sc

    fake_client = MagicMock()
    with (
        patch.dict(os.environ, {"SUPABASE_URL": "https://x.supabase.co", "SUPABASE_SERVICE_ROLE_KEY": "secret"}),
        patch("db.supabase_client.create_client", return_value=fake_client) as mock_create,
    ):
        client = sc.get_supabase()

    mock_create.assert_called_once_with("https://x.supabase.co", "secret")
    assert client is fake_client


def test_get_supabase_returns_same_singleton():
    import db.supabase_client as sc

    fake_client = MagicMock()
    with (
        patch.dict(os.environ, {"SUPABASE_URL": "https://x.supabase.co", "SUPABASE_SERVICE_ROLE_KEY": "s"}),
        patch("db.supabase_client.create_client", return_value=fake_client),
    ):
        c1 = sc.get_supabase()
        c2 = sc.get_supabase()

    assert c1 is c2


# ── create_session ────────────────────────────────────────────────────────────


def test_create_session_inserts_correct_payload(fake_sb):
    from db.supabase_client import create_session

    with patch("db.supabase_client.get_supabase", return_value=fake_sb):
        create_session("sess-1", "/tmp/laporan.xlsx", 78)

    fake_sb.table.assert_called_with("assessment_sessions")
    fake_sb.table().insert.assert_called_once_with(
        {
            "session_id": "sess-1",
            "laporan_path": "/tmp/laporan.xlsx",
            "total_indicators": 78,
            "completed_indicators": 0,
            "status": "running",
        }
    )
    fake_sb.table().insert().execute.assert_called_once()


def test_create_session_swallows_exception(fake_sb):
    """Exceptions must be caught and logged, not re-raised."""
    from db.supabase_client import create_session

    fake_sb.table.side_effect = RuntimeError("network error")

    with patch("db.supabase_client.get_supabase", return_value=fake_sb):
        create_session("sess-err", "/tmp/x.xlsx", 1)  # must not raise


# ── update_session_status ─────────────────────────────────────────────────────


def test_update_session_status_minimal(fake_sb):
    from db.supabase_client import update_session_status

    with patch("db.supabase_client.get_supabase", return_value=fake_sb):
        update_session_status("sess-1", "completed")

    fake_sb.table().update.assert_called_once_with({"status": "completed"})
    fake_sb.table().update().eq.assert_called_once_with("session_id", "sess-1")


def test_update_session_status_with_completed_indicators(fake_sb):
    from db.supabase_client import update_session_status

    with patch("db.supabase_client.get_supabase", return_value=fake_sb):
        update_session_status("sess-1", "running", completed_indicators=10)

    fake_sb.table().update.assert_called_once_with(
        {"status": "running", "completed_indicators": 10}
    )


def test_update_session_status_with_error(fake_sb):
    from db.supabase_client import update_session_status

    with patch("db.supabase_client.get_supabase", return_value=fake_sb):
        update_session_status("sess-1", "failed", error="LLM timeout")

    fake_sb.table().update.assert_called_once_with(
        {"status": "failed", "error": "LLM timeout"}
    )


def test_update_session_status_swallows_exception(fake_sb):
    from db.supabase_client import update_session_status

    fake_sb.table.side_effect = Exception("DB down")
    with patch("db.supabase_client.get_supabase", return_value=fake_sb):
        update_session_status("sess-x", "failed")  # must not raise


# ── log_indicator_result ──────────────────────────────────────────────────────


def test_log_indicator_result_upserts_correct_payload(fake_sb):
    from db.supabase_client import log_indicator_result

    with patch("db.supabase_client.get_supabase", return_value=fake_sb):
        log_indicator_result(
            session_id="sess-1",
            indicator_no=5,
            score=3.0,
            justification="Sangat baik.",
            confidence=0.9,
            recommendation="Pertahankan capaian ini.",
        )

    fake_sb.table.assert_called_with("indicator_results")
    fake_sb.table().upsert.assert_called_once_with(
        {
            "session_id": "sess-1",
            "indicator_no": 5,
            "score": 3.0,
            "justification": "Sangat baik.",
            "confidence": 0.9,
            "recommendation": "Pertahankan capaian ini.",
            "error": None,
        }
    )


def test_log_indicator_result_recommendation_defaults_to_none(fake_sb):
    from db.supabase_client import log_indicator_result

    with patch("db.supabase_client.get_supabase", return_value=fake_sb):
        log_indicator_result(
            session_id="sess-1",
            indicator_no=6,
            score=2.0,
            justification="Perlu ditingkatkan.",
            confidence=0.6,
        )

    call_arg = fake_sb.table().upsert.call_args[0][0]
    assert call_arg["recommendation"] is None


def test_log_indicator_result_with_error_payload(fake_sb):
    from db.supabase_client import log_indicator_result

    with patch("db.supabase_client.get_supabase", return_value=fake_sb):
        log_indicator_result(
            session_id="sess-1",
            indicator_no=3,
            score=None,
            justification=None,
            confidence=None,
            error="Ollama timeout",
        )

    call_arg = fake_sb.table().upsert.call_args[0][0]
    assert call_arg["score"] is None
    assert call_arg["error"] == "Ollama timeout"


def test_log_indicator_result_swallows_exception(fake_sb):
    from db.supabase_client import log_indicator_result

    fake_sb.table.side_effect = RuntimeError("bad")
    with patch("db.supabase_client.get_supabase", return_value=fake_sb):
        log_indicator_result("s", 1, None, None, None)  # must not raise


# ── log_reasoning_step ────────────────────────────────────────────────────────


def test_log_reasoning_step_inserts_correct_payload(fake_sb):
    from db.supabase_client import log_reasoning_step

    with patch("db.supabase_client.get_supabase", return_value=fake_sb):
        log_reasoning_step(
            session_id="sess-1",
            indicator_no=7,
            step_index=2,
            content="Agent calls get_indicator_rubric(7).",
        )

    fake_sb.table.assert_called_with("reasoning_steps")
    fake_sb.table().insert.assert_called_once_with(
        {
            "session_id": "sess-1",
            "indicator_no": 7,
            "step_index": 2,
            "content": "Agent calls get_indicator_rubric(7).",
        }
    )


def test_log_reasoning_step_swallows_exception(fake_sb):
    from db.supabase_client import log_reasoning_step

    fake_sb.table.side_effect = Exception("network")
    with patch("db.supabase_client.get_supabase", return_value=fake_sb):
        log_reasoning_step("s", 1, 0, "step")  # must not raise
