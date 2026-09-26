"""Ghi nhật ký sự kiện + đẩy realtime (dùng chung cho API và simulator).

Nhật ký có toạ độ mà chưa gắn xã → tự gán xã gần nhất, để lọc theo phạm vi RBAC.
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
           RETURNING id, time, category, severity, message, admin_unit_id""",
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
