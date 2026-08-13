from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from lib.db import init_db
from routes import sections, chat, export

app = FastAPI(title="LED Generator API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def _startup():
    import os
    init_db()
    # Log LangSmith status
    if os.environ.get("LANGCHAIN_TRACING_V2", "").lower() == "true":
        proj = os.environ.get("LANGCHAIN_PROJECT", "default")
        print(f"✅ LangSmith tracing aktif → project='{proj}'", flush=True)
    else:
        print("ℹ LangSmith tracing OFF (LANGCHAIN_TRACING_V2=false)", flush=True)


app.include_router(sections.router)
app.include_router(chat.router)
app.include_router(export.router)


@app.get("/")
def root():
    return {"status": "ok", "service": "led-generator-api"}


@app.get("/health")
def health():
    import os
    import requests
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
        "ollama": "ok" if ollama_ok else "unreachable",
        "ollama_url": ollama_url,
        "auth": bool(ollama_token),
        "models": models,
    }
