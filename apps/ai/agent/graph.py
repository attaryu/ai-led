"""LangGraph ReAct agent for cross-referencing LED + LKPS against the rubric.

Flow per indicator:
    agent → (tool_calls?) → tools → agent → ... → parse_output → END

The agent node sends the current message list to the LLM. If the LLM returns
tool calls, the ToolNode executes them and appends results to the message list
before going back to the agent. Once the LLM responds without tool calls,
parse_output extracts score, justification, confidence, and recommendation.
"""

from __future__ import annotations

import logging
import os
import re
from typing import Literal, Optional

from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.graph import END, StateGraph
from langgraph.prebuilt import ToolNode

from agent.state import AssessmentState
from agent.tools.formula_tool import compute_formula_score
from agent.tools.led_tool import search_led_evidence
from agent.tools.lkps_tool import get_lkps_table
from agent.tools.rubric_tool import get_indicator_rubric
from llm.ollama_client import OllamaClient

logger = logging.getLogger(__name__)

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
    """Pick native or reasoning graph based on the active model name.

    ollama_client.model is the single source of truth for "which model is
    actually active", regardless of LLM_PROVIDER — create_ollama_client_from_env()
    already resolves it from OLLAMA_MODEL or OPENROUTER_MODEL as appropriate,
    so this dispatch (and _build_llm's provider branches) can just trust it
    instead of independently re-reading provider-specific env vars."""
    if is_reasoning_model(ollama_client.model):
        from agent.reasoning_graph import build_reasoning_graph
        return build_reasoning_graph(ollama_client)

    return build_graph(ollama_client)


def _build_llm(ollama_client: OllamaClient):
    """Return a tool-bound LangChain chat model.

    Provider is selected by LLM_PROVIDER env var (default: ollama):

        LLM_PROVIDER=ollama       — Ollama on Vast.ai
        LLM_PROVIDER=openrouter   — OpenRouter API (reads OPENROUTER_API_KEY)

    Either way, the model name comes from ollama_client.model — it's the
    single source of truth regardless of provider (see
    create_ollama_client_from_env / get_available_models).
    """
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
            .bind_tools(TOOLS)
            .with_retry(stop_after_attempt=3)
        )

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

    # Retry transient connection failures (e.g. connection reset mid-request
    # to the remote Ollama instance) instead of letting them propagate raw
    # into the indicator's error field with zero retry.
    return ChatOllama(**kwargs).bind_tools(TOOLS).with_retry(stop_after_attempt=3)

_SYSTEM_PROMPT = """Anda adalah AGEN OTONOM penilai akreditasi program studi (AMI).
Anda BUKAN chatbot. Anda TIDAK bertanya balik ke user. Anda menyelesaikan
tugas penilaian SECARA MANDIRI sampai keluar skor final.

ALUR YANG WAJIB DIIKUTI per indikator:
1. Panggil get_indicator_rubric(indicator_no) untuk dapat kriteria scoring
2. Panggil search_led_evidence(query) untuk cari bukti kualitatif dari LED —
   query WAJIB kaya konteks: masukkan nomor indikator + kata kunci konkret
   dari kriteria rubrik (bukan cuma topik umum seperti "visi misi"), supaya
   hasil pencarian semantik lebih relevan
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
- DILARANG keluar dari loop tanpa SKOR/JUSTIFIKASI/CONFIDENCE/REKOMENDASI final
- Jika bukti tidak cukup → tetap beri skor 0 atau 1 dengan justifikasi "bukti tidak ditemukan"

FORMAT OUTPUT FINAL (WAJIB tepat seperti ini, tanpa markdown apapun):

SKOR: <angka 0-4, contoh: 3 atau 3.5>
JUSTIFIKASI: <2-3 kalimat Bahasa Indonesia tentang dasar penilaian>
CONFIDENCE: <angka 0.0-1.0, contoh: 0.85>
REKOMENDASI: <2-3 kalimat Bahasa Indonesia, actionable, spesifik terhadap kekurangan. Jika skor sudah 4, tulis rekomendasi untuk mempertahankan praktik yang sudah baik>

Contoh respons final yang BENAR:
SKOR: 3
JUSTIFIKASI: Program studi memiliki dokumen VMTS yang lengkap dan disusun secara partisipatif (LED hal. 30). LKPS menunjukkan 72% DTPS sesuai bidang keilmuan. Bukti memadai namun belum mencapai standar maksimal.
CONFIDENCE: 0.85
REKOMENDASI: Tingkatkan persentase DTPS yang sesuai bidang keilmuan hingga di atas 80% melalui rekrutmen dosen baru atau penyesuaian penugasan mengajar."""

