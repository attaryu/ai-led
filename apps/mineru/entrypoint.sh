#!/bin/sh
# Konfigurasi MinerU dari environment, lalu jalankan gateway.
#   MINERU_MODE=local  -> parse-server terkelola di container ini (GPU)
#   MINERU_MODE=api    -> mineru.net lewat --remote (butuh MINERU_API_KEY)
#   MINERU_TIER        -> tier server lokal (default basic = pipeline saja)
#
# Urutan penting dan SENGAJA tanpa `set -e`:
#   1. `mineru config set` menolak jalan bila server belum hidup ("Local mineru
#      server is not running") -- jadi server dinyalakan DULU.
#   2. `managed_tier` ditolak bila model tier itu belum ada di
#      /root/.mineru/models ("Run: mineru-kit models download --tier basic").
#      Versi sebelumnya memakai `set -e`, jadi galat itu mematikan container dan
#      Docker me-restart-nya tanpa henti (crash-loop). Sekarang galat dicatat
#      dengan petunjuk perbaikan dan gateway tetap hidup supaya /health bisa
#      melaporkannya.
MODE="${MINERU_MODE:-local}"
TIER="${MINERU_TIER:-basic}"

log() { echo "[mineru-entrypoint] $*"; }

# set_cfg KEY VALUE -- nilai TIDAK dicetak (bisa berupa kunci API).
set_cfg() {
    if out=$(mineru config set "$1" "$2" 2>&1); then
        log "config $1 diset"
        return 0
    fi
    log "GAGAL mengatur $1: $(echo "$out" | head -c 400)"
    return 1
}

mineru server start || log "PERINGATAN: 'mineru server start' gagal"

# tunggu server doclib hidup (maks ~60 detik)
i=0
until mineru server status --json 2>/dev/null | grep -q '"running": true'; do
    i=$((i + 1))
    if [ "$i" -ge 30 ]; then
        log "PERINGATAN: server tidak hidup setelah 60 detik"
        break
    fi
    sleep 2
done

if [ -n "${MINERU_API_KEY:-}" ]; then
    set_cfg parse_server.remote.api_key "$MINERU_API_KEY"
fi

if [ "$MODE" = "local" ]; then
    # managed_tier dulu, baru mode -- supaya parse-server langsung naik dengan tier yang benar
    if set_cfg parse_server.local.managed_tier "$TIER" && set_cfg parse_server.local.mode managed; then
        :
    else
        log "mode lokal TIDAK aktif. Biasanya model tier '$TIER' belum ada di volume mineru_home."
        log "Salin dari host (lihat komentar docker-compose.yml) atau jalankan: mineru-kit models download --tier $TIER"
    fi
fi

exec uvicorn gateway:app --host 0.0.0.0 --port 8100
