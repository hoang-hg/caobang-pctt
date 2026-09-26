"""Hub WebSocket trong tiến trình: đẩy sự kiện thời gian thực tới mọi màn hình điều hành.

Các loại sự kiện: sos.new, sos.updated, gps.update, reading.new, inventory.changed,
log.new, broadcast.updated, hazard.new, dispatch.updated, call.new

Phân quyền: mỗi kết nối mang phạm vi (danh sách mã xã được xem, ``None`` = toàn tỉnh) theo từng
nhóm quyền. Sự kiện gắn ``scope`` + ``code`` (mã xã) chỉ gửi tới kết nối có phạm vi bao trùm xã đó;
sự kiện không gắn mã (số đo, GPS…) gửi cho mọi kết nối đã đăng nhập.
"""

import asyncio
import json
from dataclasses import dataclass, field
from datetime import UTC, datetime

from fastapi import WebSocket


@dataclass(eq=False)
class Client:
    ws: WebSocket
    username: str
    scopes: dict[str, set[str] | None] = field(default_factory=dict)  # "sos" → {mã xã} | None

    def sees(self, scope: str | None, code: str | None) -> bool:
        if scope is None or code is None:
            return True
        allowed = self.scopes.get(scope, set())
        return allowed is None or code in allowed


class Hub:
    def __init__(self) -> None:
        self._clients: set[Client] = set()
        self._lock = asyncio.Lock()

    async def connect(self, client: Client) -> None:
        await client.ws.accept()
        async with self._lock:
            self._clients.add(client)

    async def disconnect(self, client: Client) -> None:
        async with self._lock:
            self._clients.discard(client)

    @property
    def client_count(self) -> int:
        return len(self._clients)

    async def publish(self, event: str, data, scope: str | None = None, code: str | None = None) -> None:
        if not self._clients:
            return
        message = json.dumps(
            {"event": event, "data": data, "ts": datetime.now(UTC).isoformat()},
            ensure_ascii=False,
            default=str,
        )
        dead = []
        for c in list(self._clients):
            if not c.sees(scope, code):
                continue
            try:
                await c.ws.send_text(message)
            except Exception:  # client đã ngắt kết nối
                dead.append(c)
        for c in dead:
            await self.disconnect(c)


hub = Hub()
