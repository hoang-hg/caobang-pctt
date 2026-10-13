"""Ghi nhật ký sự kiện + đẩy realtime (dùng chung cho API và simulator).

Nhật ký có toạ độ mà chưa gắn xã → tự gán xã gần nhất, để lọc theo phạm vi RBAC. Toạ độ trả kèm (`lat`, `lon`) để dòng
diễn biến trên bản đồ giám sát bấm được tới chỗ xảy ra.
"""

from app.db import fetch_one
from app.rbac import domains
from app.ws.hub import hub


async def log_event(
    message: str,
    category: str = "he_thong",
    severity: str = "info",
    admin_unit_id=None,
    lat=None,
    lon=None,
    conn=None,
):
    row = await fetch_one(
        """WITH pt AS (SELECT CASE WHEN CAST(:lat AS float8) IS NULL THEN NULL
                              ELSE ST_SetSRID(ST_MakePoint(CAST(:lon AS float8), CAST(:lat AS float8)), 4326) END AS g)
           INSERT INTO operations.event_logs (category, severity, message, admin_unit_id, location)
           SELECT :c, :s, :m,
                  COALESCE(CAST(:a AS uuid), (SELECT u.id FROM spatial_admin.administrative_units u
                                               WHERE u.level = 'xa' AND pt.g IS NOT NULL
                                               ORDER BY u.geom <-> pt.g LIMIT 1)),
                  pt.g
             FROM pt
           RETURNING id, time, category, severity, message, admin_unit_id,
                     ST_Y(location) AS lat, ST_X(location) AS lon""",
        {
            "c": category,
            "s": severity,
            "m": message,
            "a": str(admin_unit_id) if admin_unit_id else None,
            "lat": lat,
            "lon": lon,
        },
        conn,
    )
    unit_id = row.pop("admin_unit_id")
    await hub.publish("log.new", row, "monitoring", domains.code_of_unit_id(unit_id))
    return row


async def station_place(station_id: str | None, conn=None) -> dict:
    """Xã + toạ độ của trạm → `log_event(..., **place)`: dòng nhật ký về trạm / thiết bị gắn đúng xã (lọc theo vùng, phạm vi
    tài khoản) và bấm được tới trạm trên bản đồ. Trạm không còn → {} (ghi như cũ, không gắn xã)."""
    if not station_id:
        return {}
    row = await fetch_one(
        """SELECT admin_unit_id, ST_Y(location) AS lat, ST_X(location) AS lon
             FROM iot_telemetry.monitoring_stations WHERE id = :s""",
        {"s": station_id},
        conn,
    )
    return row or {}
