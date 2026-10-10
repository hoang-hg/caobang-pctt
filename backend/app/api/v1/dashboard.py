"""Dashboard tổng quan: KPI thời gian thực và dữ liệu biểu đồ (Phân hệ A)."""

import re
import unicodedata
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.area import area_clause, thiessen_ctes, unit_clause
from app.auth import audit
from app.db import execute, fetch_all, fetch_all_no_jit, fetch_one, transaction
from app.infra.cache import cached_view, invalidate
from app.rbac.authz import area_scope, require_any, require_permission
from app.services.events import log_event
from app.services.landslides import get_landslides_overview
from app.services.lite import VN_TZ
from app.services.reservoirs import get_reservoirs_overview
from app.services.simulator import alarm_level
from app.services.sos import NO_TEAM_15M_SQL, OVERDUE_SQL
from app.ws.hub import hub

router = APIRouter(tags=["Dashboard"])
MON = area_scope("monitoring", "view")

LATEST_READINGS = """
SELECT DISTINCT ON (r.station_id) r.station_id, r.value, r.time
  FROM iot_telemetry.sensor_readings r
 WHERE r.time > now() - interval '2 hours'
 ORDER BY r.station_id, r.time DESC
"""


# Truy vấn tổng hợp dùng chung giữa cán bộ cùng phạm vi → cached_view (khoá = mã xã đã giao với quyền + tham số)
@router.get("/dashboard/kpis")
async def kpis(codes: list[str] = Depends(MON)):
    return await cached_view("kpis", {"codes": codes}, lambda: _kpis(codes))


