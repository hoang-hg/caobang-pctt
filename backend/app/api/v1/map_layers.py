"""Bản đồ giám sát tương tác: các lớp dữ liệu GeoJSON, thanh thời gian, phân tích vùng, định tuyến (Phân hệ B)."""

import json
import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.area import area_clause, parse_codes
from app.auth import audit, current_user
from app.config import settings
from app.db import execute, fetch_all, fetch_one
from app.infra.cache import cached_view, invalidate
from app.rbac import domains, scope_loaders
from app.rbac.authz import (
    NO_MATCH,
    allowed_codes,
    can,
    forbidden,
    require_any,
    require_permission,
    restrict_codes,
)
from app.services import map_ops
from app.services.broadcast import estimate_audience
from app.services.events import log_event
from app.services.readings import LATEST_COLS, LATEST_JOIN, vn_time
from app.services.reports import CATEGORY as REPORT_CATEGORY
from app.services.reservoirs import OPERATING_STALE, classify_reservoir_status
from app.services.safe_routing import plan_route
from app.ws.hub import hub

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
    res_codes, sos_codes, rep_codes = scope("resource"), scope("sos"), scope("report")
    # Kết quả chỉ phụ thuộc 4 danh sách xã (đã giao với quyền) → dùng chung giữa cán bộ cùng phạm vi
    return await cached_view(
        "map-layers",
        {"m": codes, "r": res_codes, "s": sos_codes, "rp": rep_codes},
        lambda: _layers(codes, res_codes, sos_codes, rep_codes),
    )


