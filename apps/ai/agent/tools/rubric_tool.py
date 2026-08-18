"""Tool: get_indicator_rubric — load scoring rubric from cached JSON."""

from __future__ import annotations

import json
import os

from langchain_core.tools import tool

from ingestion.matrix_parser import load_cached_rubrics

# Module-level lazy cache — loaded once per process
_rubric_cache: dict = {}


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
    rubrics = _get_rubrics()
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
    if "load_error" in _rubric_cache:
        return json.dumps({"error": _rubric_cache["load_error"]})
    return json.dumps({"error": f"Indikator {indicator_no} tidak ditemukan"})