# ---------------------------------------------------------------------------
# Checklist generation — shared by graph.py and reasoning_graph.py
# ---------------------------------------------------------------------------

CHECKLIST_PROMPT_TEMPLATE = """Anda asesor akreditasi program studi yang berpengalaman.

Berdasarkan rubrik penilaian berikut, buat daftar 4-8 poin kriteria/fakta
KONKRET yang wajib diverifikasi untuk menentukan skor indikator ini secara
akurat.

RUBRIK:
{rubric_text}

TUGAS: Buat daftar checklist, SATU POIN PER BARIS, diawali "- ". Tiap poin
harus konkret dan bisa dicek lewat pencarian bukti di LED/LKPS. JANGAN beri
penjelasan lain, HANYA daftar checklist."""

_CHECKLIST_ITEM_RE = re.compile(r"^[-*•]\s+(.+)$|^\d+[\.\)]\s+(.+)$")


def parse_checklist(text: str) -> list[str]:
    """Extract checklist items from a freeform LLM response (bullet or
    numbered list, one item per line). Caps at 8 items, matching the prompt."""
    items: list[str] = []
    for line in (text or "").split("\n"):
        line = line.strip()
        match = _CHECKLIST_ITEM_RE.match(line)
        if match:
            item = (match.group(1) or match.group(2) or "").strip()
            if len(item) > 5:
                items.append(item)
    return items[:8]


def find_tool_result(messages: list, tool_name: str) -> Optional[str]:
    """Return the content of the most recent ToolMessage for `tool_name`,
    falling back to the single most recent ToolMessage of any name if none
    matches exactly (defensive — the model isn't hard-forced to call tools
    in a fixed order, even though the initial prompt asks it to)."""
    from langchain_core.messages import ToolMessage

    last_any: Optional[str] = None
    for msg in reversed(messages):
        if isinstance(msg, ToolMessage):
            if last_any is None:
                last_any = msg.content
            if getattr(msg, "name", None) == tool_name:
                return msg.content
    return last_any


def collect_evidence_text(
    messages: list,
    tool_names: tuple[str, ...] = ("search_led_evidence", "get_lkps_table"),
) -> str:
    """Concatenate the content of every ToolMessage from the given tools —
    i.e. the actual evidence retrieved this run, as opposed to the rubric
    (criteria) or formula (computation) — for the judge to check the final
    justification against."""
    from langchain_core.messages import ToolMessage

    parts = []
    for msg in messages:
        if isinstance(msg, ToolMessage) and getattr(msg, "name", None) in tool_names:
            parts.append(f"[{msg.name}] {msg.content}")
    return "\n\n".join(parts)


# ---------------------------------------------------------------------------
# Independent judge — shared by graph.py and reasoning_graph.py
# ---------------------------------------------------------------------------

JUDGE_PROMPT_TEMPLATE = """Anda adalah auditor independen yang mengevaluasi apakah justifikasi
skor akreditasi di bawah ini benar-benar didukung oleh bukti yang tersedia —
TANPA menilai ulang apakah skornya sendiri sudah tepat secara substansi.

JUSTIFIKASI YANG DINILAI:
{justification}

BUKTI YANG TERSEDIA (hasil pencarian LED/LKPS selama proses penilaian):
{evidence_text}

TUGAS: Nilai apakah setiap klaim konkret dalam justifikasi di atas (terutama
angka, nama dokumen, dan pernyataan faktual) didukung oleh bukti yang
tersedia. Jawab HANYA dengan JSON satu baris, tanpa markdown maupun
penjelasan lain:

{{"grounded": <true/false>, "hallucinated_claims": ["<klaim yang tidak didukung bukti>", ...], "missing_facts": ["<hal relevan yang tersedia di bukti tapi tidak disebut>", ...], "notes": "<1 kalimat ringkasan>"}}

Kalau semua klaim didukung bukti dan tidak ada yang mengada-ada, grounded
harus true dan hallucinated_claims kosong."""

_JUDGE_CODE_FENCE_RE = re.compile(r"```(?:json)?\s*(\{.*?\})\s*```", re.DOTALL)
_JUDGE_THINK_RE = re.compile(r"<think>.*?</think>", re.DOTALL | re.IGNORECASE)


