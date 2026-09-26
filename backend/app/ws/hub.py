"""Hub WebSocket: đẩy sự kiện thời gian thực tới mọi màn hình điều hành.

Các loại sự kiện: sos.new, sos.updated, gps.update, reading.new, inventory.changed, log.new,
broadcast.updated, hazard.new, dispatch.updated, call.new, report.new, report.updated, source.updated, ingest.log

Nhiều tiến trình (gunicorn nhiều worker + tiến trình nền): khi có REDIS_URL, ``publish`` gửi lên kênh Redis
``pctt:events``; mỗi tiến trình API lắng nghe kênh đó và phát lại cho các kết nối của chính nó.
Không có Redis → phát trực tiếp trong tiến trình (chế độ 1 tiến trình).

Phân quyền: mỗi kết nối mang phạm vi (mã xã được xem, ``None`` = toàn tỉnh) theo nhóm quyền.
Sự kiện gắn ``scope`` + ``code`` chỉ gửi tới kết nối có phạm vi bao trùm xã đó.
"""

import asyncio
import json
import logging
from dataclasses import dataclass, field
from datetime import UTC, datetime

from fastapi import WebSocket

from app.infra.redis import get_redis

log = logging.getLogger(__name__)
CHANNEL = "pctt:events"


@dataclass(eq=False)
class Client:
    ws: WebSocket
    username: str
    scopes: dict[str, set[str] | None] = field(default_factory=dict)

    def sees(self, scope: str | None, code: str | None) -> bool:
        if scope is None or code is None:
            return True
        allowed = self.scopes.get(scope, set())
        return allowed is None or code in allowed


class Hub:
    def __init__(self) -> None:
        self._clients: set[Client] = set()
        self._lock = asyncio.Lock()
        self._relay: asyncio.Task | None = None

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
        envelope = json.dumps(
            {"event": event, "data": data, "ts": datetime.now(UTC).isoformat(), "scope": scope, "code": code},
            ensure_ascii=False,
            default=str,
        )
        r = get_redis()
        if r is not None:
            try:
                await r.publish(CHANNEL, envelope)
                return
            except Exception:
                log.warning("Redis publish lỗi — phát trực tiếp trong tiến trình", exc_info=True)
        await self._deliver(envelope)

    async def _deliver(self, envelope: str) -> None:
        if not self._clients:
            return
        meta = json.loads(envelope)
        message = json.dumps({k: meta[k] for k in ("event", "data", "ts")}, ensure_ascii=False)
        dead = []
        for c in list(self._clients):
            if not c.sees(meta.get("scope"), meta.get("code")):
                continue
            try:
                await c.ws.send_text(message)
            except Exception:  # client đã ngắt kết nối
                dead.append(c)
        for c in dead:
            await self.disconnect(c)

    def start_relay(self) -> None:
        """Tiến trình API: nghe kênh Redis và phát lại cho kết nối WebSocket của mình."""
        if get_redis() is not None and self._relay is None:
            self._relay = asyncio.create_task(self._relay_loop())

    async def stop_relay(self) -> None:
        if self._relay:
            self._relay.cancel()

    async def _relay_loop(self) -> None:
        while True:
            try:
                pubsub = get_redis().pubsub()
                await pubsub.subscribe(CHANNEL)
                async for msg in pubsub.listen():
                    if msg.get("type") == "message":
                        await self._deliver(msg["data"])
            except asyncio.CancelledError:
                raise
            except Exception:
                log.warning("Mất kết nối Redis pub/sub — thử lại sau 3 giây", exc_info=True)
                await asyncio.sleep(3)


hub = Hub()
