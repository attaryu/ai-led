import os

from dotenv import load_dotenv

# No-op under Docker (env_file already populates os.environ) — fills the gap
# for native/local runs; nothing here ever called this before (see worker.py).
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from scalar_fastapi import get_scalar_api_reference

from api.routes.assessment import router as assessment_router
from api.routes.assessment_judge import router as assessment_judge_router
from api.routes.chat import router as chat_router
from api.routes.eval import router as eval_router
from api.routes.structure import router as structure_router
from api.routes.upload import router as upload_router

app = FastAPI(title="AMI Assessment API", version="0.1.0")

_allowed_origins = [
    origin.strip()
    for origin in os.environ.get("CORS_ORIGINS", "http://localhost:5173").split(",")
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(assessment_router)
app.include_router(assessment_judge_router)
app.include_router(upload_router)
app.include_router(eval_router)
app.include_router(chat_router)
app.include_router(structure_router)

_STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")
if os.path.isdir(_STATIC_DIR):
    app.mount("/static", StaticFiles(directory=_STATIC_DIR), name="static")


@app.get("/", include_in_schema=False)
async def index():
    return FileResponse(os.path.join(_STATIC_DIR, "index.html"))


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/reference", include_in_schema=False)
async def scalar_reference():
    return get_scalar_api_reference(
        openapi_url=app.openapi_url, title=app.title
    )