def parse_judge_verdict(text: str) -> Optional[dict]:
    """Best-effort JSON extraction for the judge's verdict — tolerant of
    <think> blocks (reasoning-model judges), code fences, and surrounding
    prose, since the judge is a separate, independently-configured model
    that isn't guaranteed to follow the "JSON only" instruction perfectly."""
    import json

    cleaned = _JUDGE_THINK_RE.sub("", text or "").strip()

    fenced = _JUDGE_CODE_FENCE_RE.findall(cleaned)
    for candidate in reversed(fenced):
        try:
            return json.loads(candidate)
        except json.JSONDecodeError:
            continue

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
                candidates.append(cleaned[start: i + 1])
                start = -1
    for candidate in reversed(candidates):
        try:
            return json.loads(candidate)
        except json.JSONDecodeError:
            continue

    return None


def build_judge_llm():
    """Return a plain chat model for the independent judge, configured via
    RAGAS_* env vars (same resolution as the offline RAGAS eval judge, so
    there's one place to configure "the model that grades other models" —
    see eval.ragas_eval.get_judge_llm_config). Deliberately NOT the same
    instance/config as the assessment model, so it isn't grading its own
    justification."""
    from eval.ragas_eval import get_judge_llm_config

    cfg = get_judge_llm_config()

    if cfg["provider"] == "openrouter":
        from langchain_openai import ChatOpenAI

        return ChatOpenAI(
            base_url="https://openrouter.ai/api/v1",
            api_key=os.environ["OPENROUTER_API_KEY"],
            model=cfg["model"],
            temperature=0.0,
        )

    from langchain_ollama import ChatOllama
    from llm.ollama_client import pick_ollama_endpoint

    judge_base_url = pick_ollama_endpoint(
        os.environ.get(
            "RAGAS_OLLAMA_BASE_URL", os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434")
        )
    )
    logger.info("Grounding judge using Ollama endpoint %s", judge_base_url)

    kwargs: dict = {
        "base_url": judge_base_url,
        "model": cfg["model"],
        "temperature": 0.0,
    }
    api_key = os.environ.get("RAGAS_OLLAMA_API_KEY", os.environ.get("OLLAMA_API_KEY"))
    if api_key and not api_key.startswith("<"):
        kwargs["client_kwargs"] = {"headers": {"Authorization": f"Bearer {api_key}"}}
    return ChatOllama(**kwargs)


