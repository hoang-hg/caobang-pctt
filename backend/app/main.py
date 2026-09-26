import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import DBAPIError

from app.api.v1 import admin_units, alerts, auth, dashboard, map_layers, resources, search, sos
from app.config import settings
from app.db import engine, fetch_one
from app.services.simulator import simulator
from app.ws.hub import hub

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(_: FastAPI):
    if settings.simulator:
        simulator.start()
    yield
    await simulator.stop()
    await engine.dispose()


app = FastAPI(
    title="API Điều hành PCTT & TKCN tỉnh Cao Bằng",
    version="0.1.0",
    description="Dashboard, bản đồ giám sát, nguồn lực, cứu hộ, cảnh báo đa kênh — dữ liệu mô phỏng.",
    lifespan=lifespan,
)
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


for r in (auth, admin_units, search, dashboard, map_layers, resources, sos, alerts):
    app.include_router(r.router, prefix="/api/v1")


@app.get("/health")
async def health():
    db = await fetch_one(
        "SELECT now() AS time, postgis_version() AS postgis, extversion AS timescaledb FROM pg_extension WHERE extname = 'timescaledb'"
    )
    return {
        "status": "ok",
        "db": db,
        "ws_clients": hub.client_count,
        "simulator": settings.simulator,
        "tick": simulator.tick,
    }


@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket):
    await hub.connect(ws)
    try:
        while True:
            await ws.receive_text()  # giữ kết nối; client có thể gửi ping
    except WebSocketDisconnect:
        pass
    finally:
        await hub.disconnect(ws)
