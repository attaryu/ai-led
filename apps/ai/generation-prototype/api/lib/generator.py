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
from .context import get_system_user_id, get_urutan_bab
from .outline import get_section
from .retrieval import (search_rubric, search_pedoman,
                          search_lkps, search_evidence,
                          search_document_registry)
from .prompts import (build_generate_prompt, build_checklist_prompt,
                       build_judge_prompt, SYSTEM_GENERATE, SYSTEM_CHECKLIST,
                       SYSTEM_JUDGE, _parse_llm_json,
                       build_route_and_plan_prompt,
                       build_assess_and_recommend_prompt)
from .ollama_client import (get_llm_for_synthesis, get_llm_for_checklist,
                              get_llm_for_judge, disable_thinking_prompt,
                              get_llm_for_route_and_plan,
                              get_llm_for_assess_and_recommend)
from .prose import text_to_doc, doc_to_text, is_empty_doc, EMPTY_DOC

JUDGE_MODEL = os.environ.get("JUDGE_MODEL", "gpt-oss:20b")
# Set RUBRIK_WRITING=false di .env utk skip rubrik penilaian sepenuhnya --
# _retrieve_rules tidak search_rubric sama sekali, jadi checklist, sintesis
# narasi, judge, DAN tahap rekomendasi dokumen (recommend_chain reuse stage
# yg sama) semuanya jalan tanpa rubric sbg acuan, murni dari pedoman+fakta.
RUBRIK_WRITING = os.environ.get("RUBRIK_WRITING", "true").strip().lower() not in ("false", "0", "no")


class SectionNotGeneratableError(ValueError):
    """Section valid (ada di outline) tapi TIDAK BOLEH digenerate narasinya
    -- beda dari ValueError biasa (section tidak ditemukan sama sekali,
    dipetakan ke 404 di routes/sections.py). Dipetakan ke 400 Bad Request."""
    pass


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
    # Level 'bab' (Heading 1 -- BAB I, BAB II, dst) murni container/judul,
    # TIDAK PERNAH punya narasi sendiri -- yang bisa digenerate cuma
    # sub_bab/sub_sub_bab/dst di bawahnya. Guard di tahap PALING AWAL ini
    # (Tahap 1) otomatis menolak baik recommend_chain maupun generate_chain,
    # krn keduanya reuse _route_section sbg stage pertama.
    if sec.get("level") == "bab":
        raise SectionNotGeneratableError(
            f"Section {sid} adalah judul BAB (Heading 1) -- tidak bisa "
            "digenerate narasinya, pilih sub-bab di bawahnya."
        )
    # retrieval_query: multi-baris breadcrumb (untuk embedding)
    retrieval_query = sec.get("retrieval_query") or sec["title"]
    # title untuk prompt: sama dengan retrieval_query supaya LLM tahu
    # konteks BAB/sub-bab penuh, bukan cuma 'iii Proses tinjauan rutin RPS'
    return {**inp,
            "section":         sec,
            "title":           retrieval_query,
            "retrieval_query": retrieval_query}


RUBRIC_MAX_DISTANCE = 0.40


def _retrieve_rules(inp: Dict) -> Dict:
    """Tahap 2: paralel ambil pedoman + rubric.

    RUBRIK_WRITING=false (.env) -> skip search_rubric sepenuhnya, rubric jadi
    [] -- titik masuk TUNGGAL rubric utk seluruh pipeline (checklist, sintesis
    narasi, judge, rekomendasi dokumen, bab_referensi_chunk semua reuse stage
    ini), jadi cukup dimatikan di sini utk mempengaruhi semuanya sekaligus."""
    query = inp["retrieval_query"]
    pedoman = search_pedoman(query, k=1)

    if not RUBRIK_WRITING:
        return {**inp, "pedoman": pedoman, "rubric": []}

    rubric_filter = (inp["section"].get("rubric_filter") or {})
    where = None
    if rubric_filter:
        k = next(iter(rubric_filter))
        if rubric_filter[k]:
            where = {k: rubric_filter[k]}

    rubric = search_rubric(query, k=5, where=where) or search_rubric(query, k=5)

    # Section naratif (mis. BAB I Pendahuluan) tidak punya kriteria penilaian
    # di matrik sama sekali -- search_rubric tetap mengembalikan top-k
    # "terdekat walau jauh" (distance jauh lebih tinggi dari section yang
    # memang punya rubric relevan, ~0.32-0.33 vs >0.40). Kalau hasil
    # terdekatnya sudah melewati ambang ini, anggap tidak ada rubric relevan
    # supaya checklist/narasi tidak dituntun ke topik section lain.
    if rubric and rubric[0].get("distance") is not None and rubric[0]["distance"] > RUBRIC_MAX_DISTANCE:
        rubric = []

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


def _section_needs_lkps(target_draft_id: str) -> bool:
    """Baca keputusan needs_lkps dari rekomendasi 'confirmed' MILIK draft yg
    sedang diisi (bab_draft_id) -- bukan lagi global per section+model, krn
    1 section boleh py banyak draft, masing2 dgn rekomendasi sendiri (lihat
    _save_recommendation). Tidak ada target_draft_id atau tidak ada baris
    confirmed utk draft itu (mis. generate dipanggil tanpa lewat alur
    rekomendasi) -> default False (skip LKPS)."""
    if not target_draft_id:
        return False
    with conn() as con:
        row = con.execute(
            """SELECT lkps_needed FROM bab_document_recommendation
               WHERE bab_draft_id = %s AND status = 'confirmed'
               ORDER BY dibuat_pada DESC LIMIT 1""",
            (target_draft_id,),
        ).fetchone()
    return bool(row["lkps_needed"]) if row else False


