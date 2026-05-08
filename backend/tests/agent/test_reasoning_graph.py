"""Tests for the reasoning-mode (prompt-based tool calling) graph."""

from __future__ import annotations

import os
from unittest.mock import patch

import pytest


# ── is_reasoning_model dispatcher ─────────────────────────────────────────────


def test_is_reasoning_model_default_patterns():
    from agent.graph import is_reasoning_model

    assert is_reasoning_model("deepseek-r1:14b") is True
    assert is_reasoning_model("qwq:32b") is True
    assert is_reasoning_model("o1-preview") is True
    assert is_reasoning_model("openai/o1-mini") is True
    assert is_reasoning_model("qwen2.5:14b") is False
    assert is_reasoning_model("llama3.1:8b") is False
    assert is_reasoning_model("") is False


def test_is_reasoning_model_explicit_override_true():
    from agent.graph import is_reasoning_model

    with patch.dict(os.environ, {"LLM_REASONING_MODE": "true"}):
        assert is_reasoning_model("qwen2.5:14b") is True


def test_is_reasoning_model_explicit_override_false():
    from agent.graph import is_reasoning_model

    with patch.dict(os.environ, {"LLM_REASONING_MODE": "false"}):
        assert is_reasoning_model("deepseek-r1:14b") is False


def test_is_reasoning_model_extra_patterns():
    from agent.graph import is_reasoning_model

    with patch.dict(os.environ, {"REASONING_MODEL_PATTERNS": "my-custom-cot,reasonix"}):
        assert is_reasoning_model("acme/my-custom-cot:7b") is True
        assert is_reasoning_model("reasonix-v2") is True


# ── JSON extraction helpers ───────────────────────────────────────────────────


def test_strip_reasoning_removes_think_block():
    from agent.reasoning_graph import _strip_reasoning

    content = (
        "<think>\nLet me reason about this...\nfirst step\n</think>\n"
        '{"action": "final", "score": 3}'
    )
    assert "think" not in _strip_reasoning(content).lower()
    assert '"action"' in _strip_reasoning(content)


def test_extract_json_from_code_fence():
    from agent.reasoning_graph import _extract_json

    content = '```json\n{"action": "final", "score": 4}\n```'
    parsed = _extract_json(content)
    assert parsed == {"action": "final", "score": 4}


def test_extract_json_takes_last_block():
    """Reasoning leakage: <think> may contain example JSON; we want the FINAL one."""
    from agent.reasoning_graph import _extract_json

    content = (
        "<think>misal saya panggil {\"action\": \"foo\"}</think>\n"
        '{"action": "final", "score": 2.5, "confidence": 0.8}'
    )
    parsed = _extract_json(content)
    assert parsed["action"] == "final"
    assert parsed["score"] == 2.5


def test_extract_json_handles_smart_quotes():
    from agent.reasoning_graph import _extract_json

    content = "{“action”: “final”, “score”: 3}"
    parsed = _extract_json(content)
    assert parsed == {"action": "final", "score": 3}


def test_extract_json_returns_none_when_unparseable():
    from agent.reasoning_graph import _extract_json

    assert _extract_json("totally not json at all") is None
    assert _extract_json("<think>only thinking, no answer</think>") is None


# ── build_reasoning_graph compiles ────────────────────────────────────────────


def test_build_reasoning_graph_returns_compiled():
    from agent.reasoning_graph import build_reasoning_graph
    from llm.ollama_client import OllamaClient

    fake = OllamaClient(base_url="http://fake:11434", model="deepseek-r1:14b", timeout_seconds=30)
    graph = build_reasoning_graph(fake)
    assert hasattr(graph, "invoke")
