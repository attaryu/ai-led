"""Shared lazy-singleton Postgres connection — used by both
db/postgres_client.py (assessment tables) and vectorstore/pgvector_store.py
(LED chunk embeddings). One connection, one DSN-fixup, not duplicated per
module that happens to also talk to Postgres.
"""

from __future__ import annotations

import os
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

import psycopg2
import psycopg2.extras

_conn = None


def get_conn():
    """Return the shared Postgres connection, (re)connecting as needed."""
    global _conn
    if _conn is None or _conn.closed:
        url = os.environ.get("DATABASE_URL")
        if not url:
            raise RuntimeError("DATABASE_URL must be set in environment.")
        # DATABASE_URL is shared verbatim with apps/backend's Prisma config,
        # which includes a `schema=` query param Prisma understands but raw
        # libpq/psycopg2 rejects as an invalid DSN parameter — strip it.
        parsed = urlparse(url)
        query = urlencode([(k, v) for k, v in parse_qsl(parsed.query) if k != "schema"])
        url = urlunparse(parsed._replace(query=query))
        _conn = psycopg2.connect(url, cursor_factory=psycopg2.extras.RealDictCursor)
        _conn.autocommit = True
    return _conn
