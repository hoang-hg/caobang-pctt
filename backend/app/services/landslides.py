"""Giám sát điểm đen sạt trượt, lũ quét & đường đèo tỉnh Cao Bằng.

Danh mục điểm đen (tên, tuyến đường, toạ độ, cảm biến gắn kèm) nằm ở bảng `iot_telemetry.landslide_blackspots` — cán bộ
nhập / sửa ở trang Nhập dữ liệu (loại "diem_den_sat_lo"; danh mục ban đầu: migration 0028).
Mọi trạng thái động đều tính từ dữ liệu thật trong CSDL — KHÔNG ghi cứng tình trạng sự cố:
- Mức nguy cơ: vùng nguy hiểm sạt lở / lũ quét đang hiệu lực trong bán kính 1 km
  (do cán bộ khoanh hoặc trigger cảm biến tạo) và cảm biến nghiêng / độ ẩm đất so ngưỡng BĐ I–III.
- Chia cắt giao thông: đoạn đường giao với vùng nguy hiểm đang hiệu lực, cách điểm ≤ 2 km
  (cùng quy tắc với lớp "đường bị chia cắt" trên bản đồ công khai).
- Xã/phường: `admin_unit_id` của điểm (bộ nhập gán theo tệp hoặc vị trí; đổi ranh giới xã → gán lại theo vị trí).
- Không có bằng chứng nào (không vùng nguy hiểm gần, không đường bị cắt, cảm biến nghiêng / độ ẩm đất gắn kèm không
  có số đo 6 giờ qua — VD chưa lắp, mã cảm biến mẫu không tồn tại khi chạy thật) → "Chưa có dữ liệu giám sát" (xám),
  KHÔNG phải "Chưa ghi nhận nguy cơ" (xanh): không để người dân hiểu là có cảm biến đang theo dõi mà chưa báo gì.
Endpoint công khai → chỉ trả thông tin an toàn công khai, không có vị trí lực lượng.
"""

from __future__ import annotations

from app.db import fetch_all, fetch_one

CATEGORY_LABEL = {
    "deo_doc": "Đường đèo, dốc",
    "khu_dan_cu": "Khu dân cư sườn đồi",
    "ngam_tran": "Ngầm tràn & suối lũ quét",
}
LEVELS = ("binh_thuong", "vang", "cam", "do")
RISK_LABEL = {
    "do": "Rất cao",
    "cam": "Cao",
    "vang": "Trung bình",
    "binh_thuong": "Chưa ghi nhận nguy cơ",
}
NO_DATA = "chua_co_du_lieu"
TRAFFIC = {
    "cam_duong": ("Đường bị chia cắt – không đi qua", "red"),
    "canh_bao": ("Nguy cơ sạt lở – hạn chế đi qua", "orange"),
    "thong_suot": ("Chưa ghi nhận nguy cơ", "green"),
    NO_DATA: ("Chưa có dữ liệu giám sát", "gray"),
}
# Khuyến cáo chung theo trạng thái — không gán hành động cho cơ quan cụ thể. Không hướng người dân tới "Chỉ đường an
# toàn" để tìm tuyến tránh: chạy thật chưa có mạng đường chính thức, công cụ đó chỉ có hướng chim bay.
GUIDANCE = {
    "cam_duong": "Không đi qua khu vực này. Tuân thủ biển báo, chốt chặn và hướng dẫn tuyến tránh của lực lượng "
    "chức năng.",
    "canh_bao": "Hạn chế đi qua, đặc biệt ban đêm và khi đang mưa. Không dừng đỗ dưới chân taluy, "
    "quan sát đá lăn, vết nứt mới và báo ngay cho chính quyền xã hoặc gửi phản ánh.",
    "thong_suot": "Chưa ghi nhận nguy cơ từ cảm biến và vùng cảnh báo. Vẫn chú ý giảm tốc độ ở đoạn đèo dốc khi trời mưa.",
    NO_DATA: "Điểm này chưa có cảm biến hay số liệu giám sát kết nối với hệ thống — không có nghĩa là an toàn. Khi mưa "
    "lớn hạn chế đi qua, không dừng đỗ dưới chân taluy, theo dõi thông báo của chính quyền và báo ngay khi thấy vết nứt, "
    "đá lăn.",
}

