"""Bản đồ giám sát tương tác: các lớp dữ liệu GeoJSON, thanh thời gian, phân tích vùng, định tuyến (Phân hệ B)."""

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.area import area_clause, parse_codes
from app.auth import current_user
from app.config import settings
from app.db import fetch_all, fetch_one
from app.infra.cache import cached_view
from app.rbac.authz import NO_MATCH, allowed_codes, forbidden, require_any, restrict_codes
from app.services.broadcast import estimate_audience
from app.services.safe_routing import plan_route

router = APIRouter(prefix="/map", tags=["Bản đồ"])


def fc(rows: list[dict], geom_key: str = "geom") -> dict:
    """Chuyển hàng có cột geojson → FeatureCollection; nếu không có geom thì dựng Point từ lat/lon."""
    features = []
    for r in rows:
        geom = r.pop(geom_key, None) or {"type": "Point", "coordinates": [r["lon"], r["lat"]]}
        features.append({"type": "Feature", "geometry": geom, "properties": r})
    return {"type": "FeatureCollection", "features": features}


@router.get("/layers")
async def layers(requested: list[str] = Depends(parse_codes), user: dict = Depends(current_user)):
    # Mỗi nhóm lớp lọc theo quyền tương ứng (quan trắc / nguồn lực / SOS); thiếu quyền → lớp rỗng
    def scope(obj: str) -> list[str]:
        allowed = allowed_codes(user, obj, "view")
        return NO_MATCH if allowed == [] else restrict_codes(requested, allowed)

    codes = scope("monitoring")
    if codes == NO_MATCH and allowed_codes(user, "monitoring", "view") == []:
        raise forbidden()
    res_codes, sos_codes = scope("resource"), scope("sos")
    # Kết quả chỉ phụ thuộc 3 danh sách xã (đã giao với quyền) → dùng chung giữa cán bộ cùng phạm vi
    return await cached_view(
        "map-layers",
        {"m": codes, "r": res_codes, "s": sos_codes},
        lambda: _layers(codes, res_codes, sos_codes),
    )