async def _layers(codes: list[str], res_codes: list[str], sos_codes: list[str], rep_codes: list[str]) -> dict:
    p, pr, ps = {"codes": codes}, {"codes": res_codes}, {"codes": sos_codes}
    # Số đo mới nhất + thời điểm + cờ stale (cũ hơn STALE_MINUTES) như cổng công khai: trạm mất tín hiệu KHÔNG được hiện
    # số cũ như đang đo (trước đây lấy số đo cuối cùng không giới hạn thời gian — trạm chết ở BĐ III đỏ mãi)
    stations = await fetch_all(
        f"""SELECT s.id, s.name, s.type, s.river, s.unit, s.alarm_thresholds AS thresholds, ST_Y(s.location) AS lat, ST_X(s.location) AS lon,
                   {LATEST_COLS}
              FROM iot_telemetry.monitoring_stations s {LATEST_JOIN} WHERE {area_clause('s.location', codes)}""",
        p,
    )
    reservoirs = await fetch_all(
        f"""SELECT id, name, river, capacity_mw, normal_level, current_level, inflow_m3s, outflow_m3s, spill_gates_open, spill_gates,
                   updated_at, operating_at, ST_Y(location) AS lat, ST_X(location) AS lon
              FROM iot_telemetry.reservoirs WHERE {area_clause('location', codes)}""",
        p,
    )
    # Trạng thái hồ theo đúng cách tính của Dashboard / cổng công khai (services/reservoirs.py) → biểu tượng cùng thang màu:
    # xả lũ lớn Đỏ, xả điều tiết Cam, chưa xả Xanh, chưa có số liệu vận hành Xám (không vẽ như hồ "bình thường")
    now = datetime.now(UTC)
    for r in reservoirs:
        r["status_code"], r["status_label"], _ = classify_reservoir_status(r)
        r["stale"] = r["operating_at"] is not None and now - r["operating_at"] > OPERATING_STALE
    hazard_zones = await fetch_all(
        f"""SELECT id, type, level, name, depth_m, source, valid_until, ST_AsGeoJSON(geom, 5)::json AS geom
              FROM iot_telemetry.hazard_zones WHERE valid_until > now() AND {area_clause('geom', codes)}""",
        p,
    )
    hazard_points = await fetch_all(
        f"""SELECT h.id, h.type, h.level, h.name, h.description, h.reported_at, h.source, h.expires_at, h.report_id,
                   (SELECT u.code FROM spatial_admin.administrative_units u WHERE u.id = h.admin_unit_id) AS admin_code,
                   ST_Y(h.location) AS lat, ST_X(h.location) AS lon
              FROM iot_telemetry.hazard_points h
             WHERE {map_ops.active_point_sql('h')} AND {area_clause('h.location', codes)}""",
        p,
    )
    # Vùng ngập theo kịch bản: ngưỡng hiệu lực = mực nước cụ thể hoặc ngưỡng BĐ hiện hành của trạm (trạm chưa khai báo
    # ngưỡng đó → trigger NULL, giao diện ghi "chưa xác định ngưỡng"). Giao diện so với mực nước trạm để bật / tắt vùng.
    scenarios = await fetch_all(
        f"""SELECT f.id, f.code, f.name, f.station_id, s.name AS station_name, f.alarm_level, f.depth_m,
                   COALESCE(f.trigger_level, (s.alarm_thresholds ->> ('bd' || f.alarm_level))::float) AS trigger,
                   ST_AsGeoJSON(ST_SimplifyPreserveTopology(f.geom, 0.0001), 5)::json AS geom
              FROM iot_telemetry.flood_scenarios f JOIN iot_telemetry.monitoring_stations s ON s.id = f.station_id
             WHERE {area_clause('f.geom', codes)}
             ORDER BY trigger NULLS LAST, f.code""",
        p,
    )
    # Phản ánh của người dân 72 giờ qua (chờ duyệt + đã duyệt / đã xử lý), cho người có quyền xem phản ánh
    reports = await fetch_all(
        f"""SELECT r.id, r.code, r.category, r.status, r.created_at, left(r.description, 240) AS description,
                   r.address, r.hamlet_name, jsonb_array_length(r.photos) AS n_photos, r.sos_ticket_id IS NOT NULL AS to_sos,
                   (SELECT u.code FROM spatial_admin.administrative_units u WHERE u.id = r.admin_unit_id) AS admin_code,
                   (SELECT u.name FROM spatial_admin.administrative_units u WHERE u.id = r.admin_unit_id) AS admin_name,
                   EXISTS (SELECT 1 FROM iot_telemetry.hazard_points h
                            WHERE h.report_id = r.id AND {map_ops.active_point_sql('h')}) AS has_incident,
                   ST_Y(r.location) AS lat, ST_X(r.location) AS lon
              FROM community.citizen_reports r
             WHERE r.status IN ('cho_duyet', 'da_duyet', 'da_xu_ly') AND r.created_at > now() - interval '72 hours'
               AND {area_clause('r.location', rep_codes)}
             ORDER BY r.created_at DESC LIMIT 300""",
        {"codes": rep_codes},
    )
    for r in reports:
        r["category_label"] = REPORT_CATEGORY.get(r["category"], r["category"])
        r["incident_type"] = map_ops.REPORT_TO_INCIDENT.get(r["category"])
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
        f"""SELECT id, name, site_type, capacity, current_occupancy, contact_phone, ST_Y(location) AS lat, ST_X(location) AS lon,
                   (SELECT u.code FROM spatial_admin.administrative_units u WHERE u.id = admin_unit_id) AS admin_code
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
        "flood_scenarios": fc(scenarios),
        "reports": fc(reports),
        "forces": fc(forces),
        "vehicles": fc(vehicles),
        "warehouses": fc(warehouses),
        "evacuation_sites": fc(evac),
        "sos": fc(sos),
        "cameras": fc(cameras),
        "routes": fc(routes),
        "roads": fc(roads),
    }


# Mô hình dự báo ưu tiên trên thanh thời gian: bản tin KTTV (trực ban nhập) > HEC-HMS (bộ mô phỏng) > mưa 3 giờ tới
FORECAST_PRIORITY = {"KTTV": 0, "HEC-HMS": 1, "QPF-NOWCAST": 2}


@router.get("/timeline")
async def timeline(offset_h: int = 0, _: dict = Depends(require_any("monitoring", "view"))):
    """Giá trị các trạm tại thời điểm (hiện tại + offset): quá khứ = trung bình số đo ±30 phút; tương lai = nội suy giữa
    số đo mới nhất và các mốc dự báo của trạm. Không có số liệu ở thời điểm đó → trạm vắng trong ``values`` (giao diện
    hiện xám), không kéo dài số cuối. Lớp vùng ngập theo kịch bản bật / tắt theo chính các giá trị này (trước đây: một
    "hệ số ngập" gắn cứng vào trạm mẫu CB-WL-01, chỉ làm đậm / nhạt vùng vẽ sẵn — chạy thật không có tác dụng)."""
    at = datetime.now(UTC) + timedelta(hours=offset_h)
    values: dict[str, float] = {}
    if offset_h <= 0:
        rows = await fetch_all(
            """SELECT s.id, round(avg(r.value)::numeric, 2)::float AS value
                 FROM iot_telemetry.monitoring_stations s JOIN iot_telemetry.sensor_readings r ON r.station_id = s.id
                WHERE r.time BETWEEN CAST(:at AS timestamptz) - interval '30 minutes' AND CAST(:at AS timestamptz) + interval '30 minutes'
                GROUP BY s.id""",
            {"at": at},
        )
        values = {r["id"]: r["value"] for r in rows}
    else:
        rows = await fetch_all(
            """SELECT station_id, model, time, value FROM iot_telemetry.forecasts
                WHERE time BETWEEN now() - interval '1 hour' AND CAST(:at AS timestamptz) + interval '12 hours'
                ORDER BY station_id, time""",
            {"at": at},
        )
        latest = await fetch_all(
            f"SELECT s.id, {LATEST_COLS} FROM iot_telemetry.monitoring_stations s {LATEST_JOIN}"
        )
        anchors = {
            r["id"]: (r["time"], r["value"]) for r in latest if r["value"] is not None and not r["stale"]
        }
        series: dict[str, dict[str, list]] = {}
        for r in rows:
            series.setdefault(r["station_id"], {}).setdefault(r["model"], []).append((r["time"], r["value"]))
        for sid, by_model in series.items():
            model = min(by_model, key=lambda m: FORECAST_PRIORITY.get(m, 9))
            # Mực nước: nối số đo mới nhất → mốc dự báo đầu tiên; mưa giờ thì không (cường độ giờ không nội suy từ số đo)
            anchor = [anchors[sid]] if sid in anchors and model != "QPF-NOWCAST" else []
            value = map_ops.value_at(by_model[model] + anchor, at)
            if value is not None:
                values[sid] = value
    return {"time": at, "offset_h": offset_h, "values": values}


# ------------------------------------------------------------------ bão / áp thấp nhiệt đới


def _storm_out(row: dict) -> dict:
    issued = row["issued_at"]
    points = sorted(row["points"], key=lambda p: p["time"])
    return {
        "id": str(row["id"]),
        "name": row["name"],
        "issued_at": issued,
        "source": row["source"],
        "simulated": False,
        "points": [
            {
                **p,
                "label": map_ops.storm_class(p.get("wind_level")),
                "forecast": datetime.fromisoformat(p["time"]) > issued,
            }
            for p in points
        ],
    }


def _simulated_storm() -> dict:
    """Kịch bản trình diễn của bộ mô phỏng (mốc giờ tính theo hiện tại) — tên luôn ghi "kịch bản mô phỏng"."""
    now = datetime.now(UTC).replace(minute=0, second=0, microsecond=0)
    pts = [  # giờ, vĩ độ, kinh độ, cấp gió, bán kính gió mạnh cấp 6 (km)
        (-24, 20.9, 107.9, 11, 180),
        (-18, 21.3, 107.2, 10, 150),
        (-12, 21.8, 106.7, 7, 100),
        (-6, 22.3, 106.4, 6, 80),
        (0, 22.7, 106.0, 5, None),
        (6, 23.1, 105.5, 5, None),
        (12, 23.5, 105.0, 4, None),
    ]
    return {
        "id": None,
        "name": "Hoàn lưu bão số 3 (kịch bản mô phỏng)",
        "issued_at": now,
        "source": None,
        "simulated": True,
        "points": [
            {
                "time": (now + timedelta(hours=h)).isoformat(),
                "lat": la,
                "lon": lo,
                "wind_level": w,
                "gust_level": None,
                "radius_km": rk,
                "label": map_ops.storm_class(w),
                "forecast": h > 0,
            }
            for h, la, lo, w, rk in pts
        ],
    }


@router.get("/storm-track")
async def storm_track(_: dict = Depends(require_any("monitoring", "view"))):
    """Bão / ATNĐ đang theo dõi theo bản tin trực ban nhập (POST /map/storm-bulletins); bão có mốc cuối đã qua 24 giờ tự
    ẩn. Không có bản tin: bộ mô phỏng trả kịch bản trình diễn, chạy thật trả 404 — giao diện khoá lớp và ghi lý do (lớp
    trống dễ bị hiểu là "không có bão")."""
    rows = await fetch_all(
        """SELECT id, name, issued_at, source, points FROM iot_telemetry.storm_bulletins
            WHERE active ORDER BY issued_at DESC"""
    )
    cutoff = datetime.now(UTC) - timedelta(hours=24)
    storms = [s for s in map(_storm_out, rows) if datetime.fromisoformat(s["points"][-1]["time"]) > cutoff]
    if storms:
        return {"storms": storms}
    if settings.simulator:
        return {"storms": [_simulated_storm()]}
    raise HTTPException(404, "Chưa có bản tin bão đang theo dõi")


def _uuid(value: str) -> str:
    try:
        return str(uuid.UUID(value))
    except ValueError:
        raise HTTPException(404, "Không tìm thấy") from None


@router.post("/storm-bulletins", status_code=201)
async def create_storm_bulletin(
    body: map_ops.StormBulletinIn, user: dict = Depends(require_permission("monitoring", "update"))
):
    """Trực ban nhập bản tin bão / ATNĐ của Trung tâm Dự báo KTTV quốc gia (chưa có kết nối tự động): vị trí tâm đã qua,
    hiện tại và các mốc dự báo. Bản tin mới cùng tên thay bản đang theo dõi."""
    now = datetime.now(UTC)
    if problem := map_ops.storm_problem(body, now):
        raise HTTPException(422, problem)
    points = sorted(
        ({**p.model_dump(mode="json"), "time": p.time.astimezone(UTC).isoformat()} for p in body.points),
        key=lambda p: p["time"],
    )
    row = await fetch_one(
        """WITH old AS (UPDATE iot_telemetry.storm_bulletins SET active = false
                         WHERE active AND lower(name) = lower(:n) RETURNING id)
           INSERT INTO iot_telemetry.storm_bulletins (name, issued_at, source, points, created_by)
           VALUES (:n, :i, :s, CAST(:p AS jsonb), CAST(:u AS uuid))
           RETURNING id, name, issued_at, source, points""",
        {
            "n": body.name.strip(),
            "i": body.issued_at,
            "s": body.source,
            "p": json.dumps(points),
            "u": str(user["id"]),
        },
    )
    out = _storm_out(row)
    current = [p for p in body.points if p.time <= body.issued_at + timedelta(hours=1)]
    c = max(current, key=lambda p: p.time)
    await audit(user, "storm.bulletin", "storm", out["id"], {"name": out["name"], "points": len(points)})
    await hub.publish("storm.updated", {"id": out["id"]})
    await log_event(
        f"Bản tin {out['name']}: tâm lúc {vn_time(c.time)} ở {c.lat:.1f}°N {c.lon:.1f}°E, "
        f"{map_ops.storm_class(c.wind_level).lower()}"
        + (f" cấp {c.wind_level}" if c.wind_level is not None else "")
        + (f", giật cấp {c.gust_level}" if c.gust_level is not None else "")
        + f"; {sum(p.time > body.issued_at for p in body.points)} mốc dự báo"
        + (f" — nguồn: {body.source}" if body.source else "")
        + f" ({user['full_name']})",
        "canh_bao",
        "warning",
    )
    return out


@router.delete("/storm-bulletins/{bulletin_id}", status_code=204)
async def end_storm_bulletin(
    bulletin_id: str, user: dict = Depends(require_permission("monitoring", "update"))
):
    """Kết thúc theo dõi (bão tan / ra khỏi khu vực) — lớp quỹ đạo ẩn bản tin này."""
    row = await fetch_one(
        """UPDATE iot_telemetry.storm_bulletins SET active = false
            WHERE id = CAST(:id AS uuid) AND active RETURNING name""",
        {"id": _uuid(bulletin_id)},
    )
    if not row:
        raise HTTPException(404, "Không có bản tin đang theo dõi này")
    await audit(user, "storm.bulletin_end", "storm", bulletin_id, {"name": row["name"]})
    await hub.publish("storm.updated", {"id": bulletin_id})
    await log_event(f"Kết thúc theo dõi {row['name']} ({user['full_name']})", "van_hanh", "info")


# ------------------------------------------------------------------ điểm sự cố cán bộ đánh dấu trên bản đồ


@router.post("/incidents", status_code=201)
async def create_incident(body: map_ops.IncidentIn, user: dict = Depends(require_any("incident", "update"))):
    """Đánh dấu nhanh điểm sự cố (cây đổ, đứt điện, sập cầu, sạt lở…) khi nhận tin qua điện thoại / bộ đàm, hoặc chuyển
    từ phản ánh của người dân. Hiện ngay trên bản đồ điều hành và cổng công khai, chỉ đường cảnh báo khi đi gần; tự ẩn khi
    hết hạn. Quyền theo xã chứa điểm (điểm sát ranh giới: xã gần nhất trong 2 km)."""
    unit = await fetch_one(
        """WITH p AS (SELECT ST_SetSRID(ST_MakePoint(:lon, :lat), 4326) AS g)
           SELECT u.id, u.code, u.name FROM spatial_admin.administrative_units u, p
            WHERE u.level = 'xa' AND ST_DWithin(u.geom::geography, p.g::geography, 2000)
            ORDER BY ST_Distance(u.geom, p.g) LIMIT 1""",
        {"lat": body.lat, "lon": body.lon},
    )
    if not unit:
        raise HTTPException(422, "Điểm nằm ngoài địa bàn tỉnh")
    if not can(user, "incident", "update", domains.domain_of_code(unit["code"]) or "*"):
        raise forbidden()
    report = None
    if body.report_id:
        report = await fetch_one(
            "SELECT id, code, admin_unit_id FROM community.citizen_reports WHERE id = CAST(:id AS uuid)",
            {"id": _uuid(body.report_id)},
        )
        if not report:
            raise HTTPException(404, "Không tìm thấy phản ánh")
        if not can(user, "report", "view", domains.domain_of_unit_id(report["admin_unit_id"])):
            raise forbidden()
    row = await fetch_one(
        """INSERT INTO iot_telemetry.hazard_points
                  (type, level, name, description, admin_unit_id, location, source, expires_at, report_id, created_by)
           VALUES (:t, :l, :n, :d, :u, ST_SetSRID(ST_MakePoint(:lon, :lat), 4326), :src,
                   now() + make_interval(hours => :h), CAST(:r AS uuid), CAST(:by AS uuid))
           RETURNING id, expires_at""",
        {
            "t": body.type,
            "l": body.level,
            "n": body.name.strip(),
            "d": body.description,
            "u": unit["id"],
            "lat": body.lat,
            "lon": body.lon,
            "src": "report" if report else "officer",
            "h": body.hours,
            "r": str(report["id"]) if report else None,
            "by": str(user["id"]),
        },
    )
    pid = str(row["id"])
    await audit(user, "incident.create", "hazard_point", pid, body.model_dump())
    await invalidate("public:")  # cổng công khai hiện điểm ngay (còn cache nginx ≤ 10 giây)
    await hub.publish("hazard.updated", {"id": pid})
    await log_event(
        f"{map_ops.INCIDENT_TYPES[body.type]}: {body.name.strip()} ({unit['name']}), mức "
        f"{map_ops.INCIDENT_LEVEL_VI[body.level]}, hiệu lực tới {vn_time(row['expires_at'])}"
        + (f" — từ phản ánh {report['code']}" if report else "")
        + f" ({user['full_name']})",
        "canh_bao",
        "warning" if body.level in ("do", "cam") else "info",
        admin_unit_id=unit["id"],
        lat=body.lat,
        lon=body.lon,
    )
    return {"id": pid, "expires_at": row["expires_at"], "admin_code": unit["code"]}


@router.post("/incidents/{point_id}/close")
async def close_incident(
    point_id: str,
    user: dict = Depends(require_permission("incident", "update", scope_loaders.hazard_point)),
):
    """Kết thúc sự cố (đã thông đường, đã khắc phục). Điểm nhập từ bản đồ điểm nguy hiểm chính thức không đóng ở đây."""
    row = await fetch_one(
        "SELECT name, source, active FROM iot_telemetry.hazard_points WHERE id = CAST(:id AS uuid)",
        {"id": _uuid(point_id)},
    )
    if row["source"] == "import":
        raise HTTPException(
            422,
            "Điểm theo bản đồ điểm nguy hiểm chính thức — cập nhật bằng Nhập dữ liệu (loại Điểm nguy hiểm)",
        )
    if row["active"]:
        await execute(
            "UPDATE iot_telemetry.hazard_points SET active = false WHERE id = CAST(:id AS uuid)",
            {"id": point_id},
        )
        await audit(user, "incident.close", "hazard_point", point_id, {"name": row["name"]})
        await invalidate("public:")
        await hub.publish("hazard.updated", {"id": point_id})
        await log_event(f"Kết thúc sự cố: {row['name']} ({user['full_name']})", "van_hanh", "info")
    return {"id": point_id, "active": False}


class AreaIn(BaseModel):
    polygon: dict


@router.post("/area-stats")
async def area_stats(body: AreaIn, _: dict = Depends(require_any("monitoring", "view"))):
    """Khoanh vùng: đếm dân cư, hộ, thuê bao, SOS, lực lượng, điểm sơ tán trong đa giác vẽ trên bản đồ."""
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
