"""Pooled Postgres connections, tenant-scoped per checkout — used by
db/postgres_client.py, db/generation_client.py, and vectorstore/
pgvector_store.py / pgvector_evidence_store.py. Replaces the old
lazy-singleton connection: worker.py fans assessment indicators out
concurrently (asyncio.Semaphore, run in real OS threads via
run_in_executor), so one shared mutable connection was never actually
safe to scope per-tenant — this is what let RLS ship on apps/backend
while app_ai_worker stayed BYPASSRLS on Postgres (see
packages/db/prisma/migrations/20260902090000_tenant_row_level_security).

`tenant_cursor`/`tenant_connection` set `app.tenant_id` via
`set_config(..., true)` (local to the transaction) — same session var and
mechanism as apps/backend's Prisma extension
(apps/backend/src/database/prisma.service.ts). `app_ai_worker` itself is
NOT downgraded from BYPASSRLS here (tracker: blocked on a separate gap —
generation_client.get_bab_dokumen's bootstrap tenant_id lookup joins into
org_study_programs, which IS RLS-covered, before any tenant_id is known)
— this only builds the plumbing so that flip is safe to make later.
"""

from __future__ import annotations

import os
from contextlib import contextmanager
from typing import Iterator, Optional
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

import psycopg2
import psycopg2.extras
import psycopg2.pool

_pool: Optional[psycopg2.pool.ThreadedConnectionPool] = None


def _dsn() -> str:
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL must be set in environment.")
    # DATABASE_URL is shared verbatim with apps/backend's Prisma config,
    # which includes a `schema=` query param Prisma understands but raw
    # libpq/psycopg2 rejects as an invalid DSN parameter — strip it.
    parsed = urlparse(url)
    query = urlencode([(k, v) for k, v in parse_qsl(parsed.query) if k != "schema"])
    return urlunparse(parsed._replace(query=query))


def _get_pool() -> psycopg2.pool.ThreadedConnectionPool:
    global _pool
    if _pool is None:
        # ponytail: ThreadedConnectionPool.getconn() raises PoolError
        # immediately when exhausted rather than waiting for one to free up
        # -- sized well above ASSESSMENT_MAX_PARALLEL (default 5) to leave
        # headroom for chat/other concurrent DB work, not to eliminate the
        # ceiling. Upgrade path if a busier worker still exhausts this:
        # wrap getconn() with a short retry/backoff loop, or move to a pool
        # that queues instead of raising.
        maxconn = int(os.environ.get("PG_POOL_MAX", "20"))
        _pool = psycopg2.pool.ThreadedConnectionPool(
            1, maxconn, _dsn(), cursor_factory=psycopg2.extras.RealDictCursor
        )
    return _pool


def reset_pool() -> None:
    """Close and drop the pool — tests only, so each test can start from a
    known-empty pool instead of leaking connections/state across tests."""
    global _pool
    if _pool is not None:
        _pool.closeall()
        _pool = None


@contextmanager
def tenant_connection(tenant_id: Optional[str]) -> Iterator[psycopg2.extensions.connection]:
    """Check out one pooled connection scoped to `tenant_id` for the
    duration of one transaction, commit on success / rollback on
    exception, always return it to the pool.

    `tenant_id=None` for the handful of call sites that genuinely have no
    tenant yet or ever: bootstrap lookups that discover tenant_id in the
    first place (generation_client.get_bab_dokumen,
    postgres_client.get_document_accreditation_set), the login-style
    get_user_nama, global reference data (get_pedoman_for_bab), and
    list_sessions' cross-tenant admin listing.
    """
    pool = _get_pool()
    conn = pool.getconn()
    try:
        if tenant_id:
            with conn.cursor() as cur:
                cur.execute("SELECT set_config('app.tenant_id', %s, true)", (tenant_id,))
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        pool.putconn(conn)


@contextmanager
def tenant_cursor(tenant_id: Optional[str]):
    """Like `tenant_connection`, but yields a cursor directly — the common case."""
    with tenant_connection(tenant_id) as conn:
        with conn.cursor() as cur:
            yield cur
