"""LLM wrapper pakai langchain-ollama OllamaLLM.

Mendukung Bearer token utk remote Ollama (Vast.ai/RunPod/dll) via
parameter `client_kwargs`. Tetap export fungsi lama (generate, generate_stream,
unload, list_models) supaya kode lama yg belum pakai LCEL tetap jalan.
"""
import json
import os
from typing import Iterator, Optional
from functools import lru_cache

import requests
from langchain_ollama import OllamaLLM

OLLAMA_HOST  = os.environ.get("OLLAMA_HOST", "http://host.docker.internal:11434")
OLLAMA_TOKEN = os.environ.get("OLLAMA_TOKEN", "").strip()


def _headers() -> dict:
    h = {}
    if OLLAMA_TOKEN:
        h["Authorization"] = f"Bearer {OLLAMA_TOKEN}"
    return h


# ──────────────────────────────────────────────────────────────────────
# LangChain LLM factory
# ──────────────────────────────────────────────────────────────────────

def _is_reasoning_model(model: str) -> bool:
    m = model.lower()
    return "qwen3" in m or "deepseek-r1" in m


def _is_qwen3_thinking(model: str) -> bool:
    """Qwen3+ (qwen3, qwen3.5, dst) pakai field `thinking` terpisah di Ollama
    API. `response` kosong saat thinking belum selesai. Untuk model ini, set
    `think=false` lewat raw HTTP supaya jawaban langsung muncul di `response`.
    """
    return "qwen3" in model.lower()


class _RawOllamaLLM:
    """LangChain-compatible wrapper yang panggil Ollama HTTP langsung,
    dengan `think=false` di payload.

    `langchain-ollama 0.2` tidak expose `think` param, padahal Qwen3+
    menaruh seluruh output di field `thinking` (response kosong) selama
    thinking. Wrapper ini bypass langchain dan baca `response` saja.

    API: `.invoke(prompt) -> str`  (subset OllamaLLM yang dipakai generator.py)
    """
    def __init__(self, model: str, temperature: float, num_predict: int):
        self.model       = model
        self.temperature = temperature
        self.num_predict = num_predict

    def invoke(self, prompt: str) -> str:
        payload = {
            "model":  self.model,
            "prompt": prompt,
            "stream": False,
            "think":  False,    # KUNCI: matikan thinking mode
            "options": {
                "temperature": self.temperature,
                "num_predict": self.num_predict,
            },
        }
        r = requests.post(
            f"{OLLAMA_HOST}/api/generate",
            json=payload, headers=_headers(), timeout=900,
        )
        r.raise_for_status()
        data = r.json()
        resp = (data.get("response") or "").strip()
        # Defensive: kalau model masih nge-think (mis. think=False tidak
        # dihormati build Ollama lama), pakai isi `thinking` sebagai
        # fallback supaya draft tidak kosong total.
        if not resp:
            thinking = (data.get("thinking") or "").strip()
            if thinking:
                resp = thinking
        return resp


@lru_cache(maxsize=16)
def get_llm(model: str,
            temperature: float = 0.3,
            num_predict: int = 2000):
    """Return LLM client siap pakai di LCEL.

    - Untuk qwen3/qwen3.5 → pakai `_RawOllamaLLM` (HTTP langsung dgn `think=false`),
      karena `langchain-ollama 0.2` tidak expose `think` dan Ollama menaruh
      output Qwen3 di field `thinking` (response kosong) selama thinking.
    - Untuk model lain → pakai `OllamaLLM` langchain wrapper biasa.

    LRU-cached: instance per (model, temp, num_predict) di-reuse.
    """
    if _is_qwen3_thinking(model):
        return _RawOllamaLLM(model=model, temperature=temperature,
                              num_predict=num_predict)
    return OllamaLLM(
        model=model,
        base_url=OLLAMA_HOST,
        temperature=temperature,
        num_predict=num_predict,
        client_kwargs={"headers": _headers()} if OLLAMA_TOKEN else None,
    )