BLACKSPOT_SQL = """
    SELECT b.code, b.name, b.road_name, b.category, b.note, b.bypass_route,
           b.tilt_sensor_id, b.rain_station_id, b.soil_moisture_id,
           ST_Y(b.location) AS lat, ST_X(b.location) AS lon,
           u.name AS admin_name, u.code AS admin_code,
           (SELECT max(CASE z.level WHEN 'do' THEN 3 WHEN 'cam' THEN 2 WHEN 'vang' THEN 1 ELSE 0 END)
              FROM iot_telemetry.hazard_zones z
             WHERE z.valid_until > now() AND z.type IN ('sat_lo', 'lu_quet')
               AND ST_DWithin(z.geom::geography, b.location::geography, 1000)) AS zone_rank,
           EXISTS (SELECT 1 FROM operations.road_segments s
                     JOIN iot_telemetry.hazard_zones z
                       ON z.valid_until > now() AND (z.type <> 'ngap' OR z.level = 'do') AND ST_Intersects(z.geom, s.geom)
                    WHERE ST_DWithin(ST_Intersection(z.geom, s.geom)::geography, b.location::geography, 2000)) AS road_cut
      FROM iot_telemetry.landslide_blackspots b
      LEFT JOIN spatial_admin.administrative_units u ON u.id = b.admin_unit_id
     WHERE CAST(:codes AS text[]) IS NULL OR u.code = ANY(CAST(:codes AS text[]))
     ORDER BY b.name
"""

SENSOR_SQL = """
    SELECT s.id, s.name, s.type, s.alarm_thresholds AS thr,
           (SELECT r.value FROM iot_telemetry.sensor_readings r
             WHERE r.station_id = s.id AND r.time > now() - interval '6 hours'
             ORDER BY r.time DESC LIMIT 1) AS latest,
           CASE WHEN s.type = 'luong_mua' THEN
             (SELECT round(sum(h.v)::numeric, 1) FROM (
                SELECT avg(r.value) AS v FROM iot_telemetry.sensor_readings r
                 WHERE r.station_id = s.id AND r.time > now() - interval '24 hours'
                 GROUP BY time_bucket('1 hour', r.time)) h)
           END AS rain_24h
      FROM iot_telemetry.monitoring_stations s
     WHERE s.id = ANY(CAST(:ids AS text[]))
"""


def sensor_level(value: float | None, thr: dict | None) -> str:
    """So số đo với ngưỡng BĐ I/II/III → binh_thuong | vang | cam | do (không có số đo → binh_thuong)."""
    if value is None or not thr:
        return "binh_thuong"
    for key, level in (("bd3", "do"), ("bd2", "cam"), ("bd1", "vang")):
        if key in thr and value >= thr[key]:
            return level
    return "binh_thuong"


def max_level(*levels: str) -> str:
    return max(levels, key=LEVELS.index)


def traffic_status(road_cut: bool, risk: str, near_zone: bool = True, monitored: bool = True) -> str:
    """near_zone: có vùng nguy hiểm sạt lở / lũ quét đang hiệu lực trong 1 km; monitored: có cảm biến nghiêng / độ ẩm đất
    gắn kèm báo số đo trong 6 giờ qua. Không có bằng chứng nào → NO_DATA (xám), không phải "Chưa ghi nhận nguy cơ"."""
    if road_cut:
        return "cam_duong"
    if risk in ("cam", "do"):
        return "canh_bao"
    return "thong_suot" if near_zone or monitored else NO_DATA


