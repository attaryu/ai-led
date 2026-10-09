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
        - If session_id provided → read from Postgres assessment_indicator_results.
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
import re
import sys
import types
from dataclasses import dataclass, field
from typing import Optional

from ingestion.matrix_parser import sub_no_dari

logger = logging.getLogger(__name__)

# ragas==0.4.3 unconditionally imports langchain_community.chat_models.vertexai
# at `from ragas.llms.base import ...` time, but that submodule was dropped from
# langchain-community 0.4.x (moved to the separate langchain-google-vertexai
# package). We never select the vertexai provider, so a stub satisfies the
# import without pulling in the real (heavy) GCP integration.
if "langchain_community.chat_models.vertexai" not in sys.modules:
    try:
        import langchain_community.chat_models.vertexai  # noqa: F401
    except ModuleNotFoundError:
        _stub = types.ModuleType("langchain_community.chat_models.vertexai")

        class ChatVertexAI:  # noqa: N801 — matches the real class name being stubbed
            def __init__(self, *args, **kwargs):
                raise RuntimeError("ChatVertexAI stub — VertexAI is not configured in this project")

        _stub.ChatVertexAI = ChatVertexAI
        sys.modules["langchain_community.chat_models.vertexai"] = _stub

# Reasoning models emit <think>...</think> chain-of-thought blocks that must
# be stripped before passing to RAGAS metric parsers (which expect clean JSON
# or structured text).
_THINK_RE = re.compile(r"<think>.*?</think>", re.DOTALL | re.IGNORECASE)


def _strip_think(text: str) -> str:
    """Remove <think>...</think> blocks from a string."""
    if not text:
        return text
    return _THINK_RE.sub("", text).strip()

# ---------------------------------------------------------------------------
# Metric constants
# ---------------------------------------------------------------------------

RETRIEVAL_METRICS = ["context_precision", "context_recall"]
GENERATION_METRICS = ["faithfulness", "answer_relevancy"]
ALL_METRICS = RETRIEVAL_METRICS + GENERATION_METRICS


# ---------------------------------------------------------------------------
# LLM / embedding wrappers
# ---------------------------------------------------------------------------


def get_available_judge_models() -> list[str]:
    """Return the configured judge model list (comma-separated env var,
    first entry is the default). Reads RAGAS_* first; falls back to the
    assessment model list (OLLAMA_MODEL / OPENROUTER_MODEL) if unset —
    same fallback used by get_judge_llm_config."""
    provider = os.environ.get("RAGAS_PROVIDER", os.environ.get("LLM_PROVIDER", "ollama")).lower()
    if provider == "openrouter":
        raw = os.environ.get(
            "RAGAS_OPENROUTER_MODEL", os.environ.get("OPENROUTER_MODEL", "deepseek/deepseek-r1")
        )
    else:
        raw = os.environ.get(
            "RAGAS_OLLAMA_MODEL", os.environ.get("OLLAMA_MODEL", "deepseek-r1:7b")
        )
    return [m.strip() for m in raw.split(",") if m.strip()]


def get_judge_llm_config(model: Optional[str] = None) -> dict:
    """Return the LLM config used as RAGAS judge.

    Reads RAGAS_* env vars first; if unset, falls back to the assessment
    model (LLM_PROVIDER / OLLAMA_MODEL / OPENROUTER_MODEL). This lets you
    benchmark assessment models against a fixed judge for fair comparison.

    `model` overrides the configured default (first of
    get_available_judge_models()) — used when the caller lets the user pick
    a judge model at request time.
    """
    provider = os.environ.get(
        "RAGAS_PROVIDER",
        os.environ.get("LLM_PROVIDER", "ollama"),
    ).lower()
    resolved_provider = "openrouter" if provider == "openrouter" else "ollama"
    return {
        "provider": resolved_provider,
        "model": model or get_available_judge_models()[0],
    }


# Back-compat alias — older code paths may import this name
def get_active_llm_config(model: Optional[str] = None) -> dict:
    return get_judge_llm_config(model=model)


