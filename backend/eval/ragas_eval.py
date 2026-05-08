"""RAGAS evaluation pipeline for the AMI Assessment RAG system.

Evaluates two aspects:
  1. Retrieval quality  — does search_led_evidence return relevant chunks?
     Metrics: ContextPrecision, ContextRecall (requires synthetic ground truth)

  2. Generation quality — is the agent justification faithful to the evidence?
     Metrics: Faithfulness, AnswerRelevancy

Workflow
--------
1. For each indicator (up to n_indicators):
   a. Form a natural-language question from the indicator description.
   b. Retrieve LED chunks via search_led_evidence (real RAG pipeline).
   c. Source the agent's justification:
        - If session_id provided → read from Supabase indicator_results.
        - Otherwise → generate synthetically with the LLM.
   d. Generate a reference (ground truth) answer with the LLM from the chunks.
2. Build RAGAS EvaluationDataset and run evaluate().
3. Return a dict of metric scores.

Provider selection follows LLM_PROVIDER env var (see agent/graph.py).
"""

from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass, field
from typing import Optional

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Metric constants
# ---------------------------------------------------------------------------

RETRIEVAL_METRICS = ["context_precision", "context_recall"]
GENERATION_METRICS = ["faithfulness", "answer_relevancy"]
ALL_METRICS = RETRIEVAL_METRICS + GENERATION_METRICS


# ---------------------------------------------------------------------------
# LLM / embedding wrappers
# ---------------------------------------------------------------------------


def get_active_llm_config() -> dict:
    """Return the active provider/model identifiers without instantiating the LLM."""
    provider = os.environ.get("LLM_PROVIDER", "ollama").lower()
    if provider == "openrouter":
        return {
            "provider": "openrouter",
            "model": os.environ.get("OPENROUTER_MODEL", "deepseek/deepseek-r1"),
        }
    return {
        "provider": "ollama",
        "model": os.environ.get("OLLAMA_MODEL", "deepseek-r1:7b"),
    }


def _build_ragas_llm():
    """Return a LangchainLLMWrapper compatible with legacy RAGAS metrics."""
    from ragas.llms import LangchainLLMWrapper

    cfg = get_active_llm_config()

    if cfg["provider"] == "openrouter":
        from langchain_openai import ChatOpenAI

        chat = ChatOpenAI(
            base_url="https://openrouter.ai/api/v1",
            api_key=os.environ["OPENROUTER_API_KEY"],
            model=cfg["model"],
            temperature=0.1,
        )
    else:
        from langchain_ollama import ChatOllama

        kwargs: dict = {
            "base_url": os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434"),
            "model": cfg["model"],
            "temperature": 0.1,
        }
        api_key = os.environ.get("OLLAMA_API_KEY")
        if api_key and not api_key.startswith("<"):
            kwargs["client_kwargs"] = {"headers": {"Authorization": f"Bearer {api_key}"}}
        chat = ChatOllama(**kwargs)

    return LangchainLLMWrapper(chat)


def _build_ragas_embeddings():
    """Return a LangchainEmbeddingsWrapper for AnswerRelevancy metric."""
    from langchain_community.embeddings import SentenceTransformerEmbeddings
    from ragas.embeddings import LangchainEmbeddingsWrapper

    emb = SentenceTransformerEmbeddings(
        model_name="paraphrase-multilingual-MiniLM-L12-v2"
    )
    return LangchainEmbeddingsWrapper(emb)


# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------


@dataclass
class EvalSample:
    indicator_no: int
    user_input: str          # question formed from indicator description
    retrieved_contexts: list[str]
    response: str            # agent justification (actual or synthetic)
    reference: str           # synthetic ground-truth answer


# ---------------------------------------------------------------------------
# Synthetic generation helpers
# ---------------------------------------------------------------------------


def _form_question(indicator_no: int, kriteria: str) -> str:
    return (
        f"Berdasarkan dokumen LED, bagaimana kondisi program studi untuk indikator "
        f"nomor {indicator_no}: {kriteria}? "
        f"Berikan penilaian singkat dengan bukti yang mendukung."
    )


