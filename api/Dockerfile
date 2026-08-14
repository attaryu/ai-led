# syntax=docker/dockerfile:1.4
FROM python:3.12-slim

WORKDIR /app

# Pip config: timeout panjang + retry banyak supaya koneksi lambat tidak fail
ENV PIP_DEFAULT_TIMEOUT=600 \
    PIP_RETRIES=20 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

COPY requirements.txt .

# Install torch CUDA 12.4 build (kompatibel driver 525+ termasuk RTX 3050).
# Ukuran ~1.5 GB (vs CPU-only 200 MB), tapi embedding 3-5× lebih cepat di GPU.
# BuildKit cache mount supaya wheel cached antar rebuild.
# torch >= 2.6 wajib karena transformers menolak torch.load utk CVE-2025-32434.
# bge-m3 punya safetensors, jadi safetensors path tetap aman.
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install torch==2.6.0 --index-url https://download.pytorch.org/whl/cu124 \
    --extra-index-url https://pypi.org/simple

RUN --mount=type=cache,target=/root/.cache/pip \
    pip install -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
