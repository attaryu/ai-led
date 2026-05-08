FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    poppler-utils \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml .
RUN pip install --no-cache-dir -e .

# Pre-download embedding model so first-run indexing isn't blocked on a
# slow / rate-limited HF Hub download (xet chunked protocol hangs on some networks).
# HF_TOKEN is optional but recommended (faster, no rate limits).
ARG HF_TOKEN=""
ENV HF_HOME=/root/.cache/huggingface \
    SENTENCE_TRANSFORMERS_HOME=/root/.cache/huggingface/sentence-transformers \
    HF_HUB_DISABLE_XET=1
RUN HF_TOKEN="$HF_TOKEN" python -c "from sentence_transformers import SentenceTransformer; \
    SentenceTransformer('paraphrase-multilingual-MiniLM-L12-v2')"

COPY . .

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
