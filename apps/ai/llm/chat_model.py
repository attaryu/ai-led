"""Plain (no tool-binding) LangChain chat model — shared by GENERASI_BAB
(worker.py) and the chat endpoint (api/routes/chat.py). Same LLM_PROVIDER
switch as agent/graph.py's _build_llm(), which is specific to the
ASSESSMENT_AMI agent's tool-bound model and isn't reusable here as-is.
"""

from __future__ import annotations

import os

from llm.ollama_client import pick_ollama_endpoint

# Per-stage (temperature, num_predict) -- dimas lib/ollama_client.py get_llm_for_*.
SYNTHESIS = (0.3, 2500)
CHECKLIST = (0.3, 4000)
JUDGE = (0.0, 2500)
CROSS_CHECK = (0.1, 1500)
ASSESS = (0.2, 7000)
SUGGEST = (0.2, 6000)


def _ollama_model(env: str = "OLLAMA_MODEL") -> str:
    raw = os.environ.get(env, os.environ.get("OLLAMA_MODEL", "deepseek-r1:7b"))
    return raw.split(",")[0].strip()


def _is_thinking_model(model: str) -> bool:
    """dimas _is_qwen3_thinking: models with a separate `thinking` field -> think=false."""
    m = model.lower()
    return "qwen3" in m or "nemotron" in m


def no_think(prompt: str, model: str | None = None) -> str:
    """Port of dimas disable_thinking_prompt -- Ollama reasoning models only."""
    if os.environ.get("LLM_PROVIDER", "ollama").lower() != "ollama":
        return prompt
    m = (model or _ollama_model()).lower()
    if "qwen3" in m:
        return f"{prompt}\n\n/no_think"
    if "deepseek-r1" in m or "nemotron" in m:
        return (f"{prompt}\n\n"
                "Instruksi: Langsung berikan jawaban final tanpa proses berpikir. "
                "Jangan gunakan tag <think>.")
    return prompt


def build_plain_llm(stage: tuple[float, int] = SYNTHESIS, json_schema: dict | None = None):
    """`json_schema` (OpenRouter saja): skema `response_format` untuk memaksa
    balasan berupa JSON yang sah.

    ponytail: prompt REKOMENDASI_DOKUMEN melarang tegas teks di luar objek
    JSON, tapi deepseek-v4-flash tetap menjawab narasi bertahap ("Langkah 1:
    ...") lalu menutup dengan `{"items":[]}` -- parser mengambil JSON terakhir
    itu, jadi hasilnya NOL item padahal narasinya sendiri menyebut dokumen yang
    benar (diukur 2026-09-22 utk C.6.3.4.1 Prestasi mahasiswa). Menaruh
    kontraknya di level API menutup celah itu; prompt tetap dibiarkan apa
    adanya sebagai penjelasan untuk model yang tidak mendukung fitur ini.

    Jangan dipakai untuk tahap yang keluarannya memang prosa (sintesis narasi).
    """
    temperature, num_predict = stage
    provider = os.environ.get("LLM_PROVIDER", "ollama").lower()

    if provider == "openrouter":
        from langchain_openai import ChatOpenAI

        extra: dict = {"reasoning": {"enabled": False}}
        if json_schema:
            extra["response_format"] = json_schema
        return ChatOpenAI(
            base_url="https://openrouter.ai/api/v1",
            api_key=os.environ["OPENROUTER_API_KEY"],
            model=os.environ.get("OPENROUTER_MODEL", "deepseek/deepseek-r1"),
            temperature=temperature,
            max_tokens=num_predict,
            extra_body=extra,
        )

    if provider == "huggingface":
        from langchain_openai import ChatOpenAI

        # HF Inference Providers -- endpoint OpenAI-compatible, HF_TOKEN sudah
        # ada di .env (dipakai jg buat download embedding model). Fallback
        # sementara selagi OLLAMA_BASE_URL (server writing dimas) mati --
        # ganti balik LLM_PROVIDER=ollama begitu server itu hidup lagi.
        return ChatOpenAI(
            base_url="https://router.huggingface.co/v1",
            api_key=os.environ["HF_TOKEN"],
            model=os.environ.get("HF_MODEL", "Qwen/Qwen2.5-72B-Instruct"),
            temperature=temperature,
            max_tokens=num_predict,
        )

    from langchain_ollama import ChatOllama

    # OLLAMA_MODEL/OLLAMA_BASE_URL can be comma-separated (multi-GPU pool,
    # multiple candidate models) — same convention as
    # llm/ollama_client.py::create_ollama_client_from_env, first entry wins
    # here since this path has no per-request model override.
    model = _ollama_model()
    kwargs: dict = {
        "base_url": pick_ollama_endpoint(os.environ["OLLAMA_BASE_URL"]),
        "model": model,
        "temperature": temperature,
        "num_predict": num_predict,
    }
    if _is_thinking_model(model):
        kwargs["reasoning"] = False
    api_key = os.environ.get("OLLAMA_API_KEY")
    if api_key and not api_key.startswith("<"):
        kwargs["client_kwargs"] = {"headers": {"Authorization": f"Bearer {api_key}"}}
    # Ollama's own default (5min) unloads a 20+GB model between test/dev
    # attempts a few minutes apart -- see llm/ollama_client.py::OllamaClient.
    kwargs["keep_alive"] = os.environ.get("OLLAMA_KEEP_ALIVE", "30m")
    return ChatOllama(**kwargs)


