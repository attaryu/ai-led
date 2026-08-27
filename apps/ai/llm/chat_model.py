"""Plain (no tool-binding) LangChain chat model — shared by GENERASI_BAB
(worker.py) and the chat endpoint (api/routes/chat.py). Same LLM_PROVIDER
switch as agent/graph.py's _build_llm(), which is specific to the
ASSESSMENT_AMI agent's tool-bound model and isn't reusable here as-is.
"""

from __future__ import annotations

import os

from llm.ollama_client import pick_ollama_endpoint


def build_plain_llm():
    provider = os.environ.get("LLM_PROVIDER", "ollama").lower()

    if provider == "openrouter":
        from langchain_openai import ChatOpenAI

        return ChatOpenAI(
            base_url="https://openrouter.ai/api/v1",
            api_key=os.environ["OPENROUTER_API_KEY"],
            model=os.environ.get("OPENROUTER_MODEL", "deepseek/deepseek-r1"),
            temperature=0.2,
        )

    from langchain_ollama import ChatOllama

    # OLLAMA_MODEL/OLLAMA_BASE_URL can be comma-separated (multi-GPU pool,
    # multiple candidate models) — same convention as
    # llm/ollama_client.py::create_ollama_client_from_env, first entry wins
    # here since this path has no per-request model override.
    raw_model = os.environ.get("OLLAMA_MODEL", "deepseek-r1:7b")
    kwargs: dict = {
        "base_url": pick_ollama_endpoint(os.environ["OLLAMA_BASE_URL"]),
        "model": raw_model.split(",")[0].strip(),
        "temperature": 0.2,
    }
    api_key = os.environ.get("OLLAMA_API_KEY")
    if api_key and not api_key.startswith("<"):
        kwargs["client_kwargs"] = {"headers": {"Authorization": f"Bearer {api_key}"}}
    return ChatOllama(**kwargs)


def build_judge_llm():
    """Separate model for GENERASI_BAB's judge stage (SYSTEM_JUDGE, worker.py)
    — same fallback idiom as eval/ragas_eval.py's _build_ragas_llm: JUDGE_*
    env vars first, falling back to the assessment model (LLM_PROVIDER /
    OLLAMA_MODEL / OPENROUTER_MODEL) if unset. Deterministic (temperature=0)
    like Dimas's get_llm_for_judge — judge output must parse as clean JSON.
    """
    provider = os.environ.get("JUDGE_PROVIDER", os.environ.get("LLM_PROVIDER", "ollama")).lower()

    if provider == "openrouter":
        from langchain_openai import ChatOpenAI

        return ChatOpenAI(
            base_url="https://openrouter.ai/api/v1",
            api_key=os.environ["OPENROUTER_API_KEY"],
            model=os.environ.get(
                "JUDGE_OPENROUTER_MODEL", os.environ.get("OPENROUTER_MODEL", "deepseek/deepseek-r1")
            ),
            temperature=0.0,
        )

    from langchain_ollama import ChatOllama

    # Same comma-separated-list handling as build_plain_llm above.
    raw_model = os.environ.get("JUDGE_OLLAMA_MODEL", os.environ.get("OLLAMA_MODEL", "deepseek-r1:7b"))
    kwargs: dict = {
        "base_url": pick_ollama_endpoint(os.environ["OLLAMA_BASE_URL"]),
        "model": raw_model.split(",")[0].strip(),
        "temperature": 0.0,
    }
    api_key = os.environ.get("OLLAMA_API_KEY")
    if api_key and not api_key.startswith("<"):
        kwargs["client_kwargs"] = {"headers": {"Authorization": f"Bearer {api_key}"}}
    return ChatOllama(**kwargs)