async def get_landslides_overview(codes: list[str] | None = None) -> dict:
    """Danh sách điểm đen sạt trượt kèm trạng thái tính từ vùng nguy hiểm, đường bị chia cắt và cảm biến. `codes`: chỉ điểm
    thuộc các xã này (vùng đang xem / phạm vi được giao) — số đếm, tuyến đường tính trên các điểm còn lại; None = toàn tỉnh."""
    spots = await fetch_all(BLACKSPOT_SQL, {"codes": codes or None})
    sensor_ids = sorted(
        {b[k] for b in spots for k in ("tilt_sensor_id", "rain_station_id", "soil_moisture_id") if b[k]}
    )
    sensors = {s["id"]: s for s in await fetch_all(SENSOR_SQL, {"ids": sensor_ids})} if sensor_ids else {}

    points = []
    corridors: dict[str, int] = {}
    counts = dict.fromkeys(TRAFFIC, 0)
    monitored_count = 0
    for item in spots:
        rain_info = None
        if (rs := sensors.get(item["rain_station_id"])) and rs["rain_24h"] is not None:
            rain_info = {
                "station_id": rs["id"],
                "station_name": rs["name"],
                "rain_24h_mm": float(rs["rain_24h"]),
            }

        tilt_info, tilt_lv = None, "binh_thuong"
        if (ts := sensors.get(item["tilt_sensor_id"])) and ts["latest"] is not None:
            tilt_lv = sensor_level(ts["latest"], ts["thr"])
            tilt_info = {
                "sensor_id": ts["id"],
                "sensor_name": ts["name"],
                "current_tilt_deg": round(ts["latest"], 2),
                "tilt_level": {"do": "nguy_hiem", "cam": "canh_bao", "vang": "canh_bao"}.get(
                    tilt_lv, "binh_thuong"
                ),
                "alarm_threshold": (ts["thr"] or {}).get("bd3"),
            }

        soil_info, soil_lv = None, "binh_thuong"
        if (sm := sensors.get(item["soil_moisture_id"])) and sm["latest"] is not None:
            soil_lv = sensor_level(sm["latest"], sm["thr"])
            val = round(sm["latest"], 1)
            soil_info = {
                "sensor_id": sm["id"],
                "sensor_name": sm["name"],
                "moisture_pct": val,
                "status_text": {
                    "do": f"Đất bão hoà {val}% – rất dễ trượt",
                    "cam": f"Độ ẩm cao {val}% – nguy cơ trượt",
                    "vang": f"Độ ẩm tăng {val}% – cần theo dõi",
                }.get(soil_lv, "Trong ngưỡng an toàn"),
            }

        zone_lv = LEVELS[item["zone_rank"] or 0]
        risk = max_level(zone_lv, tilt_lv, soil_lv)
        monitored = tilt_info is not None or soil_info is not None  # mưa một mình không đo được taluy
        monitored_count += monitored
        status = traffic_status(bool(item["road_cut"]), risk, item["zone_rank"] is not None, monitored)
        counts[status] += 1
        label, color = TRAFFIC[status]

        corridor = item["road_name"].split("(")[0].strip()
        corridors[corridor] = corridors.get(corridor, 0) + 1

        points.append(
            {
                "code": item["code"],
                "name": item["name"],
                "road_name": item["road_name"],
                "corridor": corridor,
                "admin_name": item["admin_name"],
                "admin_code": item["admin_code"],
                "category": item["category"],
                "category_label": CATEGORY_LABEL[item["category"]],
                "risk_level": risk,
                "risk_label": label if status == NO_DATA else RISK_LABEL[risk],
                "monitored": monitored,
                "traffic_status": status,
                "traffic_label": label,
                "traffic_color": color,
                "description": item["note"],
                "response_action": GUIDANCE[status],
                "bypass_route": item["bypass_route"],
                "rain_info": rain_info,
                "tilt_info": tilt_info,
                "soil_info": soil_info,
                "lat": item["lat"],
                "lon": item["lon"],
            }
        )

    # Chưa có mạng đường (chạy thật chưa nhập — sơ đồ vẽ tay chỉ có khi DEMO_MODE) → "0 điểm chia cắt" là không biết, không
    # phải "không có điểm ách tắc"
    roads = await fetch_one("SELECT EXISTS (SELECT 1 FROM operations.road_segments) AS ok")
    return {
        "total_points": len(points),
        "roads_available": bool(roads and roads["ok"]),
        "blocked_count": counts["cam_duong"],
        "warning_count": counts["canh_bao"],
        "safe_count": counts["thong_suot"],
        "no_data_count": counts[NO_DATA],
        "monitored_count": monitored_count,  # 0 → giao diện không được hiện "TRỰC TIẾP"
        "corridors": [{"name": k, "count": v} for k, v in sorted(corridors.items(), key=lambda x: -x[1])],
        "points": points,
    }