class _ThinkStrippingLLMWrapper:
    """Wrapper that proxies a LangchainLLMWrapper and strips <think> blocks
    from every generation so RAGAS metric parsers see clean text.

    Why proxy and not subclass: RAGAS LangchainLLMWrapper's signature varies
    across versions (0.4 vs 0.5+); proxying via __getattr__ keeps us
    compatible regardless of internal API churn.
    """

    def __init__(self, inner):
        self._inner = inner

    def __getattr__(self, name):
        # Forward unknown attributes (e.g. langchain_llm, run_config) to inner
        return getattr(self._inner, name)

    @staticmethod
    def _scrub_llm_result(result):
        """Mutate an LLMResult in place to strip <think> from every generation."""
        for gen_list in getattr(result, "generations", []) or []:
            for gen in gen_list:
                if hasattr(gen, "text") and isinstance(gen.text, str):
                    gen.text = _strip_think(gen.text)
                msg = getattr(gen, "message", None)
                if msg is not None and hasattr(msg, "content") and isinstance(msg.content, str):
                    msg.content = _strip_think(msg.content)
        return result

    def generate_text(self, *args, **kwargs):
        return self._scrub_llm_result(self._inner.generate_text(*args, **kwargs))

    async def agenerate_text(self, *args, **kwargs):
        return self._scrub_llm_result(await self._inner.agenerate_text(*args, **kwargs))

    # RAGAS 0.4.x sometimes calls .generate(...) too — forward + scrub
    def generate(self, *args, **kwargs):
        result = self._inner.generate(*args, **kwargs)
        return self._scrub_llm_result(result)

    async def agenerate(self, *args, **kwargs):
        result = await self._inner.agenerate(*args, **kwargs)
        return self._scrub_llm_result(result)


def _is_reasoning_model_name(model: str) -> bool:
    """Reuse the agent-side detection so judge auto-stripping matches policy."""
    try:
        from agent.graph import is_reasoning_model
        return is_reasoning_model(model)
    except Exception:
        # Fallback heuristic if agent module unavailable in some test contexts
        m = (model or "").lower()
        return any(p in m for p in ["deepseek-r1", "qwq", "o1-", "o1:", "thinking"])


