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
    study_program_id: str | None = None


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
