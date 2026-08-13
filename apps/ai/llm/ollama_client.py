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
# Factory
# ---------------------------------------------------------------------------


def create_ollama_client_from_env() -> OllamaClient:
    """Build OllamaClient from environment variables."""
    import os

    return OllamaClient(
        base_url=os.environ["OLLAMA_BASE_URL"],
        model=os.environ.get("OLLAMA_MODEL", "deepseek-r1:7b"),
        timeout_seconds=int(os.environ.get("OLLAMA_TIMEOUT_SECONDS", "300")),
        api_key=os.environ.get("OLLAMA_API_KEY"),
    )
