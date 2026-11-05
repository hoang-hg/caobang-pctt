"""Số đo mới nhất của trạm quan trắc cho người xem (cổng công khai, trang bản nhẹ).

Trạm chưa có số đo, hoặc số đo cũ hơn ``STALE_MINUTES`` (thiết bị gửi 5–15 phút/lần → coi là mất tín hiệu; thiết bị
hay hỏng đúng lúc lũ về) KHÔNG được coi là "an toàn / dưới báo động": luôn trả kèm thời điểm số đo và cờ ``stale`` để
giao diện hiện "Chưa có số liệu" / "Mất tín hiệu" thay vì màu xanh.

Dùng: ``SELECT …, {LATEST_COLS} FROM iot_telemetry.monitoring_stations s {LATEST_JOIN}`` (bảng trạm phải có bí danh ``s``).
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

STALE_MINUTES = 60
VN_TZ = timezone(timedelta(hours=7))


def vn_time(t: datetime) -> str:
    """Giờ Việt Nam cho người đọc, VD "14:05 28/09"."""
    return t.astimezone(VN_TZ).strftime("%H:%M %d/%m")


LATEST_JOIN = """LEFT JOIN LATERAL (
    SELECT round(r.value::numeric, 2)::float AS value, r.time FROM iot_telemetry.sensor_readings r
     WHERE r.station_id = s.id ORDER BY r.time DESC LIMIT 1) l ON TRUE"""

LATEST_COLS = (
    f"l.value, l.time, coalesce(l.time < now() - interval '{STALE_MINUTES} minutes', false) AS stale"
)


# Xu thế mực nước cho người dân: so số đo mới nhất với số đo gần mốc 3 giờ trước nhất (trong khoảng 2–4 giờ trước). Không có
# số đo cũ đủ gần, hoặc trạm mất tín hiệu → không nói xu thế (không đoán "ổn định")
TREND_HOURS = 3
TREND_FLAT_M = 0.05  # chênh dưới 5 cm / 3 giờ coi là ổn định
TREND_JOIN = f"""LEFT JOIN LATERAL (
    SELECT r.value AS prev_value FROM iot_telemetry.sensor_readings r
     WHERE r.station_id = s.id AND r.time BETWEEN l.time - interval '{TREND_HOURS + 1} hours'
                                             AND l.time - interval '{TREND_HOURS - 1} hours'
     ORDER BY abs(extract(epoch FROM r.time - (l.time - interval '{TREND_HOURS} hours'))) LIMIT 1) p ON TRUE"""


def river_trend(value: float | None, prev: float | None, stale: bool) -> tuple[float | None, str]:
    """(chênh lệch m trong ~3 giờ, nhãn) — "Đang lên" / "Đang xuống" / "Ổn định"; thiếu số liệu → (None, "Chưa rõ")."""
    if value is None or prev is None or stale:
        return None, "Chưa rõ"
    delta = round(value - prev, 2)
    if abs(delta) < TREND_FLAT_M:
        return delta, "Ổn định"
    return delta, "Đang lên" if delta > 0 else "Đang xuống"
