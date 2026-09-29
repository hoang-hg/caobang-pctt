"""Định tuyến an toàn: đường ngắn nhất (theo thời gian) trên đồ thị giao thông,
né đoạn đường giao cắt vùng sạt lở/lũ quét hoặc vùng ngập sâu (cấp đỏ) còn hiệu lực trong PostGIS.

``safe`` chỉ nghĩa là "không đi qua vùng nguy hiểm ĐÃ GHI NHẬN": cả tuyến (kể cả chặng chim bay từ vị trí tới nút giao
gần nhất / từ nút cuối tới đích — mạng đường còn thưa, chặng này có thể dài) được kiểm tra với MỌI vùng nguy hiểm đang
hiệu lực. ``offroad_km``: phần tuyến không có dữ liệu đường — giao diện phải nói rõ, không khẳng định an toàn.
"""

import heapq
import json
import math
from dataclasses import dataclass

from app.db import fetch_all
from app.services.readings import LATEST_COLS, LATEST_JOIN, vn_time
from app.services.simulator import alarm_level

# Cảnh báo kèm tuyến (không chặn đường — chưa có mô hình ngập): trạm mực nước gần tuyến, điểm nguy hiểm sát tuyến,
# xã có mưa rất to theo dự báo
NEAR_STATION_M = 2000
NEAR_POINT_M = 200
HEAVY_RAIN_24H_MM = 100
MAX_WARNINGS = 8
LEVEL_VI = {"do": "đỏ", "cam": "cam", "vang": "vàng"}
ALARM_VI = ["dưới báo động I", "vượt báo động I", "vượt báo động II", "vượt báo động III"]


@dataclass
class Edge:
    id: int
    a: int
    b: int
    length_km: float
    speed_kmh: float
    coords: list[list[float]]  # [[lon, lat], ...] theo chiều a → b
    road: str
    blocked: bool = False


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def dijkstra(
    edges: list[Edge], start: int, goal: int, avoid_blocked: bool = True
) -> list[tuple[Edge, bool]] | None:
    """Trả về danh sách (cạnh, đi_xuôi) hoặc None nếu không có đường."""
    adj: dict[int, list[tuple[Edge, bool]]] = {}
    for e in edges:
        if avoid_blocked and e.blocked:
            continue
        adj.setdefault(e.a, []).append((e, True))
        adj.setdefault(e.b, []).append((e, False))
    dist = {start: 0.0}
    prev: dict[int, tuple[int, Edge, bool]] = {}
    pq = [(0.0, start)]
    while pq:
        d, u = heapq.heappop(pq)
        if u == goal:
            break
        if d > dist.get(u, math.inf):
            continue
        for e, fwd in adj.get(u, []):
            v = e.b if fwd else e.a
            nd = d + e.length_km / e.speed_kmh
            if nd < dist.get(v, math.inf):
                dist[v] = nd
                prev[v] = (u, e, fwd)
                heapq.heappush(pq, (nd, v))
    if goal != start and goal not in prev:
        return None
    path: list[tuple[Edge, bool]] = []
    node = goal
    while node != start:
        u, e, fwd = prev[node]
        path.append((e, fwd))
        node = u
    return list(reversed(path))


async def load_graph() -> tuple[list[Edge], dict[int, tuple[float, float]]]:
    rows = await fetch_all(
        """
        SELECT s.id, s.source_node, s.target_node, s.length_km, s.speed_kmh, s.road_name,
               ST_AsGeoJSON(s.geom)::json AS geom,
               EXISTS (SELECT 1 FROM iot_telemetry.hazard_zones z
                        WHERE z.valid_until > now() AND (z.type <> 'ngap' OR z.level = 'do') AND ST_Intersects(z.geom, s.geom)) AS blocked
          FROM operations.road_segments s
        """
    )
    edges = [
        Edge(
            r["id"],
            r["source_node"],
            r["target_node"],
            r["length_km"],
            r["speed_kmh"],
            r["geom"]["coordinates"],
            r["road_name"],
            r["blocked"],
        )
        for r in rows
    ]
    nodes = {
        n["id"]: (n["lat"], n["lon"])
        for n in await fetch_all("SELECT id, ST_Y(geom) AS lat, ST_X(geom) AS lon FROM operations.road_nodes")
    }
    return edges, nodes


