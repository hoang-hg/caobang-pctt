"""Cổng tiếp nhận dữ liệu IoT hiện trường.

POST /ingest/readings   — 1 thiết bị, header ``X-Device-Key`` (khoá riêng từng thiết bị)
POST /ingest/batch      — nhiều thiết bị (nền tảng IoT của hãng đẩy lên), ``Authorization: Bearer <token nguồn IOT_HTTP>``
POST /ingest/lorawan    — webhook ChirpStack v4 / The Things Network v3, ``Authorization: Bearer <token nguồn LORAWAN>``
"""

import hmac
from typing import Any

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field

from app.db import fetch_one
from app.integrations import crypto
from app.integrations.ingest import IngestError, get_device, ingest_log, ingest_readings

router = APIRouter(prefix="/ingest", tags=["Tiếp nhận IoT"])


class Reading(BaseModel):
    value: float | None = None
    time: Any = None


class DeviceReadingsIn(BaseModel):
    device_id: str
    value: float | None = None
    time: Any = None
    readings: list[Reading] | None = Field(None, max_length=1000)


def _items(body) -> list[dict]:
    if body.readings:
        return [r.model_dump() for r in body.readings]
    return [{"value": body.value, "time": body.time}]


async def _device_or_404(device_id: str) -> dict:
    device = await get_device(device_id)
    if device is None:
        await ingest_log("IOT_HTTP", f"Thiết bị chưa đăng ký: {device_id}", level="warning", rejected=1)
        raise HTTPException(404, "Thiết bị chưa đăng ký")
    return device


async def _check_source_token(code: str, authorization: str | None) -> None:
    src = await fetch_one(
        "SELECT enabled, secret_enc FROM integrations.data_sources WHERE code = :c", {"c": code}
    )
    token = (authorization or "").removeprefix("Bearer ").strip()
    expected = crypto.decrypt(src["secret_enc"]) if src else None
    if not src or not src["enabled"] or not expected or not hmac.compare_digest(token, expected):
        raise HTTPException(401, "Token nguồn dữ liệu không hợp lệ hoặc nguồn đang tắt")


@router.post("/readings")
async def device_readings(body: DeviceReadingsIn, x_device_key: str | None = Header(None)):
    device = await _device_or_404(body.device_id)
    if device["protocol"] != "http" or not crypto.key_matches(x_device_key, device["api_key_hash"]):
        await ingest_log(
            f"device:{body.device_id}", "Sai khoá thiết bị (X-Device-Key)", level="warning", rejected=1
        )
        raise HTTPException(401, "Khoá thiết bị không hợp lệ")
    try:
        return await ingest_readings(device, _items(body), "http")
    except IngestError as exc:
        raise HTTPException(422, str(exc)) from exc


class BatchItem(BaseModel):
    device_id: str
    value: float | None = None
    time: Any = None


@router.post("/batch")
async def batch(items: list[BatchItem], authorization: str | None = Header(None)):
    await _check_source_token("IOT_HTTP", authorization)
    if len(items) > 5000:
        raise HTTPException(413, "Tối đa 5000 số đo mỗi lần gửi")
    grouped: dict[str, list[dict]] = {}
    for it in items:
        grouped.setdefault(it.device_id, []).append({"value": it.value, "time": it.time})
    results = []
    for device_id, rows in grouped.items():
        device = await get_device(device_id)
        if device is None:
            results.append(
                {"device_id": device_id, "accepted": 0, "rejected": len(rows), "errors": ["chưa đăng ký"]}
            )
            continue
        try:
            results.append(await ingest_readings(device, rows, "batch"))
        except IngestError as exc:
            results.append(
                {"device_id": device_id, "accepted": 0, "rejected": len(rows), "errors": [str(exc)]}
            )
    return {
        "accepted": sum(r["accepted"] for r in results),
        "rejected": sum(r["rejected"] for r in results),
        "devices": results,
    }


def parse_lorawan(body: dict) -> tuple[str | None, dict, Any]:
    """ChirpStack v4 hoặc TTN v3 → (DevEUI, payload đã giải mã, thời gian). Hàm thuần."""
    if "deviceInfo" in body:  # ChirpStack v4 (event=up)
        return (body["deviceInfo"].get("devEui"), body.get("object") or {}, body.get("time"))
    if "end_device_ids" in body:  # The Things Network v3
        up = body.get("uplink_message") or {}
        return (
            body["end_device_ids"].get("dev_eui"),
            up.get("decoded_payload") or {},
            up.get("received_at") or body.get("received_at"),
        )
    return None, {}, None


@router.post("/lorawan")
async def lorawan(body: dict, authorization: str | None = Header(None), event: str | None = None):
    await _check_source_token("LORAWAN", authorization)
    if event and event != "up":  # ChirpStack gửi cả join/status/ack — chỉ nhận uplink
        return {"ignored": event}
    dev_eui, decoded, time = parse_lorawan(body)
    if not dev_eui:
        raise HTTPException(422, "Không nhận dạng được định dạng ChirpStack / TTN")
    device = await get_device(dev_eui.upper()) or await get_device(dev_eui.lower())
    if device is None:
        await ingest_log("LORAWAN", f"DevEUI chưa đăng ký: {dev_eui}", level="warning", rejected=1)
        raise HTTPException(404, "Thiết bị chưa đăng ký")
    value = decoded.get(device["value_field"])
    try:
        return await ingest_readings(device, [{"value": value, "time": time}], "lorawan")
    except IngestError as exc:
        raise HTTPException(422, str(exc)) from exc
