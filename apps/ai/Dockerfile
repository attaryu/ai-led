# syntax=docker/dockerfile:1
FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    poppler-utils \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml .
# Cache mount, not --no-cache-dir: any pyproject.toml change (a version bump,
# swapping one package) invalidates this whole layer, and without a cache
# mount that means re-downloading every dependency from scratch — torch and
# sentence-transformers alone are ~2GB. The mount persists across builds on
# the same Docker daemon independent of layer invalidation, so only the
# actually-changed packages get fetched.
RUN --mount=type=cache,target=/root/.cache/pip pip install -e .

# Pre-download embedding model so first-run indexing isn't blocked on a
# slow / rate-limited HF Hub download (xet chunked protocol hangs on some networks).
# HF_TOKEN is optional but recommended (faster, no rate limits). Passed as a
# BuildKit secret (not an ARG) so it never lands in the image's layer history.
ENV HF_HOME=/root/.cache/huggingface \
    SENTENCE_TRANSFORMERS_HOME=/root/.cache/huggingface/sentence-transformers \
    HF_HUB_DISABLE_XET=1
RUN --mount=type=secret,id=hf_token \
    HF_TOKEN="$(cat /run/secrets/hf_token 2>/dev/null || true)" python -c "from sentence_transformers import SentenceTransformer; \
    SentenceTransformer('paraphrase-multilingual-MiniLM-L12-v2')"

COPY . .

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