async def _kpis(codes: list[str]) -> dict:
    p = {"codes": codes}
    rain = (
        await fetch_all_no_jit(
            f"""
        WITH h AS (
          SELECT s.id, s.name, time_bucket('1 hour', r.time) AS b, avg(r.value) AS v
            FROM iot_telemetry.sensor_readings r JOIN iot_telemetry.monitoring_stations s ON s.id = r.station_id
           WHERE s.type = 'luong_mua' AND r.time > now() - interval '24 hours' AND {area_clause('s.location', codes)}
           GROUP BY s.id, s.name, b),
        tot AS (SELECT id, name, sum(v) AS mm FROM h GROUP BY id, name),
        {thiessen_ctes(codes)}
        SELECT round(COALESCE(sum(tot.mm * w.m2) / NULLIF(sum(w.m2), 0), avg(tot.mm))::numeric, 1) AS avg_24h,
               CASE WHEN sum(w.m2) > 0 THEN 'thiessen' ELSE 'trung_binh_cong' END AS avg_method,
               count(*) AS stations, round(max(tot.mm)::numeric, 1) AS max_24h,
               (SELECT name FROM tot ORDER BY mm DESC LIMIT 1) AS max_station
          FROM tot LEFT JOIN w USING (id)""",
            p,
        )
    )[0]
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
                   count(*) FILTER (WHERE {OVERDUE_SQL}) AS overdue,
                   count(*) FILTER (WHERE {NO_TEAM_15M_SQL}) AS no_team_15m,
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
                   count(*) FILTER (WHERE vehicle_type IN ('xuong','ca_no','ghe','xe_loi_nuoc') AND status = 'nhiem_vu') AS special_active,
                   -- Máy xúc / máy ủi thông tuyến sau sạt lở (thiên tai chính của Cao Bằng, bên cạnh xuồng, xe lội nước)
                   count(*) FILTER (WHERE vehicle_type IN ('may_xuc','may_ui')) AS heavy_total,
                   count(*) FILTER (WHERE vehicle_type IN ('may_xuc','may_ui') AND status = 'nhiem_vu') AS heavy_active
              FROM resources.vehicles v WHERE {area_clause('v.current_location', codes)}""",
        p,
    )
    # Lọc theo vùng đang xem / phạm vi được giao (codes rỗng = toàn tỉnh) — cùng hàm với tab Hồ chứa / Sạt lở
    # (/dashboard/reservoirs, /dashboard/landslides) nên ô KPI và tab luôn cùng số
    res = await get_reservoirs_overview(codes)
    ls = await get_landslides_overview(codes)
    return {
        "rain": rain,
        "rivers": rivers,
        "evacuation": evac,
        "sos": sos,
        "forces": forces,
        "vehicles": vehicles,
        "reservoirs": {
            "total": res["total_reservoirs"],
            "spill_count": res["spill_count"],
            "emergency_count": res["emergency_count"],
            "no_data_count": res["no_data_count"],  # hồ chưa có số liệu vận hành
            "total_inflow": res["total_inflow_m3s"],
            "total_outflow": res["total_outflow_m3s"],
            "reservoirs": res["reservoirs"],
        },
        "landslides": {
            "total": ls["total_points"],
            "blocked_count": ls["blocked_count"],
            "warning_count": ls["warning_count"],
            "safe_count": ls["safe_count"],
            "no_data_count": ls["no_data_count"],
            "points": ls["points"],
        },
    }


@router.get("/dashboard/reservoirs")
async def reservoirs_in_area(codes: list[str] = Depends(MON)):
    """Hồ chứa trong vùng đang xem / phạm vi được giao — cùng dạng /public/reservoirs (tab Hồ chứa của Tổng quan theo bộ
    lọc địa phương, thiết kế mục F.1; cổng công khai vẫn toàn tỉnh)."""
    return await cached_view("reservoirs", {"codes": codes}, lambda: get_reservoirs_overview(codes))


def _river_key(name: str | None) -> str:
    """Tên sông để so khớp: "sông Bằng Giang" / "Bằng Giang" → "bằng giang" — trạm và hồ nhập từ nguồn khác nhau vẫn khớp
    (bỏ chữ "sông" / "suối" ở đầu, chữ thường, dấu tiếng Việt chuẩn NFC)."""
    key = unicodedata.normalize("NFC", (name or "").strip().lower())
    return re.sub(r"^(sông|suối)\s+", "", key)


@router.get("/dashboard/reservoir-operations")
async def reservoir_operations(
    codes: list[str] = Depends(MON),
    hours: int = Query(48, ge=6, le=168),
    river: str | None = Query(None, max_length=80),
):
    """Diễn biến vận hành hồ chứa trong vùng đang xem (thiết kế A.3 "Hydrograph & Vận hành hồ chứa"): mực nước, cửa xả,
    Q đến / Q xả — giá trị cuối của mỗi khoảng 30 phút. `river` → chỉ hồ trên sông đó (vẽ cạnh biểu đồ thủy văn của trạm
    cùng sông). Lịch sử có từ khi bật bảng reservoir_operations (migration 0020); hồ chưa có số liệu → chuỗi rỗng."""
    return await cached_view(
        "reservoir-operations",
        {"codes": codes, "hours": hours, "river": river},
        lambda: _reservoir_operations(codes, hours, river),
    )


async def _reservoir_operations(codes: list[str], hours: int, river: str | None) -> dict:
    res = [
        r
        for r in (await get_reservoirs_overview(codes))["reservoirs"]
        if not river or _river_key(r["river"]) == _river_key(river)
    ]
    rows = (
        await fetch_all(
            """SELECT reservoir_id, time_bucket('30 minutes', time) AS t,
                      last(current_level, time) AS level, last(spill_gates_open, time) AS gates,
                      last(inflow_m3s, time) AS inflow, last(outflow_m3s, time) AS outflow
                 FROM iot_telemetry.reservoir_operations
                WHERE reservoir_id = ANY(:ids) AND time > now() - make_interval(hours => :h)
                GROUP BY 1, 2 ORDER BY 1, 2""",
            {"ids": [r["id"] for r in res], "h": hours},
        )
        if res
        else []
    )
    series: dict[str, list[dict]] = {}
    for x in rows:
        series.setdefault(x["reservoir_id"], []).append(
            {
                "time": x["t"],
                "level": x["level"],
                "gates": x["gates"],
                "inflow": x["inflow"],
                "outflow": x["outflow"],
            }
        )
    keep = (
        "id",
        "name",
        "river",
        "normal_level",
        "spill_gates",
        "spill_gates_open",
        "status_code",
        "status_label",
    )
    return {
        "hours": hours,
        "reservoirs": [{**{k: r[k] for k in keep}, "series": series.get(r["id"], [])} for r in res],
    }


@router.get("/dashboard/landslides")
async def landslides_in_area(codes: list[str] = Depends(MON)):
    """Điểm đen sạt lở, đường đèo trong vùng đang xem / phạm vi được giao — cùng dạng /public/landslides."""
    return await cached_view("landslides", {"codes": codes}, lambda: get_landslides_overview(codes))


@router.get("/stations")
async def stations(type: str | None = None, codes: list[str] = Depends(MON)):
    return await cached_view("stations", {"type": type, "codes": codes}, lambda: _stations(type, codes))


async def _stations(type: str | None, codes: list[str]) -> list[dict]:
    # prev_*: số đo gần mốc 1 giờ trước số đo mới nhất (45–90 phút) → giao diện tính xu hướng lên / xuống.
    # next_* / eta_*: mức báo động kế tiếp trên số đo hiện tại và lúc đường dự báo chạm mức đó — bản tin KTTV nếu có,
    # không thì đường "HEC-HMS" (chỉ bộ mô phỏng sinh; giao diện ghi rõ "mô phỏng"), như biểu đồ thủy văn.
    return await fetch_all(
        f"""SELECT s.id, s.name, s.type, s.river, s.unit, s.alarm_thresholds AS thresholds, s.status, s.source,
                   ST_Y(s.location) AS lat, ST_X(s.location) AS lon, u.name AS admin_name, l.value, l.time,
                   p.value AS prev_value, p.time AS prev_time,
                   nx.level AS next_level, nx.threshold AS next_threshold, eta.time AS eta_time, eta.model AS eta_model
              FROM iot_telemetry.monitoring_stations s
              LEFT JOIN spatial_admin.administrative_units u ON u.id = s.admin_unit_id
              LEFT JOIN ({LATEST_READINGS}) l ON l.station_id = s.id
              LEFT JOIN LATERAL (
                  SELECT r.value, r.time FROM iot_telemetry.sensor_readings r
                   WHERE r.station_id = s.id
                     AND r.time BETWEEN l.time - interval '90 minutes' AND l.time - interval '45 minutes'
                   ORDER BY abs(extract(epoch FROM (l.time - interval '60 minutes' - r.time))) LIMIT 1
              ) p ON true
              LEFT JOIN LATERAL (
                  SELECT v.level, v.threshold FROM (VALUES
                      (1, (s.alarm_thresholds->>'bd1')::float),
                      (2, (s.alarm_thresholds->>'bd2')::float),
                      (3, (s.alarm_thresholds->>'bd3')::float)) AS v(level, threshold)
                   WHERE s.type = 'muc_nuoc' AND v.threshold IS NOT NULL AND v.threshold > l.value
                   ORDER BY v.level LIMIT 1
              ) nx ON true
              LEFT JOIN LATERAL (
                  SELECT f.time, f.model FROM iot_telemetry.forecasts f
                   WHERE f.station_id = s.id AND f.time > now() AND f.value >= nx.threshold
                     AND f.model = CASE WHEN EXISTS (
                         SELECT 1 FROM iot_telemetry.forecasts k
                          WHERE k.station_id = s.id AND k.model = 'KTTV' AND k.time > now()
                     ) THEN 'KTTV' ELSE 'HEC-HMS' END
                   ORDER BY f.time LIMIT 1
              ) eta ON true
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
        "SELECT time, value, model, issued_at FROM iot_telemetry.forecasts WHERE station_id = :id AND time > now() - interval '1 hour' ORDER BY time",
        {"id": station_id},
    )
    return {"station": station, "observed": observed, "forecast": forecast}


