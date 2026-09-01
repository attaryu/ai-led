"""Prompt-based tool calling agent for reasoning models (deepseek-r1, qwq, o1).

These models emit <think>...</think> chain-of-thought blocks and don't support
OpenAI-style function calling on Ollama. We give them a JSON-output protocol:

    {"action": "tool_name", "args": {...}}    ← call a tool
    {"action": "final", "score": <float>, "justification": "...", "confidence": <float>}

Per turn:
1. Send messages to LLM
2. Strip <think>...</think> from response
3. Parse JSON (lenient: handles code fences, smart quotes, multiple blocks)
4. Dispatch tool OR finalize
5. Loop with MAX_ITERATIONS guard
"""

from __future__ import annotations

import json
import logging
import os
import re
from typing import Literal, Optional

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langgraph.graph import END, StateGraph

from agent.graph import (
    CHECKLIST_PROMPT_TEMPLATE,
    JUDGE_PROMPT_TEMPLATE,
    _accumulate_sources,
    _EMPTY_SOURCES,
    build_judge_llm,
    parse_checklist,
    parse_judge_verdict,
)
from agent.state import AssessmentState
from agent.tools.evidence_tool import search_evidence_documents
from agent.tools.formula_tool import compute_formula_score
from agent.tools.led_tool import search_led_evidence
from agent.tools.lkps_tool import get_lkps_table
from agent.tools.rubric_tool import get_indicator_rubric
from llm.ollama_client import OllamaClient

logger = logging.getLogger(__name__)

# Same tools as native graph — referenced by name in JSON dispatch
_TOOL_REGISTRY = {
    "get_indicator_rubric": get_indicator_rubric,
    "search_led_evidence": search_led_evidence,
    "search_evidence_documents": search_evidence_documents,
    "get_lkps_table": get_lkps_table,
    "compute_formula_score": compute_formula_score,
}

MAX_ITERATIONS = 12  # hard cap on tool-call loops per indicator
# After MAX_ITERATIONS, give the model FORCE_LIMIT extra nudges to emit a
# final answer using whatever evidence it already gathered, before giving up
# entirely (mirrors agent/graph.py's FORCE_LIMIT for the native-tool-calling
# graph — same "degrade gracefully, don't just null out" philosophy).
FORCE_LIMIT = 2

_SYSTEM_PROMPT = """Anda adalah AGEN OTONOM penilai akreditasi (AMI).
Anda BUKAN chatbot. JANGAN bertanya balik. JANGAN menawarkan bantuan.
Selesaikan penilaian SAMPAI keluar skor final.

PROTOKOL: setiap respons HARUS berupa JSON satu baris. Pilih salah satu:

  {"action": "<tool_name>", "args": {<arguments>}}    ← panggil tool
  {"action": "final", "score": <0-4>, "justification": "<2-3 kalimat>", "confidence": <0.0-1.0>, "recommendation": "<2-3 kalimat actionable, spesifik terhadap kekurangan. Jika skor sudah 4, tulis rekomendasi untuk mempertahankan praktik yang sudah baik>"}    ← skor final

Tool yang tersedia:

1. get_indicator_rubric  — args: {"indicator_no": <int 1-64>}
2. search_led_evidence   — args: {"query": "<id, WAJIB kaya konteks: nomor indikator + kata kunci konkret dari kriteria rubrik, bukan cuma topik umum>", "n_results": <int, default 5>}
3. search_evidence_documents — args: {"query": "<id, sama seperti search_led_evidence>", "n_results": <int, default 5>} — cek dokumen Bukti Dukung (SK, sertifikat, MoU) yang diunggah untuk prodi ini; hasil kosong itu normal, bukan error
4. get_lkps_table        — args: {"table_reference": "<misal 'Tabel 2.a. LKPS' atau '6.f.2'>"}
5. compute_formula_score — args: {"formula_expression": "<expr Python: BOP / 5000000>", "variables": {<key: value>}}

ALUR WAJIB:
1. Mulai: get_indicator_rubric untuk pahami kriteria scoring
2. Lanjut: search_led_evidence untuk bukti kualitatif — query harus kaya
   konteks (nomor indikator + kata kunci kriteria rubrik), bukan keyword pendek
3. (Opsional) search_evidence_documents untuk verifikasi klaim LED terhadap
   dokumen Bukti Dukung yang sudah diunggah untuk prodi ini
4. (Opsional) get_lkps_table jika rubrik merujuk tabel LKPS
5. (Opsional) compute_formula_score jika rubrik berbasis formula
6. SELESAI dengan {"action": "final", ...}

LARANGAN KETAT:
- DILARANG output teks selain JSON (tidak ada penjelasan, tidak ada markdown ```json)
- DILARANG bertanya balik ("apakah Anda ingin", "untuk membantu Anda")
- DILARANG keluar tanpa action="final"
- Jika bukti tidak cukup → tetap kasih skor rendah (0 atau 1) dengan justifikasi "bukti tidak ditemukan"

Setiap respons SATU JSON SATU BARIS saja."""