def _build_ragas_llm(model: Optional[str] = None):
    """Return a LangchainLLMWrapper compatible with legacy RAGAS metrics.

    If the judge model is a reasoning model (deepseek-r1, qwq, o1, ...), the
    wrapper is further proxied to strip <think>...</think> blocks before RAGAS
    metric parsers see them.
    """
    from ragas.llms import LangchainLLMWrapper

    cfg = get_judge_llm_config(model=model)

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
        from llm.ollama_client import pick_ollama_endpoint

        ragas_base_url = pick_ollama_endpoint(
            os.environ.get("RAGAS_OLLAMA_BASE_URL", os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434"))
        )
        logger.info("RAGAS judge using Ollama endpoint %s", ragas_base_url)

        kwargs: dict = {
            "base_url": ragas_base_url,
            "model": cfg["model"],
            "temperature": 0.1,
            "client_kwargs": {"timeout": int(os.environ.get("OLLAMA_TIMEOUT_SECONDS", "300"))},
            # Same runaway-generation guard as agent.graph._build_llm. RAGAS's
            # per-call outputs (claim lists, yes/no verdicts, candidate
            # questions) are always short and structured, so this only bites
            # a degenerate generation.
            "num_predict": 4096,
            "keep_alive": os.environ.get("OLLAMA_KEEP_ALIVE", "30m"),
        }
        api_key = os.environ.get("RAGAS_OLLAMA_API_KEY", os.environ.get("OLLAMA_API_KEY"))
        if api_key and not api_key.startswith("<"):
            kwargs["client_kwargs"]["headers"] = {"Authorization": f"Bearer {api_key}"}
        chat = ChatOllama(**kwargs)

    wrapper = LangchainLLMWrapper(chat)
    if _is_reasoning_model_name(cfg["model"]):
        logger.info(
            "Judge model %s detected as reasoning model — wrapping with <think> stripper",
            cfg["model"],
        )
        return _ThinkStrippingLLMWrapper(wrapper)
    return wrapper


def _build_ragas_embeddings():
    """Return a LangchainEmbeddingsWrapper for AnswerRelevancy metric.

    Memakai instance bge-m3 yang SAMA dengan pgvector_store (`embed_documents`), bukan
    memuat salinan kedua via SentenceTransformerEmbeddings -- pada worker yang sudah
    memegang bge-m3 di GPU, salinan kedua memboroskan VRAM (risiko OOM)."""
    from langchain_core.embeddings import Embeddings
    from ragas.embeddings import LangchainEmbeddingsWrapper

    from vectorstore.pgvector_store import embed_documents

    class _SharedBgeEmbeddings(Embeddings):
        def embed_documents(self, texts: list[str]) -> list[list[float]]:
            return [[float(x) for x in v] for v in embed_documents(list(texts))]

        def embed_query(self, text: str) -> list[float]:
            return self.embed_documents([text])[0]

    # ponytail: dulu `SentenceTransformerEmbeddings(model_name=AMI_EMBED_MODEL)` -- memuat bge-m3 lagi.
    return LangchainEmbeddingsWrapper(_SharedBgeEmbeddings())


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
        # Strip <think> blocks if reasoning model leaked them through
        content = _strip_think(content)
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
        content = _strip_think(content)
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
    reference_path: Optional[str] = None,
    # "local" only for the offline no-session path (scripts/fetch_indicator_context.py);
    # with session_id, tenant/document/set/prodi are resolved from that session below.
    tenant_id: str = "local",
    dokumen_id: str = "local",
    accreditation_set_id: str = "local",
    progress_cb=None,
    model: Optional[str] = None,
) -> list[EvalSample]:
    """Build EvalSample list by retrieving real LED chunks and optionally
    reading actual agent justifications from a real assessment session.

    Args:
        n_indicators: How many indicators to evaluate (default 5 for speed).
        session_id:   If provided, read agent justifications from Postgres.
        reference_path: Path to a JSON file with actual ground-truth references.
            Format: [{"indicator_no": int, "reference": str}, ...].
            Falls back to synthetic generation for missing indicators.
    """
    from agent.context import AssessmentContext, current_assessment_context
    from agent.tools.rubric_tool import _get_rubrics, _get_rubrics_for_set
    from vectorstore.pgvector_store import search_led

    study_program_id: Optional[str] = None
    sess = None
    if session_id:
        from db.postgres_client import get_session  # noqa: PLC0415

        sess = get_session(None, session_id)
    if sess and sess.get("accreditation_set_id"):
        # Real session: same scope the assessment itself ran with (ariel had one global
        # Chroma/registry; dev-v1 is per tenant/document/AccreditationSet).
        tenant_id, dokumen_id = sess["tenant_id"], sess["document_id"]
        accreditation_set_id = sess["accreditation_set_id"]
        study_program_id = sess.get("study_program_id")
        rubrics = _get_rubrics_for_set(accreditation_set_id, tenant_id)
        try:
            from agent.tools.lkps_tool import load_lkps_for_document  # noqa: PLC0415

            load_lkps_for_document(
                tenant_id, dokumen_id, sess.get("lkps_evidence_id") or sess.get("document_lkps_evidence_id")
            )
        except Exception as exc:
            logger.warning("Could not load LKPS for session %s: %s", session_id, exc)
    else:
        rubrics = _get_rubrics()
    llm = _build_ragas_llm(model=model)

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

    # Optionally load real justifications from Postgres
    # Kunci (nomor, sub): 43.I dan 43.II punya justifikasi sendiri -- nomor saja membuat salah satunya hilang.
    real_justifications: dict[tuple[int, str], str] = {}
    if session_id:
        try:
            from db.postgres_client import get_indicator_results  # noqa: PLC0415

            for row in get_indicator_results(sess["tenant_id"] if sess else None, session_id):
                if row.get("justification"):
                    real_justifications[(row["indicator_no"], row.get("sub_no") or "")] = row["justification"]
        except Exception as exc:
            logger.warning("Could not load real justifications: %s", exc)

    # Evaluate the indicators actually scored in the session, not blindly the first n_indicators
    if real_justifications:
        target_rubrics = [
            r for r in rubrics if (r.no, sub_no_dari(r)) in real_justifications
        ][:n_indicators]
    else:
        target_rubrics = rubrics[:n_indicators]
    total = len(target_rubrics)
    samples: list[EvalSample] = []
    for idx, rubric in enumerate(target_rubrics):
        if progress_cb:
            try:
                progress_cb(stage="building_samples", current=idx, total=total)
            except Exception:
                pass
        question = _form_question(rubric.no, rubric.kriteria)

        # Retrieve LED chunks
        try:
            raw = search_led(
                query=question,
                tenant_id=tenant_id,
                dokumen_id=dokumen_id,
                n_results=5,
            )
            contexts = [r["text"][:1000] for r in raw]
        except Exception as exc:
            logger.warning("LED search failed for indicator %d: %s", rubric.no, exc)
            contexts = []

        # Tagged evidence-document chunks too, so faithfulness doesn't see LED-only context
        try:
            from vectorstore.pgvector_evidence_store import list_available_evidence_ids, search_evidence

            evidence_ids = list_available_evidence_ids(tenant_id, accreditation_set_id, rubric.no, study_program_id)
            evidence_raw = search_evidence(question, tenant_id, evidence_ids, n_results=3, ami=True)
            contexts += [r["text"][:1000] for r in evidence_raw]
        except Exception as exc:
            logger.warning("Evidence search failed for indicator %d: %s", rubric.no, exc)

        # LKPS table data for quantitative/composite indicators, same reason as evidence above
        for table_ref in rubric.lkps_table_ref or []:
            token = current_assessment_context.set(
                AssessmentContext(tenant_id, dokumen_id, rubric.no, accreditation_set_id, study_program_id)
            )
            try:
                from agent.tools.lkps_tool import get_lkps_table

                contexts.append(get_lkps_table.invoke({"table_reference": table_ref})[:1000])
            except Exception as exc:
                logger.warning(
                    "LKPS lookup failed for indicator %d table %s: %s", rubric.no, table_ref, exc
                )
            finally:
                current_assessment_context.reset(token)

        # Response: real session OR synthetic
        chave = (rubric.no, sub_no_dari(rubric))
        if chave in real_justifications:
            response = real_justifications[chave]
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


