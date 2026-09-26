"""Giám sát điểm đen sạt trượt, lũ quét & đường đèo tỉnh Cao Bằng.

Danh mục điểm đen (tên, tuyến đường, toạ độ, cảm biến gắn kèm) là dữ liệu tham chiếu tĩnh.
Mọi trạng thái động đều tính từ dữ liệu thật trong CSDL — KHÔNG ghi cứng tình trạng sự cố:
- Mức nguy cơ: vùng nguy hiểm sạt lở / lũ quét đang hiệu lực trong bán kính 1 km
  (do cán bộ khoanh hoặc trigger cảm biến tạo) và cảm biến nghiêng / độ ẩm đất so ngưỡng BĐ I–III.
- Chia cắt giao thông: đoạn đường giao với vùng nguy hiểm đang hiệu lực, cách điểm ≤ 2 km
  (cùng quy tắc với lớp "đường bị chia cắt" trên bản đồ công khai).
- Xã/phường: tra theo toạ độ trên ranh giới hành chính 2 cấp hiện hành.
Endpoint công khai → chỉ trả thông tin an toàn công khai, không có vị trí lực lượng.
"""

from __future__ import annotations

from app.db import fetch_all

# Danh mục tham chiếu — chỉ mô tả địa hình / đặc điểm lâu dài, không mô tả sự cố cụ thể
KNOWN_BLACKSPOTS = [
    {
        "code": "DD-KCC",
        "name": "Đèo Khau Cốc Chà",
        "road_name": "QL34 (Bảo Lạc – Xuân Trường)",
        "category": "deo_doc",
        "note": "Đèo nhiều tầng cua gấp, taluy dương cao, đất đá phong hoá dễ sạt khi mưa kéo dài.",
        "lat": 22.806,
        "lon": 105.720,
        "tilt_sensor_id": "CB-TL-01",
        "rain_station_id": "CB-RN-04",
        "soil_moisture_id": "CB-SM-01",
    },
    {
        "code": "DD-MEPIA",
        "name": "Đèo Mẻ Pia",
        "road_name": "ĐT Cô Ba – Thanh Long",
        "category": "deo_doc",
        "note": "Đèo dốc nhiều khúc cua tay áo, thường có đá lăn sau mưa lớn.",
        "lat": 22.872,
        "lon": 105.842,
        "tilt_sensor_id": "CB-TL-02",
        "rain_station_id": "CB-RN-04",
        "soil_moisture_id": "CB-SM-01",
    },
    {
        "code": "DD-CATHANH",
        "name": "Khu vực Ca Thành",
        "road_name": "ĐT Ca Thành",
        "category": "khu_dan_cu",
        "note": "Khu dân cư sườn đồi đất, có tiền sử sạt lở và lũ bùn đá.",
        "lat": 22.685,
        "lon": 105.820,
        "tilt_sensor_id": "CB-TL-03",
        "rain_station_id": "CB-RN-10",
        "soil_moisture_id": "CB-SM-02",
    },
    {
        "code": "DD-MAPHUC",
        "name": "Đèo Mã Phục",
        "road_name": "QL3 (Hòa An – Quảng Hòa)",
        "category": "deo_doc",
        "note": "Taluy đá vôi đã gia cố lưới thép; đường trơn, sương mù dày khi mưa.",
        "lat": 22.768,
        "lon": 106.287,
        "tilt_sensor_id": "CB-TL-04",
        "rain_station_id": "CB-RN-01",
        "soil_moisture_id": None,
    },
    {
        "code": "DD-QL34-PHANTHANH",
        "name": "Taluy QL34 đoạn Phan Thanh",
        "road_name": "QL34 (Phan Thanh – Tĩnh Túc)",
        "category": "deo_doc",
        "note": "Đoạn taluy dương cao sát mép đường, tuyến huyết mạch đi Bảo Lạc.",
        "lat": 22.728,
        "lon": 105.768,
        "tilt_sensor_id": "CB-TL-03",
        "rain_station_id": "CB-RN-02",
        "soil_moisture_id": "CB-SM-02",
    },
    {
        "code": "DD-NAPONG",
        "name": "Cụm dân cư chân đồi Nà Pồng",
        "road_name": "Đường liên xã Pác Miầu – Yên Thổ",
        "category": "khu_dan_cu",
        "note": "Khu dân cư sát chân đồi đất, nguy cơ trượt sườn khi đất bão hoà nước.",
        "lat": 22.872,
        "lon": 105.482,
        "tilt_sensor_id": None,
        "rain_station_id": "CB-RN-05",
        "soil_moisture_id": "CB-SM-01",
    },
    {
        "code": "DD-PHJADEN",
        "name": "Sườn núi Phja Oắc – Phja Đén",
        "road_name": "ĐT Thành Công – Phan Thanh",
        "category": "deo_doc",
        "note": "Vùng núi cao rừng đầu nguồn, suối dốc dễ lũ ống, lũ quét.",
        "lat": 22.596,
        "lon": 105.848,
        "tilt_sensor_id": "CB-TL-03",
        "rain_station_id": "CB-RN-03",
        "soil_moisture_id": "CB-SM-02",
    },
    {
        "code": "DD-NAMQUANG",
        "name": "Khe suối Nậm Quang",
        "road_name": "ĐT Bảo Lâm – Nam Quang",
        "category": "ngam_tran",
        "note": "Khe núi hẹp tụ thuỷ, nguy cơ lũ quét qua ngầm tràn.",
        "lat": 22.790,
        "lon": 105.540,
        "tilt_sensor_id": None,
        "rain_station_id": "CB-RN-05",
        "soil_moisture_id": "CB-SM-01",
    },
    {
        "code": "DD-BANNGAN",
        "name": "Ngầm tràn Bản Ngắn (sông Hiến)",
        "road_name": "Đường liên xã Hòa An",
        "category": "ngam_tran",
        "note": "Ngầm tràn thấp, nước sông lên nhanh khi mưa lớn thượng nguồn.",
        "lat": 22.735,
        "lon": 106.170,
        "tilt_sensor_id": None,
        "rain_station_id": "CB-RN-01",
        "soil_moisture_id": None,
    },
    {
        "code": "DD-KHAULIEU",
        "name": "Đèo Khau Liêu",
        "road_name": "QL3 (Quảng Uyên – Tà Lùng)",
        "category": "deo_doc",
        "note": "Cung đèo nhiều khúc cua gấp, sát vực; xe tải cửa khẩu lưu thông nhiều.",
        "lat": 22.685,
        "lon": 106.460,
        "tilt_sensor_id": None,
        "rain_station_id": "CB-RN-09",
        "soil_moisture_id": None,
    },
    {
        "code": "DD-TINHTUC",
        "name": "Bãi thải mỏ Tĩnh Túc",
        "road_name": "QL34 (đoạn qua Tĩnh Túc)",
        "category": "khu_dan_cu",
        "note": "Bãi thải trên sườn dốc, nguy cơ dòng bùn khi ngậm nước lâu ngày.",
        "lat": 22.645,
        "lon": 105.880,
        "tilt_sensor_id": "CB-TL-03",
        "rain_station_id": "CB-RN-03",
        "soil_moisture_id": "CB-SM-02",
    },
    {
        "code": "DD-DONGKHE",
        "name": "Đèo Đông Khê",
        "road_name": "QL4A (Thạch An – Lạng Sơn)",
        "category": "deo_doc",
        "note": "Taluy đất đỏ, mặt đường dễ trơn trượt khi mưa.",
        "lat": 22.434,
        "lon": 106.436,
        "tilt_sensor_id": None,
        "rain_station_id": "CB-RN-08",
        "soil_moisture_id": None,
    },
]

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
TRAFFIC = {
    "cam_duong": ("Đường bị chia cắt – không đi qua", "red"),
    "canh_bao": ("Nguy cơ sạt lở – hạn chế đi qua", "orange"),
    "thong_suot": ("Chưa ghi nhận nguy cơ", "green"),
}
# Khuyến cáo chung theo trạng thái — không gán hành động cho cơ quan cụ thể
GUIDANCE = {
    "cam_duong": "Không đi qua khu vực này. Tuân thủ biển báo, chốt chặn và hướng dẫn của lực lượng chức năng; "
    "dùng công cụ “Chỉ đường an toàn” để tìm tuyến tránh.",
    "canh_bao": "Hạn chế đi qua, đặc biệt ban đêm và khi đang mưa. Không dừng đỗ dưới chân taluy, "
    "quan sát đá lăn, vết nứt mới và báo ngay cho chính quyền xã hoặc gửi phản ánh.",
    "thong_suot": "Chưa ghi nhận nguy cơ từ cảm biến và vùng cảnh báo. Vẫn chú ý giảm tốc độ ở đoạn đèo dốc khi trời mưa.",
}

