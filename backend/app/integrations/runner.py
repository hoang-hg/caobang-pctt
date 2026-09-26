"""Bộ lập lịch nguồn dữ liệu: chạy các nguồn kéo (Open-Meteo, OpenWeather) theo chu kỳ,
đánh dấu thiết bị mất tín hiệu, sinh bản nháp cảnh báo từ dự báo mưa theo xã.
"""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import UTC, datetime

from app.config import settings
from app.db import execute, fetch_all, fetch_one
from app.integrations import crypto
from app.integrations.adapters import open_meteo, openweather
from app.integrations.ingest import ingest_log, mark_stale_devices
from app.services.broadcast import fill_template
from app.services.simulator import simulator
from app.ws.hub import hub

log = logging.getLogger(__name__)

ADAPTERS = {"open_meteo": open_meteo.run, "openweather": openweather.run}

DEFAULT_SOURCES = [
    {
        "code": "OPEN_METEO_ENS",
        "name": "Open-Meteo – dự báo tổ hợp ECMWF IFS + NOAA GEFS",
        "type": "open_meteo",
        "enabled": None,  # theo cấu hình OPEN_METEO_ENABLED
        "config": open_meteo.DEFAULT_CONFIG,
        "poll_interval_s": 3 * 3600,
    },
    {
        "code": "OPENWEATHER",
        "name": "OpenWeatherMap One Call 3.0",
        "type": "openweather",
        "enabled": False,
        "config": openweather.DEFAULT_CONFIG,
        "poll_interval_s": 3600,
    },
    {
        "code": "IOT_HTTP",
        "name": "Cổng IoT HTTP (thiết bị NB-IoT / 4G, nền tảng hãng)",
        "type": "http_ingest",
        "enabled": True,
        "config": {"endpoint": "/api/v1/ingest/readings", "batch_endpoint": "/api/v1/ingest/batch"},
        "poll_interval_s": None,
    },
    {
        "code": "IOT_MQTT",
        "name": "Cổng IoT MQTT",
        "type": "mqtt",
        "enabled": None,  # bật khi có MQTT_URL
        "config": {"topic": "caobang/pctt/+/readings"},
        "poll_interval_s": None,
    },
    {
        "code": "LORAWAN",
        "name": "LoRaWAN (ChirpStack / The Things Network webhook)",
        "type": "chirpstack",
        "enabled": True,
        "config": {"endpoint": "/api/v1/ingest/lorawan"},
        "poll_interval_s": None,
    },
]


async def ensure_default_sources() -> None:
    for s in DEFAULT_SOURCES:
        enabled = s["enabled"]
        if enabled is None:
            enabled = settings.open_meteo_enabled if s["type"] == "open_meteo" else bool(settings.mqtt_url)
        await execute(
            """INSERT INTO integrations.data_sources (code, name, type, enabled, config, poll_interval_s, status)
               VALUES (:c, :n, :t, :e, CAST(:cfg AS jsonb), :p, CASE WHEN :e THEN 'chua_chay' ELSE 'tat' END)
               ON CONFLICT (code) DO NOTHING""",
            {
                "c": s["code"],
                "n": s["name"],
                "t": s["type"],
                "e": enabled,
                "cfg": json.dumps(s["config"]),
                "p": s["poll_interval_s"],
            },
        )
    # Nguồn đẩy có token riêng (HTTP batch, LoRaWAN): sinh token lần đầu
    for code in ("IOT_HTTP", "LORAWAN"):
        row = await fetch_one(
            "SELECT id, secret_enc FROM integrations.data_sources WHERE code = :c", {"c": code}
        )
        if row and not row["secret_enc"]:
            await execute(
                "UPDATE integrations.data_sources SET secret_enc = :s WHERE id = :id",
                {"s": crypto.encrypt(crypto.new_device_key().replace("cbk_", "cbs_")), "id": row["id"]},
            )