def disable_thinking_prompt(prompt: str, model: str) -> str:
    """Append directive ke prompt utk skip thinking di reasoning model.

    Qwen3 support `/no_think` directive di akhir prompt.
    DeepSeek-R1 tetap thinking, jadi kita pakai system-style instruction.
    """
    if not _is_reasoning_model(model):
        return prompt
    m = model.lower()
    if "qwen3" in m:
        # Qwen3 official directive
        return f"{prompt}\n\n/no_think"
    # DeepSeek-R1 tidak ada flag resmi, kasih instruksi eksplisit
    return (f"{prompt}\n\n"
            "Instruksi: Langsung berikan jawaban final tanpa proses berpikir. "
            "Jangan gunakan tag <think>.")


def get_llm_for_synthesis(model: str) -> OllamaLLM:
    """Synthesis: cukup token utk narasi 2-4 paragraf."""
    return get_llm(model, temperature=0.3, num_predict=2500)


def get_llm_for_checklist(model: str) -> OllamaLLM:
    """Checklist: output akhir pendek (4-8 bullet), TAPI num_predict TIDAK
    BOLEH kecil (800 TERBUKTI memotong output di tengah kalimat pada kasus
    nyata -- deepseek-r1 kadang tetap 'berpikir' meski diminta skip via
    disable_thinking_prompt, menghabiskan sebagian token budget sebelum
    sempat menulis semua item checklist). 2500 memberi ruang cukup, sama
    pola dgn get_llm_for_select_pedoman (300->1500) yg mengalami masalah
    identik."""
    return get_llm(model, temperature=0.2, num_predict=2500)


def get_llm_for_judge(model: str) -> OllamaLLM:
    """Judge: deterministic + JSON-clean. gpt-oss bukan reasoning model."""
    return get_llm(model, temperature=0.0, num_predict=2500)


def get_llm_for_lkps_decision(model: str) -> OllamaLLM:
    """Keputusan biner (butuh LKPS? LKPS cukup?): output pendek, deterministic-ish."""
    return get_llm(model, temperature=0.1, num_predict=300)


def get_llm_for_query_gen(model: str) -> OllamaLLM:
    """Query generation (document_query / lkps_evidence_query): output JSON pendek."""
    return get_llm(model, temperature=0.2, num_predict=400)


def get_llm_for_recommendation(model: str) -> OllamaLLM:
    """Sintesis rekomendasi dokumen akhir ke user: narasi pendek + list."""
    return get_llm(model, temperature=0.3, num_predict=800)


def get_llm_for_route_and_plan(model: str) -> OllamaLLM:
    """Gabungan needs_lkps + document_query (2 keputusan 1 call) --
    num_predict = jumlah kebutuhan lkps_decision(300) + query_gen(400)."""
    return get_llm(model, temperature=0.2, num_predict=700)


def get_llm_for_select_pedoman(model: str) -> OllamaLLM:
    """Pilih kandidat pedoman (dari k=5 search_pedoman) yg BENAR2 relevan
    ke section, via id -- pengganti threshold distance numerik yg terbukti
    rapuh thd kandidat berdekatan. Output akhir kecil (list id), TAPI
    num_predict TIDAK BOLEH kecil (300 TERBUKTI kosong total di kasus
    nyata -- deepseek-r1 kadang tetap 'berpikir' meski diminta skip via
    disable_thinking_prompt, menghabiskan token budget sebelum sempat
    menjawab). 1500 memberi ruang cukup utk kasus reasoning yg tidak
    patuh instruksi no-thinking."""
    return get_llm(model, temperature=0.1, num_predict=1500)