@router.get("/dashboard/rainfall")
async def rainfall(codes: list[str] = Depends(MON), hours: int = 24):
    """Mưa giờ (bình quân lưu vực theo đa giác Thiessen của các trạm trong vùng) + tích lũy + dự báo mô hình 3h."""
    return await cached_view("rainfall", {"codes": codes, "hours": hours}, lambda: _rainfall(codes, hours))


async def _rainfall(codes: list[str], hours: int) -> dict:
    p = {"codes": codes, "h": hours}
    # Mỗi giờ: bình quân theo diện tích (Thiessen) của các trạm có số đo giờ đó — trạm thiếu số liệu giờ nào thì trọng số
    # của các trạm còn lại được chia lại; max_mm = trạm mưa lớn nhất trong giờ (cực đại cục bộ)
    observed = await fetch_all_no_jit(
        f"""WITH h AS (
              SELECT r.station_id AS id, time_bucket('1 hour', r.time) AS b, avg(r.value) AS v
                FROM iot_telemetry.sensor_readings r JOIN iot_telemetry.monitoring_stations s ON s.id = r.station_id
               WHERE s.type = 'luong_mua' AND r.time > now() - make_interval(hours => :h) AND {area_clause('s.location', codes)}
               GROUP BY 1, 2),
            tot AS (SELECT DISTINCT id FROM h),
            {thiessen_ctes(codes)}
            SELECT h.b AS time, round(COALESCE(sum(h.v * w.m2) / NULLIF(sum(w.m2), 0), avg(h.v))::numeric, 1)::float AS mm,
                   round(max(h.v)::numeric, 1)::float AS max_mm, COALESCE(sum(w.m2), 0) > 0 AS weighted
              FROM h LEFT JOIN w USING (id) GROUP BY h.b ORDER BY h.b""",
        p,
    )
    nowcast = await fetch_all_no_jit(
        f"""WITH h AS (
              SELECT f.station_id AS id, f.time AS b, f.value AS v
                FROM iot_telemetry.forecasts f JOIN iot_telemetry.monitoring_stations s ON s.id = f.station_id
               WHERE f.model = 'QPF-NOWCAST' AND f.time > now() AND {area_clause('s.location', codes)}),
            tot AS (SELECT DISTINCT id FROM h),
            {thiessen_ctes(codes)}
            SELECT h.b AS time, round(COALESCE(sum(h.v * w.m2) / NULLIF(sum(w.m2), 0), avg(h.v))::numeric, 1)::float AS mm,
                   round(max(h.v)::numeric, 1)::float AS max_mm
              FROM h LEFT JOIN w USING (id) GROUP BY h.b ORDER BY h.b""",
        p,
    )
    flags = [r.pop("weighted") for r in observed]
    method = "thiessen" if flags and all(flags) else "trung_binh_cong"
    return {"observed": observed, "nowcast": nowcast, "method": method}


