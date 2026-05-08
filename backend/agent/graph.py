"""LangGraph ReAct agent for cross-referencing LED + LKPS against the rubric.

Flow per indicator:
    agent → (tool_calls?) → tools → agent → ... → parse_output → END

The agent node sends the current message list to the LLM. If the LLM returns
tool calls, the ToolNode executes them and appends results to the message list
before going back to the agent. Once the LLM responds without tool calls,
parse_output extracts score, justification, and confidence.
"""

from __future__ import annotations

import os
import re
from typing import Literal

from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.graph import END, StateGraph
from langgraph.prebuilt import ToolNode

from agent.state import AssessmentState
from agent.tools.formula_tool import compute_formula_score
from agent.tools.led_tool import search_led_evidence
from agent.tools.lkps_tool import get_lkps_table
from agent.tools.rubric_tool import get_indicator_rubric
from llm.ollama_client import OllamaClient

TOOLS = [get_indicator_rubric, search_led_evidence, get_lkps_table, compute_formula_score]


def _build_llm(ollama_client: OllamaClient):
    """Return a tool-bound LangChain chat model.

    Provider is selected by LLM_PROVIDER env var (default: ollama):

        LLM_PROVIDER=ollama       — Ollama on Vast.ai (uses OllamaClient config)
        LLM_PROVIDER=openrouter   — OpenRouter API (reads OPENROUTER_API_KEY,
                                    OPENROUTER_MODEL)
    """
    provider = os.environ.get("LLM_PROVIDER", "ollama").lower()

    if provider == "openrouter":
        from langchain_openai import ChatOpenAI

        return ChatOpenAI(
            base_url="https://openrouter.ai/api/v1",
            api_key=os.environ["OPENROUTER_API_KEY"],
            model=os.environ.get("OPENROUTER_MODEL", "deepseek/deepseek-r1"),
            temperature=0.1,
        ).bind_tools(TOOLS)

    # Default: Ollama
    from langchain_ollama import ChatOllama

    return ChatOllama(
        base_url=ollama_client.base_url,
        model=ollama_client.model,
        temperature=0.1,
    ).bind_tools(TOOLS)

_SYSTEM_PROMPT = """Anda adalah asisten penilaian akreditasi program studi (AMI) yang ahli.
Tugas Anda: menentukan skor (0-4) untuk setiap indikator berdasarkan:
1. Rubrik penilaian dari Matriks Penilaian LAM Teknik (gunakan get_indicator_rubric)
2. Bukti kualitatif dari LED/narasi program studi (gunakan search_led_evidence)
3. Data kuantitatif dari LKPS (gunakan get_lkps_table jika indikator merujuk tabel LKPS)
4. Untuk indikator formula: gunakan compute_formula_score dengan data dari LKPS

PRINSIP CROSS-REFERENCING:
- Jangan hanya percaya narasi LED — VERIFIKASI dengan data LKPS jika ada referensi tabel
- Jika narasi LED mengklaim "≥25 SKS basic sciences" tapi LKPS menunjukkan 20 SKS → gunakan data LKPS
- Berikan skor yang konservatif jika bukti tidak konsisten antara LED dan LKPS

INSTRUKSI OUTPUT (WAJIB DIIKUTI):
Setelah mengumpulkan semua bukti, akhiri jawaban Anda TEPAT dengan 3 baris
berikut. JANGAN gunakan markdown (**bold**, ## heading, atau backtick).
JANGAN tambahkan baris setelahnya. Ini krusial untuk parsing otomatis:

SKOR: <satu angka antara 0 dan 4, contoh: 3 atau 3.5>
JUSTIFIKASI: <2-3 kalimat Bahasa Indonesia menjelaskan dasar penilaian>
CONFIDENCE: <satu angka antara 0.0 dan 1.0, contoh: 0.85>"""