def _retrieve_facts(inp: Dict) -> Dict:
    """Tahap 4: search LKPS (HANYA kalau needs_lkps, lihat _section_needs_lkps)
    + Evidence per checklist item (stratified). Evidence di-SCOPE HANYA ke
    `selected_bukti_dukung_ids` yg dikonfirmasi user di tahap rekomendasi
    (lihat recommend_chain di bawah) -- BUKAN blanket search ke seluruh
    evidence terupload spt sebelumnya. Kalau tidak ada file terpilih,
    evidence_facts kosong (tidak fallback)."""
    selected_ids = inp.get("selected_bukti_dukung_ids") or []
    ev_where = {"id_bukti_dukung": {"$in": selected_ids}} if selected_ids else None
    needs_lkps = _section_needs_lkps(inp.get("target_draft_id"))

    seen_lkps, seen_ev = set(), set()
    lkps_out, ev_out = [], []

    for q in inp["checklist"]:
        if needs_lkps:
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

        if selected_ids:
            try:
                for h in search_evidence(q, k=2, where=ev_where):
                    if h["id"] in seen_ev:
                        continue
                    seen_ev.add(h["id"])
                    h["_checklist_query"] = q
                    h["_source_kind"]     = "evidence"
                    ev_out.append(h)
            except Exception:
                pass

    # Fallback top-up LKPS kalau thin — pakai retrieval_query (breadcrumb
    # multi-baris) supaya context-rich. Evidence TIDAK di-top-up dgn blanket
    # search -- scope-nya murni file terpilih user.
    query = inp["retrieval_query"]
    if needs_lkps and len(lkps_out) < 3:
        for h in search_lkps(query, k=3 - len(lkps_out)):
            if h["id"] not in seen_lkps:
                seen_lkps.add(h["id"])
                h["_source_kind"] = "lkps"
                lkps_out.append(h)
    if selected_ids and len(ev_out) < 5:
        for h in search_evidence(query, k=5 - len(ev_out), where=ev_where):
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
        return {**inp, "draft_text": EMPTY_DOC, "_synthesis_error": str(e),
                "_synthesis_latency": round(time.time() - t0, 2)}
    latency = time.time() - t0

    cleaned = re.sub(r"<think>.*?</think>", "", raw, flags=re.DOTALL).strip()
    plain = cleaned or raw
    return {**inp,
            "draft_text":          text_to_doc(plain),
            "_synthesis_prompt":   prompt_text,
            "_synthesis_latency":  round(latency, 2)}