# ---------------------------------------------------------------------------
# JSON extraction helpers
# ---------------------------------------------------------------------------

_THINK_RE = re.compile(r"<think>.*?</think>", re.DOTALL | re.IGNORECASE)
_CODE_FENCE_RE = re.compile(r"```(?:json)?\s*(\{.*?\})\s*```", re.DOTALL)


def _strip_reasoning(content: str) -> str:
    """Remove <think>...</think> blocks emitted by reasoning models."""
    return _THINK_RE.sub("", content).strip()


def _extract_json(content: str) -> dict | None:
    """Best-effort JSON extraction.

    Handles: code fences, multiple JSON blocks (takes the LAST one), smart quotes.
    Returns None if no parseable JSON found.
    """
    cleaned = _strip_reasoning(content)

    # Normalise smart quotes that some models inject
    cleaned = (
        cleaned.replace("“", '"').replace("”", '"')
               .replace("‘", "'").replace("’", "'")
    )

    # Try fenced ```json blocks first
    fenced = _CODE_FENCE_RE.findall(cleaned)
    if fenced:
        for candidate in reversed(fenced):
            try:
                return json.loads(candidate)
            except json.JSONDecodeError:
                continue

    # Fallback: scan for {...} balanced braces, take the LAST valid one
    candidates: list[str] = []
    depth = 0
    start = -1
    for i, ch in enumerate(cleaned):
        if ch == "{":
            if depth == 0:
                start = i
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0 and start >= 0:
                candidates.append(cleaned[start : i + 1])
                start = -1

    for candidate in reversed(candidates):
        try:
            return json.loads(candidate)
        except json.JSONDecodeError:
            continue

    return None


def _find_reasoning_tool_result(messages: list, tool_name: str) -> Optional[str]:
    """Return the content of the most recent "Tool result (<tool_name>): ..."
    message, falling back to the single most recent tool-result message of
    any name if none matches exactly. Mirrors agent.graph.find_tool_result,
    but reasoning-mode tool results are plain HumanMessages (this graph
    doesn't use LangChain's native ToolMessage / tool_calls machinery)."""
    prefix_any = "Tool result ("
    prefix_named = f"Tool result ({tool_name}):"
    last_any: Optional[str] = None
    for msg in reversed(messages):
        content = getattr(msg, "content", "") or ""
        if content.startswith(prefix_any):
            if last_any is None:
                last_any = content
            if content.startswith(prefix_named):
                return content[len(prefix_named):].strip()
    return last_any


def _collect_reasoning_evidence_text(
    messages: list,
    tool_names: tuple[str, ...] = ("search_led_evidence", "search_evidence_documents", "get_lkps_table"),
) -> str:
    """Reasoning-mode equivalent of agent.graph.collect_evidence_text — tool
    results here are plain HumanMessages prefixed "Tool result (<name>):",
    not native ToolMessages."""
    parts = []
    for msg in messages:
        content = getattr(msg, "content", "") or ""
        for name in tool_names:
            prefix = f"Tool result ({name}):"
            if content.startswith(prefix):
                parts.append(f"[{name}] {content[len(prefix):].strip()}")
                break
    return "\n\n".join(parts)


# ---------------------------------------------------------------------------
# LLM builder (no bind_tools — reasoning models don't support it)
# ---------------------------------------------------------------------------


