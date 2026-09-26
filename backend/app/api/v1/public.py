"""API công khai cho người dân (không cần đăng nhập): /api/v1/public/*

Nguyên tắc:
- CHỈ ĐỌC, cache ngắn (Redis) để chịu tải lúc thiên tai, giới hạn tần suất theo IP (app/infra/ratelimit.py).
- Chỉ trả trường được phép công khai: KHÔNG có vị trí lực lượng, kho vật tư, số điện thoại cán bộ / người gửi,
  nội dung phiếu SOS. SOS chỉ trả số liệu tổng hợp theo xã.
- Cảnh báo chỉ gồm lệnh ĐÃ PHÊ DUYỆT & PHÁT. Phản ánh chỉ gồm phản ánh ĐÃ DUYỆT.
"""

from __future__ import annotations

import html

from fastapi import APIRouter, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field

from app.api.v1.reports import _serve_photo
from app.config import settings
from app.db import fetch_all, fetch_one
from app.infra.cache import cached
from app.services.landslides import get_landslides_overview
from app.services.reports import CATEGORY, ReportError, create_report, public_photo_url, verify_turnstile
from app.services.reservoirs import get_reservoirs_overview
from app.services.safe_routing import haversine_km, plan_route
from app.services.simulator import alarm_level
from app.services.tracking import track_ticket

router = APIRouter(prefix="/public", tags=["Công khai"])

NATIONAL_HOTLINES = [
    {"number": "112", "name": "Tìm kiếm cứu nạn"},
    {"number": "114", "name": "Cứu nạn cứu hộ – Phòng cháy chữa cháy"},
    {"number": "115", "name": "Cấp cứu y tế"},
    {"number": "113", "name": "Công an"},
]
LEVEL_LABEL = ["Dưới báo động I", "Trên báo động I", "Trên báo động II", "Trên báo động III"]


@router.get("/overview")
async def overview():
    async def build():
        rain = await fetch_one(
            """WITH h AS (SELECT r.station_id, time_bucket('1 hour', r.time) AS b, avg(r.value) AS v
                            FROM iot_telemetry.sensor_readings r JOIN iot_telemetry.monitoring_stations s ON s.id = r.station_id
                           WHERE s.type = 'luong_mua' AND r.time > now() - interval '24 hours' GROUP BY r.station_id, b),
                    t AS (SELECT station_id, sum(v) AS mm FROM h GROUP BY station_id)
               SELECT round(avg(mm)::numeric, 1)::float AS avg_24h, round(max(mm)::numeric, 1)::float AS max_24h FROM t"""
        )
        rivers = await fetch_all(
            """SELECT s.name, s.river, s.alarm_thresholds AS thr,
                      (SELECT round(value::numeric, 2)::float FROM iot_telemetry.sensor_readings r
                        WHERE r.station_id = s.id ORDER BY time DESC LIMIT 1) AS value
                 FROM iot_telemetry.monitoring_stations s WHERE s.type = 'muc_nuoc' ORDER BY s.id"""
        )
        for r in rivers:
            lv = alarm_level(r["value"] or 0, r.pop("thr") or {})
            r["level"], r["level_label"] = lv, LEVEL_LABEL[lv]
        sos = await fetch_all(
            """SELECT u.code, u.name, count(*) FILTER (WHERE t.status <> 'hoan_thanh') AS dang_xu_ly,
                      count(*) FILTER (WHERE t.status = 'hoan_thanh' AND t.resolved_at > now() - interval '24 hours') AS da_xu_ly_24h
                 FROM operations.sos_tickets t JOIN spatial_admin.administrative_units u ON u.id = t.admin_unit_id
                WHERE t.received_at > now() - interval '72 hours'
                GROUP BY u.code, u.name HAVING count(*) FILTER (WHERE t.status <> 'hoan_thanh') > 0
                    OR count(*) FILTER (WHERE t.status = 'hoan_thanh' AND t.resolved_at > now() - interval '24 hours') > 0
                ORDER BY dang_xu_ly DESC"""
        )
        evac = await fetch_one(
            """SELECT count(*) AS sites, sum(capacity) AS capacity, sum(current_occupancy) AS occupancy
                 FROM resources.evacuation_sites"""
        )
        alerts = await fetch_one(
            """SELECT count(*) AS active, max(severity) FILTER (WHERE severity = 'do') AS has_red
                 FROM communications.alert_broadcasts WHERE status IN ('sending', 'sent') AND COALESCE(sent_at, approved_at) > now() - interval '48 hours'"""
        )
        forecast = await fetch_one(
            """SELECT round(max(t.mm)::numeric)::int AS max_24h, (array_agg(t.name ORDER BY t.mm DESC))[1] AS max_name
                 FROM (SELECT u.name, sum(a.precip_p50) AS mm FROM iot_telemetry.area_forecasts a
                         JOIN spatial_admin.administrative_units u ON u.id = a.admin_unit_id
                        WHERE a.model = 'BLEND' AND a.time > now() AND a.time <= now() + interval '24 hours'
                        GROUP BY u.name) t"""
        )
        res_overview = await get_reservoirs_overview()
        ls_overview = await get_landslides_overview()
        return {
            "rain": rain,
            "rivers": rivers,
            "sos_by_commune": sos,
            "evacuation": evac,
            "alerts": {"active": alerts["active"], "has_red": bool(alerts["has_red"])},
            "forecast_24h": forecast,
            "reservoirs": {
                "total": res_overview["total_reservoirs"],
                "spill_count": res_overview["spill_count"],
                "emergency_count": res_overview["emergency_count"],
                "total_outflow": res_overview["total_outflow_m3s"],
            },
            "landslides": {
                "total": ls_overview["total_points"],
                "blocked_count": ls_overview["blocked_count"],
                "warning_count": ls_overview["warning_count"],
                "safe_count": ls_overview["safe_count"],
            },
            "generated_at": (await fetch_one("SELECT now() AS t"))["t"],
        }

    return await cached("public:overview", 30, build)


