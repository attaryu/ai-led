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
from typing import Literal

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langgraph.graph import END, StateGraph

from agent.state import AssessmentState
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
    "get_lkps_table": get_lkps_table,
    "compute_formula_score": compute_formula_score,
}

MAX_ITERATIONS = 12  # hard cap on tool-call loops per indicator

_SYSTEM_PROMPT = """Anda adalah AGEN OTONOM penilai akreditasi (AMI).
Anda BUKAN chatbot. JANGAN bertanya balik. JANGAN menawarkan bantuan.
Selesaikan penilaian SAMPAI keluar skor final.

PROTOKOL: setiap respons HARUS berupa JSON satu baris. Pilih salah satu:

  {"action": "<tool_name>", "args": {<arguments>}}    ← panggil tool
  {"action": "final", "score": <0-4>, "justification": "<2-3 kalimat>", "confidence": <0.0-1.0>, "recommendation": "<2-3 kalimat actionable, spesifik terhadap kekurangan. Jika skor sudah 4, tulis rekomendasi untuk mempertahankan praktik yang sudah baik>"}    ← skor final

Tool yang tersedia:

1. get_indicator_rubric  — args: {"indicator_no": <int 1-78>}
2. search_led_evidence   — args: {"query": "<id>", "n_results": <int, default 5>}
3. get_lkps_table        — args: {"table_reference": "<misal 'Tabel 2.a. LKPS' atau '6.f.2'>"}
4. compute_formula_score — args: {"formula_expression": "<expr Python: BOP / 5000000>", "variables": {<key: value>}}

ALUR WAJIB:
1. Mulai: get_indicator_rubric untuk pahami kriteria scoring
2. Lanjut: search_led_evidence untuk bukti kualitatif
3. (Opsional) get_lkps_table jika rubrik merujuk tabel LKPS
4. (Opsional) compute_formula_score jika rubrik berbasis formula
5. SELESAI dengan {"action": "final", ...}

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


# ---------------------------------------------------------------------------
# LLM builder (no bind_tools — reasoning models don't support it)
# ---------------------------------------------------------------------------


def _build_reasoning_llm(ollama_client: OllamaClient):
    """Return a plain ChatOllama / ChatOpenAI without tool binding."""
    provider = os.environ.get("LLM_PROVIDER", "ollama").lower()

    if provider == "openrouter":
        from langchain_openai import ChatOpenAI

        return ChatOpenAI(
            base_url="https://openrouter.ai/api/v1",
            api_key=os.environ["OPENROUTER_API_KEY"],
            model=os.environ.get("OPENROUTER_MODEL", "deepseek/deepseek-r1"),
            temperature=0.1,
        )

    from langchain_ollama import ChatOllama

    kwargs: dict = {
        "base_url": ollama_client.base_url,
        "model": ollama_client.model,
        "temperature": 0.1,
    }
    api_key = os.environ.get("OLLAMA_API_KEY")
    if api_key and not api_key.startswith("<"):
        kwargs["client_kwargs"] = {"headers": {"Authorization": f"Bearer {api_key}"}}
    return ChatOllama(**kwargs)


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

    def parse_and_dispatch(state: AssessmentState) -> Literal["tool_call", "finalize", "error"]:
        last = state["messages"][-1].content
        parsed = _extract_json(last)

        if parsed is None:
            # Could be a degenerate response — give the model one chance to retry
            iters = state.get("reasoning_steps", [])
            if len(iters) >= MAX_ITERATIONS:
                state["error"] = "Max iterations reached without final JSON."
                return "error"
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
            return "tool_call"

        # Unknown action — nudge the model
        iters = state.get("reasoning_steps", [])
        if len(iters) >= MAX_ITERATIONS:
            state["error"] = f"Unknown action '{action}' and iteration limit reached."
            return "error"
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

        # Truncate huge results to keep context manageable
        result_str = result if isinstance(result, str) else json.dumps(result, ensure_ascii=False)
        if len(result_str) > 4000:
            result_str = result_str[:4000] + "\n…(truncated)"

        state["messages"].append(
            HumanMessage(content=f"Tool result ({action}):\n{result_str}")
        )
        steps = state.get("reasoning_steps", [])
        state["reasoning_steps"] = list(steps) + [f"tool:{action}"]
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

    graph = StateGraph(AssessmentState)
    graph.add_node("agent", agent_node)
    graph.add_node("tools", tool_node)
    graph.add_node("finalize", finalize_node)

    graph.set_entry_point("agent")
    graph.add_conditional_edges(
        "agent",
        parse_and_dispatch,
        {"tool_call": "tools", "finalize": "finalize", "error": END},
    )
    graph.add_edge("tools", "agent")
    graph.add_edge("finalize", END)

    return graph.compile()
