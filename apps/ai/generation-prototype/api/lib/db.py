"""SQLite schema + helper. Single source of truth utk drafts/eval/chat."""
import os
import sqlite3
from contextlib import contextmanager
from typing import Iterator

DB_PATH = os.environ.get("DB_PATH", "/data/led.db")


SCHEMA = """
CREATE TABLE IF NOT EXISTS drafts (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    section_id      TEXT    NOT NULL,
    section_title   TEXT    NOT NULL,
    model           TEXT    NOT NULL,
    draft_text      TEXT    NOT NULL,
    pedoman_used    TEXT,           -- RAG 1: aturan/struktur penulisan
    rubric_used     TEXT,           -- RAG 2: rubrik penilaian skor 4
    checklist       TEXT,           -- daftar fakta yg dibutuhkan (LLM)
    chunks_used     TEXT,           -- RAG 3+4: LKPS + evidence
    judge_result    TEXT,           -- LLM-as-judge output (JSON)
    prompt_full     TEXT,
    latency_sec     REAL,
    token_count     INTEGER,
    status          TEXT    DEFAULT 'draft',
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(section_id, model)
);

-- Migration: tambah kolom baru kalau DB lama
-- (SQLite tidak punya IF NOT EXISTS pada ALTER, jadi pakai try-catch di Python)

CREATE TABLE IF NOT EXISTS chat_messages (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    section_id   TEXT    NOT NULL,
    model        TEXT    NOT NULL,
    role         TEXT    NOT NULL,
    message      TEXT    NOT NULL,
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS eval_results (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    section_id          TEXT    NOT NULL,
    model               TEXT    NOT NULL,
    rouge_1             REAL,
    rouge_2             REAL,
    rouge_l             REAL,
    bleu_4              REAL,
    answer_relevancy    REAL,
    context_precision   REAL,
    context_recall      REAL,
    evaluated_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(section_id, model)
);

CREATE INDEX IF NOT EXISTS idx_drafts_section ON drafts(section_id);
CREATE INDEX IF NOT EXISTS idx_chat_section   ON chat_messages(section_id);
"""


def init_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    with sqlite3.connect(DB_PATH) as con:
        con.executescript(SCHEMA)
        # Migrasi: tambah kolom baru kalau DB sudah ada dari versi lama
        for col in ("pedoman_used", "checklist", "judge_result"):
            try:
                con.execute(f"ALTER TABLE drafts ADD COLUMN {col} TEXT")
            except sqlite3.OperationalError:
                pass  # kolom sudah ada


@contextmanager
def conn() -> Iterator[sqlite3.Connection]:
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    try:
        yield con
        con.commit()
    finally:
        con.close()