@router.get("/map")
async def public_map():
    async def build():
        stations = await fetch_all(
            """SELECT s.id, s.name, s.type, s.river, s.unit, s.alarm_thresholds AS thresholds,
                      ST_Y(s.location) AS lat, ST_X(s.location) AS lon,
                      (SELECT round(value::numeric, 2)::float FROM iot_telemetry.sensor_readings r
                        WHERE r.station_id = s.id ORDER BY time DESC LIMIT 1) AS value
                 FROM iot_telemetry.monitoring_stations s"""
        )
        zones = await fetch_all(
            """SELECT type, level, name, depth_m, ST_AsGeoJSON(ST_SimplifyPreserveTopology(geom, 0.0003), 5)::json AS geom
                 FROM iot_telemetry.hazard_zones WHERE valid_until > now()"""
        )
        points = await fetch_all(
            """SELECT type, level, name, description, reported_at, ST_Y(location) AS lat, ST_X(location) AS lon
                 FROM iot_telemetry.hazard_points WHERE active"""
        )
        evac = await fetch_all(
            """SELECT e.id, e.name, e.site_type, e.capacity, e.current_occupancy, u.name AS admin_name,
                      ST_Y(e.location) AS lat, ST_X(e.location) AS lon
                 FROM resources.evacuation_sites e LEFT JOIN spatial_admin.administrative_units u ON u.id = e.admin_unit_id"""
        )
        roads = await fetch_all(
            """SELECT s.road_name, ST_AsGeoJSON(s.geom, 5)::json AS geom FROM operations.road_segments s
                WHERE EXISTS (SELECT 1 FROM iot_telemetry.hazard_zones z WHERE z.valid_until > now()
                               AND (z.type <> 'ngap' OR z.level = 'do') AND ST_Intersects(z.geom, s.geom))"""
        )
        res_overview = await get_reservoirs_overview()
        ls_overview = await get_landslides_overview()
        return {
            "stations": stations,
            "hazard_zones": zones,
            "hazard_points": points,
            "evacuation_sites": evac,
            "blocked_roads": roads,
            "reports": await _approved_reports(72),
            "reservoirs": res_overview["reservoirs"],
            "landslides": ls_overview["points"],
        }

    return await cached("public:map", 30, build)


async def _approved_reports(hours: int) -> list[dict]:
    rows = await fetch_all(
        """SELECT r.id, r.code, r.category, r.description, r.public_note, r.status, r.created_at,
                  jsonb_array_length(r.photos) AS n_photos, u.name AS admin_name,
                  ST_Y(r.location) AS lat, ST_X(r.location) AS lon
             FROM community.citizen_reports r LEFT JOIN spatial_admin.administrative_units u ON u.id = r.admin_unit_id
            WHERE r.status IN ('da_duyet', 'da_xu_ly') AND r.created_at > now() - make_interval(hours => :h)
            ORDER BY r.created_at DESC LIMIT 200""",
        {"h": hours},
    )
    for r in rows:
        rid = str(r["id"])
        r["category_label"] = CATEGORY.get(r["category"], r["category"])
        r["photos"] = [
            {"thumb": public_photo_url(rid, i, True), "full": public_photo_url(rid, i)}
            for i in range(r.pop("n_photos"))
        ]
    return rows