def nearest_node(nodes: dict[int, tuple[float, float]], lat: float, lon: float) -> int:
    return min(nodes, key=lambda n: haversine_km(lat, lon, *nodes[n]))


# Tốc độ tiếp cận ước tính theo loại phương tiện (km/h) trong điều kiện thiên tai
VEHICLE_SPEED = {
    "xuong": 25,
    "ca_no": 30,
    "ghe": 12,
    "xe_loi_nuoc": 25,
    "may_xuc": 15,
    "may_ui": 12,
    "xe_cuu_thuong": 45,
}


async def plan_route(
    from_lat: float, from_lon: float, to_lat: float, to_lon: float, speed_factor: float = 1.0
) -> dict:
    edges, nodes = await load_graph()
    route = build_route(edges, nodes, from_lat, from_lon, to_lat, to_lon, speed_factor)
    # Đồ thị chỉ né đoạn đường bị chặn; chặng chim bay và vùng ngập mức vàng / cam không được xét ở đó → kiểm tra lại
    # toàn tuyến với mọi vùng nguy hiểm đang hiệu lực
    hits = await fetch_all(
        """SELECT name FROM iot_telemetry.hazard_zones
            WHERE valid_until > now() AND ST_Intersects(geom, ST_SetSRID(ST_GeomFromGeoJSON(:g), 4326))
            ORDER BY (level = 'do') DESC, (level = 'cam') DESC, name LIMIT 5""",
        {"g": json.dumps(route["geometry"])},
    )
    route["hazards"] = [h["name"] for h in hits]
    if hits:
        route["safe"] = False
    route["warnings"] = await route_warnings(route["geometry"])
    return route


async def route_warnings(geometry: dict) -> list[str]:
    """Nguy cơ quanh tuyến mà vùng nguy hiểm chưa thể hiện — dự phòng khi số liệu trễ / thiếu:
    trạm mực nước trong NEAR_STATION_M đang vượt BĐ II hoặc MẤT TÍN HIỆU (không xác nhận được nước), điểm nguy hiểm đã
    nhập trong NEAR_POINT_M, xã tuyến đi qua có mưa dự báo 24 giờ ≥ HEAVY_RAIN_24H_MM."""
    g = json.dumps(geometry)
    out: list[str] = []
    stations = await fetch_all(
        f"""WITH r AS (SELECT ST_SetSRID(ST_GeomFromGeoJSON(:g), 4326)::geography AS g)
            SELECT s.name, s.river, s.alarm_thresholds AS thr, {LATEST_COLS}
              FROM r, iot_telemetry.monitoring_stations s {LATEST_JOIN}
             WHERE s.type = 'muc_nuoc' AND ST_DWithin(s.location::geography, r.g, :d)
             ORDER BY s.name""",
        {"g": g, "d": NEAR_STATION_M},
    )
    for s in stations:
        if s["value"] is None:  # trạm chưa từng có số đo: không có thông tin để cảnh báo
            continue
        river = f" (sông {s['river']})" if s["river"] else ""
        level = alarm_level(s["value"], s["thr"] or {})
        if level >= 2:
            out.append(
                f"{s['name']}{river} gần tuyến: {ALARM_VI[level]}"
                + (f" — mất tín hiệu từ {vn_time(s['time'])}" if s["stale"] else "")
                + " — không qua ngầm tràn, bãi bồi"
            )
        elif s["stale"]:
            out.append(
                f"{s['name']}{river} gần tuyến mất tín hiệu từ {vn_time(s['time'])} — "
                "không xác nhận được mực nước, hỏi địa phương trước khi qua sông suối"
            )
    points = await fetch_all(
        """WITH r AS (SELECT ST_SetSRID(ST_GeomFromGeoJSON(:g), 4326)::geography AS g)
           SELECT p.name, p.level FROM r, iot_telemetry.hazard_points p
            WHERE p.active AND ST_DWithin(p.location::geography, r.g, :d)
            ORDER BY (p.level = 'do') DESC, p.name LIMIT 5""",
        {"g": g, "d": NEAR_POINT_M},
    )
    out += [
        f"Điểm nguy hiểm sát tuyến: {p['name']} (mức {LEVEL_VI.get(p['level'], p['level'])})" for p in points
    ]
    rain = await fetch_all(
        """WITH r AS (SELECT ST_SetSRID(ST_GeomFromGeoJSON(:g), 4326) AS g)
           SELECT u.name, round(sum(a.precip_p50))::int AS mm
             FROM r, spatial_admin.administrative_units u
             JOIN iot_telemetry.area_forecasts a ON a.admin_unit_id = u.id
            WHERE u.level = 'xa' AND ST_Intersects(u.geom, r.g)
              AND a.model = 'BLEND' AND a.time > now() AND a.time <= now() + interval '24 hours'
            GROUP BY u.name HAVING sum(a.precip_p50) >= :mm
            ORDER BY 2 DESC LIMIT 3""",
        {"g": g, "mm": HEAVY_RAIN_24H_MM},
    )
    out += [
        f"Xã {r['name']}: dự báo mưa rất to 24 giờ tới (~{r['mm']} mm) — đề phòng ngập, sạt lở trên tuyến"
        for r in rain
    ]
    return out[:MAX_WARNINGS]


