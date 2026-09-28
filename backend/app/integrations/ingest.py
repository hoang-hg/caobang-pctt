"""Lõi tiếp nhận số đo IoT — dùng chung cho HTTP, MQTT, LoRaWAN (ChirpStack / TTN).

Mỗi số đo đi qua: quy đổi (scale/offset) → kiểm tra hợp lệ (khoảng giá trị theo loại trạm, thời gian,
trùng lặp) → ghi ``sensor_readings`` → cập nhật trạng thái thiết bị → đẩy WebSocket → chạy cảnh báo tự động
(mực nước vượt báo động, cảm biến nghiêng/độ ẩm đất vượt BĐ II…) như với dữ liệu mô phỏng.
Trạm nhận số đo thật đầu tiên tự chuyển ``source = 'iot'`` (từ 'simulator' — bộ mô phỏng ngừng sinh dữ liệu cho trạm
đó — hoặc 'external' — trạm nhập từ tệp đang chờ thiết bị).
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta

from app.db import execute, fetch_all, fetch_one
from app.services.events import log_event
from app.services.simulator import alarm_level, simulator
from app.ws.hub import hub

log = logging.getLogger(__name__)

MAX_FUTURE = timedelta(minutes=5)
MAX_AGE = timedelta(days=7)


class IngestError(ValueError):
    pass


def value_range(stype: str, thresholds: dict) -> tuple[float, float]:
    """Khoảng giá trị hợp lệ theo loại trạm (lọc số đo lỗi cảm biến)."""
    if stype == "luong_mua":
        return 0.0, 300.0  # mm/h
    if stype == "do_nghieng":
        return -90.0, 90.0  # độ
    if stype == "do_am_dat":
        return 0.0, 100.0  # %
    lo = thresholds.get("bd1")
    hi = thresholds.get("bd3")
    if lo is not None and hi is not None:
        return lo - 30.0, hi + 30.0  # mực nước quanh vạch báo động ±30 m
    return -50.0, 3000.0


def parse_time(raw, now: datetime) -> datetime:
    if raw in (None, ""):
        return now
    if isinstance(raw, int | float):
        ts = raw / 1000 if raw > 1e11 else raw  # epoch ms hoặc s
        return datetime.fromtimestamp(ts, UTC)
    text = str(raw).replace("Z", "+00:00")
    dt = datetime.fromisoformat(text)
    return dt if dt.tzinfo else dt.replace(tzinfo=UTC)


def normalize(items: list[dict], device: dict, station: dict, now: datetime) -> tuple[list[dict], list[str]]:
    """Trả (số đo hợp lệ, danh sách lỗi). Hàm thuần — kiểm thử được không cần CSDL."""
    lo, hi = value_range(station["type"], station["thresholds"] or {})
    good, errors = [], []
    for i, it in enumerate(items):
        try:
            raw = it.get("value")
            if raw is None or isinstance(raw, bool):
                raise IngestError("thiếu giá trị 'value'")
            value = float(raw) * device.get("scale", 1) + device.get("offset_value", 0)
            t = parse_time(it.get("time") or it.get("ts") or it.get("timestamp"), now)
            if t > now + MAX_FUTURE:
                raise IngestError("thời gian ở tương lai")
            if t < now - MAX_AGE:
                raise IngestError("số đo quá cũ (> 7 ngày)")
            if not lo <= value <= hi:
                raise IngestError(f"giá trị {value} ngoài khoảng hợp lệ [{lo}, {hi}]")
            good.append({"time": t, "value": round(value, 4)})
        except (IngestError, ValueError, TypeError) as exc:
            errors.append(f"#{i}: {exc}")
    return good, errors


async def get_device(device_id: str) -> dict | None:
    return await fetch_one(
        """SELECT d.*, s.type AS station_type, s.name AS station_name, s.alarm_thresholds AS thresholds,
                  s.source AS station_source
             FROM integrations.devices d JOIN iot_telemetry.monitoring_stations s ON s.id = d.station_id
            WHERE d.id = :id""",
        {"id": device_id},
    )


async def ingest_log(
    source: str, message: str, accepted: int = 0, rejected: int = 0, level: str = "info"
) -> None:
    await execute(
        """INSERT INTO integrations.ingest_log (source, level, message, accepted, rejected)
           VALUES (:s, :l, :m, :a, :r)""",
        {"s": source, "l": level, "m": message[:500], "a": accepted, "r": rejected},
    )
    await hub.publish("ingest.log", {"source": source, "level": level, "message": message[:200]})


async def ingest_readings(device: dict, items: list[dict], channel: str) -> dict:
    """Ghi số đo của một thiết bị. ``channel``: http | mqtt | lorawan | batch."""
    if not device["enabled"]:
        raise IngestError("thiết bị đang bị vô hiệu hoá")
    now = datetime.now(UTC)
    station = {"type": device["station_type"], "thresholds": device["thresholds"]}
    good, errors = normalize(items, device, station, now)

    accepted = []
    for r in good:  # bỏ số đo trùng (cùng trạm, cùng thời điểm) — thiết bị gửi lại khi mất mạng
        dup = await fetch_one(
            "SELECT 1 FROM iot_telemetry.sensor_readings WHERE station_id = :s AND time = :t",
            {"s": device["station_id"], "t": r["time"]},
        )
        if dup:
            errors.append(f"trùng số đo lúc {r['time'].isoformat()}")
            continue
        await execute(
            "INSERT INTO iot_telemetry.sensor_readings (time, station_id, value) VALUES (:t, :s, :v)",
            {"t": r["time"], "s": device["station_id"], "v": r["value"]},
        )
        accepted.append(r)

    if accepted:
        latest = max(accepted, key=lambda r: r["time"])
        await execute(
            """UPDATE integrations.devices SET last_seen_at = now(), last_value = :v, status = 'truc_tuyen'
                WHERE id = :id""",
            {"v": latest["value"], "id": device["id"]},
        )
        if device["status"] == "mat_tin_hieu":
            await log_event(
                f"Thiết bị {device['name']} ({device['id']}) có tín hiệu trở lại", "he_thong", "info"
            )
        if device["station_source"] != "iot":
            # Trạm chuyển sang dữ liệu thật: bộ mô phỏng ngừng sinh số đo cho trạm này; trạm nhập từ tệp hết "chờ thiết bị"
            await execute(
                "UPDATE iot_telemetry.monitoring_stations SET source = 'iot', status = 'online' WHERE id = :s",
                {"s": device["station_id"]},
            )
            await log_event(
                f"{device['station_name']} chuyển sang dữ liệu thật từ thiết bị {device['id']} ({channel.upper()})",
                "he_thong",
                "info",
            )
        else:
            await execute(
                "UPDATE iot_telemetry.monitoring_stations SET status = 'online' WHERE id = :s",
                {"s": device["station_id"]},
            )
        readings = [
            {
                "station_id": device["station_id"],
                "type": device["station_type"],
                "value": latest["value"],
                "time": latest["time"],
                "level": alarm_level(latest["value"], device["thresholds"] or {}),
                "name": device["station_name"],
                "thresholds": device["thresholds"] or {},
            }
        ]
        await hub.publish("reading.new", [{k: v for k, v in readings[0].items() if k != "thresholds"}])
        try:
            await simulator.check_triggers(readings, now)
        except Exception:  # cảnh báo tự động lỗi không được làm mất số đo
            log.exception("trigger check failed for %s", device["id"])

    await ingest_log(
        f"device:{device['id']}",
        f"{channel.upper()} {device['id']}: nhận {len(accepted)}, loại {len(errors)}"
        + (f" — {'; '.join(errors[:3])}" if errors else ""),
        len(accepted),
        len(errors),
        "warning" if errors and not accepted else "info",
    )
    return {
        "device_id": device["id"],
        "station_id": device["station_id"],
        "accepted": len(accepted),
        "rejected": len(errors),
        "errors": errors[:20],
    }


async def mark_stale_devices() -> None:
    """Thiết bị quá 3 chu kỳ không gửi dữ liệu → mất tín hiệu (cảnh báo trực ban)."""
    rows = await fetch_all(
        """UPDATE integrations.devices SET status = 'mat_tin_hieu'
            WHERE enabled AND status = 'truc_tuyen'
              AND last_seen_at < now() - make_interval(secs => expected_interval_s * 3)
        RETURNING id, name, station_id"""
    )
    for d in rows:
        await execute(
            "UPDATE iot_telemetry.monitoring_stations SET status = 'offline' WHERE id = :s",
            {"s": d["station_id"]},
        )
        await log_event(
            f"MẤT TÍN HIỆU thiết bị {d['name']} ({d['id']}) — kiểm tra nguồn điện / đường truyền",
            "he_thong",
            "warning",
        )
        await ingest_log(f"device:{d['id']}", f"Mất tín hiệu: {d['name']}", level="warning")