@router.get("/dashboard/landslide-risk")
async def landslide_risk(codes: list[str] = Depends(MON)):
    """Ngưỡng kích hoạt sạt lở: mưa tích lũy 3 ngày vs cường độ mưa hiện tại (theo từng trạm mưa)
    + chỉ số cảm biến nghiêng/độ ẩm đất gần nhất. Ngưỡng I–D dạng I = a · R^-b (minh hoạ)."""
    return await cached_view("landslide-risk", {"codes": codes}, lambda: _landslide_risk(codes))


async def _landslide_risk(codes: list[str]) -> dict:
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


@router.get("/dashboard/landslide-sensors")
async def landslide_sensors(codes: list[str] = Depends(MON), hours: int = Query(48, ge=6, le=168)):
    """Cảm biến cảnh báo sớm sạt lở (độ nghiêng taluy, độ ẩm đất) trong vùng: số đo mới nhất + giá trị LỚN NHẤT từng giờ
    trong `hours` giờ qua → heatmap chuỗi thời gian (giờ không có số đo = không có ô). Mức Vàng / Cam / Đỏ do giao diện
    so với ngưỡng BĐ I / II / III khai báo cho từng cảm biến."""
    return await cached_view(
        "landslide-sensors", {"codes": codes, "hours": hours}, lambda: _landslide_sensors(codes, hours)
    )


