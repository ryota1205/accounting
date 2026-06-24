import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from app.db import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="研修売上管理API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health():
    return {"status": "ok"}


from app.routers import (
    deals, masters, settings, summary, payments, io_excel, confidence, activity, auth,
)

app.include_router(auth.router)
app.include_router(deals.router)
app.include_router(masters.router)
app.include_router(settings.router)
app.include_router(summary.router)
app.include_router(payments.router)
app.include_router(io_excel.router)
app.include_router(confidence.router)
app.include_router(activity.router)


# --- ビルド済みフロントの同梱配信（後で外部CDN/別配信に差し替えやすいよう分離） ---
# 既定: backend/app/main.py から見た ../../frontend/dist。環境変数で上書き可。
FRONTEND_DIST = os.environ.get(
    "ACCOUNTING_FRONTEND_DIST",
    os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "dist")),
)

if os.path.isdir(FRONTEND_DIST):
    _DIST_ROOT = os.path.abspath(FRONTEND_DIST)
    _INDEX = os.path.join(_DIST_ROOT, "index.html")

    # /api/* は上で登録済みのルーターが優先される。ここは画面（SPA）用の受け皿。
    @app.get("/{full_path:path}", include_in_schema=False)
    def serve_spa(full_path: str):
        target = os.path.abspath(os.path.join(_DIST_ROOT, full_path))
        # ディレクトリトラバーサル防止＋実ファイルがあればそれを返す
        if full_path and target.startswith(_DIST_ROOT) and os.path.isfile(target):
            return FileResponse(target)
        # それ以外（未知パス含む）は SPA のエントリへ
        return FileResponse(_INDEX)
