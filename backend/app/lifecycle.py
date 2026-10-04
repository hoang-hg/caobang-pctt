"""Khởi động / dừng theo vai trò tiến trình (RUN_MODE):

api     — phục vụ HTTP + WebSocket (chạy nhiều worker gunicorn); nghe Redis để phát sự kiện & đồng bộ quyền
worker  — tác vụ nền chạy đúng 1 bản: bộ mô phỏng, đồng bộ nguồn dữ liệu, cầu nối MQTT, phát hiện mất tín hiệu
all     — cả hai trong 1 tiến trình (phát triển / máy nhỏ)
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from sqlalchemy import text

from app import preflight
from app.config import settings
from app.db import engine
from app.infra import storage
from app.infra.heartbeat import heartbeat
from app.infra.ops_watch import ops_watch
from app.infra.redis import close_redis
from app.integrations.mqtt_bridge import bridge
from app.integrations.runner import ensure_default_sources, runner
from app.rbac import domains
from app.rbac.enforcer import init_enforcer, reload_policy, start_policy_watcher, stop_policy_watcher
from app.rbac.seed import bootstrap as rbac_bootstrap
from app.services.alert_watch import alert_watch
from app.services.simulator import simulator
from app.ws.hub import hub

log = logging.getLogger(__name__)
BOOTSTRAP_LOCK = (
    482_736_101  # khoá advisory Postgres: chỉ 1 tiến trình seed quyền / nguồn dữ liệu tại một thời điểm
)


@asynccontextmanager
async def advisory_lock(key: int):
    async with engine.connect() as conn:
        await conn.execute(text("SELECT pg_advisory_lock(:k)"), {"k": key})
        try:
            yield
        finally:
            await conn.execute(text("SELECT pg_advisory_unlock(:k)"), {"k": key})


def runs_api() -> bool:
    return settings.run_mode in ("api", "all")


def runs_worker() -> bool:
    return settings.run_mode in ("worker", "all")


async def _reload_units_after_import(data: dict) -> None:
    """Nhập "ranh giới xã" có thể đổi tên xã → mọi tiến trình API nạp lại danh sách xã (nhãn phạm vi, tên xã trong
    phản ánh…). Mã xã / phạm vi phân quyền không đổi khi nhập (loại dữ liệu này chỉ cập nhật xã đã có)."""
    if data.get("dataset") == "ranh_gioi_xa":
        await domains.load_units(force=True)


async def startup() -> None:
    preflight.enforce()  # staging/production: dừng ngay nếu cấu hình không an toàn
    await domains.load_units()
    await init_enforcer()
    async with advisory_lock(BOOTSTRAP_LOCK):
        await (
            reload_policy()
        )  # đọc policy mới nhất SAU khi giữ khoá — tránh ghi trùng khi nhiều tiến trình khởi động
        await rbac_bootstrap()
        await ensure_default_sources()
        await storage.ensure_bucket()
    await reload_policy()  # tiến trình khác có thể vừa seed xong
    start_policy_watcher()
    if runs_api():
        hub.on("data.imported", _reload_units_after_import)
        hub.start_relay()
    if settings.run_mode == "api":
        ops_watch.start_api()  # theo dõi ngược nhịp worker chạy riêng
    if runs_worker():
        heartbeat.start()
        ops_watch.start_worker()
        runner.start()
        bridge.start()
        alert_watch.start()  # nhắc gia hạn cảnh báo sắp hết hiệu lực
        if settings.simulator:
            simulator.start()
    log.info("Khởi động xong (RUN_MODE=%s, Redis=%s)", settings.run_mode, bool(settings.redis_url))


async def shutdown() -> None:
    await heartbeat.stop()
    await ops_watch.stop()
    await simulator.stop()
    await runner.stop()
    await bridge.stop()
    await alert_watch.stop()
    await hub.stop_relay()
    await stop_policy_watcher()
    await close_redis()
    await engine.dispose()
