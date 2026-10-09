# syntax=docker/dockerfile:1
FROM python:3.11-slim

WORKDIR /app

# libgl1/libglib2.0-0: opencv-python (mineru[core] dependency) needs these,
# fails with "libGL.so.1: cannot open shared object file" otherwise.
RUN apt-get update && apt-get install -y \
    poppler-utils \
    libgl1 \
    libglib2.0-0 \
    libreoffice-writer \
    libreoffice-impress \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml .
# Must pair from the same index or transformers-loading code hits a torchvision ABI mismatch.
# ponytail: pindah ke wheel CUDA (cu124) supaya MinerU layout-detection +
# embedding bge-m3 bisa pakai GPU, menyamakan dengan worker /web yang sudah
# begitu. Host punya RTX 3050 6GB, driver 580.178.04, runtime `nvidia` aktif
# (dicek 2026-09-22). MinerU auto-fallback ke CPU kalau GPU tidak terlihat,
# jadi image ini tetap jalan di mesin tanpa GPU -- cuma lebih lambat.
# Baris CPU-only lama dibiarkan sebagai komentar supaya gampang dibalikin:
# CPU-only torch/torchvision so mineru's resolver doesn't pull the CUDA wheels (no GPU here).
# RUN --mount=type=cache,target=/root/.cache/pip pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
RUN --mount=type=cache,target=/root/.cache/pip pip install torch torchvision --index-url https://download.pytorch.org/whl/cu124
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
# ponytail: dinonaktifkan sementara -- CDN HuggingFace ke-throttle di jaringan
# sini (diukur 2026-09-22: huggingface.co ~358 B/s, files.pythonhosted.org
# ~400 B/s, sementara Cloudflare 4.8 MB/s -- jadi bukan bandwidth, tapi host
# tertentu). bge-m3 (~2.3 GB) praktis tidak akan pernah selesai diunduh di
# sini. Modelnya sudah disalin manual ke volume hf_cache (lihat compose:
# hf_cache:/root/.cache/huggingface), jadi tetap tersedia saat runtime.
# Aktifkan lagi begitu jaringan ke HF normal, supaya image kembali self-
# contained dan tidak bergantung pada isi volume.
# RUN --mount=type=secret,id=hf_token \
#     HF_TOKEN="$(cat /run/secrets/hf_token 2>/dev/null || true)" python -c "from sentence_transformers import SentenceTransformer; \
#     SentenceTransformer('BAAI/bge-m3')"

# Pre-download MinerU's OCR models too, same reason as the embedding model above.
# ponytail: dinonaktifkan sementara, alasan sama persis dgn blok bge-m3 di
# atas. `|| true` memang bikin build tetap lanjut kalau gagal, tapi ia baru
# menyerah setelah retry HF habis -- belasan menit menggantung tanpa hasil.
# PDF-Extract-Kit-1.0 sudah disalin manual ke volume hf_cache. Aktifkan lagi
# begitu jaringan ke HF normal.
# RUN mineru-models-download -s huggingface -m pipeline || true

COPY . .

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