def _build_reasoning_llm(ollama_client: OllamaClient):
    """Return a plain ChatOllama / ChatOpenAI without tool binding."""
    provider = os.environ.get("LLM_PROVIDER", "ollama").lower()

    if provider == "openrouter":
        from langchain_openai import ChatOpenAI

        return (
            ChatOpenAI(
                base_url="https://openrouter.ai/api/v1",
                api_key=os.environ["OPENROUTER_API_KEY"],
                model=ollama_client.model,
                temperature=0.1,
            )
            .with_retry(stop_after_attempt=3)
        )

    from langchain_ollama import ChatOllama

    kwargs: dict = {
        "base_url": ollama_client.base_url,
        "model": ollama_client.model,
        "temperature": 0.1,
        "client_kwargs": {"timeout": int(os.environ.get("OLLAMA_TIMEOUT_SECONDS", "300"))},
    }
    api_key = os.environ.get("OLLAMA_API_KEY")
    if api_key and not api_key.startswith("<"):
        kwargs["client_kwargs"]["headers"] = {"Authorization": f"Bearer {api_key}"}
    # Retry transient connection failures (e.g. connection reset mid-request
    # to the remote Ollama instance) instead of letting them propagate raw
    # into the indicator's error field with zero retry.
    return ChatOllama(**kwargs).with_retry(stop_after_attempt=3)


# ---------------------------------------------------------------------------
# Graph
# ---------------------------------------------------------------------------


