"""Dự báo mưa theo xã (tổ hợp ECMWF/GFS từ Open-Meteo, OpenWeather) — /api/v1/forecast/*"""

from fastapi import APIRouter, Depends, HTTPException

from app.area import unit_clause
from app.db import fetch_all, fetch_one
from app.rbac.authz import allowed_codes, area_scope, require_any

router = APIRouter(prefix="/forecast", tags=["Dự báo theo xã"])


@router.get("/models")
async def models(_: dict = Depends(require_any("monitoring", "view"))):
    return await fetch_all(
        """SELECT model, count(DISTINCT admin_unit_id) AS units, min(time) AS first, max(time) AS last,
                  max(issued_at) AS issued_at, max(members) AS members
             FROM iot_telemetry.area_forecasts WHERE time > now() - interval '1 hour' GROUP BY model ORDER BY model"""
    )


@router.get("/areas")
async def areas(
    model: str = "BLEND", hours: int = 24, codes: list[str] = Depends(area_scope("monitoring", "view"))
):
    """Tổng mưa dự báo N giờ tới theo xã (P10/P50/P90), xác suất mưa lớn cao nhất — cho bản đồ & bảng xếp hạng."""
    return await fetch_all(
        f"""SELECT u.code, u.name, u.old_district,
                   round(sum(a.precip_p10)::numeric, 1)::float AS p10,
                   round(sum(a.precip_p50)::numeric, 1)::float AS p50,
                   round(sum(a.precip_p90)::numeric, 1)::float AS p90,
                   round(max(a.precip_p90)::numeric, 1)::float AS max_hourly_p90,
                   round(max(a.prob_heavy)::numeric, 2)::float AS max_prob_heavy,
                   max(a.issued_at) AS issued_at
              FROM iot_telemetry.area_forecasts a JOIN spatial_admin.administrative_units u ON u.id = a.admin_unit_id
             WHERE a.model = :m AND a.time > now() AND a.time <= now() + make_interval(hours => :h)
               AND {unit_clause('a.admin_unit_id', codes)}
             GROUP BY u.code, u.name, u.old_district ORDER BY p50 DESC""",
        {"m": model, "h": hours, "codes": codes},
    )


@router.get("/areas/{code}")
async def area_series(code: str, user: dict = Depends(require_any("monitoring", "view"))):
    allowed = allowed_codes(user, "monitoring", "view")
    if allowed is not None and code not in allowed:
        raise HTTPException(403, "Xã nằm ngoài phạm vi được giao")
    unit = await fetch_one(
        "SELECT id, code, name FROM spatial_admin.administrative_units WHERE code = :c AND level = 'xa'",
        {"c": code},
    )
    if not unit:
        raise HTTPException(404, "Không tìm thấy xã")
    rows = await fetch_all(
        """SELECT model, time, precip_p10, precip_p50, precip_p90, prob_heavy, temp_c, gust_kmh, members, issued_at
             FROM iot_telemetry.area_forecasts WHERE admin_unit_id = :u AND time > now() - interval '1 hour'
            ORDER BY model, time""",
        {"u": unit["id"]},
    )
    series: dict[str, list] = {}
    for r in rows:
        series.setdefault(r.pop("model"), []).append(r)
    return {"unit": {"code": unit["code"], "name": unit["name"]}, "series": series}