DYNAMIC_SQL = """
    WITH pt AS (
        SELECT code, ST_SetSRID(ST_MakePoint(lon, lat), 4326) AS g
          FROM unnest(CAST(:codes AS text[]), CAST(:lats AS float8[]), CAST(:lons AS float8[])) AS t(code, lat, lon)
    )
    SELECT pt.code, u.name AS admin_name, u.code AS admin_code,
           (SELECT max(CASE z.level WHEN 'do' THEN 3 WHEN 'cam' THEN 2 WHEN 'vang' THEN 1 ELSE 0 END)
              FROM iot_telemetry.hazard_zones z
             WHERE z.valid_until > now() AND z.type IN ('sat_lo', 'lu_quet')
               AND ST_DWithin(z.geom::geography, pt.g::geography, 1000)) AS zone_rank,
           EXISTS (SELECT 1 FROM operations.road_segments s
                     JOIN iot_telemetry.hazard_zones z
                       ON z.valid_until > now() AND (z.type <> 'ngap' OR z.level = 'do') AND ST_Intersects(z.geom, s.geom)
                    WHERE ST_DWithin(ST_Intersection(z.geom, s.geom)::geography, pt.g::geography, 2000)) AS road_cut
      FROM pt
      LEFT JOIN spatial_admin.administrative_units u ON u.level = 'xa' AND ST_Contains(u.geom, pt.g)
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


def traffic_status(road_cut: bool, risk: str) -> str:
    if road_cut:
        return "cam_duong"
    return "canh_bao" if risk in ("cam", "do") else "thong_suot"


async def get_landslides_overview() -> dict:
    """Danh sách điểm đen sạt trượt kèm trạng thái tính từ vùng nguy hiểm, đường bị chia cắt và cảm biến."""
    dyn = await fetch_all(
        DYNAMIC_SQL,
        {
            "codes": [b["code"] for b in KNOWN_BLACKSPOTS],
            "lats": [b["lat"] for b in KNOWN_BLACKSPOTS],
            "lons": [b["lon"] for b in KNOWN_BLACKSPOTS],
        },
    )
    dyn_by_code = {d["code"]: d for d in dyn}
    sensor_ids = sorted(
        {
            b[k]
            for b in KNOWN_BLACKSPOTS
            for k in ("tilt_sensor_id", "rain_station_id", "soil_moisture_id")
            if b[k]
        }
    )
    sensors = {s["id"]: s for s in await fetch_all(SENSOR_SQL, {"ids": sensor_ids})}

    points = []
    corridors: dict[str, int] = {}
    counts = {"cam_duong": 0, "canh_bao": 0, "thong_suot": 0}
    for item in KNOWN_BLACKSPOTS:
        d = dyn_by_code.get(item["code"], {})

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

        zone_lv = LEVELS[d.get("zone_rank") or 0]
        risk = max_level(zone_lv, tilt_lv, soil_lv)
        status = traffic_status(bool(d.get("road_cut")), risk)
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
                "admin_name": d.get("admin_name"),
                "admin_code": d.get("admin_code"),
                "category": item["category"],
                "category_label": CATEGORY_LABEL[item["category"]],
                "risk_level": risk,
                "risk_label": RISK_LABEL[risk],
                "traffic_status": status,
                "traffic_label": label,
                "traffic_color": color,
                "description": item["note"],
                "response_action": GUIDANCE[status],
                "bypass_route": None,
                "rain_info": rain_info,
                "tilt_info": tilt_info,
                "soil_info": soil_info,
                "lat": item["lat"],
                "lon": item["lon"],
            }
        )

    return {
        "total_points": len(points),
        "blocked_count": counts["cam_duong"],
        "warning_count": counts["canh_bao"],
        "safe_count": counts["thong_suot"],
        "corridors": [{"name": k, "count": v} for k, v in sorted(corridors.items(), key=lambda x: -x[1])],
        "points": points,
    }
