"""Số đo mới nhất của trạm quan trắc cho người xem (cổng công khai, trang bản nhẹ).

Trạm chưa có số đo, hoặc số đo cũ hơn ``STALE_MINUTES`` (thiết bị gửi 5–15 phút/lần → coi là mất tín hiệu; thiết bị
hay hỏng đúng lúc lũ về) KHÔNG được coi là "an toàn / dưới báo động": luôn trả kèm thời điểm số đo và cờ ``stale`` để
giao diện hiện "Chưa có số liệu" / "Mất tín hiệu" thay vì màu xanh.

Dùng: ``SELECT …, {LATEST_COLS} FROM iot_telemetry.monitoring_stations s {LATEST_JOIN}`` (bảng trạm phải có bí danh ``s``).
"""

from __future__ import annotations

STALE_MINUTES = 60

LATEST_JOIN = """LEFT JOIN LATERAL (
    SELECT round(r.value::numeric, 2)::float AS value, r.time FROM iot_telemetry.sensor_readings r
     WHERE r.station_id = s.id ORDER BY r.time DESC LIMIT 1) l ON TRUE"""

LATEST_COLS = (
    f"l.value, l.time, coalesce(l.time < now() - interval '{STALE_MINUTES} minutes', false) AS stale"
)
