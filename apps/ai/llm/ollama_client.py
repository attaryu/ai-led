"""
Async HTTP client for Ollama running on a remote Vast.ai instance.

Connection scheme:
    FastAPI container → HTTPS → Vast.ai (port-forwarded) → Ollama /api/chat

Configuration via environment variables (never hardcoded):
    OLLAMA_BASE_URL           e.g. https://xxxxx.vastai.com:11434
    OLLAMA_MODEL              default: deepseek-r1:7b
    OLLAMA_TIMEOUT_SECONDS    default: 300
    OLLAMA_API_KEY            optional Bearer token
"""

from __future__ import annotations

import asyncio
import itertools
from dataclasses import dataclass, field
from typing import Optional

import httpx


# ---------------------------------------------------------------------------
# Custom exceptions
# ---------------------------------------------------------------------------


class OllamaTimeoutError(Exception):
    """Raised when the Ollama server does not respond within timeout_seconds."""


class OllamaConnectionError(Exception):
    """Raised when all retry attempts fail (503, HTTP errors, etc.)."""


# ---------------------------------------------------------------------------
# Client
# ---------------------------------------------------------------------------


@dataclass
class OllamaClient:
    base_url: str
    model: str
    timeout_seconds: int = 300
    api_key: Optional[str] = None
    max_retries: int = 3
    # Ollama's own default (5min) unloads a 20+GB model between test/dev
    # attempts a few minutes apart -- the next call then pays a full
    # disk->VRAM reload on the remote box before it can answer at all.
    keep_alive: str = "30m"

    def _headers(self) -> dict[str, str]:
        h: dict[str, str] = {"Content-Type": "application/json"}
        if self.api_key:
            h["Authorization"] = f"Bearer {self.api_key}"
        return h

    async def chat(self, messages: list[dict], temperature: float = 0.1) -> str:
        """Send messages to Ollama /api/chat and return the assistant content.

        Temperature is kept low (0.1) for scoring consistency.
        Retries up to max_retries on 503 / HTTP errors with exponential backoff.
        Raises OllamaTimeoutError on timeout, OllamaConnectionError on exhausted retries.
        """
        payload = {
            "model": self.model,
            "messages": messages,
            "stream": False,
            "options": {"temperature": temperature},
            "keep_alive": self.keep_alive,
        }

        last_error: Optional[Exception] = None
        for attempt in range(self.max_retries):
            try:
                async with httpx.AsyncClient(
                    timeout=float(self.timeout_seconds),
                    headers=self._headers(),
                ) as client:
                    response = await client.post(
                        f"{self.base_url}/api/chat",
                        json=payload,
                    )

                if response.status_code == 503:
                    wait = 2 ** attempt
                    await asyncio.sleep(wait)
                    last_error = OllamaConnectionError(
                        f"503 Service Unavailable after attempt {attempt + 1}"
                    )
                    continue

                response.raise_for_status()
                data = response.json()
                return data["message"]["content"]

            except httpx.TimeoutException as exc:
                raise OllamaTimeoutError(
                    f"Ollama timeout after {self.timeout_seconds}s for model {self.model}. "
                    "Consider splitting the prompt or raising OLLAMA_TIMEOUT_SECONDS."
                ) from exc
            except httpx.HTTPStatusError as exc:
                last_error = OllamaConnectionError(str(exc))
                await asyncio.sleep(2 ** attempt)

        raise last_error or OllamaConnectionError("Max retries exceeded")


# ---------------------------------------------------------------------------
# Multi-GPU round-robin
# ---------------------------------------------------------------------------

# Shared across every pick_ollama_endpoint() call in the process (assessment
# pipeline, RAGAS judge, inline grounding judge) so load actually spreads
# across whatever pool is configured, rather than each call site picking
# independently and skewing toward the first endpoint.
_endpoint_counter = itertools.count()


def pick_ollama_endpoint(raw: str) -> str:
    """Round-robin across a comma-separated endpoint list.

    A single URL (today's format, no comma) always returns that same URL —
    existing single-endpoint configs are unaffected. Multiple URLs (e.g. one
    Ollama instance per GPU, each pinned via CUDA_VISIBLE_DEVICES and its own
    port) get spread round-robin across successive calls, so concurrent
    indicator-scoring/eval tasks land on different GPUs instead of all
    sharing one.
    """
    endpoints = [u.strip() for u in raw.split(",") if u.strip()]
    if not endpoints:
        raise ValueError("No Ollama endpoint configured")
    if len(endpoints) == 1:
        return endpoints[0]
    return endpoints[next(_endpoint_counter) % len(endpoints)]


# ---------------------------------------------------------------------------
# Factory
# ---------------------------------------------------------------------------


def get_available_models() -> list[str]:
    """Return the configured model list for the active LLM_PROVIDER.

    Derived from OLLAMA_MODEL or OPENROUTER_MODEL (comma-separated; the
    first entry is the default). Lets the caller (assessment start/resume,
    RAGAS eval) offer a model picker without querying anything live.
    """
    import os

    provider = os.environ.get("LLM_PROVIDER", "ollama").lower()
    if provider == "openrouter":
        raw = os.environ.get("OPENROUTER_MODEL", "deepseek/deepseek-r1")
    else:
        raw = os.environ.get("OLLAMA_MODEL", "deepseek-r1:7b")
    return [m.strip() for m in raw.split(",") if m.strip()]


def create_ollama_client_from_env(model: Optional[str] = None) -> OllamaClient:
    """Build OllamaClient from environment variables.

    `model` overrides the configured default (first of get_available_models())
    — used when the caller lets the user pick a model at request time.
    """
    import os

    return OllamaClient(
        base_url=pick_ollama_endpoint(os.environ["OLLAMA_BASE_URL"]),
        model=model or get_available_models()[0],
        timeout_seconds=int(os.environ.get("OLLAMA_TIMEOUT_SECONDS", "300")),
        api_key=os.environ.get("OLLAMA_API_KEY"),
        keep_alive=os.environ.get("OLLAMA_KEEP_ALIVE", "30m"),
    )
