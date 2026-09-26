"""Dashboard tổng quan: KPI thời gian thực và dữ liệu biểu đồ (Phân hệ A)."""

from fastapi import APIRouter, Depends, HTTPException

from app.area import area_clause, unit_clause
from app.db import fetch_all, fetch_one
from app.rbac.authz import area_scope, require_any
from app.services.landslides import get_landslides_overview
from app.services.reservoirs import get_reservoirs_overview

router = APIRouter(tags=["Dashboard"])
MON = area_scope("monitoring", "view")

LATEST_READINGS = """
SELECT DISTINCT ON (r.station_id) r.station_id, r.value, r.time
  FROM iot_telemetry.sensor_readings r
 WHERE r.time > now() - interval '2 hours'
 ORDER BY r.station_id, r.time DESC
"""


@router.get("/dashboard/kpis")
async def kpis(codes: list[str] = Depends(MON)):
    p = {"codes": codes}
    rain = await fetch_one(
        f"""
        WITH h AS (
          SELECT s.id, s.name, time_bucket('1 hour', r.time) AS b, avg(r.value) AS v
            FROM iot_telemetry.sensor_readings r JOIN iot_telemetry.monitoring_stations s ON s.id = r.station_id
           WHERE s.type = 'luong_mua' AND r.time > now() - interval '24 hours' AND {area_clause('s.location', codes)}
           GROUP BY s.id, s.name, b),
        tot AS (SELECT id, name, sum(v) AS mm FROM h GROUP BY id, name)
        SELECT round(avg(mm)::numeric, 1) AS avg_24h, round(max(mm)::numeric, 1) AS max_24h,
               (SELECT name FROM tot ORDER BY mm DESC LIMIT 1) AS max_station
          FROM tot""",
        p,
    )
    rivers = await fetch_all(
        f"""SELECT s.id, s.name, s.river, s.alarm_thresholds AS thresholds, l.value, l.time
              FROM iot_telemetry.monitoring_stations s JOIN ({LATEST_READINGS}) l ON l.station_id = s.id
             WHERE s.type = 'muc_nuoc' AND {area_clause('s.location', codes)}
             ORDER BY s.id""",
        p,
    )
    evac = await fetch_one(
        f"""SELECT COALESCE(sum(planned_households), 0) AS planned_households, COALESCE(sum(evacuated_households), 0) AS evacuated_households,
                   COALESCE(sum(planned_persons), 0) AS planned_persons, COALESCE(sum(evacuated_persons), 0) AS evacuated_persons
              FROM operations.evacuation_progress e WHERE {unit_clause('e.admin_unit_id', codes)}""",
        p,
    )
    sos = await fetch_one(
        f"""SELECT count(*) FILTER (WHERE status = 'moi') AS waiting,
                   count(*) FILTER (WHERE status = 'moi' AND received_at < now() - interval '15 minutes') AS overdue,
                   count(*) FILTER (WHERE status IN ('dieu_phoi', 'thuc_thi')) AS in_progress,
                   count(*) FILTER (WHERE status = 'hoan_thanh' AND resolved_at > now() - interval '24 hours') AS resolved_24h,
                   count(*) FILTER (WHERE status <> 'hoan_thanh' AND priority = 1) AS critical,
                   min(received_at) FILTER (WHERE status = 'moi') AS oldest_waiting
              FROM operations.sos_tickets t WHERE {area_clause('t.location', codes)}""",
        p,
    )
    forces = await fetch_one(
        f"""SELECT COALESCE(sum(personnel_ready), 0) AS ready, COALESCE(sum(personnel_on_mission), 0) AS on_mission,
                   COALESCE(sum(personnel_total), 0) AS total, count(*) AS units
              FROM resources.forces f WHERE {area_clause('f.location', codes)}""",
        p,
    )
    vehicles = await fetch_one(
        f"""SELECT count(*) FILTER (WHERE status = 'nhiem_vu') AS active, count(*) FILTER (WHERE status = 'san_sang') AS ready,
                   count(*) FILTER (WHERE status = 'bao_duong') AS maintenance,
                   count(*) FILTER (WHERE vehicle_type IN ('xuong','ca_no','ghe','xe_loi_nuoc')) AS special_total,
                   count(*) FILTER (WHERE vehicle_type IN ('xuong','ca_no','ghe','xe_loi_nuoc') AND status = 'nhiem_vu') AS special_active
              FROM resources.vehicles v WHERE {area_clause('v.current_location', codes)}""",
        p,
    )
    # Tổng quan toàn tỉnh → lọc theo vùng đang xem / phạm vi được giao (codes rỗng = toàn tỉnh)
    reservoirs = [
        r for r in (await get_reservoirs_overview())["reservoirs"] if not codes or r["admin_code"] in codes
    ]
    landslides = [
        p for p in (await get_landslides_overview())["points"] if not codes or p["admin_code"] in codes
    ]
    return {
        "rain": rain,
        "rivers": rivers,
        "evacuation": evac,
        "sos": sos,
        "forces": forces,
        "vehicles": vehicles,
        "reservoirs": {
            "total": len(reservoirs),
            "spill_count": sum(r["status_code"] != "binh_thuong" for r in reservoirs),
            "emergency_count": sum(r["status_code"] == "xa_khan_cap" for r in reservoirs),
            "total_inflow": round(sum(r["inflow_m3s"] for r in reservoirs), 1),
            "total_outflow": round(sum(r["outflow_m3s"] for r in reservoirs), 1),
            "reservoirs": reservoirs,
        },
        "landslides": {
            "total": len(landslides),
            "blocked_count": sum(p["traffic_status"] == "cam_duong" for p in landslides),
            "warning_count": sum(p["traffic_status"] == "canh_bao" for p in landslides),
            "safe_count": sum(p["traffic_status"] == "thong_suot" for p in landslides),
            "points": landslides,
        },
    }


