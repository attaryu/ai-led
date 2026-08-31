"""Tool: get_indicator_rubric — load the scoring rubric for the document's
chosen AccreditationSet from Postgres. `_get_rubrics()`/matrix.json below is
kept only for api/routes/assessment.py's GET /assessment/indicators, the
one-time bootstrap source seed-rubric-criteria.ts imports FROM — not read by
the live agent anymore."""

from __future__ import annotations

import json
import os

from langchain_core.tools import tool

from agent.context import require_current_context
from db.postgres_client import get_rubric_criteria_for_set
from ingestion.matrix_parser import load_cached_rubrics

# Module-level lazy cache — loaded once per process
_rubric_cache: dict = {}

# Per-AccreditationSet cache for the live scoring path (get_indicator_rubric).
# Keyed by accreditation_set_id, unlike _rubric_cache above which is a single
# global entry — different sets must not share rubrics.
_rubric_cache_by_set: dict[str, list] = {}
_rubric_load_errors_by_set: dict[str, str] = {}


def _get_rubrics_for_set(accreditation_set_id: str) -> list:
    if accreditation_set_id not in _rubric_cache_by_set:
        try:
            _rubric_cache_by_set[accreditation_set_id] = get_rubric_criteria_for_set(
                accreditation_set_id
            )
        except Exception as exc:
            # Same rationale as _get_rubrics()'s FileNotFoundError/JSONDecodeError
            # handling below — get_indicator_rubric is the mandatory first tool
            # call, a raw DB exception here would crash every indicator's run.
            _rubric_cache_by_set[accreditation_set_id] = []
            _rubric_load_errors_by_set[accreditation_set_id] = (
                f"Gagal memuat rubrik untuk set akreditasi {accreditation_set_id}: {exc}"
            )
    return _rubric_cache_by_set[accreditation_set_id]


def _get_rubrics() -> list:
    cache_path = os.environ.get(
        "RUBRIC_CACHE_PATH", "data/rubric_cache/matrix.json"
    )
    if "rubrics" not in _rubric_cache:
        try:
            _rubric_cache["rubrics"] = load_cached_rubrics(cache_path)
        except FileNotFoundError:
            # Matrix PDF hasn't been uploaded/cached yet. get_indicator_rubric
            # is the mandatory FIRST tool call per the system prompt, so
            # letting this propagate would crash every indicator's graph run
            # instead of surfacing a normal "not found" tool error.
            _rubric_cache["rubrics"] = []
            _rubric_cache["load_error"] = f"Cache rubrik belum tersedia di {cache_path}"
        except json.JSONDecodeError as exc:
            _rubric_cache["rubrics"] = []
            _rubric_cache["load_error"] = f"Cache rubrik di {cache_path} rusak/tidak valid: {exc}"
    return _rubric_cache["rubrics"]


@tool
def get_indicator_rubric(indicator_no: int) -> str:
    """Ambil rubrik penilaian lengkap untuk nomor indikator tertentu.

    Mengembalikan JSON string dengan score_criteria (0-4) dan formula jika ada.
    Gunakan tool ini PERTAMA sebelum tool lainnya.
    """
    accreditation_set_id = require_current_context().accreditation_set_id
    rubrics = _get_rubrics_for_set(accreditation_set_id)
    for r in rubrics:
        if r.no == indicator_no:
            return json.dumps(
                {
                    "no": r.no,
                    "kriteria": r.kriteria,
                    "indikator": r.indikator,
                    "score_type": r.score_type,
                    "score_criteria": r.score_criteria,
                    "formula": r.formula,
                    "lkps_table_ref": r.lkps_table_ref,
                    "sub_score_formula": r.sub_score_formula,
                },
                ensure_ascii=False,
            )
    if not rubrics:
        if accreditation_set_id in _rubric_load_errors_by_set:
            return json.dumps({"error": _rubric_load_errors_by_set[accreditation_set_id]})
        return json.dumps(
            {"error": f"Set akreditasi {accreditation_set_id} tidak punya kriteria rubrik."}
        )
    return json.dumps({"error": f"Indikator {indicator_no} tidak ditemukan"})
