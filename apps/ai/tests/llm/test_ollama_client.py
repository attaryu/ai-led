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


# ── 7 ──────────────────────────────────────────────────────────────────────────
def test_get_available_models_splits_csv_ollama(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "ollama")
    monkeypatch.setenv("OLLAMA_MODEL", "qwen3.6:35b, deepseek-r1:32b ,qwen2.5:7b")

    from llm.ollama_client import get_available_models

    assert get_available_models() == ["qwen3.6:35b", "deepseek-r1:32b", "qwen2.5:7b"]


def test_get_available_models_splits_csv_openrouter(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "openrouter")
    monkeypatch.setenv("OPENROUTER_MODEL", "deepseek/deepseek-v4-pro,anthropic/claude-haiku-4.5")

    from llm.ollama_client import get_available_models

    assert get_available_models() == ["deepseek/deepseek-v4-pro", "anthropic/claude-haiku-4.5"]


def test_create_from_env_picks_first_of_csv_when_no_override(monkeypatch):
    monkeypatch.setenv("OLLAMA_BASE_URL", "http://vastai:11434")
    monkeypatch.setenv("OLLAMA_MODEL", "qwen3.6:35b,deepseek-r1:32b")

    from llm.ollama_client import create_ollama_client_from_env

    c = create_ollama_client_from_env()
    assert c.model == "qwen3.6:35b"


# ── pick_ollama_endpoint (multi-GPU round-robin) ───────────────────────────────

def test_pick_ollama_endpoint_single_url_is_unchanged():
    """A single URL (today's format, no comma) must always return that same
    URL — existing single-endpoint configs behave identically to before."""
    from llm.ollama_client import pick_ollama_endpoint

    for _ in range(3):
        assert pick_ollama_endpoint("http://only-one:11434") == "http://only-one:11434"


def test_pick_ollama_endpoint_round_robins_across_multiple():
    """The counter is a module-level global shared across every call in the
    process (by design — see pick_ollama_endpoint's docstring), so other
    tests running earlier in the same session shift its starting phase.
    Assert the rotation *property* (cycles through all N exactly once before
    repeating, then repeats identically) rather than an exact 0-based
    sequence, which would be order-dependent and flaky."""
    from llm.ollama_client import pick_ollama_endpoint

    raw = "http://gpu1:11435,http://gpu2:11436,http://gpu3:11437"
    endpoints = raw.split(",")
    picks = [pick_ollama_endpoint(raw) for _ in range(6)]

    assert sorted(picks[0:3]) == sorted(endpoints)
    assert sorted(picks[3:6]) == sorted(endpoints)
    assert picks[0:3] == picks[3:6]


def test_pick_ollama_endpoint_trims_whitespace_around_commas():
    from llm.ollama_client import pick_ollama_endpoint

    raw = "http://gpu1:11435 , http://gpu2:11436"
    picks = {pick_ollama_endpoint(raw) for _ in range(4)}
    assert picks == {"http://gpu1:11435", "http://gpu2:11436"}


def test_pick_ollama_endpoint_raises_on_empty():
    from llm.ollama_client import pick_ollama_endpoint

    with pytest.raises(ValueError):
        pick_ollama_endpoint("")


def test_create_from_env_round_robins_across_multiple_endpoints(monkeypatch):
    """OLLAMA_BASE_URL with multiple comma-separated endpoints spreads
    successive create_ollama_client_from_env() calls across all of them —
    this is what lets concurrent indicator-scoring tasks land on different
    GPUs instead of all sharing one."""
    monkeypatch.setenv("OLLAMA_BASE_URL", "http://gpu1:11435,http://gpu2:11436")
    monkeypatch.setenv("OLLAMA_MODEL", "deepseek-r1:7b")

    from llm.ollama_client import create_ollama_client_from_env

    urls = {create_ollama_client_from_env().base_url for _ in range(4)}
    assert urls == {"http://gpu1:11435", "http://gpu2:11436"}


def test_create_from_env_uses_explicit_model_override(monkeypatch):
    """A caller-supplied model wins over the configured default — used when
    the frontend lets the user pick a model from GET /assessment/models."""
    monkeypatch.setenv("OLLAMA_BASE_URL", "http://vastai:11434")
    monkeypatch.setenv("OLLAMA_MODEL", "qwen3.6:35b,deepseek-r1:32b")

    from llm.ollama_client import create_ollama_client_from_env

    c = create_ollama_client_from_env(model="deepseek-r1:32b")
    assert c.model == "deepseek-r1:32b"