@router.get("/stations")
async def stations(type: str | None = None, codes: list[str] = Depends(MON)):
    return await fetch_all(
        f"""SELECT s.id, s.name, s.type, s.river, s.unit, s.alarm_thresholds AS thresholds, s.status, s.source,
                   ST_Y(s.location) AS lat, ST_X(s.location) AS lon, u.name AS admin_name, l.value, l.time
              FROM iot_telemetry.monitoring_stations s
              LEFT JOIN spatial_admin.administrative_units u ON u.id = s.admin_unit_id
              LEFT JOIN ({LATEST_READINGS}) l ON l.station_id = s.id
             WHERE (CAST(:type AS text) IS NULL OR s.type = :type) AND {area_clause('s.location', codes)}
             ORDER BY s.type, s.id""",
        {"type": type, "codes": codes},
    )


@router.get("/stations/{station_id}/series")
async def station_series(
    station_id: str,
    hours: int = 48,
    bucket_minutes: int = 60,
    _: dict = Depends(require_any("monitoring", "view")),
):
    station = await fetch_one(
        "SELECT id, name, type, river, unit, alarm_thresholds AS thresholds FROM iot_telemetry.monitoring_stations WHERE id = :id",
        {"id": station_id},
    )
    if not station:
        raise HTTPException(404, "Không tìm thấy trạm")
    # Mưa lưu cường độ mm/h → trung bình theo giờ chính là lượng mưa (mm) của giờ đó
    observed = await fetch_all(
        """SELECT time_bucket(make_interval(mins => :bm), time) AS time, round(avg(value)::numeric, 3)::float AS value
             FROM iot_telemetry.sensor_readings
            WHERE station_id = :id AND time > now() - make_interval(hours => :h)
            GROUP BY 1 ORDER BY 1""",
        {"id": station_id, "h": hours, "bm": bucket_minutes},
    )
    forecast = await fetch_all(
        "SELECT time, value, model FROM iot_telemetry.forecasts WHERE station_id = :id AND time > now() - interval '1 hour' ORDER BY time",
        {"id": station_id},
    )
    return {"station": station, "observed": observed, "forecast": forecast}


@router.get("/dashboard/rainfall")
async def rainfall(codes: list[str] = Depends(MON), hours: int = 24):
    """Mưa giờ (trung bình các trạm trong vùng) + tích lũy + nowcast QPF 3h."""
    p = {"codes": codes, "h": hours}
    observed = await fetch_all(
        f"""SELECT b AS time, round(avg(v)::numeric, 1)::float AS mm, round(max(v)::numeric, 1)::float AS max_mm FROM (
              SELECT r.station_id, time_bucket('1 hour', r.time) AS b, avg(r.value) AS v
                FROM iot_telemetry.sensor_readings r JOIN iot_telemetry.monitoring_stations s ON s.id = r.station_id
               WHERE s.type = 'luong_mua' AND r.time > now() - make_interval(hours => :h) AND {area_clause('s.location', codes)}
               GROUP BY r.station_id, b) x
            GROUP BY b ORDER BY b""",
        p,
    )
    nowcast = await fetch_all(
        f"""SELECT f.time, round(avg(f.value)::numeric, 1)::float AS mm, round(max(f.value)::numeric, 1)::float AS max_mm
              FROM iot_telemetry.forecasts f JOIN iot_telemetry.monitoring_stations s ON s.id = f.station_id
             WHERE f.model = 'QPF-NOWCAST' AND f.time > now() AND {area_clause('s.location', codes)}
             GROUP BY f.time ORDER BY f.time""",
        p,
    )
    return {"observed": observed, "nowcast": nowcast}


