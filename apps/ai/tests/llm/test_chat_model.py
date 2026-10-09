"""build_plain_llm/build_judge_llm provider switch -- construction only
(no network call), one case per provider branch."""

import pytest

from llm.chat_model import build_judge_llm, build_plain_llm


@pytest.fixture(autouse=True)
def _clean_env(monkeypatch):
    for key in (
        "LLM_PROVIDER", "JUDGE_PROVIDER",
        "OLLAMA_BASE_URL", "OLLAMA_MODEL", "OLLAMA_API_KEY",
        "OPENROUTER_API_KEY", "OPENROUTER_MODEL",
        "HF_TOKEN", "HF_MODEL", "JUDGE_HF_MODEL",
    ):
        monkeypatch.delenv(key, raising=False)


def test_plain_llm_huggingface_provider_uses_hf_router(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "huggingface")
    monkeypatch.setenv("HF_TOKEN", "hf_fake")

    llm = build_plain_llm()

    assert str(llm.openai_api_base) == "https://router.huggingface.co/v1"
    assert llm.model_name == "Qwen/Qwen2.5-72B-Instruct"


def test_plain_llm_huggingface_provider_respects_hf_model_override(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "huggingface")
    monkeypatch.setenv("HF_TOKEN", "hf_fake")
    monkeypatch.setenv("HF_MODEL", "meta-llama/Llama-3.3-70B-Instruct")

    llm = build_plain_llm()

    assert llm.model_name == "meta-llama/Llama-3.3-70B-Instruct"


def test_judge_llm_huggingface_provider_falls_back_to_hf_model(monkeypatch):
    monkeypatch.setenv("JUDGE_PROVIDER", "huggingface")
    monkeypatch.setenv("HF_TOKEN", "hf_fake")
    monkeypatch.setenv("HF_MODEL", "meta-llama/Llama-3.3-70B-Instruct")

    llm = build_judge_llm()

    assert llm.model_name == "meta-llama/Llama-3.3-70B-Instruct"


def test_judge_llm_huggingface_provider_prefers_judge_hf_model(monkeypatch):
    monkeypatch.setenv("JUDGE_PROVIDER", "huggingface")
    monkeypatch.setenv("HF_TOKEN", "hf_fake")
    monkeypatch.setenv("HF_MODEL", "meta-llama/Llama-3.3-70B-Instruct")
    monkeypatch.setenv("JUDGE_HF_MODEL", "Qwen/Qwen2.5-14B-Instruct")

    llm = build_judge_llm()

    assert llm.model_name == "Qwen/Qwen2.5-14B-Instruct"
