"""Ghi nhật ký sự kiện + đẩy realtime (dùng chung cho API và simulator)."""

from app.db import fetch_one
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
        """INSERT INTO operations.event_logs (category, severity, message, admin_unit_id, location)
           VALUES (:c, :s, :m, :a, CASE WHEN CAST(:lat AS float8) IS NULL THEN NULL
                                        ELSE ST_SetSRID(ST_MakePoint(CAST(:lon AS float8), CAST(:lat AS float8)), 4326) END)
           RETURNING id, time, category, severity, message""",
        {"c": category, "s": severity, "m": message, "a": admin_unit_id, "lat": lat, "lon": lon},
        conn,
    )
    await hub.publish("log.new", row)
    return row