async def _landslide_sensors(codes: list[str], hours: int) -> dict:
    sensors = await fetch_all(
        f"""SELECT s.id, s.name, s.type, s.unit, s.alarm_thresholds AS thresholds, u.name AS admin_name, l.value, l.time,
                   COALESCE((
                     SELECT json_agg(json_build_object('time', x.b, 'max', x.v) ORDER BY x.b)
                       FROM (SELECT time_bucket('1 hour', r.time) AS b, round(max(r.value)::numeric, 2)::float AS v
                               FROM iot_telemetry.sensor_readings r
                              WHERE r.station_id = s.id AND r.time > now() - make_interval(hours => :h)
                              GROUP BY 1) x), '[]'::json) AS series
              FROM iot_telemetry.monitoring_stations s
              LEFT JOIN spatial_admin.administrative_units u ON u.id = s.admin_unit_id
              LEFT JOIN ({LATEST_READINGS}) l ON l.station_id = s.id
             WHERE s.type IN ('do_nghieng', 'do_am_dat') AND {area_clause('s.location', codes)}
             ORDER BY s.type, s.id""",
        {"codes": codes, "h": hours},
    )
    return {"hours": hours, "sensors": sensors}


@router.get("/dashboard/supplies")
async def supplies(codes: list[str] = Depends(area_scope("resource", "view"))):
    """Vật tư theo kho/nhóm: hiện có vs định mức (phần thiếu hụt để vẽ cột chồng)."""
    return await cached_view("supplies", {"codes": codes}, lambda: _supplies(codes))


async def _supplies(codes: list[str]) -> list[dict]:
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


MAX_LEVEL_DEVIATION_M = 50  # mực nước báo lệch MNDBT quá chừng này → gần như chắc chắn gõ nhầm


class ReservoirOperationIn(BaseModel):
    current_level: float = Field(ge=-50, le=3000, description="Mực nước hồ (m)")
    spill_gates_open: int = Field(ge=0, le=50, description="Số cửa xả tràn đang mở")
    inflow_m3s: float | None = Field(None, ge=0, le=100_000, description="Lưu lượng về hồ (m³/s)")
    outflow_m3s: float | None = Field(None, ge=0, le=100_000, description="Tổng lưu lượng xả (m³/s)")
    reported_at: datetime | None = Field(None, description="Thời điểm đơn vị vận hành báo — trống = bây giờ")
    source: str | None = Field(
        None, max_length=200, description="Nguồn báo cáo, VD: điện thoại Nhà máy TĐ Bằng Giang"
    )


