"""Plain (no tool-binding) LangChain chat model — shared by GENERASI_BAB
(worker.py) and the chat endpoint (api/routes/chat.py). Same LLM_PROVIDER
switch as agent/graph.py's _build_llm(), which is specific to the
ASSESSMENT_AMI agent's tool-bound model and isn't reusable here as-is.
"""

from __future__ import annotations

import os


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

    kwargs: dict = {
        "base_url": os.environ["OLLAMA_BASE_URL"],
        "model": os.environ.get("OLLAMA_MODEL", "deepseek-r1:7b"),
        "temperature": 0.2,
    }
    api_key = os.environ.get("OLLAMA_API_KEY")
    if api_key and not api_key.startswith("<"):
        kwargs["client_kwargs"] = {"headers": {"Authorization": f"Bearer {api_key}"}}
    return ChatOllama(**kwargs)