def _judge(inp: Dict) -> Dict:
    """Tahap 6: gpt-oss:20b evaluate 4 metrik RAGAS."""
    prompt_text = build_judge_prompt(
        inp["title"], doc_to_text(inp["draft_text"]), inp["rubric"], inp["facts"],
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


def _get_or_create_bab_dokumen(con, dokumen_id: str, urutan_bab: int, title: str, model: str) -> str:
    """Ambil/insert baris bab_dokumen (idempotent via ON CONFLICT) -- dipakai
    _save_recommendation (bikin draft kosong) DAN _save_to_db (isi draft)
    supaya logic 'section belum pernah ada baris bab_dokumen' cuma di 1
    tempat."""
    row = con.execute(
        """INSERT INTO bab_dokumen (dokumen_id, urutan_bab, judul_bab, model, status, konten_kerja, terakhir_disimpan)
           VALUES (%s, %s, %s, %s, 'draft', '{}'::jsonb, now())
           ON CONFLICT (dokumen_id, urutan_bab, model) DO UPDATE SET
               terakhir_disimpan = bab_dokumen.terakhir_disimpan
           RETURNING id""",
        (dokumen_id, urutan_bab, title, model),
    ).fetchone()
    return row["id"]


def _save_to_db(inp: Dict) -> Dict:
    """Persist hasil ke PostgreSQL: UPDATE/INSERT bab_dokumen (kondisi aktif,
    kunci UNIQUE(dokumen_id, urutan_bab, model)) + selalu INSERT bab_draft
    checkpoint baru (versi bertambah)."""
    facts = inp["facts"]
    dokumen_id = inp["dokumen_id"]
    section_id = inp["section_id"]
    model = inp["model"]
    title = inp["title"]

    pedoman_used  = [{"id": p["id"], "text": (p.get("text") or "")[:300]}
                      for p in inp["pedoman"]]
    rubric_used   = [{"id": r["id"], "text": (r.get("text") or "")[:300]}
                      for r in inp["rubric"]]

    def _citation(c):
        meta = c.get("metadata") or {}
        if c.get("_source_kind") == "lkps":
            sheet = meta.get("sheet")
            return f"LKPS Sheet {sheet}" if sheet else (meta.get("judul") or meta.get("chunk_id"))
        # Evidence: metadata disimpan sbg 'orig_file' (lihat worker_tasks.py
        # _flatten_meta), bukan 'filename' -- fallback lama selalu jatuh ke
        # chunk_id krn 'filename' tidak pernah ada di collection ini.
        return meta.get("orig_file") or meta.get("filename") or meta.get("judul") or meta.get("chunk_id")

    chunks_used = [{
        "id":       c["id"],
        "kind":     c.get("_source_kind"),
        "filename": _citation(c),
        "text":     (c.get("text") or "")[:300],
        "query":    c.get("_checklist_query"),
    } for c in facts]

    konten_kerja = {
        "draft_text":     inp["draft_text"],
        "pedoman_used":   pedoman_used,
        "rubric_used":    rubric_used,
        "checklist":      inp["checklist"],
        "chunks_used":    chunks_used,
        "judge_result":   inp["judge_result"],
        "prompt_full":    inp.get("_synthesis_prompt", ""),
        "latency_sec":    inp.get("_synthesis_latency", 0),
        "token_count":    None,  # tidak tersedia langsung dari LangChain Ollama wrapper
    }

    urutan_bab = get_urutan_bab(section_id)
    if urutan_bab is None:
        raise ValueError(f"Section {section_id} tidak ditemukan di outline.")

    target_draft_id = inp.get("target_draft_id")
    is_active_target = True  # mode "bikin versi baru" SELALU jadi aktif baru

    with conn() as con:
        # Mode overwrite: target_draft_id diberikan -> TIMPA versi draft itu
        # langsung (bukan INSERT versi baru). Kalau target BUKAN checkpoint
        # aktif section ini, bab_dokumen.konten_kerja (= draft AKTIF) TIDAK
        # ikut berubah -- hanya baris bab_draft target yg ditimpa (lihat
        # rancangan: "Regenerate" dari panel kanan menimpa versi yg SEDANG
        # DIBUKA, bukan selalu draft aktif).
        if target_draft_id:
            target_row = con.execute(
                """SELECT bd.bab_id, bd.versi, bab.checkpoint_aktif_id
                   FROM bab_draft bd JOIN bab_dokumen bab ON bab.id = bd.bab_id
                   WHERE bd.id = %s AND bab.dokumen_id = %s AND bab.urutan_bab = %s AND bab.model = %s""",
                (target_draft_id, dokumen_id, urutan_bab, model),
            ).fetchone()
            if not target_row:
                raise ValueError(f"Draft version {target_draft_id} tidak ditemukan utk section ini.")
            bab_id = target_row["bab_id"]
            versi = target_row["versi"]

            con.execute(
                """UPDATE bab_draft SET konten_snapshot = %s, sumber = 'AI', status = 'FILLED', dibuat_pada = now()
                   WHERE id = %s""",
                (json.dumps(konten_kerja, ensure_ascii=False), target_draft_id),
            )
            draft_row = {"id": target_draft_id}

            # Kalau target ini KEBETULAN draft aktif, konten_kerja bab_dokumen
            # ikut disinkronkan supaya endpoint lain (get_section_detail dst)
            # tetap konsisten. Kalau bukan aktif, bab_dokumen TIDAK disentuh.
            is_active_target = target_row["checkpoint_aktif_id"] == target_draft_id
            if is_active_target:
                con.execute(
                    """UPDATE bab_dokumen SET konten_kerja = %s, terakhir_disimpan = now()
                       WHERE id = %s""",
                    (json.dumps(konten_kerja, ensure_ascii=False), bab_id),
                )
        else:
            bab_id = _get_or_create_bab_dokumen(con, dokumen_id, urutan_bab, title, model)
            con.execute(
                """UPDATE bab_dokumen SET konten_kerja = %s, terakhir_disimpan = now()
                   WHERE id = %s""",
                (json.dumps(konten_kerja, ensure_ascii=False), bab_id),
            )

            versi_row = con.execute(
                "SELECT COALESCE(MAX(versi), 0) + 1 AS next_versi FROM bab_draft WHERE bab_id = %s",
                (bab_id,),
            ).fetchone()
            versi = versi_row["next_versi"]

            draft_row = con.execute(
                """INSERT INTO bab_draft
                       (bab_id, dibuat_oleh_user_id, model, versi, konten_snapshot, sumber, status, dibuat_pada)
                   VALUES (%s, %s, %s, %s, %s, 'AI', 'FILLED', now())
                   RETURNING id""",
                (bab_id, get_system_user_id(), model, versi,
                 json.dumps(konten_kerja, ensure_ascii=False)),
            ).fetchone()

            con.execute(
                "UPDATE bab_dokumen SET checkpoint_aktif_id = %s WHERE id = %s",
                (draft_row["id"], bab_id),
            )

        # --- Dokumen evidence terpilih (dikonfirmasi user di tahap
        # rekomendasi) -- relasi M:N yg sebelumnya tidak dipakai, sekarang
        # jadi sumber kebenaran "evidence apa yg dipakai bab/checkpoint ini".
        # bukti_dukung_bab merepresentasikan draft AKTIF -- HANYA ditimpa
        # kalau target overwrite ini memang draft aktif (sama spt guard
        # BAB_AKTIF di bab_referensi_chunk di bawah, mencegah bug serupa:
        # regenerate versi lama "membajak" evidence link draft aktif lain).
        # bukti_dukung_draft (per-versi) SELALU aman diisi, unique key beda.
        selected_ids = inp.get("selected_bukti_dukung_ids") or []
        if selected_ids:
            if is_active_target:
                con.execute("DELETE FROM bukti_dukung_bab WHERE bab_dokumen_id = %s", (bab_id,))
                with con.cursor() as cur:
                    cur.executemany(
                        """INSERT INTO bukti_dukung_bab (bukti_dukung_id, bab_dokumen_id)
                           VALUES (%s, %s) ON CONFLICT DO NOTHING""",
                        [(bid, bab_id) for bid in selected_ids],
                    )
            with con.cursor() as cur:
                cur.executemany(
                    """INSERT INTO bukti_dukung_draft (bukti_dukung_id, bab_draft_id)
                       VALUES (%s, %s) ON CONFLICT DO NOTHING""",
                    [(bid, draft_row["id"]) for bid in selected_ids],
                )

        # --- Traceability top-N chunk per tipe sumber (BAB_REFERENSI_CHUNK) ---
        # Menggantikan pedoman_used/rubric_used/chunks_used sbg sumber kebenaran
        # relasional -- field jsonb di atas TETAP disimpan sbg cache ringkas.
        lkps_facts = [c for c in facts if c.get("_source_kind") == "lkps"]
        evidence_facts = [c for c in facts if c.get("_source_kind") == "evidence"]

        def _rows(chunks, tipe_sumber, target_tipe, bab_id_val, bab_draft_id_val):
            return [
                (bab_id_val, bab_draft_id_val, target_tipe, tipe_sumber,
                 c["id"], i + 1, c.get("distance"))
                for i, c in enumerate(chunks)
            ]

        # BAB_AKTIF merepresentasikan draft yg SEDANG AKTIF (checkpoint_aktif_id)
        # -- HANYA ditulis ulang kalau target overwrite ini memang draft aktif
        # (atau mode "bikin versi baru", yg selalu jadi aktif baru). Kalau
        # user Regenerate versi LAMA (bukan aktif), BAB_AKTIF milik draft
        # aktif yg LAIN tidak boleh disentuh sama sekali -- sebelumnya baris
        # ini jalan tanpa syarat, jadi Regenerate 1 draft "membajak" referensi
        # BAB_AKTIF milik draft lain (bug: "regenerate berpengaruh ke semua draft").
        aktif_rows = []
        if is_active_target:
            con.execute("DELETE FROM bab_referensi_chunk WHERE bab_id = %s", (bab_id,))
            aktif_rows = (
                _rows(inp["pedoman"], "PEDOMAN", "BAB_AKTIF", bab_id, None)
                + _rows(inp["rubric"], "RUBRIK", "BAB_AKTIF", bab_id, None)
                + _rows(lkps_facts, "LKPS", "BAB_AKTIF", bab_id, None)
                + _rows(evidence_facts, "EVIDENCE", "BAB_AKTIF", bab_id, None)
            )
        # Checkpoint draft yg SEDANG DITIMPA (mode overwrite, target_draft_id
        # diisi -- lihat cabang di atas) -- hapus baris BAB_DRAFT lama milik
        # draft_row["id"] ini SAJA (draft lain TIDAK disentuh), baru insert
        # ulang. Tanpa ini, INSERT ulang bentrok UNIQUE constraint krn baris
        # lama utk draft yg sama masih ada (UniqueViolation uq_brc_bab_draft).
        con.execute("DELETE FROM bab_referensi_chunk WHERE bab_draft_id = %s", (draft_row["id"],))
        # Checkpoint: permanen, snapshot yang sama menempel ke versi draft ini.
        draft_rows = (
            _rows(inp["pedoman"], "PEDOMAN", "BAB_DRAFT", None, draft_row["id"])
            + _rows(inp["rubric"], "RUBRIK", "BAB_DRAFT", None, draft_row["id"])
            + _rows(lkps_facts, "LKPS", "BAB_DRAFT", None, draft_row["id"])
            + _rows(evidence_facts, "EVIDENCE", "BAB_DRAFT", None, draft_row["id"])
        )
        all_ref_rows = aktif_rows + draft_rows
        if all_ref_rows:
            with con.cursor() as cur:
                cur.executemany(
                    """INSERT INTO bab_referensi_chunk
                           (bab_id, bab_draft_id, target_tipe, tipe_sumber, chunk_id, urutan, distance)
                       VALUES (%s, %s, %s, %s, %s, %s, %s)""",
                    all_ref_rows,
                )

    return {
        "section_id":    section_id,
        "section_title": title,
        "model":         model,
        "draft_text":    inp["draft_text"],
        "pedoman_used":  json.dumps(pedoman_used, ensure_ascii=False),
        "rubric_used":   json.dumps(rubric_used, ensure_ascii=False),
        "checklist":     json.dumps(inp["checklist"], ensure_ascii=False),
        "chunks_used":   json.dumps(chunks_used, ensure_ascii=False),
        "judge_result":  json.dumps(inp["judge_result"], ensure_ascii=False),
        "latency_sec":   inp.get("_synthesis_latency", 0),
        "token_count":   None,
    }


# ──────────────────────────────────────────────────────────────────────
# TAHAP REKOMENDASI DOKUMEN (Tahap 1 dari alur Document Recommendation) --
# LCEL chain terpisah, dijalankan SEBELUM generate_chain. Reuse
# _route_section/_retrieve_rules (tidak berubah) sbg 2 stage pertama.
# ──────────────────────────────────────────────────────────────────────

_LKPS_MENTION_RE = re.compile(r"\(?\s*Tabel\s+[\dA-Za-z.]+\s+LKPS\s*\)?", re.IGNORECASE)


def _pedoman_mentions_lkps(pedoman: List[Dict]) -> bool:
    """Pedoman LAM Teknik SELALU menyebut eksplisit '(Tabel X.Y LKPS)' di
    subbab yg butuh data LKPS, dan TIDAK PERNAH menyebutnya sama sekali di
    subbab yg murni naratif (lihat contoh di full_text.txt). Regex ini
    dicek DULU sebelum LLM -- lebih akurat & konsisten drpd keputusan LLM
    bebas, dan menghemat 1 panggilan LLM kalau sinyalnya sudah eksplisit."""
    for p in pedoman:
        if _LKPS_MENTION_RE.search(p.get("text") or ""):
            return True
    return False


def _route_and_plan(inp: Dict) -> Dict:
    """R3+R4 gabungan: needs_lkps + document_query dalam 1 LLM call --
    keduanya independen (input sama: pedoman+rubric section ini), jadi aman
    digabung tanpa mengubah shape output yg dikonsumsi stage berikutnya
    (_retrieve_lkps, _search_document_registry_candidates).

    needs_lkps: GATE KERAS via regex _pedoman_mentions_lkps, BUKAN sekadar
    hint ke LLM. Pedoman LAM Teknik SELALU eksplisit menyebut '(Tabel X.Y
    LKPS)' kalau subbab itu memang butuh data LKPS, dan TIDAK PERNAH
    menyebutnya kalau tidak -- jadi regex ini definitif utk KEDUA arah:
    ketemu -> needs_lkps=True PASTI, tidak ketemu -> needs_lkps=False PASTI.
    LLM TIDAK dipanggil sama sekali utk keputusan ini (sebelumnya LLM bisa
    override False jadi True krn menebak dari konteks umum "tim penyusun"/
    "data institusi" dsb -- padahal pedoman tidak minta LKPS sama sekali,
    jadi retrieval LKPS ikut jalan & tampil di referensi padahal tidak
    relevan). LLM tetap dipanggil, tapi HANYA utk document_query."""
    needs_lkps = _pedoman_mentions_lkps(inp["pedoman"])

    prompt_text = build_route_and_plan_prompt(inp["title"], inp["pedoman"], inp["rubric"])
    prompt_text = disable_thinking_prompt(prompt_text, inp["model"])
    llm = get_llm_for_route_and_plan(inp["model"])
    try:
        raw = llm.invoke(prompt_text)
    except Exception:
        return {**inp, "needs_lkps": needs_lkps, "document_query": [inp["title"]]}

    raw = re.sub(r"<think>.*?</think>", "", raw, flags=re.DOTALL).strip()
    data = _parse_llm_json(raw)

    queries = data.get("document_query") or []
    return {**inp, "needs_lkps": needs_lkps, "document_query": queries or [inp["title"]]}


def _retrieve_lkps(inp: Dict) -> Dict:
    """R5 (RAG only): kalau needs_lkps, search_lkps. Cek kecukupan +
    lkps_evidence_query DIPINDAH ke _assess_and_recommend (gabung dgn R7)
    krn keduanya LLM call yg bisa jalan 1x sekaligus dgn candidate_folders."""
    if not inp["needs_lkps"]:
        return {**inp, "lkps_results": []}
    lkps_results = search_lkps(inp["retrieval_query"], k=5)
    return {**inp, "lkps_results": lkps_results}


REGISTRY_MAX_DISTANCE = 0.50


def _search_registry_by_queries(candidates: List[Dict], seen: set,
                                queries: List[str], k: int, kind: str) -> None:
    """Helper: search_document_registry per query, append ke candidates (in-place)
    sambil dedup via `seen`. Folder yg distance-nya > REGISTRY_MAX_DISTANCE
    DIBUANG -- index document_registry kecil (~280 folder) & isinya nama
    file mentah (bukan deskripsi), jadi begitu kandidat #1 relevan (~0.43-0.46)
    habis, sisanya melompat jauh (~0.52+, folder yg tidak nyambung sama
    sekali) tapi tetap "dipaksa" ikut sbg top-k -- LLM di _assess_and_recommend
    lalu menyimpulkan card generik/salah dari kandidat yg sebenarnya noise."""
    for q in queries or []:
        for h in search_document_registry(q, k=k):
            if h["id"] in seen:
                continue
            if h.get("distance") is not None and h["distance"] > REGISTRY_MAX_DISTANCE:
                continue
            seen.add(h["id"])
            h["_query"] = q
            h["_query_kind"] = kind
            candidates.append(h)


def _search_document_registry_candidates(inp: Dict) -> Dict:
    """R6: search document_registry pakai document_query SAJA.

    NOTE: sebelumnya juga search pakai lkps_evidence_query di sini -- tapi
    lkps_evidence_query sekarang BARU dihasilkan di _assess_and_recommend
    (digabung dgn R7, lihat catatan di sana), yg jalan SETELAH stage ini.
    Top-up kandidat dari lkps_evidence_query dipindah ke
    _topup_registry_from_evidence_query (setelah _assess_and_recommend)."""
    seen, candidates = set(), []
    _search_registry_by_queries(candidates, seen, inp["document_query"] or [inp["title"]],
                                 k=5, kind="document_query")
    return {**inp, "candidate_folders": candidates, "_registry_seen_ids": seen}


def _topup_registry_from_evidence_query(inp: Dict) -> Dict:
    """R7b: kalau _assess_and_recommend menemukan lkps_evidence_query baru
    (LKPS ternyata tidak cukup), cari kandidat folder TAMBAHAN dari query
    itu. Trade-off dari penggabungan R5-LLM+R7: query ini kini muncul
    SETELAH candidate_folders sudah disusun (bukan sebelum spt alur lama),
    jadi butuh 1 retrieval susulan -- HANYA jalan kalau evidence_query ada
    isinya (kasus umum: array kosong, jadi skip tanpa retrieval ekstra)."""
    evidence_query = inp.get("lkps_evidence_query") or []
    if not evidence_query:
        return inp
    candidates = list(inp["candidate_folders"])
    seen = set(inp.get("_registry_seen_ids") or [c["id"] for c in candidates])
    _search_registry_by_queries(candidates, seen, evidence_query,
                                 k=3, kind="lkps_evidence_query")
    return {**inp, "candidate_folders": candidates}


FALLBACK_RECOMMENDATION_TEXT = (
    "LLM gagal menghasilkan rekomendasi yang valid untuk subbab ini. "
    "Klik \"Rekomendasikan Ulang\" untuk mencoba lagi."
)


def _assess_and_recommend(inp: Dict) -> Dict:
    """R5-LLM + R7 gabungan: 1 LLM call yg terima SEMUA context sekaligus
    (lkps_results dari _retrieve_lkps + candidate_folders dari
    _search_document_registry_candidates), lalu output 3 keputusan:
    lkps_sufficient, lkps_evidence_query, recommendation_text/items."""
    prompt_text = build_assess_and_recommend_prompt(
        inp["title"], inp["candidate_folders"], inp["document_query"],
        lkps_results=inp.get("lkps_results"), needs_lkps=inp["needs_lkps"],
    )
    prompt_text = disable_thinking_prompt(prompt_text, inp["model"])
    llm = get_llm_for_assess_and_recommend(inp["model"])
    raw = None
    try:
        raw = llm.invoke(prompt_text)
        raw = re.sub(r"<think>.*?</think>", "", raw, flags=re.DOTALL).strip()
        data = _parse_llm_json(raw)
    except Exception as e:
        print(f"[recommend] LLM invoke gagal (model={inp['model']}): {type(e).__name__}: {e}", flush=True)
        data = {"recommendation_text": f"Gagal menyusun rekomendasi: {e}", "items": []}

    if data.get("parse_error"):
        print(f"[recommend] Gagal parse JSON dari LLM (model={inp['model']}). "
              f"Raw output (500 char pertama): {(raw or '')[:500]!r}", flush=True)

    items = data.get("items") or []
    text = data.get("recommendation_text") or ""
    if data.get("parse_error") or (not text and not items):
        text = FALLBACK_RECOMMENDATION_TEXT

    sufficient = data.get("lkps_sufficient") if inp["needs_lkps"] else None
    evidence_query = data.get("lkps_evidence_query") or [] if sufficient is False else []

    return {**inp,
            "lkps_sufficient":      sufficient,
            "lkps_evidence_query":  evidence_query,
            "recommendation_text":  text,
            "recommendation_items": items}


def _save_recommendation(inp: Dict) -> Dict:
    """R8: buat (kalau belum ada) bab_dokumen + bab_draft KOSONG (status=
    'EMPTY') untuk section ini, lalu INSERT bab_document_recommendation
    TERIKAT ke draft itu (bab_draft_id) + attach pedoman/rubric/lkps chunk
    yg dipakai tahap rekomendasi ke bab_referensi_chunk (target_tipe=
    'BAB_DRAFT') supaya tab Pedoman/Rubric/LKPS bisa tampil SEBELUM narasi
    ditulis -- draft kosong ini yg NANTI diisi _save_to_db.

    reuse_draft_id (opsional, dari 'Rekomendasikan Ulang' pada draft yg
    SUDAH kosong) -- kalau diisi, INSERT rekomendasi baru terikat ke draft
    itu langsung (tidak bikin draft baru), supaya tidak numpuk draft kosong."""
    dokumen_id = inp["dokumen_id"]
    section_id = inp["section_id"]
    urutan_bab = get_urutan_bab(section_id)
    if urutan_bab is None:
        raise ValueError(f"Section {section_id} tidak ditemukan di outline.")
    model = inp["model"]
    title = inp["title"]
    reuse_draft_id = inp.get("reuse_draft_id")

    # Chunk pedoman/rubric/lkps yg dipakai SELAMA tahap rekomendasi -- field
    # shape sama persis dgn pedoman_used/rubric_used di _save_to_db supaya
    # frontend CardList/LkpsTab bisa reuse tanpa ubah shape.
    pedoman_used = [{"id": p["id"], "text": (p.get("text") or "")[:300]} for p in inp["pedoman"]]
    rubric_used  = [{"id": r["id"], "text": (r.get("text") or "")[:300]} for r in inp["rubric"]]
    lkps_used    = [{"id": l["id"], "text": (l.get("text") or "")[:300]} for l in (inp.get("lkps_results") or [])]

    with conn() as con:
        if reuse_draft_id:
            # Validasi draft itu memang milik section ini & masih EMPTY --
            # 'Rekomendasikan Ulang' pada draft kosong TIDAK boleh menimpa
            # draft yg sudah ada narasinya (itu tugas 'Regenerate' generate).
            row_check = con.execute(
                """SELECT bd.id, bd.status FROM bab_draft bd
                   JOIN bab_dokumen bab ON bab.id = bd.bab_id
                   WHERE bd.id = %s AND bab.dokumen_id = %s AND bab.urutan_bab = %s AND bab.model = %s""",
                (reuse_draft_id, dokumen_id, urutan_bab, model),
            ).fetchone()
            if not row_check:
                raise ValueError(f"Draft {reuse_draft_id} tidak ditemukan utk section ini.")
            if row_check["status"] != "EMPTY":
                raise ValueError(f"Draft {reuse_draft_id} sudah berisi narasi, tidak bisa direkomendasi ulang di sini.")
            draft_id = row_check["id"]
        else:
            bab_id = _get_or_create_bab_dokumen(con, dokumen_id, urutan_bab, title, model)
            versi_row = con.execute(
                "SELECT COALESCE(MAX(versi), 0) + 1 AS next_versi FROM bab_draft WHERE bab_id = %s",
                (bab_id,),
            ).fetchone()
            versi = versi_row["next_versi"]
            draft_row = con.execute(
                """INSERT INTO bab_draft
                       (bab_id, dibuat_oleh_user_id, model, versi, konten_snapshot, sumber, status, dibuat_pada)
                   VALUES (%s, %s, %s, %s, '{}'::jsonb, 'AI', 'EMPTY', now())
                   RETURNING id""",
                (bab_id, get_system_user_id(), model, versi),
            ).fetchone()
            draft_id = draft_row["id"]
            # Draft baru (termasuk yg masih kosong) langsung jadi checkpoint
            # aktif -- konsisten dgn perilaku "mode bikin versi baru SELALU
            # jadi aktif baru" di _save_to_db, supaya draft kosong ini
            # langsung terlihat di panel tengah tanpa langkah ekstra user.
            con.execute("UPDATE bab_dokumen SET checkpoint_aktif_id = %s WHERE id = %s", (draft_id, bab_id))

        # Baris 'confirmed' SEBELUMNYA milik draft INI (kalau draft dipakai
        # ulang & sebelumnya sempat confirmed) ditandai 'superseded' --
        # unique index sekarang per bab_draft_id, bukan per section+model.
        con.execute(
            """UPDATE bab_document_recommendation SET status = 'superseded'
               WHERE bab_draft_id = %s AND status = 'confirmed'""",
            (draft_id,),
        )
        row = con.execute(
            """INSERT INTO bab_document_recommendation
                   (dokumen_id, urutan_bab, model, bab_draft_id, document_query, lkps_needed,
                    lkps_sufficient, lkps_evidence_query, candidate_folders,
                    recommendation_text, pedoman_used, rubric_used, lkps_used, status)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'recommended')
               RETURNING id""",
            (dokumen_id, urutan_bab, model, draft_id,
             json.dumps(inp["document_query"], ensure_ascii=False),
             inp["needs_lkps"],
             inp.get("lkps_sufficient"),
             json.dumps(inp.get("lkps_evidence_query"), ensure_ascii=False) if inp.get("lkps_evidence_query") is not None else None,
             json.dumps(inp["candidate_folders"], ensure_ascii=False),
             inp["recommendation_text"],
             json.dumps(pedoman_used, ensure_ascii=False),
             json.dumps(rubric_used, ensure_ascii=False),
             json.dumps(lkps_used, ensure_ascii=False)),
        ).fetchone()

        items = inp.get("recommendation_items") or []
        if items:
            with con.cursor() as cur:
                cur.executemany(
                    """INSERT INTO bab_recommendation_item
                           (recommendation_id, label, reason, urutan)
                       VALUES (%s, %s, %s, %s)""",
                    [(row["id"], it.get("label", ""), it.get("reason"), i)
                     for i, it in enumerate(items)],
                )

        # Attach pedoman/rubric/lkps chunk ke bab_referensi_chunk milik draft
        # ini (target_tipe='BAB_DRAFT') -- supaya tab Pedoman/Rubric/LKPS
        # tampil referensi SEBELUM narasi ditulis. _save_to_db nanti (saat
        # generate) menimpa baris ini dgn set final (checklist-scoped), key
        # sama (bab_draft_id) jadi tidak bentrok (DELETE+INSERT).
        con.execute("DELETE FROM bab_referensi_chunk WHERE bab_draft_id = %s", (draft_id,))
        lkps_results = inp.get("lkps_results") or []

        def _rows(chunks, tipe_sumber):
            return [(None, draft_id, "BAB_DRAFT", tipe_sumber, c["id"], i + 1, c.get("distance"))
                    for i, c in enumerate(chunks)]

        ref_rows = _rows(inp["pedoman"], "PEDOMAN") + _rows(inp["rubric"], "RUBRIK") + _rows(lkps_results, "LKPS")
        if ref_rows:
            with con.cursor() as cur:
                cur.executemany(
                    """INSERT INTO bab_referensi_chunk
                           (bab_id, bab_draft_id, target_tipe, tipe_sumber, chunk_id, urutan, distance)
                       VALUES (%s, %s, %s, %s, %s, %s, %s)""",
                    ref_rows,
                )

    return {
        "recommendation_id":    row["id"],
        "bab_draft_id":         draft_id,
        "section_id":           section_id,
        "section_title":        title,
        "model":                model,
        "document_query":       inp["document_query"],
        "lkps_needed":          inp["needs_lkps"],
        "pedoman_used":         pedoman_used,
        "rubric_used":          rubric_used,
        "lkps_used":            lkps_used,
        "lkps_sufficient":      inp.get("lkps_sufficient"),
        "lkps_evidence_query":  inp.get("lkps_evidence_query"),
        "candidate_folders":    inp["candidate_folders"],
        "recommendation_text":  inp["recommendation_text"],
        "recommendation_items": inp.get("recommendation_items", []),
        "selected_bukti_dukung_ids": [],
        "status":               "recommended",
    }


recommend_chain = (
    RunnableLambda(_route_section,    name="r01_route")
    | RunnableLambda(_retrieve_rules, name="r02_retrieve_rules")
    | RunnableLambda(_route_and_plan, name="r03_route_and_plan")
    | RunnableLambda(_retrieve_lkps,  name="r04_retrieve_lkps")
    | RunnableLambda(_search_document_registry_candidates, name="r05_search_registry")
    | RunnableLambda(_assess_and_recommend, name="r06_assess_and_recommend")
    | RunnableLambda(_topup_registry_from_evidence_query, name="r06b_topup_registry")
    | RunnableLambda(_save_recommendation, name="r07_save")
).with_config({"run_name": "led_recommend_documents"})


def recommend_documents(dokumen_id: str, section_id: str, model: str,
                        reuse_draft_id: str = None) -> Dict:
    """Tahap 1 alur Document Recommendation -- lihat recommend_chain di atas.

    reuse_draft_id: kalau diisi ('Rekomendasikan Ulang' pada draft yg SUDAH
    kosong), rekomendasi baru terikat ke draft itu langsung, tidak bikin
    bab_draft baru."""
    return recommend_chain.invoke({
        "dokumen_id": dokumen_id,
        "section_id": section_id,
        "model":      model,
        "reuse_draft_id": reuse_draft_id,
    })


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

def generate_section(dokumen_id: str, section_id: str, model: str,
                     selected_bukti_dukung_ids: List[str] = None,
                     overwrite: bool = False,
                     target_draft_id: str = None) -> Dict:
    """Generate 1 section via LCEL chain -- Tahap 2 "Tulis Narasi" dari alur
    Document Recommendation. Evidence di-scope HANYA ke
    `selected_bukti_dukung_ids` (dokumen yg dikonfirmasi user di tahap
    rekomendasi, lihat recommend_section() di bawah) -- kalau kosong, tidak
    ada evidence yg dipakai (bukan fallback ke blanket search).

    Tiga kasus target_draft_id/overwrite:
      1. FILL draft KOSONG hasil recommend -- target_draft_id diisi, draft
         berstatus 'EMPTY'. Ini jalur NORMAL setelah recommend -> confirm ->
         generate. Tidak ada chat history lama utk dihapus (draft baru).
      2. REGENERATE versi baru (target_draft_id=None) -- bikin bab_draft
         baru dari nol, TANPA rekomendasi terikat (dipertahankan utk
         backward-compat/manual generate tanpa lewat alur rekomendasi).
      3. OVERWRITE draft yg SUDAH terisi (target_draft_id diisi, draft
         berstatus 'FILLED') -- "Regenerate" dari panel kanan yg menimpa
         versi yg SEDANG DIBUKA; chat history dihapus HANYA kalau draft itu
         memang draft aktif section ini.

    Args:
        dokumen_id: ID dokumen_led (1 prodi bisa punya banyak dokumen LED)
        section_id: ID section dari outline.py
        model:      Model Ollama utk synthesis (deepseek-r1:32b / qwen3.5:35b)
        selected_bukti_dukung_ids: UUID bukti_dukung yg dikonfirmasi user
        overwrite:  Kalau True, hapus chat history + force regenerate
            (hanya relevan utk Kasus 2 -- diabaikan kalau target_draft_id diisi)
        target_draft_id: draft yg diisi/ditimpa (Kasus 1 atau 3 di atas).

    Returns:
        Dict berisi section_id, section_title, model, draft_text,
        pedoman_used, rubric_used, checklist, chunks_used, judge_result, dst.
    """
    urutan_bab = get_urutan_bab(section_id)
    if urutan_bab is None:
        raise ValueError(f"Section {section_id} tidak ditemukan.")

    if target_draft_id:
        overwrite = True
        with conn() as con:
            draft_status_row = con.execute(
                """SELECT bd.status FROM bab_draft bd JOIN bab_dokumen bab ON bab.id = bd.bab_id
                   WHERE bd.id = %s AND bab.dokumen_id = %s AND bab.urutan_bab = %s AND bab.model = %s""",
                (target_draft_id, dokumen_id, urutan_bab, model),
            ).fetchone()
            if not draft_status_row:
                raise ValueError(f"Draft version {target_draft_id} tidak ditemukan utk section ini.")
            # Kasus 3 (draft SUDAH FILLED): hapus chat history HANYA kalau
            # target ini draft aktif (chat terikat ke bab_id/draft aktif,
            # bukan per-versi). Kasus 1 (draft EMPTY): tidak ada chat lama
            # utk draft ini, skip.
            if draft_status_row["status"] == "FILLED":
                bab_row = con.execute(
                    """SELECT id, checkpoint_aktif_id FROM bab_dokumen
                       WHERE dokumen_id=%s AND urutan_bab=%s AND model=%s""",
                    (dokumen_id, urutan_bab, model)).fetchone()
                if bab_row and bab_row["checkpoint_aktif_id"] == target_draft_id:
                    con.execute("DELETE FROM bab_chat_message WHERE bab_id=%s", (bab_row["id"],))
    elif not overwrite:
        # Cek DB dulu -- HANYA relevan utk Kasus 2 lama/manual (idempotent:
        # kalau bab_dokumen sudah py draft_text, kembalikan itu tanpa
        # regenerate).
        with conn() as con:
            row = con.execute(
                """SELECT konten_kerja FROM bab_dokumen
                   WHERE dokumen_id=%s AND urutan_bab=%s AND model=%s""",
                (dokumen_id, urutan_bab, model)).fetchone()
            if row and not is_empty_doc(row["konten_kerja"].get("draft_text")):
                kk = row["konten_kerja"]
                return {
                    "section_id":    section_id,
                    "section_title": get_section(section_id)["title"],
                    "model":         model,
                    "draft_text":    kk.get("draft_text"),
                    "pedoman_used":  json.dumps(kk.get("pedoman_used"), ensure_ascii=False),
                    "rubric_used":   json.dumps(kk.get("rubric_used"), ensure_ascii=False),
                    "checklist":     json.dumps(kk.get("checklist"), ensure_ascii=False),
                    "chunks_used":   json.dumps(kk.get("chunks_used"), ensure_ascii=False),
                    "judge_result":  json.dumps(kk.get("judge_result"), ensure_ascii=False),
                    "latency_sec":   kk.get("latency_sec", 0),
                    "token_count":   kk.get("token_count"),
                }
    else:
        # Kasus 2 explicit regenerate-versi-baru: bersihkan chat history
        # utk bab (section+model) ini, kalau baris sudah ada.
        with conn() as con:
            bab_row = con.execute(
                """SELECT id FROM bab_dokumen
                   WHERE dokumen_id=%s AND urutan_bab=%s AND model=%s""",
                (dokumen_id, urutan_bab, model)).fetchone()
            if bab_row:
                con.execute(
                    "DELETE FROM bab_chat_message WHERE bab_id=%s", (bab_row["id"],))

    # Invoke LCEL chain
    result = generate_chain.invoke({
        "dokumen_id": dokumen_id,
        "section_id": section_id,
        "model":      model,
        "selected_bukti_dukung_ids": selected_bukti_dukung_ids or [],
        "target_draft_id": target_draft_id,
    })
    return result
