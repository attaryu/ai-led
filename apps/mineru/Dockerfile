# syntax=docker/dockerfile:1
# MinerU 4.x sebagai service sendiri (lihat gateway.py).
#
# requirements.lock = `pip freeze` dari venv yang SUDAH terbukti menjalankan
# notebook ekstraksi di mesin ini (MinerU 4.0.8, Python 3.12, torch 2.11+cu128),
# jadi versinya bukan tebakan. torch memakai build cu128 -- BEDA dari image `ai`
# (cu124); keduanya tidak berbagi lapisan.
FROM python:3.12-slim

# libgl1/libglib2.0-0: dibutuhkan opencv; libgomp1: dibutuhkan onnxruntime.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /srv

COPY requirements.lock .
# Cache pip: unduhan ~3 GB (torch + paket CUDA) cukup sekali, build ulang tidak
# mengunduh lagi. torch +cu128 hanya ada di index PyTorch, sisanya dari PyPI.
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install -r requirements.lock --extra-index-url https://download.pytorch.org/whl/cu128

COPY gateway.py entrypoint.sh ./
RUN chmod +x entrypoint.sh

ENV MINERU_MODE=local \
    MINERU_TIER=basic \
    PYTHONUNBUFFERED=1

EXPOSE 8100
ENTRYPOINT ["/srv/entrypoint.sh"]