@router.get("/dashboard/landslide-risk")
async def landslide_risk(codes: list[str] = Depends(MON)):
    """Ngưỡng kích hoạt sạt lở: mưa tích lũy 3 ngày vs cường độ mưa hiện tại (theo từng trạm mưa)
    + chỉ số cảm biến nghiêng/độ ẩm đất gần nhất. Ngưỡng I–D dạng I = a · R^-b (minh hoạ)."""
    rows = await fetch_all(
        f"""
        WITH h AS (
          SELECT r.station_id, time_bucket('1 hour', r.time) AS b, avg(r.value) AS v
            FROM iot_telemetry.sensor_readings r JOIN iot_telemetry.monitoring_stations s ON s.id = r.station_id
           WHERE s.type = 'luong_mua' AND r.time > now() - interval '72 hours' AND {area_clause('s.location', codes)}
           GROUP BY r.station_id, b)
        SELECT s.id, s.name, u.name AS admin_name, round(sum(h.v)::numeric, 1)::float AS rain_72h,
               round((SELECT value FROM iot_telemetry.sensor_readings x WHERE x.station_id = s.id ORDER BY time DESC LIMIT 1)::numeric, 1)::float AS intensity,
               (SELECT round(max(l.value)::numeric, 2)::float FROM ({LATEST_READINGS}) l
                  JOIN iot_telemetry.monitoring_stations t ON t.id = l.station_id
                 WHERE t.type = 'do_nghieng' AND ST_DWithin(t.location::geography, s.location::geography, 25000)) AS tilt_nearby
          FROM h JOIN iot_telemetry.monitoring_stations s ON s.id = h.station_id
          LEFT JOIN spatial_admin.administrative_units u ON u.id = s.admin_unit_id
         GROUP BY s.id, s.name, u.name
        """,
        {"codes": codes},
    )
    for r in rows:
        r["risk"] = classify_landslide(r["rain_72h"] or 0, r["intensity"] or 0, r["tilt_nearby"])
    return {"points": rows, "thresholds": threshold_curves()}


# Ngưỡng cường độ kích hoạt I = a · (R/100)^-0.6: đất càng bão hoà (R lớn) thì cường độ mưa cần để
# gây sạt lở càng thấp. Hệ số a (mm/h tại R = 100 mm) là MINH HOẠ, cần hiệu chỉnh theo số liệu địa phương.
THRESHOLD_A = {"vang": 14.0, "cam": 24.0, "do": 36.0}


def threshold_intensity(level: str, rain_72h: float) -> float:
    return THRESHOLD_A[level] * (max(rain_72h, 20) / 100) ** -0.6


def threshold_curves() -> dict:
    """Đường ngưỡng cường độ – lượng mưa tích lũy cho 3 cấp Vàng/Cam/Đỏ."""
    return {
        name: [
            {"rain_72h": r, "intensity": round(threshold_intensity(name, r), 1)} for r in range(60, 601, 20)
        ]
        for name in THRESHOLD_A
    }


def classify_landslide(rain_72h: float, intensity: float, tilt: float | None) -> str:
    tilt = tilt or 0
    if intensity >= threshold_intensity("do", rain_72h) or tilt >= 2 or rain_72h >= 450:
        return "do"
    if intensity >= threshold_intensity("cam", rain_72h) or tilt >= 1 or rain_72h >= 300:
        return "cam"
    if intensity >= threshold_intensity("vang", rain_72h) or rain_72h >= 180:
        return "vang"
    return "an_toan"


@router.get("/dashboard/supplies")
async def supplies(codes: list[str] = Depends(area_scope("resource", "view"))):
    """Vật tư theo kho/nhóm: hiện có vs định mức (phần thiếu hụt để vẽ cột chồng)."""
    rows = await fetch_all(
        f"""SELECT w.code, w.name, w.level, i.category,
                   sum(inv.quantity) AS quantity, sum(inv.safety_quota) AS quota,
                   round(100.0 * sum(inv.quantity) / NULLIF(sum(inv.safety_quota), 0))::int AS pct
              FROM resources.inventory inv
              JOIN resources.items i ON i.code = inv.item_code
              JOIN resources.warehouses w ON w.id = inv.warehouse_id
             WHERE i.category IN ('luong_thuc', 'nuoc_uong', 'do_dung') AND {area_clause('w.location', codes)}
             GROUP BY w.code, w.name, w.level, i.category
             ORDER BY array_position(ARRAY['tinh', 'cum', 'xa', 'da_chien'], w.level), w.code""",
        {"codes": codes},
    )
    out: dict[str, dict] = {}
    for r in rows:
        w = out.setdefault(r["code"], {"code": r["code"], "name": r["name"], "level": r["level"]})
        pct = min(r["pct"] or 0, 100)
        w[r["category"]] = pct
        w[f"{r['category']}_thieu"] = max(0, 100 - pct)
    return list(out.values())


@router.get("/dashboard/logs")
async def logs(limit: int = 40, codes: list[str] = Depends(MON)):
    return await fetch_all(
        f"""SELECT id, time, category, severity, message FROM operations.event_logs e
             WHERE e.admin_unit_id IS NULL OR {unit_clause('e.admin_unit_id', codes)}
             ORDER BY time DESC LIMIT :l""",
        {"l": limit, "codes": codes},
    )
