"""Regression test for worker.py::_handle_assessment_ami -- was crashing with
"_run_assessment_pipeline() missing 1 required positional argument:
'accreditation_set_id'" because this BullMQ job path never resolved/passed
it, unlike api/routes/assessment.py's /start and /resume HTTP routes. All
Postgres/agent/redis dependencies are mocked; no real infra needed.
"""

from __future__ import annotations

import asyncio
import contextlib
from unittest.mock import AsyncMock, MagicMock, patch


def _fake_job(dokumen_id="doc-1", tenant_id="tenant-1", user_id="user-1"):
    job = MagicMock()
    job.id = "job-1"
    job.data = {"dokumenId": dokumen_id, "tenantId": tenant_id, "createdByUserId": user_id}
    return job


def _fake_rubric(no=1, kriteria="Kriteria 1"):
    rubric = MagicMock()
    rubric.no = no
    rubric.kriteria = kriteria
    return rubric


def _run(job, accreditation_set_id="set-1", rubrics=None, **overrides):
    run_pipeline = AsyncMock()
    redis_client = MagicMock()
    redis_client.get = AsyncMock(return_value=None)
    redis_client.aclose = AsyncMock()

    defaults = dict(
        set_lkps_registry=MagicMock(),
        _get_rubrics_for_set=MagicMock(return_value=rubrics if rubrics is not None else [_fake_rubric()]),
        _run_assessment_pipeline=run_pipeline,
        _doc_dir=MagicMock(return_value="/nonexistent/doc/dir"),
        create_session=MagicMock(),
        get_document_accreditation_set=MagicMock(return_value=accreditation_set_id),
        get_session=MagicMock(return_value={
            "status": "completed", "total_indicators": 1, "completed_indicators": 1,
        }),
    )
    defaults.update(overrides)

    from worker import _handle_assessment_ami

    with contextlib.ExitStack() as stack:
        stack.enter_context(patch("agent.tools.lkps_tool.set_lkps_registry", defaults["set_lkps_registry"]))
        stack.enter_context(patch("agent.tools.rubric_tool._get_rubrics_for_set", defaults["_get_rubrics_for_set"]))
        stack.enter_context(patch("api.routes.assessment._run_assessment_pipeline", defaults["_run_assessment_pipeline"]))
        stack.enter_context(patch("api.routes.upload._doc_dir", defaults["_doc_dir"]))
        stack.enter_context(patch("db.postgres_client.create_session", defaults["create_session"]))
        stack.enter_context(patch("db.postgres_client.get_document_accreditation_set", defaults["get_document_accreditation_set"]))
        stack.enter_context(patch("db.postgres_client.get_session", defaults["get_session"]))
        stack.enter_context(patch("redis.asyncio.from_url", return_value=redis_client))
        result = asyncio.run(_handle_assessment_ami(job))

    return result, {**defaults, "run_pipeline": run_pipeline}


def test_passes_accreditation_set_id_through_to_the_pipeline():
    result, defaults = _run(_fake_job(), accreditation_set_id="set-42")

    assert result["status"] == "completed"
    defaults["run_pipeline"].assert_called_once()
    assert defaults["run_pipeline"].call_args.kwargs["accreditation_set_id"] == "set-42"


def test_uses_the_set_scoped_rubric_lookup_not_the_global_one():
    _, defaults = _run(_fake_job(), accreditation_set_id="set-42")
    defaults["_get_rubrics_for_set"].assert_called_with("set-42")


def test_document_without_a_chosen_set_fails_fast_without_calling_the_pipeline():
    result, defaults = _run(_fake_job(), get_document_accreditation_set=MagicMock(return_value=None))

    assert result["status"] == "error"
    assert "Set Akreditasi" in result["error"]
    defaults["run_pipeline"].assert_not_called()
