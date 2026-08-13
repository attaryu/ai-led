"""Tests for the remote Ollama async client."""

import pytest
import respx
import httpx

from llm.ollama_client import OllamaClient, OllamaTimeoutError, OllamaConnectionError

_BASE = "http://fake-vastai:11434"


@pytest.fixture
def client():
    return OllamaClient(
        base_url=_BASE,
        model="deepseek-r1:7b",
        timeout_seconds=30,
        api_key=None,
        max_retries=3,
    )


# ── 1 ──────────────────────────────────────────────────────────────────────────
@pytest.mark.asyncio
@respx.mock
async def test_chat_returns_response(client):
    """Successful 200 response returns assistant message content."""
    respx.post(f"{_BASE}/api/chat").mock(
        return_value=httpx.Response(
            200,
            json={"message": {"content": "Skor 3 karena program studi telah memenuhi kriteria."}, "done": True},
        )
    )
    result = await client.chat([{"role": "user", "content": "Nilai indikator ini."}])
    assert "Skor" in result


# ── 2 ──────────────────────────────────────────────────────────────────────────
@pytest.mark.asyncio
@respx.mock
async def test_timeout_raises_custom_error(client):
    """httpx.TimeoutException is converted to OllamaTimeoutError."""
    respx.post(f"{_BASE}/api/chat").mock(
        side_effect=httpx.TimeoutException("timed out")
    )
    with pytest.raises(OllamaTimeoutError):
        await client.chat([{"role": "user", "content": "test"}])


# ── 3 ──────────────────────────────────────────────────────────────────────────
@pytest.mark.asyncio
@respx.mock
async def test_retry_on_503_then_success(client):
    """First attempt returns 503; second attempt succeeds."""
    respx.post(f"{_BASE}/api/chat").mock(
        side_effect=[
            httpx.Response(503, text="Service Unavailable"),
            httpx.Response(200, json={"message": {"content": "ok"}, "done": True}),
        ]
    )
    result = await client.chat([{"role": "user", "content": "test"}])
    assert result == "ok"


# ── 4 ──────────────────────────────────────────────────────────────────────────
@pytest.mark.asyncio
@respx.mock
async def test_all_retries_exhausted_raises(client):
    """All max_retries attempts fail → OllamaConnectionError."""
    respx.post(f"{_BASE}/api/chat").mock(
        side_effect=[
            httpx.Response(503),
            httpx.Response(503),
            httpx.Response(503),
        ]
    )
    with pytest.raises(OllamaConnectionError):
        await client.chat([{"role": "user", "content": "test"}])


# ── 5 ──────────────────────────────────────────────────────────────────────────
@pytest.mark.asyncio
@respx.mock
async def test_api_key_header_sent(client):
    """When api_key is set, Authorization: Bearer header is included."""
    authed_client = OllamaClient(
        base_url=_BASE,
        model="deepseek-r1:7b",
        timeout_seconds=30,
        api_key="secret-token",
    )

    def check_auth(request: httpx.Request, *args, **kwargs):
        assert request.headers.get("Authorization") == "Bearer secret-token"
        return httpx.Response(200, json={"message": {"content": "ok"}, "done": True})

    respx.post(f"{_BASE}/api/chat").mock(side_effect=check_auth)
    result = await authed_client.chat([{"role": "user", "content": "test"}])
    assert result == "ok"


# ── 6 ──────────────────────────────────────────────────────────────────────────
def test_create_from_env(monkeypatch):
    """create_ollama_client_from_env reads environment variables correctly."""
    monkeypatch.setenv("OLLAMA_BASE_URL", "http://vastai:11434")
    monkeypatch.setenv("OLLAMA_MODEL", "qwen2.5:7b")
    monkeypatch.setenv("OLLAMA_TIMEOUT_SECONDS", "120")
    monkeypatch.setenv("OLLAMA_API_KEY", "mykey")

    from llm.ollama_client import create_ollama_client_from_env

    c = create_ollama_client_from_env()
    assert c.base_url == "http://vastai:11434"
    assert c.model == "qwen2.5:7b"
    assert c.timeout_seconds == 120
    assert c.api_key == "mykey"
