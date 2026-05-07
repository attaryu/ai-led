"""LangGraph ReAct agent for cross-referencing LED + LKPS against the rubric.

Flow per indicator:
    agent → (tool_calls?) → tools → agent → ... → parse_output → END

The agent node sends the current message list to the LLM. If the LLM returns
tool calls, the ToolNode executes them and appends results to the message list
before going back to the agent. Once the LLM responds without tool calls,
parse_output extracts score, justification, and confidence.
"""

from __future__ import annotations

import re
from typing import Literal

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_ollama import ChatOllama
from langgraph.graph import END, StateGraph
from langgraph.prebuilt import ToolNode

from agent.state import AssessmentState
from agent.tools.formula_tool import compute_formula_score
from agent.tools.led_tool import search_led_evidence
from agent.tools.lkps_tool import get_lkps_table
from agent.tools.rubric_tool import get_indicator_rubric
from llm.ollama_client import OllamaClient

TOOLS = [get_indicator_rubric, search_led_evidence, get_lkps_table, compute_formula_score]

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

INSTRUKSI OUTPUT: Setelah mengumpulkan semua bukti, akhiri dengan format:
SKOR: <angka 0-4 atau pecahan desimal untuk composite>
JUSTIFIKASI: <paragraf ringkas dalam Bahasa Indonesia menjelaskan dasar penilaian>
CONFIDENCE: <0.0-1.0>"""


def build_graph(ollama_client: OllamaClient) -> StateGraph:
    """Compile and return the assessment LangGraph."""
    llm = ChatOllama(
        base_url=ollama_client.base_url,
        model=ollama_client.model,
        temperature=0.1,
    ).bind_tools(TOOLS)

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
        """Extract score, justification, and confidence from the final LLM message."""
        last_content = state["messages"][-1].content

        score_match = re.search(r"SKOR:\s*([\d\.]+)", last_content)
        just_match = re.search(
            r"JUSTIFIKASI:\s*(.+?)(?=CONFIDENCE:|$)", last_content, re.DOTALL
        )
        conf_match = re.search(r"CONFIDENCE:\s*([\d\.]+)", last_content)

        state["final_score"] = float(score_match.group(1)) if score_match else None
        state["justification"] = (
            just_match.group(1).strip() if just_match else last_content[:500]
        )
        state["confidence"] = float(conf_match.group(1)) if conf_match else 0.5
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
