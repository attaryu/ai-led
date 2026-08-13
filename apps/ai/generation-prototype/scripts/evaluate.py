"""T7: Hitung ROUGE/BLEU/RAGAS per (section, model). DB-backed (idempotent).

Output:
  - eval_results table di SQLite
  - /data/eval_results.csv (pivot)
"""
import argparse
import json
import math
import os
import sys
import time
from pathlib import Path

sys.path.insert(0, "/app")

from lib.db import init_db, conn

LED_DIR = Path("/data/led_existing_split")
OUT_CSV = Path("/data/eval_results.csv")


def compute_rouge(hyp: str, ref: str) -> dict:
    from rouge_score.rouge_scorer import RougeScorer
    scorer = RougeScorer(["rouge1", "rouge2", "rougeL"], use_stemmer=False)
    s = scorer.score(ref, hyp)
    return {
        "rouge_1": round(s["rouge1"].fmeasure, 4),
        "rouge_2": round(s["rouge2"].fmeasure, 4),
        "rouge_l": round(s["rougeL"].fmeasure, 4),
    }


def compute_bleu(hyp: str, ref: str) -> float:
    from nltk.translate.bleu_score import sentence_bleu, SmoothingFunction
    sm = SmoothingFunction().method4
    return round(sentence_bleu([ref.split()], hyp.split(),
                                weights=(0.25, 0.25, 0.25, 0.25),
                                smoothing_function=sm), 4)


def compute_ragas(answer: str, context: str, reference: str) -> dict:
    """RAGAS via Groq llama-3.1-8b-instant judge."""
    try:
        from datasets import Dataset
        from ragas import evaluate
        from ragas.metrics import AnswerRelevancy, ContextPrecision, ContextRecall
        from ragas.llms import LangchainLLMWrapper
        from ragas.embeddings import LangchainEmbeddingsWrapper
        from langchain_community.chat_models import ChatLiteLLM
        from langchain_community.embeddings import HuggingFaceEmbeddings
    except ImportError as e:
        print(f"  ragas/groq libs tidak lengkap: {e}")
        return {"answer_relevancy": None, "context_precision": None, "context_recall": None}

    if not os.environ.get("GROQ_API_KEY"):
        return {"answer_relevancy": None, "context_precision": None, "context_recall": None}

    llm = LangchainLLMWrapper(ChatLiteLLM(model="groq/llama-3.1-8b-instant",
                                            temperature=0, max_tokens=512))
    emb = LangchainEmbeddingsWrapper(HuggingFaceEmbeddings(
        model_name="firqaaa/indo-sentence-bert-base"))

    metrics = [
        AnswerRelevancy(llm=llm, embeddings=emb),
        ContextPrecision(llm=llm),
        ContextRecall(llm=llm),
    ]

    ds = Dataset.from_dict({
        "user_input":         [reference[:500]],
        "response":           [answer[:2000]],
        "retrieved_contexts": [[context[:2000]]],
        "reference":          [reference[:2000]],
    })

    def _scalar(v):
        if isinstance(v, list):
            v = [x for x in v if x is not None]
            return round(sum(v) / len(v), 4) if v else None
        try:
            f = float(v); return None if math.isnan(f) else round(f, 4)
        except Exception:
            return None

    out = {"answer_relevancy": None, "context_precision": None, "context_recall": None}
    name_map = {
        "answer_relevancy":  metrics[0],
        "context_precision": metrics[1],
        "context_recall":    metrics[2],
    }
    for k, m in name_map.items():
        for attempt in range(3):
            try:
                r = evaluate(ds, metrics=[m], allow_nest_asyncio=True)
                out[k] = _scalar(r[m.name])
                if out[k] is not None:
                    break
            except Exception as e:
                print(f"    ragas {k} attempt {attempt+1} err: {e}")
                time.sleep(2)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true", help="Re-eval semua row")
    args = ap.parse_args()

    init_db()
    if not LED_DIR.exists() or not any(LED_DIR.glob("*.txt")):
        print(f"⚠ {LED_DIR} kosong. Jalankan dulu parse_led_existing.py")
        sys.exit(1)

    led_by_id = {p.stem: p.read_text(encoding="utf-8") for p in LED_DIR.glob("*.txt")}
    print(f"Loaded {len(led_by_id)} LED ground-truth section.")

    with conn() as con:
        rows = con.execute("SELECT * FROM drafts").fetchall()
    print(f"Drafts di DB: {len(rows)}")

    for r in rows:
        sid   = r["section_id"]
        model = r["model"]
        hyp   = r["draft_text"]
        ref   = led_by_id.get(sid)

        if not args.force:
            with conn() as con:
                prev = con.execute(
                    "SELECT id FROM eval_results WHERE section_id=? AND model=?",
                    (sid, model)).fetchone()
            if prev:
                print(f"  [SKIP] {sid:<8} [{model}] sudah dieval")
                continue

        if not ref:
            print(f"  [SKIP] {sid:<8} [{model}] tidak ada ground-truth")
            continue

        print(f"  [EVAL] {sid:<8} [{model}] ...", flush=True)

        rouge = compute_rouge(hyp, ref)
        bleu  = compute_bleu(hyp, ref)

        try:
            chunks_meta = json.loads(r["chunks_used"] or "[]")
            ctx = " ".join((c.get("text") or "") for c in chunks_meta[:5])
        except Exception:
            ctx = ""
        ragas = compute_ragas(hyp, ctx, ref)

        with conn() as con:
            con.execute("""
                INSERT INTO eval_results
                (section_id, model, rouge_1, rouge_2, rouge_l, bleu_4,
                 answer_relevancy, context_precision, context_recall, evaluated_at)
                VALUES (?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
                ON CONFLICT(section_id, model) DO UPDATE SET
                    rouge_1=excluded.rouge_1,
                    rouge_2=excluded.rouge_2,
                    rouge_l=excluded.rouge_l,
                    bleu_4 =excluded.bleu_4,
                    answer_relevancy=excluded.answer_relevancy,
                    context_precision=excluded.context_precision,
                    context_recall=excluded.context_recall,
                    evaluated_at=CURRENT_TIMESTAMP
            """, (sid, model,
                  rouge["rouge_1"], rouge["rouge_2"], rouge["rouge_l"], bleu,
                  ragas["answer_relevancy"], ragas["context_precision"], ragas["context_recall"]))
        print(f"         ROUGE-L={rouge['rouge_l']} BLEU={bleu} "
              f"AnsRel={ragas['answer_relevancy']} CtxP={ragas['context_precision']} "
              f"CtxR={ragas['context_recall']}")

    # Export CSV pivot
    with conn() as con:
        rows = con.execute("SELECT * FROM eval_results").fetchall()
    if rows:
        import csv
        with open(OUT_CSV, "w", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            cols = list(rows[0].keys())
            w.writerow(cols)
            for r in rows:
                w.writerow([r[c] for c in cols])
        print(f"\n✅ {OUT_CSV} ditulis ({len(rows)} row)")


if __name__ == "__main__":
    main()