def get_llm_for_assess_and_recommend(model: str) -> OllamaLLM:
    """Gabungan lkps_sufficient + lkps_evidence_query + recommendation_text/
    items (3 keputusan 1 call). num_predict dinaikkan signifikan drpd
    perkiraan awal (1500) -- katalog dokumen sekarang closed-set ~94 entri,
    dan section yg butuh banyak bukti LKPS bisa memilih >10 item sekaligus
    (tiap item: no+label panjang disalin ulang+reason ~15-20 kata). 1500
    token TERBUKTI terpotong di tengah JSON pada kasus nyata (>2 item LKPS
    terpilih) -- parse gagal total, bukan sekadar item hilang.

    temperature=0.3 -- SEMPAT diturunkan ke 0.0 utk coba menstabilkan
    variasi jumlah item (pernah terlihat 2 vs 8 dokumen utk PEDOMAN yg
    sama), TAPI 0.0 (greedy decoding) TERBUKTI mengunci ke jawaban PALING
    KONSERVATIF/SEDIKIT (selalu 2 item), bukan yg paling LENGKAP. Dinaikkan
    bertahap 0.2 -> 0.3 (user konfirmasi hasil membaik) -> 0.4/0.35 (TERBUKTI
    memperburuk lagi -- kasus nyata: dokumen L1 "Permendikbud tentang
    Statuta Institusi" yg SEHARUSNYA SELALU terpilih krn pedoman eksplisit
    sebut "peraturan perundang-undangan" jadi kadang HILANG antar-run utk
    PEDOMAN yg sama persis -- LANGKAH 3 di prompt tidak konsisten
    dieksekusi pd temperature lebih tinggi). Dikembalikan ke 0.3, titik yg
    sudah dikonfirmasi user lebih baik drpd 0.2 maupun 0.4."""
    return get_llm(model, temperature=0.4, num_predict=6000)


def get_llm_for_suggest_custom_document(model: str) -> OllamaLLM:
    """Fallback usulan dokumen DI LUAR katalog -- HANYA dipanggil kalau
    tahap assess_and_recommend (katalog closed-set) hasilnya benar-benar
    kosong. Output kecil (1-3 item, label+reason singkat), num_predict
    cukup kecil spt checklist."""
    return get_llm(model, temperature=0.2, num_predict=800)


# ──────────────────────────────────────────────────────────────────────
# Legacy direct HTTP API (utk fungsi yg belum di-migrate)
# ──────────────────────────────────────────────────────────────────────

def generate(model: str, prompt: str,
             temperature: float = 0.3,
             num_predict: int = 1500,
             keep_alive: Optional[str] = None) -> dict:
    """Single-shot generate (non-stream) via HTTP langsung."""
    payload = {
        "model":  model,
        "prompt": prompt,
        "stream": False,
        "options": {
            "temperature": temperature,
            "num_predict": num_predict,
        },
    }
    if keep_alive is not None:
        payload["keep_alive"] = keep_alive
    r = requests.post(f"{OLLAMA_HOST}/api/generate",
                       json=payload, headers=_headers(), timeout=900)
    r.raise_for_status()
    return r.json()


def generate_stream(model: str, prompt: str,
                    temperature: float = 0.3,
                    num_predict: int = 1500) -> Iterator[str]:
    """Streaming generate — yield token by token via HTTP."""
    payload = {
        "model":  model,
        "prompt": prompt,
        "stream": True,
        "options": {
            "temperature": temperature,
            "num_predict": num_predict,
        },
    }
    with requests.post(f"{OLLAMA_HOST}/api/generate",
                       json=payload, headers=_headers(),
                       stream=True, timeout=900) as r:
        r.raise_for_status()
        for line in r.iter_lines():
            if not line:
                continue
            try:
                obj = json.loads(line)
            except json.JSONDecodeError:
                continue
            tok = obj.get("response", "")
            if tok:
                yield tok
            if obj.get("done"):
                break


def unload(model: str):
    """Force unload model dari VRAM."""
    try:
        requests.post(
            f"{OLLAMA_HOST}/api/generate",
            json={"model": model, "keep_alive": 0, "prompt": ""},
            headers=_headers(), timeout=10,
        )
    except requests.RequestException:
        pass


def list_models() -> list:
    try:
        r = requests.get(f"{OLLAMA_HOST}/api/tags",
                          headers=_headers(), timeout=5)
        r.raise_for_status()
        return [m["name"] for m in r.json().get("models", [])]
    except requests.RequestException:
        return []
