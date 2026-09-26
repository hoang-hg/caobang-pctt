"""Quản trị nguồn dữ liệu ngoài & thiết bị IoT, giám sát kết nối: /api/v1/integrations/*"""

import json

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field

from app.auth import audit
from app.db import execute, fetch_all, fetch_one
from app.integrations import crypto
from app.integrations.mqtt_bridge import bridge
from app.integrations.runner import run_source
from app.rbac.authz import require_permission

router = APIRouter(prefix="/integrations", tags=["Nguồn dữ liệu & IoT"])
VIEW = require_permission("integration", "view")
MANAGE = require_permission("integration", "manage")

SOURCE_COLS = """id, code, name, type, enabled, config, poll_interval_s, status, last_run_at, last_success_at,
                 last_error, stats, updated_at, (secret_enc IS NOT NULL) AS has_secret"""


def _mask(value: str | None) -> str | None:
    return f"{value[:6]}…{value[-4:]}" if value and len(value) > 12 else ("••••" if value else None)


@router.get("/sources")
async def sources(_: dict = Depends(VIEW)):
    rows = await fetch_all(
        f"SELECT {SOURCE_COLS}, secret_enc FROM integrations.data_sources ORDER BY created_at"
    )
    for r in rows:
        r["secret_hint"] = _mask(crypto.decrypt(r.pop("secret_enc")))
        if r["type"] == "mqtt":
            r["connected"] = bridge.connected
    return rows


class SourcePatch(BaseModel):
    name: str | None = None
    enabled: bool | None = None
    config: dict | None = None
    poll_interval_s: int | None = Field(None, ge=300, le=86400)
    secret: str | None = Field(None, max_length=500)


@router.patch("/sources/{source_id}")
async def update_source(source_id: str, body: SourcePatch, user: dict = Depends(MANAGE)):
    src = await fetch_one(
        "SELECT * FROM integrations.data_sources WHERE id = CAST(:id AS uuid)", {"id": source_id}
    )
    if not src:
        raise HTTPException(404, "Không tìm thấy nguồn")
    config = {**(src["config"] or {}), **(body.config or {})} if body.config is not None else None
    await execute(
        """UPDATE integrations.data_sources SET name = COALESCE(CAST(:n AS text), name),
                  enabled = COALESCE(CAST(:e AS boolean), enabled),
                  config = COALESCE(CAST(:c AS jsonb), config),
                  poll_interval_s = COALESCE(CAST(:p AS int), poll_interval_s),
                  secret_enc = COALESCE(CAST(:s AS text), secret_enc),
                  status = CASE WHEN CAST(:e AS boolean) IS FALSE THEN 'tat'
                                WHEN CAST(:e AS boolean) IS TRUE AND status = 'tat' THEN 'chua_chay' ELSE status END,
                  updated_at = now()
            WHERE id = CAST(:id AS uuid)""",
        {
            "n": body.name,
            "e": body.enabled,
            "c": json.dumps(config) if config is not None else None,
            "p": body.poll_interval_s,
            "s": crypto.encrypt(body.secret) if body.secret else None,
            "id": source_id,
        },
    )
    await audit(
        user,
        "integration.source.update",
        "data_source",
        src["code"],
        {"enabled": body.enabled, "config": body.config, "secret_changed": bool(body.secret)},
    )
    return await fetch_one(
        f"SELECT {SOURCE_COLS} FROM integrations.data_sources WHERE id = CAST(:id AS uuid)", {"id": source_id}
    )


@router.post("/sources/{source_id}/run")
async def run_now(source_id: str, user: dict = Depends(MANAGE)):
    src = await fetch_one(
        "SELECT * FROM integrations.data_sources WHERE id = CAST(:id AS uuid)", {"id": source_id}
    )
    if not src:
        raise HTTPException(404, "Không tìm thấy nguồn")
    try:
        result = await run_source(src)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    except Exception as exc:
        raise HTTPException(502, f"Đồng bộ thất bại: {exc}") from exc
    await audit(user, "integration.source.run", "data_source", src["code"], result)
    return result


