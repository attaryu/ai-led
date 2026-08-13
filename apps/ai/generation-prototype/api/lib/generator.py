"""6-stage RAG pipeline pakai LangChain Expression Language (LCEL).

  Tahap 1. Route        → identifikasi section
  Tahap 2. Rule-book    → search_pedoman + search_rubric (paralel)
  Tahap 3. Checklist    → LLM buat daftar pertanyaan faktual
  Tahap 4. Facts        → search_lkps + search_evidence per item checklist
  Tahap 5. Synthesis    → LLM tulis narasi
  Tahap 6. Judge        → gpt-oss:20b evaluate 4 metrik RAGAS

Tracing otomatis ke LangSmith kalau LANGCHAIN_TRACING_V2=true.
"""
import json
import os
import re
import time
from typing import Dict, List, Any

from langchain_core.prompts import PromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_core.runnables import (RunnableLambda, RunnableParallel,
                                       RunnablePassthrough)

from .db import conn
from .outline import get_section
from .retrieval import (search_rubric, search_pedoman,
                          search_lkps, search_evidence)
from .prompts import (build_generate_prompt, build_checklist_prompt,
                       build_judge_prompt, SYSTEM_GENERATE, SYSTEM_CHECKLIST,
                       SYSTEM_JUDGE)
from .ollama_client import (get_llm_for_synthesis, get_llm_for_checklist,
                              get_llm_for_judge, disable_thinking_prompt)

JUDGE_MODEL = os.environ.get("JUDGE_MODEL", "gpt-oss:20b")


# ──────────────────────────────────────────────────────────────────────
# Helper LCEL Runnable per tahap
# ──────────────────────────────────────────────────────────────────────

def _route_section(inp: Dict) -> Dict:
    """Tahap 1: ambil definisi section.

    `title`         dipakai untuk PROMPT (judul yang muncul di prompt LLM).
    `retrieval_query` dipakai untuk RETRIEVAL (query embedding ke Chroma).
    Keduanya berisi konteks BAB → sub-bab → ... → poin supaya retrieval kaya.
    """
    sid = inp["section_id"]
    sec = get_section(sid)
    if not sec:
        raise ValueError(f"Section {sid} tidak ditemukan")
    # retrieval_query: multi-baris breadcrumb (untuk embedding)
    retrieval_query = sec.get("retrieval_query") or sec["title"]
    # title untuk prompt: sama dengan retrieval_query supaya LLM tahu
    # konteks BAB/sub-bab penuh, bukan cuma 'iii Proses tinjauan rutin RPS'
    return {**inp,
            "section":         sec,
            "title":           retrieval_query,
            "retrieval_query": retrieval_query}


def _retrieve_rules(inp: Dict) -> Dict:
    """Tahap 2: paralel ambil pedoman + rubric."""
    query = inp["retrieval_query"]
    rubric_filter = (inp["section"].get("rubric_filter") or {})
    where = None
    if rubric_filter:
        k = next(iter(rubric_filter))
        if rubric_filter[k]:
            where = {k: rubric_filter[k]}

    pedoman = search_pedoman(query, k=5)
    rubric = search_rubric(query, k=5, where=where) or search_rubric(query, k=5)
    return {**inp, "pedoman": pedoman, "rubric": rubric}


def _build_checklist(inp: Dict) -> Dict:
    """Tahap 3: LLM buat daftar pertanyaan."""
    prompt_text = build_checklist_prompt(inp["title"], inp["pedoman"], inp["rubric"])
    prompt_text = disable_thinking_prompt(prompt_text, inp["model"])
    llm = get_llm_for_checklist(inp["model"])

    try:
        raw = llm.invoke(prompt_text)
    except Exception as e:
        return {**inp, "checklist": [inp["title"]], "_checklist_error": str(e)}

    # Strip thinking block (reasoning models)
    raw = re.sub(r"<think>.*?</think>", "", raw, flags=re.DOTALL)
    items = []
    for line in raw.split("\n"):
        line = line.strip()
        m = re.match(r"^[-\*•]\s+(.+)$|^\d+[\.\)]\s+(.+)$", line)
        if m:
            item = (m.group(1) or m.group(2) or "").strip()
            if len(item) > 5:
                items.append(item)

    # Dedup + cap 8
    seen, uniq = set(), []
    for it in items:
        if it not in seen:
            seen.add(it)
            uniq.append(it)
    checklist = uniq[:8] or [inp["title"]]
    return {**inp, "checklist": checklist}