def build_graph(ollama_client: OllamaClient) -> StateGraph:
    """Compile and return the assessment LangGraph.

    The LLM provider is chosen via LLM_PROVIDER env var — see _build_llm().
    ollama_client is only used when LLM_PROVIDER=ollama (default).
    """
    llm = _build_llm(ollama_client)

    tool_node = ToolNode(TOOLS)

    def tools_node(state: AssessmentState) -> AssessmentState:
        """Run the real ToolNode, then bump the round counter should_continue
        checks against MAX_TOOL_CALLS."""
        result = tool_node.invoke(state)
        result["_tool_call_count"] = state.get("_tool_call_count", 0) + 1
        return result

    # ── Node: checklist (runs once, right after the first tool round) ────────

    def checklist_node(state: AssessmentState) -> AssessmentState:
        """Build an explicit checklist of rubric sub-criteria to check, once
        per indicator, from whatever the rubric tool returned. Injected as
        guidance, not hard-enforced — a model that genuinely finds no
        evidence for an item can still score conservatively per the system
        prompt's "bukti tidak ditemukan" escape hatch. Never blocks the flow:
        a failed checklist call just skips straight to the agent."""
        state["_checklist_built"] = True

        rubric_text = find_tool_result(state["messages"], "get_indicator_rubric")
        if not rubric_text:
            state["checklist"] = None
            return state

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
                        "Pastikan bukti untuk tiap poin sudah dicari sebelum memberi skor "
                        "final. Jika bukti untuk suatu poin tidak ditemukan, itu sah — "
                        "sebutkan di justifikasi."
                    )
                )
            )

        steps = state.get("reasoning_steps", [])
        state["reasoning_steps"] = list(steps) + [{"checklist": checklist}]
        return state

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
    # Separate guard against a model that keeps VALIDLY calling tools forever
    # (never stuck, never finalizing either) — without this, should_continue
    # would route to "tools" unconditionally and the loop is only bounded by
    # LangGraph's own recursion_limit, which surfaces as an unhandled
    # GraphRecursionError rather than a graceful (if conservative) result.
    MAX_TOOL_CALLS = 12

    def _looks_like_finalized(content: str) -> bool:
        """Detect if message contains a parseable SKOR line AND a JUSTIFIKASI
        marker. Requiring both avoids accepting a free-form response (e.g. a
        markdown table/essay that merely mentions "Skor: 4" somewhere) as
        finalized — which would otherwise make parse_output_node's fallback
        grab the first 600 chars of unrelated text as the justification."""
        cleaned = re.sub(r"\*{1,3}|`+|#+\s*", "", content or "")
        has_score = bool(
            re.search(
                r"(?im)\bskor(?:\s+(?:final|akhir))?\s*[:=]\s*[0-9]+(?:\.[0-9]+)?",
                cleaned,
            )
        )
        has_justification = bool(re.search(r"(?im)\bjustifikasi\s*[:=]", cleaned))
        return has_score and has_justification

    def should_continue(state: AssessmentState) -> Literal["tools", "force", "parse_output", "give_up"]:
        last = state["messages"][-1]
        # Both trigger reasons below (too many tool rounds, or stuck without a
        # final answer) share the SAME force-retry budget, so a model that
        # exhausts MAX_TOOL_CALLS and then keeps re-requesting tools after each
        # force nudge can't loop past FORCE_LIMIT either — it always converges
        # on parse_output.
        forces = state.get("_force_count", 0)

        if hasattr(last, "tool_calls") and last.tool_calls:
            tool_calls_so_far = state.get("_tool_call_count", 0)
            if tool_calls_so_far >= MAX_TOOL_CALLS:
                return "force" if forces < FORCE_LIMIT else "give_up"
            return "tools"

        content = getattr(last, "content", "") or ""
        if _looks_like_finalized(content):
            return "parse_output"

        return "force" if forces < FORCE_LIMIT else "give_up"

    def give_up_node(state: AssessmentState) -> AssessmentState:
        """Reached when FORCE_LIMIT is exhausted without ever producing a
        parseable SKOR+JUSTIFIKASI response. Sets an explicit error instead
        of falling through to parse_output_node, which would otherwise
        silently parse empty/unstructured content into a uniform
        score=None/confidence=0.5/justification="" result indistinguishable
        from a genuine (but empty) model answer."""
        state["error"] = (
            "Model tidak menghasilkan format SKOR/JUSTIFIKASI yang valid "
            "setelah batas percobaan force-finalize tercapai."
        )
        return state

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
                    "Sekarang berikan HANYA 4 baris dengan format ini, tanpa pertanyaan balik:\n\n"
                    "SKOR: <0-4>\nJUSTIFIKASI: <2-3 kalimat>\nCONFIDENCE: <0.0-1.0>\n"
                    "REKOMENDASI: <2-3 kalimat actionable>"
                )
            )
        )
        return state

    # ── Node: parse_output ────────────────────────────────────────────────────

    def parse_output_node(state: AssessmentState) -> AssessmentState:
        """Extract score, justification, confidence, and recommendation from the final LLM message.

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

        # Recommendation: last field, capture to end of message. None if absent
        # (missing recommendation must not block finalization or trigger retry).
        rekom_match = re.search(
            r"(?is)\brekomendasi\s*[:=]\s*(.+)$",
            cleaned,
        )
        state["recommendation"] = rekom_match.group(1).strip()[:500] if rekom_match else None

        return state

    # ── Node: judge (independent post-hoc grounding check) ───────────────────

    def judge_node(state: AssessmentState) -> AssessmentState:
        """Check whether the final justification is grounded in evidence
        actually retrieved this run, using a SEPARATE model (build_judge_llm)
        so the assessment model isn't grading its own homework. Soft signal:
        lowers confidence when ungrounded, never blocks or reruns scoring.
        Skipped entirely if there's no score to judge."""
        if state.get("final_score") is None:
            return state

        evidence_text = collect_evidence_text(state["messages"])
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

    # ── Build graph ───────────────────────────────────────────────────────────

    def route_after_tools(state: AssessmentState) -> Literal["checklist", "agent"]:
        return "agent" if state.get("_checklist_built") else "checklist"

    graph = StateGraph(AssessmentState)
    graph.add_node("agent", agent_node)
    graph.add_node("tools", tools_node)
    graph.add_node("checklist", checklist_node)
    graph.add_node("force", force_finalize_node)
    graph.add_node("parse_output", parse_output_node)
    graph.add_node("judge", judge_node)
    graph.add_node("give_up", give_up_node)

    graph.set_entry_point("agent")
    graph.add_conditional_edges(
        "agent",
        should_continue,
        {
            "tools": "tools",
            "force": "force",
            "parse_output": "parse_output",
            "give_up": "give_up",
        },
    )
    graph.add_conditional_edges(
        "tools", route_after_tools, {"checklist": "checklist", "agent": "agent"}
    )
    graph.add_edge("checklist", "agent")
    graph.add_edge("force", "agent")
    graph.add_edge("parse_output", "judge")
    graph.add_edge("judge", END)
    graph.add_edge("give_up", END)

    return graph.compile()
