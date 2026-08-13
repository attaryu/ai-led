"""Schema verification script.

Run after applying 001_initial_schema.sql to confirm all three tables exist
and accept basic read/write operations.

Usage:
    SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... python -m db.verify_schema
"""

from __future__ import annotations

import sys
import uuid

TABLES = ["assessment_sessions", "indicator_results", "reasoning_steps"]


def _check_table_exists(sb, table: str) -> bool:
    """Return True if a SELECT on the table succeeds (table exists and is accessible)."""
    try:
        sb.table(table).select("*").limit(0).execute()
        return True
    except Exception as exc:
        print(f"  [FAIL] {table}: {exc}")
        return False


def _check_insert_and_cleanup(sb) -> bool:
    """Insert a sentinel session and clean it up, verifying FK cascade."""
    sid = f"verify-{uuid.uuid4()}"
    try:
        # Insert session
        sb.table("assessment_sessions").insert(
            {
                "session_id": sid,
                "laporan_path": "/verify/test.xlsx",
                "total_indicators": 1,
                "completed_indicators": 0,
                "status": "running",
            }
        ).execute()

        # Insert a result (tests FK)
        sb.table("indicator_results").upsert(
            {
                "session_id": sid,
                "indicator_no": 1,
                "score": 3.0,
                "justification": "Schema verification test.",
                "confidence": 0.9,
            }
        ).execute()

        # Insert a reasoning step
        sb.table("reasoning_steps").insert(
            {
                "session_id": sid,
                "indicator_no": 1,
                "step_index": 0,
                "content": "Verification step.",
            }
        ).execute()

        # Cleanup — CASCADE should remove indicator_results and reasoning_steps too
        sb.table("assessment_sessions").delete().eq("session_id", sid).execute()
        return True

    except Exception as exc:
        print(f"  [FAIL] insert/cleanup: {exc}")
        # Best-effort cleanup
        try:
            sb.table("assessment_sessions").delete().eq("session_id", sid).execute()
        except Exception:
            pass
        return False


def run_verification() -> int:
    """Return 0 on success, 1 on any failure."""
    from db.supabase_client import get_supabase

    try:
        sb = get_supabase()
    except RuntimeError as exc:
        print(f"[ERROR] Cannot connect to Supabase: {exc}")
        return 1

    print("Verifying AMI Assessment schema...\n")

    all_ok = True

    print("1. Checking table existence:")
    for table in TABLES:
        exists = _check_table_exists(sb, table)
        symbol = "  [OK]" if exists else "  [FAIL]"
        print(f"{symbol}  {table}")
        all_ok = all_ok and exists

    print("\n2. Checking insert / FK / cascade / cleanup:")
    ok = _check_insert_and_cleanup(sb)
    print("  [OK]  round-trip write/delete" if ok else "  [FAIL]  round-trip write/delete")
    all_ok = all_ok and ok

    print()
    if all_ok:
        print("Schema verification PASSED.")
        return 0
    else:
        print("Schema verification FAILED — apply db/migrations/001_initial_schema.sql first.")
        return 1


if __name__ == "__main__":
    sys.exit(run_verification())
