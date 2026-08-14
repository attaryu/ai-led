from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from lib.db import init_db
from lib.context import get_system_user_id, get_active_program_studi_id
from routes import sections, chat, export, documents, me, led_documents

app = FastAPI(title="LED Generator API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1|\d+\.\d+\.\d+\.\d+):5173",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def _startup():
    import os
    # init_db() cuma health-check (SELECT 1 + cek 17 tabel) -- schema
    # dikelola lewat db/schema.sql + scripts/migrate_to_postgres.py, BUKAN
    # dibuat di sini seperti SQLite lama.
    init_db()

    # Resolve & cache system user + program studi sekali di startup -- fail
    # fast dgn pesan jelas kalau seed data belum ada (migrasi belum jalan).
    # TIDAK resolve "dokumen aktif" lagi -- 1 prodi boleh punya banyak
    # dokumen_led (termasuk NOL, sebelum user pertama kali membuat dari UI),
    # jadi itu diresolve per-request lewat dokumen_id di path URL, bukan di
    # sini (lihat lib/context.py & routes/led_documents.py).
    try:
        system_user_id = get_system_user_id()
        program_studi_id = get_active_program_studi_id()
        print(f"✅ System user: {system_user_id}, program studi: {program_studi_id}", flush=True)
    except RuntimeError as e:
        print(f"❌ STARTUP GAGAL: {e}", flush=True)
        raise

    # Log LangSmith status
    if os.environ.get("LANGCHAIN_TRACING_V2", "").lower() == "true":
        proj = os.environ.get("LANGCHAIN_PROJECT", "default")
        print(f"✅ LangSmith tracing aktif → project='{proj}'", flush=True)
    else:
        print("ℹ LangSmith tracing OFF (LANGCHAIN_TRACING_V2=false)", flush=True)


app.include_router(led_documents.router)
app.include_router(sections.router)
app.include_router(chat.router)
app.include_router(export.router)
app.include_router(documents.router)
app.include_router(me.router)


@app.get("/")
def root():
    return {"status": "ok", "service": "led-generator-api"}


@app.get("/health")
def health():
    import os
    import requests
    from lib.db import conn

    try:
        with conn() as con:
            con.execute("SELECT 1")
        postgres_ok = True
    except Exception:
        postgres_ok = False

    ollama_url   = os.environ.get("OLLAMA_HOST", "http://host.docker.internal:11434")
    ollama_token = os.environ.get("OLLAMA_TOKEN", "").strip()
    headers = {"Authorization": f"Bearer {ollama_token}"} if ollama_token else {}
    try:
        r = requests.get(f"{ollama_url}/api/tags", headers=headers, timeout=5)
        ollama_ok = r.ok
        models = [m["name"] for m in r.json().get("models", [])] if ollama_ok else []
    except Exception:
        ollama_ok = False
        models = []
    return {
        "api": "ok",
        "postgres": "ok" if postgres_ok else "unreachable",
        "ollama": "ok" if ollama_ok else "unreachable",
        "ollama_url": ollama_url,
        "auth": bool(ollama_token),
        "models": models,
    }