@router.get("/alerts")
async def alerts(days: int = Query(7, ge=1, le=30)):
    async def build():
        rows = await fetch_all(
            """SELECT b.code, b.title, b.message_body, b.severity, b.channels, COALESCE(b.sent_at, b.approved_at) AS issued_at,
                      b.target_admin_codes, ST_AsGeoJSON(ST_SimplifyPreserveTopology(b.target_polygon, 0.001), 4)::json AS geom
                 FROM communications.alert_broadcasts b
                WHERE b.status IN ('sending', 'sent') AND COALESCE(b.sent_at, b.approved_at) > now() - make_interval(days => :d)
                ORDER BY COALESCE(b.sent_at, b.approved_at) DESC""",
            {"d": days},
        )
        names = {
            u["code"]: u["name"]
            for u in await fetch_all(
                "SELECT code, name FROM spatial_admin.administrative_units WHERE level = 'xa'"
            )
        }
        for r in rows:
            r["areas"] = [names.get(c, c) for c in r.pop("target_admin_codes")]
        return rows

    return await cached(f"public:alerts:{days}", 30, build)


@router.get("/alerts/{code}/share", response_class=HTMLResponse)
async def share_alert(code: str):
    """Trang chia sẻ (thẻ Open Graph cho Zalo / Facebook) — người dùng được chuyển tới cổng công khai."""
    row = await fetch_one(
        """SELECT code, title, message_body FROM communications.alert_broadcasts
            WHERE code = :c AND status IN ('sending', 'sent')""",
        {"c": code},
    )
    if not row:
        raise HTTPException(404, "Không tìm thấy cảnh báo")
    base = settings.public_base_url.rstrip("/")
    target = f"{base}/?canh-bao={html.escape(row['code'])}"
    title = html.escape(f"⚠ {row['title']} – BCH PCTT & TKCN tỉnh Cao Bằng")
    desc = html.escape(row["message_body"][:280])
    return HTMLResponse(
        f"""<!doctype html><html lang="vi"><head><meta charset="utf-8">
<title>{title}</title>
<meta property="og:type" content="article"><meta property="og:title" content="{title}">
<meta property="og:description" content="{desc}"><meta property="og:url" content="{target}">
<meta property="og:site_name" content="Cảnh báo thiên tai tỉnh Cao Bằng"><meta name="description" content="{desc}">
<meta http-equiv="refresh" content="0; url={target}"></head>
<body><p>{desc}</p><p><a href="{target}">Xem trên cổng cảnh báo thiên tai tỉnh Cao Bằng</a></p></body></html>""",
        headers={"Cache-Control": "public, max-age=300"},
    )


@router.get("/forecast/areas")
async def forecast_areas(hours: int = Query(24, description="24 hoặc 72")):
    if hours not in (24, 72):
        raise HTTPException(422, "hours chỉ nhận 24 hoặc 72")

    async def build():
        return await fetch_all(
            """SELECT u.code, u.name, round(sum(a.precip_p10)::numeric, 1)::float AS p10,
                      round(sum(a.precip_p50)::numeric, 1)::float AS p50, round(sum(a.precip_p90)::numeric, 1)::float AS p90,
                      round(max(a.prob_heavy)::numeric, 2)::float AS max_prob_heavy, max(a.issued_at) AS issued_at
                 FROM iot_telemetry.area_forecasts a JOIN spatial_admin.administrative_units u ON u.id = a.admin_unit_id
                WHERE a.model = 'BLEND' AND a.time > now() AND a.time <= now() + make_interval(hours => :h)
                GROUP BY u.code, u.name ORDER BY p50 DESC""",
            {"h": hours},
        )

    return await cached(f"public:forecast:{hours}", 300, build)


