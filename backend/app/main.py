import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import DBAPIError

from app.api.v1 import (
    admin_units,
    alerts,
    auth,
    dashboard,
    forecast,
    ingest,
    integrations,
    map_layers,
    public,
    rbac,
    reports,
    resources,
    search,
    sos,
)
from app.auth import user_from_token
from app.config import settings
from app.db import fetch_one
from app.infra import storage
from app.infra.ratelimit import RateLimitMiddleware
from app.infra.redis import get_redis
from app.lifecycle import shutdown, startup
from app.rbac.authz import allowed_codes
from app.services.simulator import simulator
from app.ws.hub import Client, hub

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
# httpx ghi cả URL ở mức INFO → lộ API key trong query (Open-Meteo, OpenWeather). Chỉ ghi cảnh báo.
logging.getLogger("httpx").setLevel(logging.WARNING)


@asynccontextmanager
async def lifespan(_: FastAPI):
    await startup()
    yield
    await shutdown()


app = FastAPI(
    title="API Điều hành PCTT & TKCN tỉnh Cao Bằng",
    version="0.1.0",
    description="Dashboard, bản đồ giám sát, nguồn lực, cứu hộ, cảnh báo đa kênh — dữ liệu mô phỏng.",
    lifespan=lifespan,
)
app.add_middleware(RateLimitMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(DBAPIError)
async def db_error(_: Request, exc: DBAPIError):
    # VD: mã UUID sai định dạng → 400 thay vì 500
    logging.getLogger(__name__).warning("DB error: %s", exc.orig)
    return JSONResponse(status_code=400, content={"detail": "Dữ liệu không hợp lệ"})


for r in (
    auth,
    admin_units,
    search,
    dashboard,
    map_layers,
    resources,
    sos,
    alerts,
    rbac,
    ingest,
    integrations,
    forecast,
    public,
    reports,
):
    app.include_router(r.router, prefix="/api/v1")


@app.get("/health")
async def health():
    db = await fetch_one(
        "SELECT now() AS time, postgis_version() AS postgis, extversion AS timescaledb FROM pg_extension WHERE extname = 'timescaledb'"
    )
    redis_ok = None
    if (r := get_redis()) is not None:
        try:
            redis_ok = bool(await r.ping())
        except Exception:
            redis_ok = False
    return {
        "status": "ok" if redis_ok is not False else "degraded",
        "db": db,
        "redis": redis_ok,
        "storage": storage.backend_name(),
        "run_mode": settings.run_mode,
        "ws_clients": hub.client_count,
        "simulator": settings.simulator,
        "tick": simulator.tick,
    }


@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket, token: str = ""):
    """WebSocket cần token (?token=...). Phạm vi nhận sự kiện theo quyền của người dùng."""
    user = await user_from_token(token) if token else None
    if user is None:
        await ws.close(code=4401)
        return
    scopes = {}
    for obj in ("sos", "monitoring", "report"):
        codes = allowed_codes(user, obj, "view")
        scopes[obj] = None if codes is None else set(codes)
    client = Client(ws, user["username"], scopes)
    await hub.connect(client)
    try:
        while True:
            await ws.receive_text()  # giữ kết nối; client có thể gửi ping
    except WebSocketDisconnect:
        pass
    finally:
        await hub.disconnect(client)