async def _layers(codes: list[str], res_codes: list[str], sos_codes: list[str]) -> dict:
    p, pr, ps = {"codes": codes}, {"codes": res_codes}, {"codes": sos_codes}
    stations = await fetch_all(
        f"""SELECT s.id, s.name, s.type, s.river, s.unit, s.alarm_thresholds AS thresholds, ST_Y(s.location) AS lat, ST_X(s.location) AS lon,
                   (SELECT value FROM iot_telemetry.sensor_readings r WHERE r.station_id = s.id ORDER BY time DESC LIMIT 1) AS value
              FROM iot_telemetry.monitoring_stations s WHERE {area_clause('s.location', codes)}""",
        p,
    )
    reservoirs = await fetch_all(
        f"""SELECT id, name, river, capacity_mw, normal_level, current_level, inflow_m3s, outflow_m3s, spill_gates_open, spill_gates,
                   updated_at, ST_Y(location) AS lat, ST_X(location) AS lon
              FROM iot_telemetry.reservoirs WHERE {area_clause('location', codes)}""",
        p,
    )
    hazard_zones = await fetch_all(
        f"""SELECT id, type, level, name, depth_m, source, valid_until, ST_AsGeoJSON(geom, 5)::json AS geom
              FROM iot_telemetry.hazard_zones WHERE valid_until > now() AND {area_clause('geom', codes)}""",
        p,
    )
    hazard_points = await fetch_all(
        f"""SELECT id, type, level, name, description, reported_at, ST_Y(location) AS lat, ST_X(location) AS lon
              FROM iot_telemetry.hazard_points WHERE active AND {area_clause('location', codes)}""",
        p,
    )
    forces = await fetch_all(
        f"""SELECT id, code, name, org_type, commander, contact_phone, radio_freq, personnel_ready, personnel_on_mission, status, skills,
                   ST_Y(location) AS lat, ST_X(location) AS lon
              FROM resources.forces WHERE {area_clause('location', res_codes)}""",
        pr,
    )
    vehicles = await fetch_all(
        f"""SELECT v.id, v.code, v.name, v.vehicle_type, v.category, v.status, v.fuel_level, f.name AS force_name,
                   ST_Y(v.current_location) AS lat, ST_X(v.current_location) AS lon
              FROM resources.vehicles v LEFT JOIN resources.forces f ON f.id = v.force_id
             WHERE {area_clause('v.current_location', res_codes)}""",
        pr,
    )
    warehouses = await fetch_all(
        f"""SELECT w.id, w.code, w.name, w.level, w.phone,
                   (SELECT u.code FROM spatial_admin.administrative_units u WHERE u.id = w.admin_unit_id) AS admin_code, ST_Y(w.location) AS lat, ST_X(w.location) AS lon,
                   COALESCE(json_agg(json_build_object('category', i.category, 'pct',
                            round(100.0 * inv.quantity / NULLIF(inv.safety_quota, 0))))
                            FILTER (WHERE inv.item_code IS NOT NULL), '[]') AS items,
                   round(100.0 * sum(inv.quantity) / NULLIF(sum(inv.safety_quota), 0))::int AS pct
              FROM resources.warehouses w
              -- LEFT JOIN: kho chưa có dòng tồn kho vẫn hiện trên bản đồ (pct = null)
              LEFT JOIN resources.inventory inv ON inv.warehouse_id = w.id
              LEFT JOIN resources.items i ON i.code = inv.item_code
             WHERE {area_clause('w.location', res_codes)}
             GROUP BY w.id""",
        pr,
    )
    for w in warehouses:  # gộp % theo nhóm hàng cho biểu đồ tròn trong popup
        groups: dict[str, list] = {}
        for it in w.pop("items"):
            groups.setdefault(it["category"], []).append(min(it["pct"] or 0, 150))
        w["categories"] = {k: round(sum(v) / len(v)) for k, v in groups.items()}
    evac = await fetch_all(
        f"""SELECT id, name, site_type, capacity, current_occupancy, contact_phone, ST_Y(location) AS lat, ST_X(location) AS lon
              FROM resources.evacuation_sites WHERE {area_clause('location', res_codes)}""",
        pr,
    )
    sos = await fetch_all(
        f"""SELECT id, code, incident_type, priority, status, trapped_count, address, source, received_at, raw_message,
                   (SELECT u.code FROM spatial_admin.administrative_units u WHERE u.id = admin_unit_id) AS admin_code,
                   ST_Y(location) AS lat, ST_X(location) AS lon
              FROM operations.sos_tickets WHERE status <> 'hoan_thanh' AND {area_clause('location', sos_codes)}""",
        ps,
    )
    cameras = await fetch_all(
        f"""SELECT id, name, stream_url, ST_Y(location) AS lat, ST_X(location) AS lon
              FROM iot_telemetry.cameras WHERE {area_clause('location', codes)}""",
        p,
    )
    routes = await fetch_all(
        f"""SELECT o.id, o.ticket_id, o.status, o.progress, o.eta, o.route_safe, f.name AS force_name, t.code AS ticket_code,
                  ST_AsGeoJSON(o.route_geom, 5)::json AS geom
             FROM operations.dispatch_orders o JOIN operations.sos_tickets t ON t.id = o.ticket_id
             LEFT JOIN resources.forces f ON f.id = o.force_id
            WHERE o.status IN ('dang_di', 'da_den') AND {area_clause('t.location', sos_codes)}""",
        ps,
    )
    roads = await fetch_all(
        """SELECT s.id, s.road_name, EXISTS (SELECT 1 FROM iot_telemetry.hazard_zones z WHERE z.valid_until > now()
                                                AND (z.type <> 'ngap' OR z.level = 'do') AND ST_Intersects(z.geom, s.geom)) AS blocked,
                  ST_AsGeoJSON(s.geom, 5)::json AS geom FROM operations.road_segments s"""
    )
    return {
        "stations": fc(stations),
        "reservoirs": fc(reservoirs),
        "hazard_zones": fc(hazard_zones),
        "hazard_points": fc(hazard_points),
        "forces": fc(forces),
        "vehicles": fc(vehicles),
        "warehouses": fc(warehouses),
        "evacuation_sites": fc(evac),
        "sos": fc(sos),
        "cameras": fc(cameras),
        "routes": fc(routes),
        "roads": fc(roads),
    }