@router.get("/forecast/areas/{code}")
async def forecast_area(code: str):
    async def build():
        unit = await fetch_one(
            "SELECT id, code, name FROM spatial_admin.administrative_units WHERE code = :c AND level = 'xa'",
            {"c": code},
        )
        if not unit:
            return None
        rows = await fetch_all(
            """SELECT time, precip_p10, precip_p50, precip_p90, prob_heavy, temp_c, gust_kmh
                 FROM iot_telemetry.area_forecasts WHERE admin_unit_id = :u AND model = 'BLEND' AND time > now() - interval '1 hour'
                ORDER BY time""",
            {"u": unit["id"]},
        )
        return {"unit": {"code": unit["code"], "name": unit["name"]}, "series": rows}

    data = await cached(f"public:forecast:area:{code}", 300, build)
    if data is None:
        raise HTTPException(404, "Không tìm thấy xã")
    return data


@router.get("/locate")
async def locate(lat: float = Query(..., ge=20, le=25), lon: float = Query(..., ge=103, le=108)):
    """“Tôi đang ở đâu?” — xã, mức nguy cơ, mưa dự báo, cảnh báo đang hiệu lực, điểm sơ tán gần nhất."""
    pt = {"lat": lat, "lon": lon}
    unit = await fetch_one(
        """SELECT u.id, u.code, u.name, u.old_district,
                  ST_DWithin(p.geom::geography, ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography, 5000) AS in_province
             FROM spatial_admin.administrative_units u, spatial_admin.administrative_units p
            WHERE u.level = 'xa' AND p.code = 'CB'
            ORDER BY u.geom <-> ST_SetSRID(ST_MakePoint(:lon, :lat), 4326) LIMIT 1""",
        pt,
    )
    if not unit or not unit["in_province"]:
        raise HTTPException(422, "Vị trí nằm ngoài địa bàn tỉnh Cao Bằng")
    hazards = await fetch_all(
        """SELECT type, level, name,
                  round(ST_Distance(geom::geography, ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography))::int AS distance_m
             FROM iot_telemetry.hazard_zones
            WHERE valid_until > now() AND ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography, 3000)
            ORDER BY distance_m""",
        pt,
    )
    fc = await fetch_one(
        """SELECT round(sum(precip_p50)::numeric, 1)::float AS p50, round(sum(precip_p90)::numeric, 1)::float AS p90,
                  round(max(prob_heavy)::numeric, 2)::float AS prob
             FROM iot_telemetry.area_forecasts WHERE admin_unit_id = :u AND model = 'BLEND'
              AND time > now() AND time <= now() + interval '24 hours'""",
        {"u": unit["id"]},
    )
    sites = await fetch_all(
        """SELECT id, name, capacity, current_occupancy, ST_Y(location) AS lat, ST_X(location) AS lon
             FROM resources.evacuation_sites WHERE current_occupancy < capacity
            ORDER BY location <-> ST_SetSRID(ST_MakePoint(:lon, :lat), 4326) LIMIT 3""",
        pt,
    )
    for s in sites:
        s["distance_km"] = round(haversine_km(lat, lon, s["lat"], s["lon"]), 1)
    active_alerts = await fetch_all(
        """SELECT code, title, severity, COALESCE(sent_at, approved_at) AS issued_at FROM communications.alert_broadcasts
            WHERE status IN ('sending', 'sent') AND COALESCE(sent_at, approved_at) > now() - interval '48 hours'
              AND (:code = ANY(target_admin_codes)
                   OR ST_Intersects(target_polygon, ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)))
            ORDER BY issued_at DESC""",
        {**pt, "code": unit["code"]},
    )
    in_zone = [h for h in hazards if h["distance_m"] == 0]
    near = [h for h in hazards if h["distance_m"] > 0]
    if any(h["level"] == "do" for h in in_zone) or any(a["severity"] == "do" for a in active_alerts):
        risk, advice = (
            "cao",
            "Bạn đang ở trong vùng nguy hiểm. Di chuyển ngay đến điểm sơ tán an toàn gần nhất, gọi 112 nếu cần trợ giúp.",
        )
    elif in_zone or near or active_alerts or (fc and (fc["p50"] or 0) >= 50):
        risk, advice = (
            "trung_binh",
            "Theo dõi sát cảnh báo, chuẩn bị đồ dùng thiết yếu, sẵn sàng sơ tán khi có lệnh.",
        )
    else:
        risk, advice = (
            "thap",
            "Chưa ghi nhận nguy cơ tại vị trí của bạn. Tiếp tục theo dõi thông tin chính thức.",
        )
    return {
        "commune": {"code": unit["code"], "name": unit["name"], "district": unit["old_district"]},
        "risk": risk,
        "advice": advice,
        "hazards": hazards,
        "forecast_24h": fc,
        "evacuation_sites": sites,
        "alerts": active_alerts,
    }