@router.patch("/reservoirs/{reservoir_id}/operation")
async def update_reservoir_operation(
    reservoir_id: str,
    body: ReservoirOperationIn,
    user: dict = Depends(require_permission("monitoring", "update")),
):
    """Trực ban nhập số liệu vận hành hồ khi đơn vị quản lý hồ báo về (chưa có kết nối tự động) — cổng công khai và
    trang bản nhẹ hiện ngay; hồ chưa có số liệu hiện "Chưa có số liệu vận hành" thay vì "Chưa xả tràn"."""
    res = await fetch_one(
        "SELECT id, name, spill_gates, normal_level FROM iot_telemetry.reservoirs WHERE id = :id",
        {"id": reservoir_id},
    )
    if not res:
        raise HTTPException(404, "Không tìm thấy hồ chứa")
    if res["spill_gates"] and body.spill_gates_open > res["spill_gates"]:
        raise HTTPException(422, f"Hồ chỉ có {res['spill_gates']} cửa xả")
    # Gõ thừa / thiếu chữ số (1900 thay vì 190) → cổng công khai báo "xả lũ lớn" giả hoặc bỏ sót — chặn trước khi ghi
    if (
        res["normal_level"] is not None
        and abs(body.current_level - res["normal_level"]) > MAX_LEVEL_DEVIATION_M
    ):
        raise HTTPException(
            422,
            f"Mực nước {body.current_level:g} m lệch mực nước dâng bình thường ({res['normal_level']:g} m) quá "
            f"{MAX_LEVEL_DEVIATION_M} m — kiểm tra lại số liệu (gõ thừa / thiếu chữ số?)",
        )
    now = datetime.now(UTC)
    reported = body.reported_at or now
    if reported.tzinfo is None:
        raise HTTPException(422, "Thời điểm báo cáo phải kèm múi giờ")
    if reported > now + timedelta(minutes=5) or reported < now - timedelta(days=2):
        raise HTTPException(422, "Thời điểm báo cáo không hợp lệ (tương lai hoặc quá 2 ngày)")
    await fetch_one(
        """UPDATE iot_telemetry.reservoirs SET current_level = :l, spill_gates_open = :g, inflow_m3s = :i,
                  outflow_m3s = :o, operating_at = :t, updated_at = now() WHERE id = :id RETURNING id""",
        {
            "l": body.current_level,
            "g": body.spill_gates_open,
            "i": body.inflow_m3s,
            "o": body.outflow_m3s,
            "t": reported,
            "id": reservoir_id,
        },
    )
    await audit(user, "reservoir.operation", "reservoir", reservoir_id, body.model_dump(mode="json"))
    await invalidate("public:")  # cổng công khai, bản nhẹ hiện ngay (còn cache nginx ≤ 10 giây)
    await hub.publish("reservoir.updated", {"id": reservoir_id})
    gates = (
        f"mở {body.spill_gates_open}/{res['spill_gates']} cửa xả"
        if body.spill_gates_open
        else "chưa mở cửa xả"
    )
    # Thiết kế A.4: nhật ký vận hành ghi cả lưu lượng xả (VD "Hồ … xả tràn lưu lượng 500 m³/s"), như bộ mô phỏng
    flow = f", lưu lượng xả {body.outflow_m3s:g} m³/s" if body.outflow_m3s is not None else ""
    await log_event(
        f"Cập nhật vận hành {res['name']}: mực nước {body.current_level:.2f} m, {gates}{flow}"
        + (f" — nguồn: {body.source}" if body.source else "")
        + f" ({user['full_name']})",
        "canh_bao" if body.spill_gates_open else "van_hanh",
        "warning" if body.spill_gates_open else "info",
    )
    return next(r for r in (await get_reservoirs_overview())["reservoirs"] if r["id"] == reservoir_id)


# ------------------------------------------------------------------ bản tin dự báo mực nước (KTTV)

FORECAST_MODEL = "KTTV"  # trực ban nhập theo bản tin của Đài KTTV; "HEC-HMS" chỉ do bộ mô phỏng sinh
MAX_FORECAST_POINTS = 240  # 10 ngày × 24 giờ
FORECAST_PAST = timedelta(hours=12)
FORECAST_AHEAD = timedelta(days=10)


class ForecastPoint(BaseModel):
    time: datetime
    value: float = Field(ge=-50, le=3000, description="Mực nước dự báo (m)")


class ForecastBulletinIn(BaseModel):
    points: list[ForecastPoint] = Field(min_length=1, max_length=MAX_FORECAST_POINTS)
    issued_at: datetime | None = Field(None, description="Thời điểm phát hành bản tin — trống = bây giờ")
    source: str | None = Field(None, max_length=200, description="VD: Đài KTTV tỉnh Cao Bằng, bản tin 15h")


def forecast_problem(body: ForecastBulletinIn, now: datetime, ref_level: float | None) -> str | None:
    """Lỗi của bản tin (None = hợp lệ). ref_level = ngưỡng BĐ I (hoặc số đo gần nhất) để bắt lỗi gõ thừa / thiếu chữ số."""
    times = [p.time for p in body.points]
    if any(t.tzinfo is None for t in times) or (body.issued_at and body.issued_at.tzinfo is None):
        return "Thời điểm phải kèm múi giờ"
    if len(set(times)) != len(times):
        return "Có hai dòng trùng thời điểm"
    if min(times) < now - FORECAST_PAST or max(times) > now + FORECAST_AHEAD:
        return "Thời điểm dự báo phải trong khoảng từ 12 giờ trước đến 10 ngày tới"
    if body.issued_at and (
        body.issued_at > now + timedelta(minutes=5) or body.issued_at < now - timedelta(days=2)
    ):
        return "Thời điểm phát hành không hợp lệ (tương lai hoặc quá 2 ngày)"
    if ref_level is not None:
        far = next((p for p in body.points if abs(p.value - ref_level) > MAX_LEVEL_DEVIATION_M), None)
        if far:
            return (
                f"Mực nước {far.value:g} m lệch mức tham chiếu của trạm ({ref_level:g} m) quá {MAX_LEVEL_DEVIATION_M} m"
                " — kiểm tra lại số liệu (gõ thừa / thiếu chữ số?)"
            )
    return None