def build_route(
    edges: list[Edge],
    nodes: dict[int, tuple[float, float]],
    from_lat: float,
    from_lon: float,
    to_lat: float,
    to_lon: float,
    speed_factor: float = 1.0,
) -> dict:
    """Tuyến an toàn trên đồ thị đường (hàm thuần). ``roads`` rỗng = không có đường nối → nét thẳng (chim bay)."""
    if not nodes:  # chưa có mạng đường → đường chim bay, không bảo đảm an toàn
        km = haversine_km(from_lat, from_lon, to_lat, to_lon)
        return {
            "geometry": {
                "type": "LineString",
                "coordinates": [[from_lon, from_lat], [to_lon + 1e-5, to_lat + 1e-5]],
            },
            "distance_km": round(km, 1),
            "duration_min": round(km / 15 * 60),
            "safe": False,
            "offroad_km": round(km, 1),
            "roads": [],
            "blocked_segments": 0,
        }
    a = nearest_node(nodes, from_lat, from_lon)
    b = nearest_node(nodes, to_lat, to_lon)
    safe = True
    path = dijkstra(edges, a, b, avoid_blocked=True)
    if path is None:  # không còn tuyến an toàn → đi tuyến ngắn nhất và cảnh báo
        safe = False
        path = dijkstra(edges, a, b, avoid_blocked=False) or []

    coords: list[list[float]] = [[from_lon, from_lat]]
    hours = 0.0
    km = haversine_km(from_lat, from_lon, *nodes[a])
    hours += km / 20  # chặng tiếp cận nút giao gần nhất
    offroad = km  # phần không có dữ liệu đường (chim bay)
    if not path and a != b:
        # Hai nút giao không nối với nhau (mạng đường rời) → đoạn giữa chưa có đường: tính theo đường chim bay,
        # nếu không quãng đường / thời gian bị báo thiếu cả đoạn này
        gap = haversine_km(*nodes[a], *nodes[b])
        km += gap
        offroad += gap
        hours += gap / 15
    passes_hazard = False
    roads: list[str] = []
    for e, fwd in path:
        seg = e.coords if fwd else list(reversed(e.coords))
        coords.extend(seg)
        km += e.length_km
        hours += e.length_km / (e.speed_kmh * speed_factor)
        passes_hazard = passes_hazard or e.blocked
        if not roads or roads[-1] != e.road:
            roads.append(e.road)
    last = haversine_km(*nodes[b], to_lat, to_lon)
    km += last
    offroad += last
    hours += last / 15  # chặng cuối (đường thôn, lội nước…)
    coords.append([to_lon, to_lat])

    # Khử điểm trùng liên tiếp
    dedup = [coords[0]]
    for c in coords[1:]:
        if c != dedup[-1]:
            dedup.append(c)
    if len(dedup) < 2:
        dedup.append([to_lon + 1e-5, to_lat + 1e-5])

    return {
        "geometry": {"type": "LineString", "coordinates": dedup},
        "distance_km": round(km, 1),
        "duration_min": round(hours * 60),
        "safe": safe and not passes_hazard,
        "offroad_km": round(offroad, 1),
        "roads": roads,
        "blocked_segments": sum(1 for e in edges if e.blocked),
    }
