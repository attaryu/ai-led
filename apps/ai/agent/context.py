"""Per-run tenant/document scoping for tool calls made from inside a graph run.

Tools like `search_led_evidence` (led_tool.py) and `get_lkps_table`
(lkps_tool.py) are invoked BY THE LLM with only the arguments the LLM
chooses (query, table_reference, ...) — there is no room to also pass
tenant_id/dokumen_id as explicit tool-call arguments without letting the
model pick which tenant's data to read, which defeats the point.

A `contextvars.ContextVar` carries this instead, set once per indicator run
right before `graph.invoke()`. This is concurrency-safe for
`asyncio.gather`-scheduled indicator runs (each task gets its own copy of
the context), but `graph.invoke()` itself runs via
`loop.run_in_executor(None, graph.invoke, ...)` — a real OS thread, which
does NOT automatically inherit the calling coroutine's context. Callers
MUST wrap the executor call with `contextvars.copy_context().run(...)`,
otherwise the tools silently fall back to no-context and return nothing:

    ctx = contextvars.copy_context()
    result = await loop.run_in_executor(None, ctx.run, graph.invoke, initial_state)
"""

from __future__ import annotations

import contextvars
from dataclasses import dataclass


@dataclass(frozen=True)
class AssessmentContext:
    tenant_id: str
    dokumen_id: str


current_assessment_context: contextvars.ContextVar[AssessmentContext | None] = (
    contextvars.ContextVar("current_assessment_context", default=None)
)


def require_current_context() -> AssessmentContext:
    """Fetch the context set for this run, or raise if none was set.

    Raising (rather than silently returning a "no results" empty answer) is
    deliberate: a tool call with no tenant context is a bug in the caller —
    letting it through quietly would risk resolving to *some* default
    collection/registry instead of failing loudly.
    """
    ctx = current_assessment_context.get()
    if ctx is None:
        raise RuntimeError(
            "AssessmentContext belum diset — pastikan _run_assessment_pipeline "
            "memanggil current_assessment_context.set(...) sebelum graph.invoke(), "
            "dan menjalankannya lewat contextvars.copy_context().run(...) di executor."
        )
    return ctx
