#!/bin/sh
# Mengisi volume model dari folder ./models di proyek -- SEKALI, saat volume masih kosong.
# Idempotent: bagian yang sudah ada di volume DILEWATI (tidak ditimpa), jadi aman dijalankan tiap `up`.
#
# Layout ./models (lihat docker-compose.yml, service `bootstrap`):
#   models/hf_cache/sentence-transformers/models--BAAI--bge-m3              -> volume hf_cache
#   models/hf_cache/hub/models--opendatalab--PDF-Extract-Kit-1.0            -> volume hf_cache
#   models/mineru/models/MinerU-4_models_torch                              -> volume mineru_home
set -u

GAGAL=0

# salin SUMBER TUJUAN LABEL WAJIB(1|0)
salin() {
    sumber="$1"; tujuan="$2"; label="$3"; wajib="$4"
    if [ -d "$tujuan" ] && [ -n "$(ls -A "$tujuan" 2>/dev/null)" ]; then
        echo "[bootstrap] $label: sudah ada di volume, dilewati"
        return 0
    fi
    if [ ! -d "$sumber" ]; then
        if [ "$wajib" = "1" ]; then
            echo "[bootstrap] GAGAL $label: tidak ada di volume maupun di folder models (cari: $sumber)"
            GAGAL=1
        else
            echo "[bootstrap] PERINGATAN $label: tidak ada di folder models ($sumber); dilewati"
        fi
        return 0
    fi
    mkdir -p "$tujuan" && cp -a "$sumber/." "$tujuan/" && echo "[bootstrap] $label: disalin ke volume"
}

# Model embedding: tanpanya ai/ai-worker tidak bisa membuat embedding sama sekali -> WAJIB.
salin /seed/hf_cache/sentence-transformers/models--BAAI--bge-m3 \
      /dst/hf_cache/sentence-transformers/models--BAAI--bge-m3 "bge-m3 (embedding)" 1
# Jalur MinerU 3.4.5 in-process (Panduan) dan model MinerU 4 tier basic: tanpanya fitur itu saja yang tidak jalan.
salin /seed/hf_cache/hub/models--opendatalab--PDF-Extract-Kit-1.0 \
      /dst/hf_cache/hub/models--opendatalab--PDF-Extract-Kit-1.0 "PDF-Extract-Kit" 0
salin /seed/mineru/models/MinerU-4_models_torch \
      /dst/mineru_home/models/MinerU-4_models_torch "MinerU 4 tier basic" 0

if [ "$GAGAL" -ne 0 ]; then
    echo "[bootstrap] ada model WAJIB yang hilang -- hentikan di sini supaya tidak ada service yang jalan setengah rusak."
    exit 1
fi
echo "[bootstrap] selesai"
