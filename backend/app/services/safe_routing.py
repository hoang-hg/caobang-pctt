"""Định tuyến an toàn: đường ngắn nhất (theo thời gian) trên đồ thị giao thông,
né đoạn đường giao cắt vùng sạt lở/lũ quét hoặc vùng ngập sâu (cấp đỏ) còn hiệu lực trong PostGIS.
"""

import heapq
import math
from dataclasses import dataclass

from app.db import fetch_all


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
        "roads": roads,
        "blocked_segments": sum(1 for e in edges if e.blocked),
    }