def _retrieve_facts(inp: Dict) -> Dict:
    """Tahap 4: search LKPS + Evidence per checklist item (stratified)."""
    seen_lkps, seen_ev = set(), set()
    lkps_out, ev_out = [], []

    for q in inp["checklist"]:
        try:
            for h in search_lkps(q, k=2):
                if h["id"] in seen_lkps:
                    continue
                seen_lkps.add(h["id"])
                h["_checklist_query"] = q
                h["_source_kind"]     = "lkps"
                lkps_out.append(h)
        except Exception:
            pass

        try:
            for h in search_evidence(q, k=2):
                if h["id"] in seen_ev:
                    continue
                seen_ev.add(h["id"])
                h["_checklist_query"] = q
                h["_source_kind"]     = "evidence"
                ev_out.append(h)
        except Exception:
            pass

    # Fallback: top-up kalau salah satu thin — pakai retrieval_query
    # (breadcrumb multi-baris) supaya context-rich
    query = inp["retrieval_query"]
    if len(lkps_out) < 3:
        for h in search_lkps(query, k=3 - len(lkps_out)):
            if h["id"] not in seen_lkps:
                seen_lkps.add(h["id"])
                h["_source_kind"] = "lkps"
                lkps_out.append(h)
    if len(ev_out) < 5:
        for h in search_evidence(query, k=5 - len(ev_out)):
            if h["id"] not in seen_ev:
                seen_ev.add(h["id"])
                h["_source_kind"] = "evidence"
                ev_out.append(h)

    return {**inp, "lkps_facts": lkps_out, "evidence_facts": ev_out,
            "facts": lkps_out + ev_out}


def _synthesize(inp: Dict) -> Dict:
    """Tahap 5: LLM tulis narasi LED."""
    prompt_text = build_generate_prompt(
        inp["title"], inp["rubric"], inp["facts"], inp["pedoman"],
        checklist=inp["checklist"],
    )
    prompt_text = disable_thinking_prompt(prompt_text, inp["model"])
    llm = get_llm_for_synthesis(inp["model"])

    t0 = time.time()
    try:
        raw = llm.invoke(prompt_text)
    except Exception as e:
        return {**inp, "draft_text": "", "_synthesis_error": str(e),
                "_synthesis_latency": round(time.time() - t0, 2)}
    latency = time.time() - t0

    cleaned = re.sub(r"<think>.*?</think>", "", raw, flags=re.DOTALL).strip()
    return {**inp,
            "draft_text":          cleaned or raw,
            "_synthesis_prompt":   prompt_text,
            "_synthesis_latency":  round(latency, 2)}


def _judge(inp: Dict) -> Dict:
    """Tahap 6: gpt-oss:20b evaluate 4 metrik RAGAS."""
    prompt_text = build_judge_prompt(
        inp["title"], inp["draft_text"], inp["rubric"], inp["facts"],
    )
    llm = get_llm_for_judge(JUDGE_MODEL)

    t0 = time.time()
    try:
        raw = llm.invoke(prompt_text)
    except Exception as e:
        return {**inp, "judge_result": {
            "error": str(e),
            "_judge_model": JUDGE_MODEL,
            "_judge_latency": round(time.time() - t0, 2),
        }}
    latency = time.time() - t0

    raw = re.sub(r"<think>.*?</think>", "", raw, flags=re.DOTALL).strip()
    raw = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw, flags=re.MULTILINE).strip()

    data = _parse_judge_json(raw) if raw else {"error": "empty response"}
    data["_judge_model"]   = JUDGE_MODEL
    data["_judge_latency"] = round(latency, 2)
    return {**inp, "judge_result": data}


def _parse_judge_json(raw: str) -> Dict:
    """Multi-strategy JSON parser utk judge output."""
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass

    m = re.search(r"\{.*\}", raw, re.DOTALL)
    if m:
        try:
            return json.loads(m.group(0))
        except json.JSONDecodeError:
            pass

    # Truncated JSON: regex ekstrak 4 metrik
    metrics = {}
    for key in ("faithfulness", "answer_relevancy",
                "context_precision", "context_recall"):
        rx = re.search(rf'"{key}"\s*:\s*([0-9]*\.?[0-9]+)', raw)
        if rx:
            try:
                metrics[key] = float(rx.group(1))
            except ValueError:
                pass

    if metrics:
        metrics["raw"] = raw
        metrics["parse_warning"] = "JSON truncated, extracted via regex"
        return metrics

    return {"raw": raw, "parse_error": "could not extract any metric"}


