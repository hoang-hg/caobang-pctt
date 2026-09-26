"""Hub WebSocket trong tiến trình: đẩy sự kiện thời gian thực tới mọi màn hình điều hành.

Các loại sự kiện: sos.new, sos.updated, gps.update, reading.new, inventory.changed,
log.new, broadcast.updated, hazard.new, dispatch.updated
"""

import asyncio
import json
import logging
from datetime import UTC, datetime

from fastapi import WebSocket

log = logging.getLogger(__name__)


class Hub:
    def __init__(self) -> None:
        self._clients: set[WebSocket] = set()
        self._lock = asyncio.Lock()

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        async with self._lock:
            self._clients.add(ws)

    async def disconnect(self, ws: WebSocket) -> None:
        async with self._lock:
            self._clients.discard(ws)

    @property
    def client_count(self) -> int:
        return len(self._clients)

    async def publish(self, event: str, data) -> None:
        if not self._clients:
            return
        message = json.dumps(
            {"event": event, "data": data, "ts": datetime.now(UTC).isoformat()},
            ensure_ascii=False,
            default=str,
        )
        dead = []
        for ws in list(self._clients):
            try:
                await ws.send_text(message)
            except Exception:  # client đã ngắt kết nối
                dead.append(ws)
        for ws in dead:
            await self.disconnect(ws)


hub = Hub()