@router.post("/sources/{source_id}/rotate-token")
async def rotate_token(source_id: str, user: dict = Depends(MANAGE)):
    src = await fetch_one(
        "SELECT code, type FROM integrations.data_sources WHERE id = CAST(:id AS uuid)", {"id": source_id}
    )
    if not src or src["type"] not in ("http_ingest", "chirpstack"):
        raise HTTPException(400, "Chỉ nguồn đẩy (HTTP batch, LoRaWAN) có token")
    token = crypto.new_device_key().replace("cbk_", "cbs_")
    await execute(
        "UPDATE integrations.data_sources SET secret_enc = :s, updated_at = now() WHERE id = CAST(:id AS uuid)",
        {"s": crypto.encrypt(token), "id": source_id},
    )
    await audit(user, "integration.source.rotate_token", "data_source", src["code"])
    return {"token": token, "note": "Token chỉ hiển thị một lần — cấu hình ngay vào hệ thống gửi dữ liệu"}


# ------------------------------------------------------------------ devices
DEVICE_COLS = """d.id, d.name, d.vendor, d.protocol, d.station_id, s.name AS station_name, s.type AS station_type,
                 s.source AS station_source, d.value_field, d.scale, d.offset_value, d.expected_interval_s, d.enabled,
                 d.status, d.last_seen_at, d.last_value, d.created_at, (d.api_key_hash IS NOT NULL) AS has_key"""


@router.get("/devices")
async def devices(_: dict = Depends(VIEW)):
    return await fetch_all(
        f"""SELECT {DEVICE_COLS} FROM integrations.devices d
              JOIN iot_telemetry.monitoring_stations s ON s.id = d.station_id ORDER BY d.created_at"""
    )


class DeviceIn(BaseModel):
    id: str = Field(pattern=r"^[A-Za-z0-9._:-]{3,64}$")
    name: str = Field(min_length=2)
    vendor: str | None = None
    protocol: str = Field(pattern="^(http|mqtt|lorawan)$")
    station_id: str
    value_field: str = "value"
    scale: float = 1
    offset_value: float = 0
    expected_interval_s: int = Field(600, ge=30, le=86400)


@router.post("/devices", status_code=201)
async def create_device(body: DeviceIn, user: dict = Depends(MANAGE)):
    if not await fetch_one(
        "SELECT 1 FROM iot_telemetry.monitoring_stations WHERE id = :s", {"s": body.station_id}
    ):
        raise HTTPException(422, "Trạm quan trắc không tồn tại")
    device_id = body.id.upper() if body.protocol == "lorawan" else body.id
    if await fetch_one("SELECT 1 FROM integrations.devices WHERE id = :id", {"id": device_id}):
        raise HTTPException(409, "Mã thiết bị đã tồn tại")
    key = crypto.new_device_key() if body.protocol == "http" else None
    await execute(
        """INSERT INTO integrations.devices (id, name, vendor, protocol, station_id, api_key_hash, value_field, scale,
                  offset_value, expected_interval_s)
           VALUES (:id, :n, :v, :p, :s, :k, :vf, :sc, :of, :ei)""",
        {
            "id": device_id,
            "n": body.name,
            "v": body.vendor,
            "p": body.protocol,
            "s": body.station_id,
            "k": crypto.hash_key(key) if key else None,
            "vf": body.value_field,
            "sc": body.scale,
            "of": body.offset_value,
            "ei": body.expected_interval_s,
        },
    )
    await audit(
        user,
        "integration.device.create",
        "device",
        device_id,
        {"station": body.station_id, "protocol": body.protocol},
    )
    return {
        "id": device_id,
        "api_key": key,
        "note": "Khoá thiết bị chỉ hiển thị một lần"
        if key
        else "Thiết bị MQTT/LoRaWAN xác thực qua broker / network server",
    }