def _save_to_db(inp: Dict) -> Dict:
    """Persist hasil ke SQLite."""
    facts = inp["facts"]
    section_id = inp["section_id"]
    model = inp["model"]
    title = inp["title"]

    pedoman_used  = json.dumps([{"id": p["id"], "text": (p.get("text") or "")[:300]}
                                 for p in inp["pedoman"]], ensure_ascii=False)
    rubric_used   = json.dumps([{"id": r["id"], "text": (r.get("text") or "")[:300]}
                                 for r in inp["rubric"]], ensure_ascii=False)
    chunks_used   = json.dumps([{
        "id":       c["id"],
        "kind":     c.get("_source_kind"),
        "filename": (c.get("metadata") or {}).get("filename")
                    or (c.get("metadata") or {}).get("judul")
                    or (c.get("metadata") or {}).get("sheet"),
        "text":     (c.get("text") or "")[:300],
        "query":    c.get("_checklist_query"),
    } for c in facts], ensure_ascii=False)
    checklist_str = json.dumps(inp["checklist"], ensure_ascii=False)
    judge_str     = json.dumps(inp["judge_result"], ensure_ascii=False)

    with conn() as con:
        con.execute("""
            INSERT INTO drafts (section_id, section_title, model, draft_text,
                                pedoman_used, rubric_used, checklist, chunks_used,
                                judge_result, prompt_full, latency_sec,
                                token_count, status, updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?, CURRENT_TIMESTAMP)
            ON CONFLICT(section_id, model) DO UPDATE SET
                draft_text=excluded.draft_text,
                pedoman_used=excluded.pedoman_used,
                rubric_used=excluded.rubric_used,
                checklist=excluded.checklist,
                chunks_used=excluded.chunks_used,
                judge_result=excluded.judge_result,
                prompt_full=excluded.prompt_full,
                latency_sec=excluded.latency_sec,
                token_count=excluded.token_count,
                updated_at=CURRENT_TIMESTAMP
        """, (section_id, title, model, inp["draft_text"],
              pedoman_used, rubric_used, checklist_str, chunks_used,
              judge_str, inp.get("_synthesis_prompt", ""),
              inp.get("_synthesis_latency", 0),
              None,   # token_count tidak tersedia langsung dari LangChain Ollama wrapper
              "draft"))

    return {
        "section_id":    section_id,
        "section_title": title,
        "model":         model,
        "draft_text":    inp["draft_text"],
        "pedoman_used":  pedoman_used,
        "rubric_used":   rubric_used,
        "checklist":     checklist_str,
        "chunks_used":   chunks_used,
        "judge_result":  judge_str,
        "latency_sec":   inp.get("_synthesis_latency", 0),
        "token_count":   None,
    }


# ──────────────────────────────────────────────────────────────────────
# LCEL Chain (6 stages dirangkai sebagai pipeline)
# ──────────────────────────────────────────────────────────────────────

# Chain dirangkai sebagai sequence Runnable - tiap stage di-tag supaya
# muncul terpisah di LangSmith dashboard
generate_chain = (
    RunnableLambda(_route_section,    name="01_route")
    | RunnableLambda(_retrieve_rules, name="02_retrieve_rules")
    | RunnableLambda(_build_checklist,name="03_build_checklist")
    | RunnableLambda(_retrieve_facts, name="04_retrieve_facts")
    | RunnableLambda(_synthesize,     name="05_synthesize")
    | RunnableLambda(_judge,          name="06_judge")
    | RunnableLambda(_save_to_db,     name="07_save_db")
).with_config({"run_name": "led_generate_section"})


# ──────────────────────────────────────────────────────────────────────
# Public API
# ──────────────────────────────────────────────────────────────────────

def generate_section(section_id: str, model: str, k: int = 8,
                     overwrite: bool = False) -> Dict:
    """Generate 1 section via LCEL chain.

    Args:
        section_id: ID section dari outline.py
        model:      Model Ollama utk synthesis (deepseek-r1:32b / qwen3.5:35b)
        k:          unused (LCEL chain pakai value default)
        overwrite:  Kalau True, hapus chat history + force regenerate

    Returns:
        Dict berisi section_id, section_title, model, draft_text,
        pedoman_used, rubric_used, checklist, chunks_used, judge_result, dst.
    """
    # Cek DB dulu
    if not overwrite:
        with conn() as con:
            row = con.execute(
                "SELECT * FROM drafts WHERE section_id=? AND model=?",
                (section_id, model)).fetchone()
            if row:
                return dict(row)
    else:
        # Regenerate: bersihkan chat history utk section+model ini
        with conn() as con:
            con.execute(
                "DELETE FROM chat_messages WHERE section_id=? AND model=?",
                (section_id, model))

    # Invoke LCEL chain
    result = generate_chain.invoke({
        "section_id": section_id,
        "model":      model,
    })
    return result