class _JobProgressPbar:
    """Duck-typed tqdm replacement passed as ragas.evaluate()'s `_pbar` arg
    (port of ariel's d0ddc7a).

    ragas's Executor calls `.update(1)` once per completed job -- success or
    failure -- regardless of batching. Without this, the "evaluating" stage's
    progress_cb was only ever invoked once, with current=0, before evaluate()
    started, and never again until the whole (possibly 60+ minute) call
    returned -- indistinguishable from a hung run to any caller polling
    progress_current."""

    def __init__(self, total: int, on_update) -> None:
        self.total = total
        self.n = 0
        self._on_update = on_update

    def update(self, n: int = 1) -> None:
        self.n += n
        try:
            self._on_update(self.n, self.total)
        except Exception:
            pass


def run_ragas_evaluation(
    n_indicators: int = 5,
    session_id: Optional[str] = None,
    metrics_to_run: Optional[list[str]] = None,
    reference_path: Optional[str] = None,
    progress_cb=None,
    model: Optional[str] = None,
) -> dict:
    """Run RAGAS evaluation and return a results dict.

    Args:
        n_indicators:    Number of indicators to evaluate.
        session_id:      Optional assessment session to read real justifications from.
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
    from ragas.run_config import RunConfig

    want = set(metrics_to_run or ALL_METRICS)

    samples = build_eval_samples(
        n_indicators=n_indicators,
        session_id=session_id,
        reference_path=reference_path,
        progress_cb=progress_cb,
        model=model,
    )

    if not samples:
        return {"error": "No evaluation samples could be built.", "n_samples": 0}

    llm_wrapper = _build_ragas_llm(model=model)
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

    # ragas's own default RunConfig (timeout=180s, max_workers=16) assumes a
    # fast/scalable LLM backend. Our Ollama instance is slow and typically a
    # single GPU, so 16 concurrent jobs just queue behind each other and blow
    # past the 180s per-job timeout before their own inference even starts.
    # Tie the timeout to OLLAMA_TIMEOUT_SECONDS (the budget we already give a
    # single call elsewhere) and keep worker count low to avoid GPU contention.
    run_config = RunConfig(
        timeout=int(os.environ.get("OLLAMA_TIMEOUT_SECONDS", "300")) + 60,
        max_retries=2,
        max_workers=int(os.environ.get("RAGAS_MAX_WORKERS", "2")),
    )

    total_jobs = len(ragas_samples) * len(active_metrics)
    pbar = None
    if progress_cb:
        try:
            progress_cb(stage="evaluating", current=0, total=total_jobs)
        except Exception:
            pass
        pbar = _JobProgressPbar(
            total_jobs,
            lambda cur, tot: progress_cb(stage="evaluating", current=cur, total=tot),
        )

    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        result = evaluate(dataset=dataset, metrics=active_metrics, run_config=run_config, _pbar=pbar)

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
        "total_chunks": sum(len(s.retrieved_contexts) for s in samples),
        "session_id": session_id,
        "scores": scores,
        "per_indicator": per_indicator,
        "assessor_model": _get_assessor_model(session_id) if session_id else None,
        **get_active_llm_config(model=model),
    }


def _get_assessor_model(session_id: str) -> Optional[str]:
    """Which model(s) actually scored this session's indicators, from IndicatorResult.model."""
    from db.postgres_client import get_indicator_results, get_session

    try:
        sess = get_session(None, session_id)
        models = {
            r["model"]
            for r in get_indicator_results(sess["tenant_id"] if sess else None, session_id)
            if r.get("model")
        }
    except Exception as exc:
        logger.warning("Could not look up assessor_model for session %s: %s", session_id, exc)
        return None
    return ", ".join(sorted(models)) if models else None


