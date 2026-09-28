import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import DBAPIError
from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware

from app.api.v1 import (
    admin_units,
    alerts,
    auth,
    dashboard,
    data_import,
    forecast,
    ingest,
    integrations,
    map_layers,
    mfa,
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
from app.infra.heartbeat import STALE_S, worker_age_s
from app.infra.ops_watch import ops_watch
from app.infra.ratelimit import RateLimitMiddleware
from app.infra.redis import get_redis
from app.lifecycle import shutdown, startup
from app.rbac.authz import allowed_codes
from app.services.simulator import simulator
from app.ws.hub import Client, hub

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
# httpx ghi cả URL ở mức INFO → lộ API key trong query (Open-Meteo, OpenWeather). Chỉ ghi cảnh báo.
logging.getLogger("httpx").setLevel(logging.WARNING)


class DropQueryString(logging.Filter):
    """Log của uvicorn không ghi query string: /ws?token=… chứa JWT, /public/locate?lat=… là vị trí người dân.
    Áp cho log truy cập HTTP (uvicorn.access) và log kết nối WebSocket (uvicorn.error)."""

    def filter(self, record: logging.LogRecord) -> bool:
        if isinstance(record.args, tuple):
            record.args = tuple(
                a.split("?", 1)[0] if isinstance(a, str) and a.startswith("/") else a for a in record.args
            )
        return True


for _name in ("uvicorn.access", "uvicorn.error"):
    logging.getLogger(_name).addFilter(DropQueryString())


@asynccontextmanager
async def lifespan(_: FastAPI):
    await startup()
    yield
    await shutdown()


app = FastAPI(
    title="API Điều hành PCTT & TKCN tỉnh Cao Bằng",
    version="0.1.0",
    description="Dashboard, bản đồ giám sát, nguồn lực, cứu hộ, cảnh báo đa kênh.",
    lifespan=lifespan,
    docs_url="/docs" if settings.docs_enabled else None,
    redoc_url="/redoc" if settings.docs_enabled else None,
    openapi_url="/openapi.json" if settings.docs_enabled else None,
)
app.add_middleware(RateLimitMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# Ngoài cùng (thêm sau cùng): xác định IP người dùng TRƯỚC giới hạn tần suất. Chỉ tin X-Forwarded-For khi kết nối
# đến từ TRUSTED_PROXIES (hỗ trợ CIDR — gunicorn --forwarded-allow-ips thì không), lấy IP không tin cậy ngoài cùng.
app.add_middleware(ProxyHeadersMiddleware, trusted_hosts=settings.trusted_proxies)


@app.exception_handler(DBAPIError)
async def db_error(_: Request, exc: DBAPIError):
    # VD: mã UUID sai định dạng → 400 thay vì 500
    logging.getLogger(__name__).warning("DB error: %s", exc.orig)
    return JSONResponse(status_code=400, content={"detail": "Dữ liệu không hợp lệ"})


for r in (
    auth,
    mfa,
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
    data_import,
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
    # Worker chạy riêng (RUN_MODE=api + Redis): mất nhịp > 2 phút → degraded để giám sát bên ngoài cảnh báo
    worker_age = await worker_age_s() if settings.run_mode == "api" else None
    worker_ok = (
        settings.run_mode != "api" or redis_ok is None or (worker_age is not None and worker_age <= STALE_S)
    )
    return {
        "status": "ok" if redis_ok is not False and worker_ok else "degraded",
        "worker_heartbeat_age_s": worker_age,
        "db": db,
        "redis": redis_ok,
        "storage": storage.backend_name(),
        "run_mode": settings.run_mode,
        "ws_clients": hub.client_count,
        "simulator": settings.simulator,
        "tick": simulator.tick,
    }


@app.get("/health/full")
async def health_full():
    """Cho giám sát bên ngoài (Uptime Kuma, UptimeRobot…): 503 khi có bất kỳ kiểm tra nào lỗi — CSDL, Redis, worker, API,
    ổ đĩa, sao lưu (app/infra/ops_watch.py). Chỉ trả tên kiểm tra + đạt / lỗi; chi tiết gửi trong email cảnh báo.
    Không dùng cho healthcheck của container: ổ đĩa đầy không phải lý do khởi động lại backend."""
    checks = await ops_watch.snapshot()
    ok = all(checks.values())
    return JSONResponse(
        status_code=200 if ok else 503, content={"status": "ok" if ok else "degraded", "checks": checks}
    )


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
