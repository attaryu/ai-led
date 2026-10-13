"""Pembuat model chat untuk setor ke LED. Meniru agent/graph.py::_build_llm (provider switch, timeout,
num_predict, keep_alive, retry) tetapi: model dipilih per-permintaan, daftar tool bisa diberikan atau
tidak (tahap 2 tanpa tool), dan tidak mengubah apa pun di agent/ (AMI)."""

from __future__ import annotations

import os

from llm.chat_model import _is_thinking_model
from llm.ollama_client import create_ollama_client_from_env


def build_setor_llm(
    model: str | None,
    *,
    tools: list | None = None,
    temperature: float = 0.1,
    num_predict: int = 4096,
):
    client = create_ollama_client_from_env(model=model)
    provider = os.environ.get("LLM_PROVIDER", "ollama").lower()

    if provider == "openrouter":
        from langchain_openai import ChatOpenAI

        llm = ChatOpenAI(
            base_url="https://openrouter.ai/api/v1",
            api_key=os.environ["OPENROUTER_API_KEY"],
            model=client.model,
            temperature=temperature,
            max_tokens=num_predict,
        )
    else:
        from langchain_ollama import ChatOllama

        kwargs: dict = {
            "base_url": client.base_url,
            "model": client.model,
            "temperature": temperature,
            "num_predict": num_predict,
            # Tanpa timeout, koneksi macet ke Ollama jauh membuat IKU menggantung selamanya (lihat _build_llm).
            "client_kwargs": {"timeout": client.timeout_seconds},
            "keep_alive": client.keep_alive,
        }
        if client.api_key and not client.api_key.startswith("<"):
            kwargs["client_kwargs"]["headers"] = {"Authorization": f"Bearer {client.api_key}"}
        # Tahap tanpa tool menuntut JSON bersih: matikan thinking terpisah milik qwen3/nemotron.
        if tools is None and _is_thinking_model(client.model):
            kwargs["reasoning"] = False
        llm = ChatOllama(**kwargs)

    if tools:
        llm = llm.bind_tools(tools)
    return llm.with_retry(stop_after_attempt=3)