def _generate_reference(question: str, contexts: list[str], llm) -> str:
    """Ask the LLM to produce a reference answer from the retrieved contexts."""
    if not contexts:
        return "Tidak ada bukti yang ditemukan di dokumen LED."

    context_text = "\n\n".join(f"[Chunk {i+1}]\n{c}" for i, c in enumerate(contexts[:3]))
    prompt = (
        f"Berdasarkan kutipan dokumen LED berikut:\n\n{context_text}\n\n"
        f"Jawab pertanyaan ini dalam 2-3 kalimat Bahasa Indonesia:\n{question}"
    )
    try:
        # LangchainLLMWrapper — use the underlying chat model directly
        response = llm.langchain_llm.invoke(prompt)
        content = response.content if hasattr(response, "content") else str(response)
        return content.strip() or "Tidak dapat menghasilkan referensi."
    except Exception as exc:
        logger.warning("Reference generation failed: %s", exc)
        return contexts[0][:500] if contexts else "N/A"


def _generate_synthetic_response(question: str, contexts: list[str], llm) -> str:
    """Generate a synthetic agent response when no real session is available."""
    if not contexts:
        return "Tidak ada bukti LED yang ditemukan untuk indikator ini."

    context_text = "\n\n".join(f"[Chunk {i+1}]\n{c}" for i, c in enumerate(contexts[:3]))
    prompt = (
        f"Anda adalah penilai akreditasi. Berdasarkan bukti berikut:\n\n{context_text}\n\n"
        f"Beri justifikasi singkat (2-3 kalimat) untuk: {question}"
    )
    try:
        response = llm.langchain_llm.invoke(prompt)
        content = response.content if hasattr(response, "content") else str(response)
        return content.strip() or "Tidak dapat menghasilkan justifikasi."
    except Exception as exc:
        logger.warning("Synthetic response generation failed: %s", exc)
        return "Justifikasi tidak tersedia."


# ---------------------------------------------------------------------------
# Dataset builder
# ---------------------------------------------------------------------------


def build_eval_samples(
    n_indicators: int = 5,
    session_id: Optional[str] = None,
    chroma_persist_dir: Optional[str] = None,
    reference_path: Optional[str] = None,
) -> list[EvalSample]:
    """Build EvalSample list by retrieving real LED chunks and optionally
    reading actual agent justifications from a Supabase session.

    Args:
        n_indicators: How many indicators to evaluate (default 5 for speed).
        session_id:   If provided, read agent justifications from Supabase.
        chroma_persist_dir: Override for ChromaDB path.
        reference_path: Path to a JSON file with actual ground-truth references.
            Format: [{"indicator_no": int, "reference": str}, ...].
            Falls back to synthetic generation for missing indicators.
    """
    from agent.tools.rubric_tool import _get_rubrics
    from vectorstore.chroma_store import search_led

    persist_dir = chroma_persist_dir or os.environ.get("CHROMA_PERSIST_DIR", "data/chroma_db")
    rubrics = _get_rubrics()
    llm = _build_ragas_llm()

    # Load actual ground-truth references from JSON file if provided
    actual_refs: dict[int, str] = {}
    if reference_path and os.path.exists(reference_path):
        try:
            with open(reference_path, encoding="utf-8") as f:
                for item in json.load(f):
                    if "indicator_no" in item and "reference" in item:
                        actual_refs[int(item["indicator_no"])] = item["reference"]
            logger.info("Loaded %d actual references from %s", len(actual_refs), reference_path)
        except Exception as exc:
            logger.warning("Could not load references from %s: %s", reference_path, exc)

    # Optionally load real justifications from Supabase
    real_justifications: dict[int, str] = {}
    if session_id:
        try:
            from db.supabase_client import get_supabase  # noqa: PLC0415

            resp = (
                get_supabase()
                .table("indicator_results")
                .select("indicator_no, justification")
                .eq("session_id", session_id)
                .execute()
            )
            for row in resp.data or []:
                if row.get("justification"):
                    real_justifications[row["indicator_no"]] = row["justification"]
        except Exception as exc:
            logger.warning("Could not load Supabase justifications: %s", exc)

    samples: list[EvalSample] = []
    for rubric in rubrics[:n_indicators]:
        question = _form_question(rubric.no, rubric.kriteria)

        # Retrieve LED chunks
        try:
            raw = search_led(query=question, persist_dir=persist_dir, n_results=5)
            contexts = [r["text"][:1000] for r in raw]
        except Exception as exc:
            logger.warning("LED search failed for indicator %d: %s", rubric.no, exc)
            contexts = []

        # Response: real session OR synthetic
        if rubric.no in real_justifications:
            response = real_justifications[rubric.no]
        else:
            response = _generate_synthetic_response(question, contexts, llm)

        # Reference: use actual doc if available, otherwise generate synthetically
        if rubric.no in actual_refs:
            reference = actual_refs[rubric.no]
        else:
            reference = _generate_reference(question, contexts, llm)

        samples.append(
            EvalSample(
                indicator_no=rubric.no,
                user_input=question,
                retrieved_contexts=contexts,
                response=response,
                reference=reference,
            )
        )
        logger.info("Prepared eval sample for indicator %d", rubric.no)

    return samples