@router.get("/route")
async def route(from_lat: float, from_lon: float, to_lat: float, to_lon: float):
    """Đường đi an toàn tới điểm sơ tán (né vùng sạt lở / ngập sâu)."""
    for v, lo, hi in ((from_lat, 20, 25), (to_lat, 20, 25), (from_lon, 103, 108), (to_lon, 103, 108)):
        if not lo <= v <= hi:
            raise HTTPException(422, "Toạ độ ngoài phạm vi")
    return await plan_route(from_lat, from_lon, to_lat, to_lon)


@router.get("/hotlines")
async def hotlines():
    async def build():
        office = await fetch_all(
            """SELECT org, position, phone FROM communications.contacts
                WHERE level = 'tinh' AND org IN ('Văn phòng thường trực BCH', 'BCH PCTT & TKCN tỉnh')
                ORDER BY sort LIMIT 2"""
        )
        return {"national": NATIONAL_HOTLINES, "province": office}

    return await cached("public:hotlines", 3600, build)


@router.get("/reports")
async def public_reports(hours: int = Query(72, ge=1, le=720)):
    return await cached(f"public:reports:{hours}", 30, lambda: _approved_reports(hours))


@router.get("/reports/{report_id}/photos/{idx}")
async def public_report_photo(report_id: str, idx: int, thumb: int = 0):
    return await _serve_photo(report_id, idx, bool(thumb), public=True)


@router.get("/report-categories")
async def report_categories():
    return [{"code": k, "label": v} for k, v in CATEGORY.items()]


@router.post("/reports", status_code=201)
async def submit_report(
    request: Request,
    category: str = Form(...),
    description: str = Form(..., min_length=10, max_length=1000),
    lat: float = Form(...),
    lon: float = Form(...),
    address: str | None = Form(None, max_length=200),
    reporter_name: str | None = Form(None, max_length=100),
    reporter_phone: str | None = Form(None, pattern=r"^[0-9 +().-]{8,20}$"),
    website: str | None = Form(None),  # honeypot — người thật không điền
    turnstile_token: str | None = Form(None),
    photos: list[UploadFile] | None = File(None),
):
    """Người dân gửi phản ánh hiện trường kèm ảnh. Phản ánh chỉ hiển thị công khai sau khi cán bộ duyệt."""
    ip = request.client.host if request.client else None
    if website:
        raise HTTPException(400, "Yêu cầu không hợp lệ")
    if not await verify_turnstile(turnstile_token, ip):
        raise HTTPException(400, "Xác minh chống spam không thành công")
    files = [p for p in (photos or []) if p.filename]
    blobs = []
    for f in files[:4]:
        blobs.append(await f.read(8 * 1024 * 1024 + 1))
    try:
        result = await create_report(
            category=category,
            description=description.strip(),
            lat=lat,
            lon=lon,
            address=address,
            reporter_name=reporter_name,
            reporter_phone=reporter_phone,
            photos=blobs,
            client_ip=ip,
        )
    except ReportError as exc:
        raise HTTPException(422, str(exc)) from exc
    return {
        **result,
        "message": "Đã tiếp nhận phản ánh. Cán bộ sẽ xác minh trước khi hiển thị công khai. "
        "Trường hợp nguy hiểm đến tính mạng, hãy gọi ngay 112.",
    }


class TrackIn(BaseModel):
    code: str = Field(..., min_length=3, max_length=20, description="Mã phiếu SOS-… hoặc PA-…")
    phone: str | None = Field(None, max_length=20, description="SĐT người gửi — bắt buộc nếu phiếu có SĐT")


@router.post("/track")
async def track_public(body: TrackIn):
    """Tra cứu tiến độ 1 phiếu SOS / phản ánh.

    POST (không phải GET) để SĐT không nằm trong URL và log truy cập. Không cache (dữ liệu theo từng người).
    """
    return await track_ticket(body.code, body.phone)


@router.get("/reservoirs")
async def public_reservoirs():
    """Giám sát tình hình vận hành các hồ chứa thủy điện, hồ thủy lợi & cảnh báo xả lũ."""
    return await cached("public:reservoirs", 20, get_reservoirs_overview)


@router.get("/landslides")
async def public_landslides():
    """Giám sát các điểm đen sạt trượt đất đá, lũ quét & trạng thái đường đèo tỉnh Cao Bằng."""
    return await cached("public:landslides", 20, get_landslides_overview)