class DevicePatch(BaseModel):
    name: str | None = None
    enabled: bool | None = None
    station_id: str | None = None
    value_field: str | None = None
    scale: float | None = None
    offset_value: float | None = None
    expected_interval_s: int | None = Field(None, ge=30, le=86400)


@router.patch("/devices/{device_id}")
async def update_device(device_id: str, body: DevicePatch, user: dict = Depends(MANAGE)):
    if not await fetch_one("SELECT 1 FROM integrations.devices WHERE id = :id", {"id": device_id}):
        raise HTTPException(404, "Không tìm thấy thiết bị")
    data = body.model_dump(exclude_none=True)
    if not data:
        raise HTTPException(422, "Không có thay đổi")
    sets = ", ".join(f"{k} = :{k}" for k in data)
    await execute(f"UPDATE integrations.devices SET {sets} WHERE id = :id", {**data, "id": device_id})
    await audit(user, "integration.device.update", "device", device_id, data)
    return {"ok": True}


@router.post("/devices/{device_id}/rotate-key")
async def rotate_device_key(device_id: str, user: dict = Depends(MANAGE)):
    d = await fetch_one("SELECT protocol FROM integrations.devices WHERE id = :id", {"id": device_id})
    if not d or d["protocol"] != "http":
        raise HTTPException(400, "Chỉ thiết bị HTTP dùng khoá")
    key = crypto.new_device_key()
    await execute(
        "UPDATE integrations.devices SET api_key_hash = :k WHERE id = :id",
        {"k": crypto.hash_key(key), "id": device_id},
    )
    await audit(user, "integration.device.rotate_key", "device", device_id)
    return {"api_key": key}


@router.delete("/devices/{device_id}", status_code=204, response_class=Response)
async def delete_device(device_id: str, user: dict = Depends(MANAGE)):
    d = await fetch_one(
        "DELETE FROM integrations.devices WHERE id = :id RETURNING station_id", {"id": device_id}
    )
    if not d:
        raise HTTPException(404, "Không tìm thấy thiết bị")
    # Trạm không còn thiết bị nào → trở lại chế độ mô phỏng (demo)
    await execute(
        """UPDATE iot_telemetry.monitoring_stations SET source = 'simulator', status = 'online'
            WHERE id = :s AND NOT EXISTS (SELECT 1 FROM integrations.devices WHERE station_id = :s)""",
        {"s": d["station_id"]},
    )
    await audit(user, "integration.device.delete", "device", device_id)


# ------------------------------------------------------------------ monitor
@router.get("/monitor")
async def monitor(limit: int = 100, _: dict = Depends(VIEW)):
    devices = await fetch_one(
        """SELECT count(*) AS total, count(*) FILTER (WHERE status = 'truc_tuyen') AS online,
                  count(*) FILTER (WHERE status = 'mat_tin_hieu') AS offline,
                  count(*) FILTER (WHERE status = 'chua_ket_noi') AS never
             FROM integrations.devices WHERE enabled"""
    )
    stations = await fetch_all(
        "SELECT source, count(*) AS n FROM iot_telemetry.monitoring_stations GROUP BY source ORDER BY source"
    )
    last24 = await fetch_one(
        """SELECT COALESCE(sum(accepted), 0) AS accepted, COALESCE(sum(rejected), 0) AS rejected,
                  count(*) FILTER (WHERE level = 'error') AS errors
             FROM integrations.ingest_log WHERE time > now() - interval '24 hours'"""
    )
    log = await fetch_all(
        "SELECT id, time, source, level, message, accepted, rejected FROM integrations.ingest_log ORDER BY time DESC LIMIT :l",
        {"l": limit},
    )
    return {
        "devices": devices,
        "stations": stations,
        "last24": last24,
        "log": log,
        "mqtt_connected": bridge.connected,
    }
