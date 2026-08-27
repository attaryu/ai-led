"""Distributed lock berbasis Redis utk serialize akses GPU LINTAS CONTAINER.

Container `api` (embedding query via retrieval.py::get_embeddings) dan
`worker` (MinerU extraction + embedding upsert via worker_tasks.py) sama-sama
punya deploy.resources.reservations GPU di docker-compose.yml -- keduanya
BEBAS jalan bersamaan krn tidak ada koordinasi apapun. GPU lokal (mis. RTX
3050, 6GiB) terlalu kecil utk 2 beban model sekaligus (bge-m3 ~2.3GiB +
MinerU layout model bisa >3GiB) -- kalau bertabrakan, salah satu OOM
("CUDA out of memory") dan job gagal permanen (bukti_dukung.status='failed').

Lock ini dipakai membungkus SETIAP operasi yg memuat/menjalankan model ke
GPU (baik di api maupun worker) -- Redis (`redis.lock.Lock`, built-in di
package `redis` yg sudah jadi dependency `rq`) sudah shared antar kedua
container (REDIS_URL sama), jadi lock ini otomatis cross-container tanpa
tambahan infrastruktur apapun.

Kalau tidak ada GPU sama sekali (EMBEDDING_DEVICE=cpu / CI / dev tanpa GPU),
lock ini TETAP aman dipakai -- cuma jadi serialize tanpa manfaat nyata
(overhead nya kecil, blocking timeout wajar), tidak perlu dimatikan manual.
"""
import os
from contextlib import contextmanager

from redis import Redis

REDIS_URL = os.environ.get("REDIS_URL", "redis://redis:6379")
_redis = Redis.from_url(REDIS_URL)

GPU_LOCK_NAME = "gpu:exclusive"
# Timeout lock (auto-release kalau proses crash tanpa sempat release) --
# lebih panjang dari operasi GPU terlama yg diharapkan (MinerU 1 PDF besar
# bisa >2 menit). Blocking_timeout: berapa lama NUNGGU giliran sebelum
# menyerah (bukan berapa lama lock dipegang).
GPU_LOCK_TIMEOUT_SEC = 600
GPU_LOCK_BLOCKING_TIMEOUT_SEC = 900


@contextmanager
def gpu_lock():
    """Context manager: blokir sampai dapat giliran eksklusif GPU, lintas
    container (api & worker rebutan lock yg SAMA di Redis). Raise TimeoutError
    kalau menunggu > GPU_LOCK_BLOCKING_TIMEOUT_SEC (proses lain macet/nyangkut
    -- lebih baik gagal jelas drpd nunggu selamanya)."""
    lock = _redis.lock(
        GPU_LOCK_NAME,
        timeout=GPU_LOCK_TIMEOUT_SEC,
        blocking_timeout=GPU_LOCK_BLOCKING_TIMEOUT_SEC,
    )
    acquired = lock.acquire(blocking=True)
    if not acquired:
        raise TimeoutError(
            "Gagal dapat akses GPU eksklusif dalam "
            f"{GPU_LOCK_BLOCKING_TIMEOUT_SEC}s -- proses lain kemungkinan macet."
        )
    try:
        yield
    finally:
        try:
            lock.release()
        except Exception:
            # Lock sudah expired/di-release proses lain (mis. krn timeout
            # abis duluan) -- aman diabaikan, bukan error yg perlu naik.
            pass
