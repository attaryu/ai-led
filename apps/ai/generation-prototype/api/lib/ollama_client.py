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
    """Checklist: output pendek (4-8 bullet)."""
    return get_llm(model, temperature=0.2, num_predict=800)


def get_llm_for_judge(model: str) -> OllamaLLM:
    """Judge: deterministic + JSON-clean. gpt-oss bukan reasoning model."""
    return get_llm(model, temperature=0.0, num_predict=2500)


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
