"""Cầu nối MQTT: đăng ký topic ``caobang/pctt/<device_id>/readings`` trên broker, chuyển số đo vào lõi tiếp nhận.

Payload JSON: ``{"value": 12.5, "time": "2026-09-26T08:00:00Z"}`` hoặc ``{"readings": [{...}, ...]}``.
Xác thực thiết bị do broker đảm nhiệm (tài khoản + ACL theo topic). Môi trường dev dùng Mosquitto cho phép ẩn danh
— KHÔNG dùng cấu hình đó khi triển khai thật.
"""

from __future__ import annotations

import asyncio
import json
import logging
from urllib.parse import urlparse

from app.config import settings
from app.integrations.ingest import IngestError, get_device, ingest_log, ingest_readings

log = logging.getLogger(__name__)


def parse_payload(payload: bytes) -> list[dict]:
    data = json.loads(payload.decode("utf-8"))
    if isinstance(data, list):
        return data
    if isinstance(data, dict) and isinstance(data.get("readings"), list):
        return data["readings"]
    if isinstance(data, dict):
        return [data]
    if isinstance(data, int | float):
        return [{"value": data}]
    raise ValueError("payload không hợp lệ")


def device_from_topic(topic: str, pattern: str) -> str | None:
    parts, pat = topic.split("/"), pattern.split("/")
    if len(parts) != len(pat):
        return None
    for p, q in zip(parts, pat, strict=True):
        if q not in ("+", p):
            return None
    return parts[pat.index("+")] if "+" in pat else None


async def handle(topic: str, payload: bytes, pattern: str) -> None:
    device_id = device_from_topic(topic, pattern)
    if not device_id:
        return
    device = await get_device(device_id)
    if device is None:
        await ingest_log(
            "IOT_MQTT", f"Thiết bị chưa đăng ký: {device_id} (topic {topic})", level="warning", rejected=1
        )
        return
    try:
        await ingest_readings(device, parse_payload(payload), "mqtt")
    except (IngestError, ValueError) as exc:
        await ingest_log(f"device:{device_id}", f"MQTT bị từ chối: {exc}", level="warning", rejected=1)


class MqttBridge:
    def __init__(self) -> None:
        self._task: asyncio.Task | None = None
        self.connected = False

    def start(self) -> None:
        if settings.mqtt_url:
            self._task = asyncio.create_task(self._loop())

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()

    async def _loop(self) -> None:
        import aiomqtt

        url = urlparse(settings.mqtt_url)
        topic = settings.mqtt_topic
        while True:
            try:
                async with aiomqtt.Client(
                    hostname=url.hostname,
                    port=url.port or 1883,
                    username=url.username,
                    password=url.password,
                    identifier="caobang-pctt-backend",
                ) as client:
                    await client.subscribe(topic, qos=1)
                    self.connected = True
                    await ingest_log(
                        "IOT_MQTT", f"Đã kết nối broker {url.hostname}:{url.port or 1883}, topic {topic}"
                    )
                    async for message in client.messages:
                        try:
                            await handle(str(message.topic), message.payload, topic)
                        except Exception:
                            log.exception("mqtt message failed")
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                if self.connected:
                    await ingest_log("IOT_MQTT", f"Mất kết nối broker: {exc}", level="error")
                self.connected = False
                await asyncio.sleep(10)


bridge = MqttBridge()