def score_single_sample(
    question: str,
    answer: str,
    contexts: list[str],
    reference: Optional[str] = None,
) -> dict[str, float]:
    """Score one real (question, answer, retrieved contexts) triple —
    faithfulness/answer_relevancy/context_precision, plus context_recall ONLY when
    `reference` is given (RAGAS menghitung recall terhadap jawaban acuan; narasi LED tidak
    punya, jadi pemanggil menurunkannya dari pedoman section + butir checklist). Unlike run_ragas_evaluation, this scores an
    actual generation, not a synthetic AMI-indicator sample.
    """
    import warnings

    from ragas import evaluate, EvaluationDataset
    from ragas.dataset_schema import SingleTurnSample
    from ragas.metrics import AnswerRelevancy, ContextRecall, Faithfulness, LLMContextPrecisionWithoutReference
    from ragas.run_config import RunConfig

    llm_wrapper = _build_ragas_llm()
    emb_wrapper = _build_ragas_embeddings()

    metrics = [
        Faithfulness(llm=llm_wrapper),
        AnswerRelevancy(llm=llm_wrapper, embeddings=emb_wrapper),
        # Plain ContextPrecision needs a `reference` (ground-truth) column we
        # don't have for real generations — this variant judges relevance
        # against the response instead, same as this function's docstring says.
        LLMContextPrecisionWithoutReference(llm=llm_wrapper),
    ]
    if reference and reference.strip():
        metrics.append(ContextRecall(llm=llm_wrapper))
    dataset = EvaluationDataset(samples=[
        SingleTurnSample(
            user_input=question,
            retrieved_contexts=contexts if contexts else [""],
            response=answer,
            reference=(reference or None),
        )
    ])

    # RunConfig bawaan RAGAS (timeout 180 dtk) terlalu pendek untuk LLM via jaringan: job yang
    # kena timeout jadi NaN. Sama seperti run_ragas_evaluation, timeout diikat ke anggaran satu
    # panggilan LLM kita; 3 metrik berjalan paralel.
    run_config = RunConfig(
        timeout=int(os.environ.get("OLLAMA_TIMEOUT_SECONDS", "300")) + 60,
        max_retries=2,
        max_workers=int(os.environ.get("RAGAS_MAX_WORKERS", "3")),
    )
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        result = evaluate(dataset=dataset, metrics=metrics, run_config=run_config)

    # Stable output keys regardless of ragas's internal metric.name (e.g.
    # LLMContextPrecisionWithoutReference.name isn't "context_precision").
    output_keys = {
        "faithfulness": Faithfulness,
        "answer_relevancy": AnswerRelevancy,
        "context_precision": LLMContextPrecisionWithoutReference,
        "context_recall": ContextRecall,
    }
    result_df = result.to_pandas()
    scores: dict[str, float] = {}
    for key, metric_cls in output_keys.items():
        col = next((m.name for m in metrics if isinstance(m, metric_cls)), None)
        if col and col in result_df.columns:
            val = result_df[col].iloc[0]
            # ponytail: dulu `... if val == val else 0.0`. NaN = metrik GAGAL dihitung (timeout/parse),
            # bukan skor nol -- angka 0.0 palsu menyesatkan; metrik yang gagal dibiarkan tidak ada.
            if val == val:
                scores[key] = round(float(val), 4)
    return scores
