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

# Reasoning models that emit <think>...</think> and lack native tool-calling
# on Ollama. Override per-deployment with REASONING_MODEL_PATTERNS env var
# (comma-separated substrings, case-insensitive).
_DEFAULT_REASONING_PATTERNS = ["deepseek-r1", "qwq", "o1-", "o1:", "thinking", "deepthink"]


def is_reasoning_model(model_name: str) -> bool:
    """True if the given model name looks like a reasoning/CoT model."""
    if not model_name:
        return False
    override = os.environ.get("LLM_REASONING_MODE", "").strip().lower()
    if override in {"true", "1", "yes", "on"}:
        return True
    if override in {"false", "0", "no", "off"}:
        return False
    extra = [
        p.strip().lower()
        for p in os.environ.get("REASONING_MODEL_PATTERNS", "").split(",")
        if p.strip()
    ]
    patterns = _DEFAULT_REASONING_PATTERNS + extra
    name_l = model_name.lower()
    return any(p in name_l for p in patterns)


def build_graph_auto(ollama_client: OllamaClient):
    """Pick native or reasoning graph based on the active model name."""
    provider = os.environ.get("LLM_PROVIDER", "ollama").lower()
    if provider == "openrouter":
        model = os.environ.get("OPENROUTER_MODEL", "")
    else:
        model = ollama_client.model

    if is_reasoning_model(model):
        from agent.reasoning_graph import build_reasoning_graph
        return build_reasoning_graph(ollama_client)

    return build_graph(ollama_client)


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

    kwargs: dict = {
        "base_url": ollama_client.base_url,
        "model": ollama_client.model,
        "temperature": 0.1,
    }
    api_key = os.environ.get("OLLAMA_API_KEY")
    if api_key and not api_key.startswith("<"):
        # Pass Bearer token to the underlying ollama Client
        kwargs["client_kwargs"] = {"headers": {"Authorization": f"Bearer {api_key}"}}

    return ChatOllama(**kwargs).bind_tools(TOOLS)