@router.get("/timeline")
async def timeline(offset_h: int = 0, _: dict = Depends(require_any("monitoring", "view"))):
    """Giá trị các trạm tại thời điểm (hiện tại + offset): quá khứ dùng số đo, tương lai dùng dự báo.
    Kèm hệ số ngập (0..1.6) để phóng to/thu nhỏ lớp vùng ngập theo diễn biến lũ."""
    at = datetime.now(UTC) + timedelta(hours=offset_h)
    if offset_h <= 0:
        rows = await fetch_all(
            """SELECT s.id, s.type, round(avg(r.value)::numeric, 2)::float AS value
                 FROM iot_telemetry.monitoring_stations s JOIN iot_telemetry.sensor_readings r ON r.station_id = s.id
                WHERE r.time BETWEEN CAST(:at AS timestamptz) - interval '30 minutes' AND CAST(:at AS timestamptz) + interval '30 minutes'
                GROUP BY s.id, s.type""",
            {"at": at},
        )
    else:
        rows = await fetch_all(
            """SELECT DISTINCT ON (f.station_id) f.station_id AS id, s.type, f.value
                 FROM iot_telemetry.forecasts f JOIN iot_telemetry.monitoring_stations s ON s.id = f.station_id
                WHERE f.time >= CAST(:at AS timestamptz) - interval '30 minutes'
                ORDER BY f.station_id, f.time""",
            {"at": at},
        )
    wl = await fetch_one(
        """SELECT (s.alarm_thresholds->>'bd1')::float AS bd1, (s.alarm_thresholds->>'bd3')::float AS bd3
             FROM iot_telemetry.monitoring_stations s WHERE s.id = 'CB-WL-01'"""
    )
    main = next((r["value"] for r in rows if r["id"] == "CB-WL-01"), None)
    flood_factor = None
    # Trạm nhập lại có thể thiếu ngưỡng / ngưỡng không tăng dần → không tính hệ số ngập (thay vì lỗi 500)
    if (
        main is not None
        and wl
        and wl["bd1"] is not None
        and wl["bd3"] is not None
        and wl["bd3"] - wl["bd1"] + 1 > 0
    ):
        flood_factor = round(max(0.0, min(1.6, (main - (wl["bd1"] - 1)) / (wl["bd3"] - wl["bd1"] + 1))), 2)
    return {
        "time": at,
        "offset_h": offset_h,
        "values": {r["id"]: r["value"] for r in rows},
        "flood_factor": flood_factor,
    }


@router.get("/storm-track")
async def storm_track(_: dict = Depends(require_any("monitoring", "view"))):
    """Quỹ đạo bão / ATNĐ. Chưa nối nguồn chính thức (Trung tâm Dự báo KTTV quốc gia) → chạy thật trả 404: quỹ đạo dưới
    đây là KỊCH BẢN của bộ mô phỏng (mốc giờ tính theo hiện tại), bật lớp giữa bão thật mà thấy nó là chỉ huy sai."""
    if not settings.simulator:
        raise HTTPException(404, "Chưa kết nối nguồn dữ liệu quỹ đạo bão chính thức")
    now = datetime.now(UTC).replace(minute=0, second=0, microsecond=0)
    pts = [
        (-24, 20.9, 107.9, 118, "Bão cấp 11"),
        (-18, 21.3, 107.2, 102, "Bão cấp 10"),
        (-12, 21.8, 106.7, 75, "ATNĐ"),
        (-6, 22.3, 106.4, 55, "Vùng áp thấp"),
        (0, 22.7, 106.0, 45, "Vùng áp thấp"),
        (6, 23.1, 105.5, 35, "Suy yếu"),
        (12, 23.5, 105.0, 30, "Tan dần"),
    ]
    return {
        "name": "Hoàn lưu bão số 3 (kịch bản mô phỏng)",
        "simulated": True,
        "points": [
            {
                "time": now + timedelta(hours=h),
                "lat": la,
                "lon": lo,
                "wind_kmh": w,
                "label": lb,
                "forecast": h > 0,
            }
            for h, la, lo, w, lb in pts
        ],
    }


class AreaIn(BaseModel):
    polygon: dict


@router.post("/area-stats")
async def area_stats(body: AreaIn, _: dict = Depends(require_any("monitoring", "view"))):
    """Khoanh vùng: đếm dân cư, hộ, thuê bao, SOS, lực lượng, điểm sơ tán trong đa giác vẽ trên bản đồ."""
    import json

    audience = await estimate_audience([], body.polygon)
    counts = await fetch_one(
        """WITH g AS (SELECT ST_SetSRID(ST_GeomFromGeoJSON(:p), 4326) AS g)
           SELECT (SELECT count(*) FROM operations.sos_tickets t, g WHERE t.status <> 'hoan_thanh' AND ST_Contains(g.g, t.location)) AS sos_open,
                  (SELECT count(*) FROM resources.forces f, g WHERE ST_Contains(g.g, f.location)) AS forces,
                  (SELECT COALESCE(sum(capacity - current_occupancy), 0) FROM resources.evacuation_sites e, g WHERE ST_Contains(g.g, e.location)) AS evac_free,
                  (SELECT count(*) FROM iot_telemetry.hazard_zones z, g WHERE z.valid_until > now() AND ST_Intersects(g.g, z.geom)) AS hazard_zones""",
        {"p": json.dumps(body.polygon)},
    )
    return {**audience, **counts}


class RouteIn(BaseModel):
    from_lat: float
    from_lon: float
    to_lat: float
    to_lon: float


@router.post("/route")
async def route(body: RouteIn, _: dict = Depends(require_any("monitoring", "view"))):
    return await plan_route(body.from_lat, body.from_lon, body.to_lat, body.to_lon)