def build_reasoning_graph(ollama_client: OllamaClient) -> StateGraph:
    """Compile a graph that uses prompt-based tool calling for reasoning models."""
    llm = _build_reasoning_llm(ollama_client)

    def agent_node(state: AssessmentState) -> AssessmentState:
        if not state.get("messages"):
            indicator = state["indicator_row"]
            state["messages"] = [
                SystemMessage(content=_SYSTEM_PROMPT),
                HumanMessage(
                    content=(
                        f"Nilai indikator nomor {indicator.indicator_no}.\n"
                        f"Deskripsi: {indicator.kriteria}\n\n"
                        f"Mulai dengan: "
                        f'{{"action": "get_indicator_rubric", "args": {{"indicator_no": {indicator.indicator_no}}}}}'
                    )
                ),
            ]

        response = llm.invoke(state["messages"])
        state["messages"] = list(state["messages"]) + [response]
        return state

    def _force_or_give_up(state: AssessmentState, reason: str) -> Literal["force", "error"]:
        """Shared MAX_ITERATIONS overflow handler for every dispatch branch
        (invalid JSON, unknown action, or a validly-repeating tool call).

        All three share the SAME FORCE_LIMIT budget, so a model that keeps
        finding new ways to avoid finalizing can't loop past
        MAX_ITERATIONS + FORCE_LIMIT turns total, regardless of which branch
        it keeps landing in.

        Does NOT set state["error"] itself — routers can't persist state mutations, only a real node's return can; error_node (below) does it."""
        forces = state.get("_force_count", 0)
        if forces < FORCE_LIMIT:
            return "force"
        logger.warning("%s and force-finalize attempts exhausted.", reason)
        return "error"

    def parse_and_dispatch(state: AssessmentState) -> Literal["tool_call", "finalize", "force", "error"]:
        last = state["messages"][-1].content
        parsed = _extract_json(last)
        iters = state.get("reasoning_steps", [])

        if parsed is None:
            # Could be a degenerate response — give the model one chance to retry
            if len(iters) >= MAX_ITERATIONS:
                return _force_or_give_up(state, "Max iterations reached without final JSON")
            state["messages"].append(
                HumanMessage(
                    content=(
                        "Output sebelumnya tidak valid JSON. "
                        "Ulangi dengan JSON satu baris saja, tanpa markdown atau penjelasan."
                    )
                )
            )
            state["reasoning_steps"] = list(iters) + ["invalid_json_retry"]
            return "tool_call"  # loop back

        action = parsed.get("action")
        if action == "final":
            return "finalize"

        if action in _TOOL_REGISTRY:
            if len(iters) >= MAX_ITERATIONS:
                return _force_or_give_up(state, f"Iteration limit reached while still calling tools ('{action}')")
            return "tool_call"

        # Unknown action — nudge the model
        if len(iters) >= MAX_ITERATIONS:
            return _force_or_give_up(state, f"Unknown action '{action}' and iteration limit reached")
        state["messages"].append(
            HumanMessage(
                content=(
                    f"Action '{action}' tidak valid. "
                    f"Pilih dari: {list(_TOOL_REGISTRY.keys())} atau 'final'."
                )
            )
        )
        state["reasoning_steps"] = list(iters) + [f"unknown_action:{action}"]
        return "tool_call"

    def tool_node(state: AssessmentState) -> AssessmentState:
        last = state["messages"][-1].content
        parsed = _extract_json(last)
        if not parsed:
            return state

        action = parsed.get("action", "")
        args = parsed.get("args", {})

        tool = _TOOL_REGISTRY.get(action)
        if tool is None:
            return state

        # Normalize common arg-name mistakes from LLMs
        if action == "get_lkps_table":
            if "table_id" in args and "table_reference" not in args:
                args["table_reference"] = args.pop("table_id")
            if "table" in args and "table_reference" not in args:
                args["table_reference"] = args.pop("table")
        elif action == "search_led_evidence":
            if "q" in args and "query" not in args:
                args["query"] = args.pop("q")
        elif action == "search_evidence_documents":
            if "q" in args and "query" not in args:
                args["query"] = args.pop("q")
        elif action == "compute_formula_score":
            if "formula" in args and "formula_expression" not in args:
                args["formula_expression"] = args.pop("formula")
            if "expression" in args and "formula_expression" not in args:
                args["formula_expression"] = args.pop("expression")
            if "vars" in args and "variables" not in args:
                args["variables"] = args.pop("vars")
        elif action == "get_indicator_rubric":
            if "indicator" in args and "indicator_no" not in args:
                args["indicator_no"] = args.pop("indicator")
            if "no" in args and "indicator_no" not in args:
                args["indicator_no"] = args.pop("no")

        try:
            result = tool.invoke(args) if hasattr(tool, "invoke") else tool(**args)
        except Exception as exc:
            logger.exception("Tool %s failed", action)
            result = json.dumps({"error": str(exc)}, ensure_ascii=False)

        result_str_full = result if isinstance(result, str) else json.dumps(result, ensure_ascii=False)
        state["sources_used"] = _accumulate_sources(
            state.get("sources_used") or _EMPTY_SOURCES, action, args, result_str_full
        )

        # Truncate for context, but source extraction above already saw the full result
        result_str = result_str_full
        if len(result_str) > 4000:
            result_str = result_str[:4000] + "\n…(truncated)"

        state["messages"].append(
            HumanMessage(content=f"Tool result ({action}):\n{result_str}")
        )
        steps = state.get("reasoning_steps", [])
        state["reasoning_steps"] = list(steps) + [f"tool:{action}"]
        return state

    def checklist_node(state: AssessmentState) -> AssessmentState:
        """Build a rubric checklist (soft guidance) and auto-inject any tagged evidence for this indicator."""
        state["_checklist_built"] = True
        indicator = state["indicator_row"]

        try:
            evidence_raw = search_evidence_documents.invoke({"query": indicator.kriteria})
            evidence_items = json.loads(evidence_raw)
        except Exception:
            evidence_items = []

        if evidence_items:
            entities = sorted({item.get("entity") for item in evidence_items if item.get("entity")})
            state["messages"].append(
                HumanMessage(
                    content=(
                        f"Ditemukan {len(entities)} dokumen bukti pendukung yang di-tag ke "
                        f"indikator ini ({', '.join(entities)}). Isi relevan sudah diambil "
                        f"otomatis:\n\n{evidence_raw}\n\n"
                        "WAJIB pertimbangkan dokumen ini sebagai bukti independen saat "
                        "menyusun skor dan justifikasi — JANGAN abaikan hanya karena LED/LKPS "
                        "terasa sudah cukup.\n\n"
                        "Lanjutkan dengan JSON satu baris seperti biasa."
                    )
                )
            )
            state["sources_used"] = _accumulate_sources(
                state.get("sources_used") or _EMPTY_SOURCES,
                "search_evidence_documents", {}, evidence_raw,
            )

        rubric_text = _find_reasoning_tool_result(state["messages"], "get_indicator_rubric")
        checklist: list = []
        if rubric_text:
            try:
                prompt = CHECKLIST_PROMPT_TEMPLATE.format(rubric_text=rubric_text[:2000])
                response = llm.invoke([HumanMessage(content=prompt)])
                checklist = parse_checklist(response.content or "")
            except Exception:
                checklist = []

            state["checklist"] = checklist or None

            if checklist:
                bullet_list = "\n".join(f"{i + 1}. {item}" for i, item in enumerate(checklist))
                state["messages"].append(
                    HumanMessage(
                        content=(
                            "Checklist kriteria yang WAJIB dicek untuk indikator ini "
                            "(hasil analisis rubrik):\n"
                            f"{bullet_list}\n\n"
                            "Pastikan bukti untuk tiap poin sudah dicari sebelum memberi jawaban "
                            "final. Jika bukti untuk suatu poin tidak ditemukan, itu sah — "
                            "sebutkan di justifikasi.\n\n"
                            "Lanjutkan dengan JSON satu baris seperti biasa."
                        )
                    )
                )
        else:
            state["checklist"] = None

        steps = state.get("reasoning_steps", [])
        state["reasoning_steps"] = list(steps) + [
            {"checklist": checklist},
            {"evidence_auto_check": evidence_items or None},
        ]
        return state

    def force_finalize_node(state: AssessmentState) -> AssessmentState:
        """Nudge the model to emit {"action": "final", ...} NOW, using
        whatever evidence it already gathered, instead of giving up outright."""
        forces = state.get("_force_count", 0)
        state["_force_count"] = forces + 1
        state["messages"].append(
            HumanMessage(
                content=(
                    "STOP. Batas iterasi tercapai. Berikan HANYA satu baris JSON final "
                    "sekarang, berdasarkan bukti yang sudah terkumpul:\n"
                    '{"action": "final", "score": <0-4>, "justification": "<2-3 kalimat>", '
                    '"confidence": <0.0-1.0>, "recommendation": "<2-3 kalimat actionable>"}'
                )
            )
        )
        return state

    def finalize_node(state: AssessmentState) -> AssessmentState:
        last = state["messages"][-1].content
        parsed = _extract_json(last) or {}

        score = parsed.get("score")
        try:
            score_f = float(score) if score is not None else None
            if score_f is not None and not (0.0 <= score_f <= 4.0):
                score_f = None
        except (TypeError, ValueError):
            score_f = None

        try:
            conf_f = float(parsed.get("confidence", 0.5))
            conf_f = max(0.0, min(1.0, conf_f))
        except (TypeError, ValueError):
            conf_f = 0.5

        recommendation = parsed.get("recommendation")

        state["final_score"] = score_f
        state["justification"] = str(parsed.get("justification", ""))[:2000]
        state["confidence"] = conf_f
        state["recommendation"] = str(recommendation)[:500] if recommendation else None
        return state

    def judge_node(state: AssessmentState) -> AssessmentState:
        """Independent post-hoc grounding check — same behavior as
        agent.graph's judge_node (separate model, soft confidence adjustment,
        never blocks), adapted to this graph's plain-HumanMessage tool-result
        format."""
        if state.get("final_score") is None:
            return state

        evidence_text = _collect_reasoning_evidence_text(state["messages"])
        justification = state.get("justification") or ""

        try:
            judge_llm = build_judge_llm()
            prompt = JUDGE_PROMPT_TEMPLATE.format(
                justification=justification[:1500],
                evidence_text=evidence_text[:3000] or "(tidak ada bukti tercatat)",
            )
            response = judge_llm.invoke([HumanMessage(content=prompt)])
            verdict = parse_judge_verdict(response.content or "")
        except Exception as exc:
            verdict = {"error": str(exc)}

        state["judge_verdict"] = verdict

        if verdict and verdict.get("grounded") is False:
            current_conf = state.get("confidence")
            if current_conf is not None:
                state["confidence"] = min(current_conf, 0.3)

        steps = state.get("reasoning_steps", [])
        state["reasoning_steps"] = list(steps) + [{"judge_verdict": verdict}]
        return state

    def route_after_tools(state: AssessmentState) -> Literal["checklist", "agent"]:
        return "agent" if state.get("_checklist_built") else "checklist"

    def error_node(state: AssessmentState) -> AssessmentState:
        """Real node that sets state["error"] once FORCE_LIMIT is exhausted — see _force_or_give_up."""
        state["error"] = (
            "Model tidak menghasilkan format final yang valid "
            "setelah batas percobaan force-finalize tercapai."
        )
        return state

    graph = StateGraph(AssessmentState)
    graph.add_node("agent", agent_node)
    graph.add_node("tools", tool_node)
    graph.add_node("checklist", checklist_node)
    graph.add_node("force", force_finalize_node)
    graph.add_node("finalize", finalize_node)
    graph.add_node("judge", judge_node)
    graph.add_node("error_node", error_node)

    graph.set_entry_point("agent")
    graph.add_conditional_edges(
        "agent",
        parse_and_dispatch,
        {"tool_call": "tools", "finalize": "finalize", "force": "force", "error": "error_node"},
    )
    graph.add_edge("error_node", END)
    graph.add_conditional_edges(
        "tools", route_after_tools, {"checklist": "checklist", "agent": "agent"}
    )
    graph.add_edge("checklist", "agent")
    graph.add_edge("force", "agent")
    graph.add_edge("finalize", "judge")
    graph.add_edge("judge", END)

    return graph.compile()