async def _water_station(station_id: str) -> dict:
    station = await fetch_one(
        """SELECT id, name, type, alarm_thresholds AS thr FROM iot_telemetry.monitoring_stations WHERE id = :id""",
        {"id": station_id},
    )
    if not station:
        raise HTTPException(404, "Không tìm thấy trạm")
    if station["type"] != "muc_nuoc":
        raise HTTPException(422, "Chỉ nhập dự báo cho trạm mực nước")
    return station


@router.put("/stations/{station_id}/forecast")
async def put_forecast_bulletin(
    station_id: str,
    body: ForecastBulletinIn,
    user: dict = Depends(require_permission("monitoring", "update")),
):
    """Trực ban nhập bản tin dự báo mực nước của Đài KTTV (dán từ bảng tính) → Hydrograph vẽ nét đứt sau số đo thực.
    Bản tin mới thay toàn bộ bản tin cũ của trạm (không trộn hai bản tin)."""
    station = await _water_station(station_id)
    thr = station["thr"] or {}
    ref = thr.get("bd1")
    if ref is None:
        last = await fetch_one(
            "SELECT value FROM iot_telemetry.sensor_readings WHERE station_id = :id ORDER BY time DESC LIMIT 1",
            {"id": station_id},
        )
        ref = last["value"] if last else None
    now = datetime.now(UTC)
    if problem := forecast_problem(body, now, ref):
        raise HTTPException(422, problem)
    points = sorted(body.points, key=lambda p: p.time)
    async with transaction() as conn:
        await execute(
            "DELETE FROM iot_telemetry.forecasts WHERE station_id = :id AND model = :m",
            {"id": station_id, "m": FORECAST_MODEL},
            conn,
        )
        await execute(
            """INSERT INTO iot_telemetry.forecasts (station_id, time, value, model, issued_at)
               SELECT :id, unnest(CAST(:t AS timestamptz[])), unnest(CAST(:v AS float8[])), :m, :i""",
            {
                "id": station_id,
                "t": [p.time for p in points],
                "v": [p.value for p in points],
                "m": FORECAST_MODEL,
                "i": body.issued_at or now,
            },
            conn,
        )
    peak = max(points, key=lambda p: p.value)
    level = alarm_level(peak.value, thr)
    await audit(user, "forecast.bulletin", "station", station_id, body.model_dump(mode="json"))
    await hub.publish("forecast.updated", {"station_id": station_id})
    await log_event(
        f"Bản tin dự báo mực nước {station['name']}: đỉnh {peak.value:.2f} m lúc "
        f"{peak.time.astimezone(VN_TZ):%H:%M %d/%m}"
        + (f", trên báo động {'I' * level}" if level else "")
        + (f" — nguồn: {body.source}" if body.source else "")
        + f" ({user['full_name']})",
        "canh_bao" if level else "van_hanh",
        "warning" if level else "info",
    )
    return {"station_id": station_id, "points": len(points), "peak": peak.value, "peak_level": level}


@router.delete("/stations/{station_id}/forecast", status_code=204)
async def delete_forecast_bulletin(
    station_id: str, user: dict = Depends(require_permission("monitoring", "update"))
):
    """Bản tin hết hiệu lực hoặc nhập nhầm trạm → gỡ dự báo KTTV của trạm."""
    station = await _water_station(station_id)
    await execute(
        "DELETE FROM iot_telemetry.forecasts WHERE station_id = :id AND model = :m",
        {"id": station_id, "m": FORECAST_MODEL},
    )
    await audit(user, "forecast.bulletin_delete", "station", station_id, {})
    await hub.publish("forecast.updated", {"station_id": station_id})
    await log_event(f"Gỡ bản tin dự báo mực nước {station['name']} ({user['full_name']})", "van_hanh", "info")
