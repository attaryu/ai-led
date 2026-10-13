"""setor_led.llm.build_setor_llm -- hanya konstruksi (tanpa jaringan): provider switch, model per-permintaan,
bind tools, dan retry."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from llm.ollama_client import OllamaClient
from setor_led.llm import build_setor_llm


@pytest.fixture(autouse=True)
def _env(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "ollama")
    monkeypatch.setenv("OLLAMA_BASE_URL", "http://ollama:11434")
    monkeypatch.setenv("OLLAMA_MODEL", "qwen3.6:35b,llama3.3:70b")


def _client(model):
    return OllamaClient(base_url="http://ollama:11434", model=model, timeout_seconds=300, api_key=None, keep_alive="30m")


def test_ollama_uses_the_requested_model_and_caps_output():
    chat = MagicMock()
    with (
        patch("setor_led.llm.create_ollama_client_from_env", return_value=_client("llama3.3:70b")) as buat,
        patch("langchain_ollama.ChatOllama", return_value=chat) as ollama,
    ):
        build_setor_llm("llama3.3:70b", temperature=0.2, num_predict=3000)

    buat.assert_called_once_with(model="llama3.3:70b")
    kwargs = ollama.call_args.kwargs
    assert kwargs["model"] == "llama3.3:70b"
    assert kwargs["temperature"] == 0.2 and kwargs["num_predict"] == 3000
    assert kwargs["client_kwargs"]["timeout"] == 300
    chat.bind_tools.assert_not_called()
    chat.with_retry.assert_called_once_with(stop_after_attempt=3)


def test_tools_are_bound_before_retry_wrapping():
    chat, bound = MagicMock(), MagicMock()
    chat.bind_tools.return_value = bound
    with (
        patch("setor_led.llm.create_ollama_client_from_env", return_value=_client("llama3.3:70b")),
        patch("langchain_ollama.ChatOllama", return_value=chat),
    ):
        build_setor_llm("llama3.3:70b", tools=["t1", "t2"])

    chat.bind_tools.assert_called_once_with(["t1", "t2"])
    bound.with_retry.assert_called_once_with(stop_after_attempt=3)


def test_thinking_models_get_reasoning_disabled_only_without_tools():
    with (
        patch("setor_led.llm.create_ollama_client_from_env", return_value=_client("qwen3.6:35b")),
        patch("langchain_ollama.ChatOllama") as ollama,
    ):
        build_setor_llm("qwen3.6:35b")
        assert ollama.call_args.kwargs["reasoning"] is False
        build_setor_llm("qwen3.6:35b", tools=["t"])
        assert "reasoning" not in ollama.call_args.kwargs


def test_openrouter_json_stage_disables_reasoning_so_it_cannot_eat_the_token_budget(monkeypatch):
    # Uji E2E: deepseek-v4-flash menghabiskan ~2.000 dari 3.000 token keluaran untuk "reasoning", sehingga
    # JSON tahap 2 kadang terpotong/kosong. Preseden: llm/chat_model.py::build_plain_llm.
    monkeypatch.setenv("LLM_PROVIDER", "openrouter")
    monkeypatch.setenv("OPENROUTER_API_KEY", "k")
    with (
        patch("setor_led.llm.create_ollama_client_from_env", return_value=_client("deepseek/x")),
        patch("langchain_openai.ChatOpenAI") as openai,
    ):
        build_setor_llm("deepseek/x", num_predict=3000)
    assert openai.call_args.kwargs["extra_body"] == {"reasoning": {"enabled": False}}
    assert openai.call_args.kwargs["max_tokens"] == 3000


def test_openrouter_tool_stage_keeps_the_models_default_reasoning(monkeypatch):
    # Tahap 1 (loop tool) mengikuti perilaku AMI (_build_llm): reasoning tidak dimatikan.
    monkeypatch.setenv("LLM_PROVIDER", "openrouter")
    monkeypatch.setenv("OPENROUTER_API_KEY", "k")
    with (
        patch("setor_led.llm.create_ollama_client_from_env", return_value=_client("deepseek/x")),
        patch("langchain_openai.ChatOpenAI") as openai,
    ):
        build_setor_llm("deepseek/x", tools=["t"])
    assert "extra_body" not in openai.call_args.kwargs


def test_json_tool_protocol_stage_keeps_reasoning_on_without_binding_tools(monkeypatch):
    # Model reasoning memanggil tool lewat JSON di teks (bukan function calling), jadi tanpa tools -- tetapi berpikirnya
    # tidak dimatikan, sama seperti agent/reasoning_graph.py. disable_reasoning=False mengesampingkan bawaan "tanpa tools".
    monkeypatch.setenv("LLM_PROVIDER", "openrouter")
    monkeypatch.setenv("OPENROUTER_API_KEY", "k")
    with (
        patch("setor_led.llm.create_ollama_client_from_env", return_value=_client("deepseek/x")),
        patch("langchain_openai.ChatOpenAI") as openai,
    ):
        build_setor_llm("deepseek/x", num_predict=8192, disable_reasoning=False)
    assert "extra_body" not in openai.call_args.kwargs
    assert openai.call_args.kwargs["max_tokens"] == 8192

    monkeypatch.setenv("LLM_PROVIDER", "ollama")
    with (
        patch("setor_led.llm.create_ollama_client_from_env", return_value=_client("qwen3.6:35b")),
        patch("langchain_ollama.ChatOllama") as ollama,
    ):
        build_setor_llm("qwen3.6:35b", disable_reasoning=False)
    assert "reasoning" not in ollama.call_args.kwargs


def test_disable_reasoning_can_also_be_forced_on_with_tools():
    with (
        patch("setor_led.llm.create_ollama_client_from_env", return_value=_client("qwen3.6:35b")),
        patch("langchain_ollama.ChatOllama") as ollama,
    ):
        build_setor_llm("qwen3.6:35b", tools=["t"], disable_reasoning=True)
    assert ollama.call_args.kwargs["reasoning"] is False


def test_openrouter_branch_uses_chatopenai(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "openrouter")
    monkeypatch.setenv("OPENROUTER_API_KEY", "k")
    with (
        patch("setor_led.llm.create_ollama_client_from_env", return_value=_client("deepseek/x")),
        patch("langchain_openai.ChatOpenAI") as openai,
    ):
        build_setor_llm("deepseek/x")

    assert openai.call_args.kwargs["model"] == "deepseek/x"
    assert openai.call_args.kwargs["base_url"] == "https://openrouter.ai/api/v1"