def build_graph(ollama_client: OllamaClient) -> StateGraph:
    """Compile and return the assessment LangGraph.

    The LLM provider is chosen via LLM_PROVIDER env var — see _build_llm().
    ollama_client is only used when LLM_PROVIDER=ollama (default).
    """
    llm = _build_llm(ollama_client)

    tool_node = ToolNode(TOOLS)

    # ── Node: agent ──────────────────────────────────────────────────────────

    def agent_node(state: AssessmentState) -> AssessmentState:
        if not state.get("messages"):
            indicator = state["indicator_row"]
            state["messages"] = [
                SystemMessage(content=_SYSTEM_PROMPT),
                HumanMessage(
                    content=(
                        f"Nilai indikator nomor {indicator.indicator_no}.\n"
                        f"Deskripsi: {indicator.kriteria}\n\n"
                        f"Mulai dengan memanggil get_indicator_rubric({indicator.indicator_no})"
                    )
                ),
            ]

        response = llm.invoke(state["messages"])
        state["messages"] = list(state["messages"]) + [response]
        return state

    # ── Edge: should_continue ─────────────────────────────────────────────────

    def should_continue(state: AssessmentState) -> Literal["tools", "parse_output"]:
        last = state["messages"][-1]
        if hasattr(last, "tool_calls") and last.tool_calls:
            return "tools"
        return "parse_output"

    # ── Node: parse_output ────────────────────────────────────────────────────

    def parse_output_node(state: AssessmentState) -> AssessmentState:
        """Extract score, justification, and confidence from the final LLM message.

        Permissive parser — handles plain (SKOR: 3), markdown bold (**Skor:** 3),
        heading (## Skor Akhir: 3), and case variations. Picks the LAST valid
        score value to avoid grabbing a formula reference like "Skor = (I × 2)…"
        that may appear earlier in the response.
        """
        last_content = state["messages"][-1].content
        # Strip markdown noise that confuses regex
        cleaned = re.sub(r"\*{1,3}|`+|#+\s*", "", last_content)

        # Find ALL "skor[ final|akhir]: <number>" matches; take the last numeric one
        # in 0..4 range so a stray "Skor = formula" earlier doesn't win.
        score_candidates = re.findall(
            r"(?im)\bskor(?:\s+(?:final|akhir))?\s*[:=]\s*([0-9]+(?:\.[0-9]+)?)",
            cleaned,
        )
        score: float | None = None
        for cand in reversed(score_candidates):
            try:
                v = float(cand)
            except ValueError:
                continue
            if 0.0 <= v <= 4.0:
                score = v
                break
        state["final_score"] = score

        # Justification: prefer explicit JUSTIFIKASI line; fallback to first
        # ~600 chars after stripping markdown so user still sees something useful.
        just_match = re.search(
            r"(?is)\bjustifikasi\s*[:=]\s*(.+?)(?=\bconfidence\b|$)",
            cleaned,
        )
        state["justification"] = (
            just_match.group(1).strip() if just_match else cleaned.strip()[:600]
        )

        # Confidence: 0.0–1.0
        conf_match = re.search(
            r"(?i)\bconfidence\s*[:=]\s*([0-9]*\.?[0-9]+)",
            cleaned,
        )
        if conf_match:
            try:
                cv = float(conf_match.group(1))
                state["confidence"] = max(0.0, min(1.0, cv))
            except ValueError:
                state["confidence"] = 0.5
        else:
            state["confidence"] = 0.5

        return state

    # ── Build graph ───────────────────────────────────────────────────────────

    graph = StateGraph(AssessmentState)
    graph.add_node("agent", agent_node)
    graph.add_node("tools", tool_node)
    graph.add_node("parse_output", parse_output_node)

    graph.set_entry_point("agent")
    graph.add_conditional_edges(
        "agent",
        should_continue,
        {"tools": "tools", "parse_output": "parse_output"},
    )
    graph.add_edge("tools", "agent")
    graph.add_edge("parse_output", END)

    return graph.compile()
