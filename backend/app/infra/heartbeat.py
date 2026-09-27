"""Nhịp sống của tiến trình worker: phát hiện worker treo / chết (không đồng bộ dự báo, không nhận MQTT…).

- Tệp ``HEARTBEAT_FILE`` → healthcheck của container worker (docker-compose.prod.yml).
- Khoá Redis ``HEARTBEAT_KEY`` → ``GET /health`` của API báo ``degraded`` để giám sát bên ngoài cảnh báo.
Nhịp chạy trong event loop của worker: loop bị chặn / treo thì nhịp dừng.
"""

from __future__ import annotations

import asyncio
import logging
import time
from pathlib import Path

from app.infra.redis import get_redis

log = logging.getLogger(__name__)

HEARTBEAT_FILE = Path("/tmp/pctt-worker-heartbeat")
HEARTBEAT_KEY = "pctt:worker:heartbeat"
INTERVAL_S = 30
STALE_S = 120


class Heartbeat:
    def __init__(self) -> None:
        self._task: asyncio.Task | None = None

    def start(self) -> None:
        self._task = asyncio.create_task(self._loop())

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()

    async def _loop(self) -> None:
        while True:
            try:
                HEARTBEAT_FILE.touch()
                if (r := get_redis()) is not None:
                    await r.set(HEARTBEAT_KEY, str(int(time.time())), ex=STALE_S * 2)
            except Exception:
                log.warning("Không ghi được nhịp worker", exc_info=True)
            await asyncio.sleep(INTERVAL_S)


async def worker_age_s() -> int | None:
    """Số giây từ nhịp worker gần nhất (None = không có Redis / chưa có nhịp)."""
    r = get_redis()
    if r is None:
        return None
    try:
        value = await r.get(HEARTBEAT_KEY)
    except Exception:
        return None
    return None if value is None else int(time.time()) - int(value)


heartbeat = Heartbeat()
