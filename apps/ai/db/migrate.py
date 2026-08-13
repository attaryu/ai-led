"""Simple SQL migration runner — works like drizzle-kit migrate.

Usage:
    python -m db.migrate

Requires DATABASE_URL env var (Postgres connection string from Supabase dashboard):
    postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres

Scans db/migrations/*.sql in filename order, applies any that haven't
been recorded in the _migrations table, then exits.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

MIGRATIONS_DIR = Path(__file__).parent / "migrations"


def _connect():
    import psycopg2

    url = os.environ.get("DATABASE_URL")
    if not url:
        print("ERROR: DATABASE_URL is not set.")
        print("  Get it from Supabase dashboard → Settings → Database → Connection string (URI)")
        sys.exit(1)
    # Supabase requires SSL
    if "sslmode" not in url:
        url += "?sslmode=require"
    return psycopg2.connect(url)


def _ensure_migrations_table(cur) -> None:
    cur.execute("""
        CREATE TABLE IF NOT EXISTS _migrations (
            id          SERIAL PRIMARY KEY,
            filename    TEXT UNIQUE NOT NULL,
            applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        );
    """)


def _applied_migrations(cur) -> set[str]:
    cur.execute("SELECT filename FROM _migrations;")
    return {row[0] for row in cur.fetchall()}


def main() -> None:
    from dotenv import load_dotenv
    # Try .env in backend dir first, then parent (project root)
    load_dotenv(Path(__file__).parent.parent.parent / ".env")
    load_dotenv()

    conn = _connect()
    conn.autocommit = False

    try:
        with conn.cursor() as cur:
            print("Ensuring _migrations table exists...")
            _ensure_migrations_table(cur)
            conn.commit()

            applied = _applied_migrations(cur)

        sql_files = sorted(MIGRATIONS_DIR.glob("*.sql"))
        if not sql_files:
            print("No migration files found in db/migrations/")
            return

        pending = [f for f in sql_files if f.name not in applied]

        if not pending:
            print(f"Nothing to migrate. ({len(applied)} already applied)")
            return

        for path in pending:
            print(f"  Applying {path.name} ... ", end="", flush=True)
            sql = path.read_text(encoding="utf-8")
            with conn.cursor() as cur:
                cur.execute(sql)
                cur.execute(
                    "INSERT INTO _migrations (filename) VALUES (%s);",
                    (path.name,),
                )
            conn.commit()
            print("done")

        print(f"\nMigrated {len(pending)} file(s).")

    except Exception as exc:
        conn.rollback()
        print(f"\nERROR: {exc}")
        sys.exit(1)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