# ---------------------------------------------------------------------------
# RAGAS runner
# ---------------------------------------------------------------------------


def run_ragas_evaluation(
    n_indicators: int = 5,
    session_id: Optional[str] = None,
    chroma_persist_dir: Optional[str] = None,
    metrics_to_run: Optional[list[str]] = None,
    reference_path: Optional[str] = None,
) -> dict:
    """Run RAGAS evaluation and return a results dict.

    Args:
        n_indicators:    Number of indicators to evaluate.
        session_id:      Optional Supabase session to read real justifications from.
        chroma_persist_dir: Override ChromaDB path.
        metrics_to_run:  Subset of ALL_METRICS to run (default: all four).
        reference_path:  Path to JSON file with actual ground-truth references.

    Returns:
        {
            "n_samples": int,
            "scores": {
                "faithfulness": float,
                "answer_relevancy": float,
                "context_precision": float,
                "context_recall": float,
            },
            "per_indicator": [{"indicator_no": int, "faithfulness": float, ...}]
        }
    """
    import warnings

    from ragas import evaluate, EvaluationDataset
    from ragas.dataset_schema import SingleTurnSample
    from ragas.metrics import (
        AnswerRelevancy,
        ContextPrecision,
        ContextRecall,
        Faithfulness,
    )

    want = set(metrics_to_run or ALL_METRICS)

    samples = build_eval_samples(
        n_indicators=n_indicators,
        session_id=session_id,
        chroma_persist_dir=chroma_persist_dir,
        reference_path=reference_path,
    )

    if not samples:
        return {"error": "No evaluation samples could be built.", "n_samples": 0}

    llm_wrapper = _build_ragas_llm()
    emb_wrapper = _build_ragas_embeddings()

    # Build metric objects
    active_metrics = []
    if "faithfulness" in want:
        active_metrics.append(Faithfulness(llm=llm_wrapper))
    if "answer_relevancy" in want:
        active_metrics.append(AnswerRelevancy(llm=llm_wrapper, embeddings=emb_wrapper))
    if "context_precision" in want:
        active_metrics.append(ContextPrecision(llm=llm_wrapper))
    if "context_recall" in want:
        active_metrics.append(ContextRecall(llm=llm_wrapper))

    # Build EvaluationDataset
    ragas_samples = [
        SingleTurnSample(
            user_input=s.user_input,
            retrieved_contexts=s.retrieved_contexts if s.retrieved_contexts else [""],
            response=s.response,
            reference=s.reference,
        )
        for s in samples
    ]
    dataset = EvaluationDataset(samples=ragas_samples)

    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        result = evaluate(dataset=dataset, metrics=active_metrics)

    result_df = result.to_pandas()

    # Aggregate scores
    scores = {}
    for metric in active_metrics:
        col = metric.name
        if col in result_df.columns:
            scores[col] = round(float(result_df[col].mean(skipna=True)), 4)

    # Per-indicator breakdown
    per_indicator = []
    for i, s in enumerate(samples):
        row: dict = {"indicator_no": s.indicator_no}
        for metric in active_metrics:
            col = metric.name
            if col in result_df.columns:
                val = result_df[col].iloc[i]
                row[col] = round(float(val), 4) if val == val else None  # NaN guard
        per_indicator.append(row)

    return {
        "n_samples": len(samples),
        "session_id": session_id,
        "scores": scores,
        "per_indicator": per_indicator,
        **get_active_llm_config(),
    }
