"""Per-run tenant/document scoping — LLM tools can't be trusted to pass
tenant_id/dokumen_id themselves, so it's carried via contextvar instead.

graph.invoke() runs via run_in_executor (a real thread), which does NOT
inherit the calling coroutine's context — callers must set the var then
wrap with contextvars.copy_context().run(graph.invoke, ...).
"""

from __future__ import annotations

import contextvars
from dataclasses import dataclass


@dataclass(frozen=True)
class AssessmentContext:
    tenant_id: str
    dokumen_id: str
    # Indicator currently being assessed — search_evidence_documents scopes
    # STRICTLY to evidence tagged to this indicator (evidence_indicator_tags),
    # no fallback to a blanket tenant/prodi search.
    indicator_no: int
    # Which AccreditationSet's rubric_criteria applies to this document —
    # get_indicator_rubric scopes to THIS set, never the old global matrix.json.
    accreditation_set_id: str
    study_program_id: str | None = None
    # Sub-indikator yang sedang dinilai ("I", "II", ...); "" = tanpa sub. get_indicator_rubric memakainya
    # untuk memilih baris rubrik yang tepat bila satu nomor indikator punya beberapa baris (43.I / 43.II).
    sub_no: str = ""


current_assessment_context: contextvars.ContextVar[AssessmentContext | None] = (
    contextvars.ContextVar("current_assessment_context", default=None)
)


def require_current_context() -> AssessmentContext:
    """Raise instead of silently falling back to no context."""
    ctx = current_assessment_context.get()
    if ctx is None:
        raise RuntimeError(
            "AssessmentContext belum diset sebelum graph.invoke()."
        )
    return ctx