def build_judge_llm():
    """Separate model for GENERASI_BAB's judge stage (SYSTEM_JUDGE, worker.py)
    — same fallback idiom as eval/ragas_eval.py's _build_ragas_llm: JUDGE_*
    env vars first; JUDGE_PROVIDER falls back to LLM_PROVIDER, the model never
    falls back to the writer's (dimas JUDGE_MODEL / JUDGE_MODEL_GEMINI). Deterministic (temperature=0)
    like Dimas's get_llm_for_judge — judge output must parse as clean JSON.
    """
    provider = os.environ.get("JUDGE_PROVIDER", os.environ.get("LLM_PROVIDER", "ollama")).lower()

    if provider == "openrouter":
        from langchain_openai import ChatOpenAI

        model = os.environ.get("JUDGE_OPENROUTER_MODEL", "google/gemini-3.5-flash")
        gemini = model.startswith("google/")
        return ChatOpenAI(
            base_url="https://openrouter.ai/api/v1",
            api_key=os.environ["OPENROUTER_API_KEY"],
            # dimas JUDGE_MODEL_GEMINI: an OpenRouter writer is judged by Gemini, never by itself.
            model=model,
            temperature=JUDGE[0],
            # dimas _get_google_llm: Gemini reasoning can't be disabled -> +2000 token buffer instead.
            max_tokens=JUDGE[1] + 2000 if gemini else JUDGE[1],
            extra_body=None if gemini else {"reasoning": {"enabled": False}},
        )

    if provider == "huggingface":
        from langchain_openai import ChatOpenAI

        return ChatOpenAI(
            base_url="https://router.huggingface.co/v1",
            api_key=os.environ["HF_TOKEN"],
            model=os.environ.get("JUDGE_HF_MODEL", os.environ.get("HF_MODEL", "Qwen/Qwen2.5-72B-Instruct")),
            temperature=JUDGE[0],
            max_tokens=JUDGE[1],
        )

    from langchain_ollama import ChatOllama

    # dimas JUDGE_MODEL: a different model from the writer (default gpt-oss:20b), never OLLAMA_MODEL.
    model = os.environ.get("JUDGE_OLLAMA_MODEL", "gpt-oss:20b").split(",")[0].strip()
    kwargs: dict = {
        "base_url": pick_ollama_endpoint(os.environ["OLLAMA_BASE_URL"]),
        "model": model,
        "temperature": JUDGE[0],
        "num_predict": JUDGE[1],
    }
    if _is_thinking_model(model):
        kwargs["reasoning"] = False
    api_key = os.environ.get("OLLAMA_API_KEY")
    if api_key and not api_key.startswith("<"):
        kwargs["client_kwargs"] = {"headers": {"Authorization": f"Bearer {api_key}"}}
    # Ollama's own default (5min) unloads a 20+GB model between test/dev
    # attempts a few minutes apart -- see llm/ollama_client.py::OllamaClient.
    kwargs["keep_alive"] = os.environ.get("OLLAMA_KEEP_ALIVE", "30m")
    return ChatOllama(**kwargs)