_SYSTEM_PROMPT = """Anda adalah AGEN OTONOM penilai akreditasi program studi (AMI).
Anda BUKAN chatbot. Anda TIDAK bertanya balik ke user. Anda menyelesaikan
tugas penilaian SECARA MANDIRI sampai keluar skor final.

ALUR YANG WAJIB DIIKUTI per indikator:
1. Panggil get_indicator_rubric(indicator_no) untuk dapat kriteria scoring
2. Panggil search_led_evidence(query) untuk cari bukti kualitatif dari LED
3. (Opsional) Panggil get_lkps_table(table_id) jika rubrik merujuk tabel LKPS
4. (Opsional) Panggil compute_formula_score(...) jika rubrik berbasis formula
5. Output skor final dengan format yang dijelaskan di bawah

PRINSIP CROSS-REFERENCING:
- VERIFIKASI klaim LED dengan data LKPS jika ada referensi tabel
- Jika narasi LED dan data LKPS tidak konsisten → gunakan data LKPS, beri skor konservatif

LARANGAN KETAT:
- DILARANG bertanya balik ke user ("untuk membantu Anda...", "saya perlu mengetahui...")
- DILARANG menawarkan bantuan tambahan ("apakah Anda ingin...")
- DILARANG menulis "Saya melihat Anda telah..." — Anda yang bekerja, bukan user
- DILARANG keluar dari loop tanpa SKOR/JUSTIFIKASI/CONFIDENCE final
- Jika bukti tidak cukup → tetap beri skor 0 atau 1 dengan justifikasi "bukti tidak ditemukan"

FORMAT OUTPUT FINAL (WAJIB tepat seperti ini, tanpa markdown apapun):

SKOR: <angka 0-4, contoh: 3 atau 3.5>
JUSTIFIKASI: <2-3 kalimat Bahasa Indonesia tentang dasar penilaian>
CONFIDENCE: <angka 0.0-1.0, contoh: 0.85>

Contoh respons final yang BENAR:
SKOR: 3
JUSTIFIKASI: Program studi memiliki dokumen VMTS yang lengkap dan disusun secara partisipatif (LED hal. 30). LKPS menunjukkan 72% DTPS sesuai bidang keilmuan. Bukti memadai namun belum mencapai standar maksimal.
CONFIDENCE: 0.85"""


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
    # Force-finalize guard: chat-tuned models (qwen3.5, llama3.x) sometimes
    # misinterpret tool results as user-provided data and reply
    # conversationally ("Saya melihat Anda telah membagikan...") instead of
    # emitting SKOR/JUSTIFIKASI/CONFIDENCE. We re-prompt up to FORCE_LIMIT
    # times before giving up.
    FORCE_LIMIT = 2
    # Hard cap on tool-calling iterations. Some models (e.g. gemma4) loop
    # forever calling tools without ever emitting a final answer. Once this
    # cap is hit, route to force-finalize regardless of the model's last
    # tool_calls request.
    MAX_TOOL_CALLS = 10

    def _looks_like_finalized(content: str) -> bool:
        """Detect if message contains a parseable SKOR line."""
        cleaned = re.sub(r"\*{1,3}|`+|#+\s*", "", content or "")
        return bool(
            re.search(
                r"(?im)\bskor(?:\s+(?:final|akhir))?\s*[:=]\s*[0-9]+(?:\.[0-9]+)?",
                cleaned,
            )
        )

    def should_continue(state: AssessmentState) -> Literal["tools", "force", "parse_output"]:
        last = state["messages"][-1]
        # Count tool messages to detect runaway loops (some models never finalize).
        tool_msg_count = sum(
            1 for m in state["messages"]
            if getattr(m, "type", "") == "tool" or m.__class__.__name__ == "ToolMessage"
        )

        if hasattr(last, "tool_calls") and last.tool_calls:
            if tool_msg_count >= MAX_TOOL_CALLS:
                # Cap exceeded — drop the pending tool_calls and force finalize
                # to break the loop.
                return "force"
            return "tools"

        content = getattr(last, "content", "") or ""
        if _looks_like_finalized(content):
            return "parse_output"

        forces = state.get("_force_count", 0)
        if forces < FORCE_LIMIT:
            return "force"
        return "parse_output"

    def force_finalize_node(state: AssessmentState) -> AssessmentState:
        """Append a system reminder forcing the model to emit final format.

        If the last message is an AIMessage with pending tool_calls (because
        we hit MAX_TOOL_CALLS cap), fabricate dummy ToolMessage replies first
        so the conversation history stays valid.
        """
        from langchain_core.messages import ToolMessage

        last = state["messages"][-1]
        if hasattr(last, "tool_calls") and last.tool_calls:
            for call in last.tool_calls:
                state["messages"].append(
                    ToolMessage(
                        content="(Tool call dibatalkan — batas iterasi tercapai. Finalisasi sekarang dengan bukti yang sudah ada.)",
                        tool_call_id=call.get("id", ""),
                    )
                )

        forces = state.get("_force_count", 0)
        state["_force_count"] = forces + 1
        state["messages"].append(
            HumanMessage(
                content=(
                    "STOP. Batas iterasi tool tercapai atau Anda belum memberikan skor final. "
                    "Output tool sebelumnya dari sistem, bukan user. "
                    "Sekarang berikan HANYA 3 baris dengan format ini, tanpa pertanyaan balik:\n\n"
                    "SKOR: <0-4>\nJUSTIFIKASI: <2-3 kalimat>\nCONFIDENCE: <0.0-1.0>"
                )
            )
        )
        return state

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
    graph.add_node("force", force_finalize_node)
    graph.add_node("parse_output", parse_output_node)

    graph.set_entry_point("agent")
    graph.add_conditional_edges(
        "agent",
        should_continue,
        {"tools": "tools", "force": "force", "parse_output": "parse_output"},
    )
    graph.add_edge("tools", "agent")
    graph.add_edge("force", "agent")
    graph.add_edge("parse_output", END)

    return graph.compile()