async def run_source(source: dict) -> dict:
    adapter = ADAPTERS.get(source["type"])
    if adapter is None:
        raise ValueError("Nguồn này là nguồn đẩy (push) — không chạy thủ công")
    await execute(
        "UPDATE integrations.data_sources SET last_run_at = now() WHERE id = :id", {"id": source["id"]}
    )
    started = datetime.now(UTC)
    try:
        result = await adapter(source, crypto.decrypt(source["secret_enc"]))
    except Exception as exc:
        msg = f"{type(exc).__name__}: {exc}"[:400]
        await execute(
            "UPDATE integrations.data_sources SET status = 'loi', last_error = :e, updated_at = now() WHERE id = :id",
            {"e": msg, "id": source["id"]},
        )
        await ingest_log(source["code"], f"Lỗi đồng bộ: {msg}", level="error")
        await hub.publish("source.updated", {"code": source["code"], "status": "loi"})
        raise
    result["duration_s"] = round((datetime.now(UTC) - started).total_seconds(), 1)
    await execute(
        """UPDATE integrations.data_sources SET status = 'ok', last_success_at = now(), last_error = NULL,
                  stats = CAST(:st AS jsonb), updated_at = now() WHERE id = :id""",
        {"st": json.dumps(result, default=str), "id": source["id"]},
    )
    await ingest_log(
        source["code"],
        f"Đồng bộ thành công: {json.dumps(result, ensure_ascii=False, default=str)}",
        accepted=result.get("rows", 0),
    )
    await hub.publish("source.updated", {"code": source["code"], "status": "ok"})
    if source["type"] == "open_meteo":
        await forecast_alerts(source)
    return result


async def forecast_alerts(source: dict) -> None:
    """Kích hoạt từ mô hình dự báo: xã có mưa dự báo 24 giờ tới (P50 kết hợp) ≥ ngưỡng → nháp 'Chuẩn bị sơ tán'."""
    threshold = float({**open_meteo.DEFAULT_CONFIG, **(source.get("config") or {})}["alert_24h_mm"])
    rows = await fetch_all(
        """SELECT u.code, u.name, round(sum(a.precip_p50)::numeric)::int AS mm, round(sum(a.precip_p90)::numeric)::int AS mm90
             FROM iot_telemetry.area_forecasts a JOIN spatial_admin.administrative_units u ON u.id = a.admin_unit_id
            WHERE a.model = 'BLEND' AND a.time > now() AND a.time <= now() + interval '24 hours'
            GROUP BY u.code, u.name HAVING sum(a.precip_p50) >= :th ORDER BY mm DESC""",
        {"th": threshold},
    )
    if not rows:
        return
    recent = await fetch_one(
        """SELECT 1 FROM communications.alert_broadcasts
            WHERE trigger_source = 'forecast:open_meteo' AND created_at > now() - interval '12 hours'"""
    )
    if recent:
        return
    tpl = await fetch_one("SELECT body FROM communications.message_templates WHERE code = 'CHUAN_BI_SO_TAN'")
    names = ", ".join(r["name"] for r in rows[:8]) + (f" và {len(rows) - 8} xã khác" if len(rows) > 8 else "")
    await simulator.auto_draft(
        title=f"[Dự báo ECMWF/GFS] Mưa rất to 24 giờ tới tại {len(rows)} xã (tới {rows[0]['mm']} mm)",
        template="CHUAN_BI_SO_TAN",
        body=fill_template(
            tpl["body"],
            {
                "so_gio": "24",
                "dia_diem": names,
                "nguy_co": f"lũ quét, sạt lở (mưa dự báo {rows[0]['mm']}–{rows[0]['mm90']} mm)",
            },
        ),
        severity="cam",
        polygon=None,
        codes=[r["code"] for r in rows],
        channels=["SMS", "ZALO_OA", "PUSH", "LOA"],
        trigger="forecast:open_meteo",
    )


async def tick() -> None:
    due = await fetch_all(
        """SELECT * FROM integrations.data_sources
            WHERE enabled AND poll_interval_s IS NOT NULL AND type IN ('open_meteo', 'openweather')
              AND (last_run_at IS NULL OR last_run_at < now() - make_interval(secs => poll_interval_s))"""
    )
    for s in due:
        try:
            await run_source(s)
        except Exception:
            log.warning("source %s failed", s["code"], exc_info=True)
    await mark_stale_devices()


class Runner:
    def __init__(self) -> None:
        self._task: asyncio.Task | None = None

    def start(self) -> None:
        self._task = asyncio.create_task(self._loop())

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()

    async def _loop(self) -> None:
        await asyncio.sleep(5)
        while True:
            try:
                await tick()
            except asyncio.CancelledError:
                raise
            except Exception:
                log.exception("integration tick failed")
            await asyncio.sleep(30)


runner = Runner()
