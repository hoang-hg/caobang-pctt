"""Nạp dữ liệu tỉnh Cao Bằng (chạy idempotent: bỏ qua nếu đã có dữ liệu).

DEMO_MODE=false (triển khai thật): chỉ dữ liệu NỀN — địa giới 56 xã, preset, địa danh, mẫu tin cảnh báo, danh mục
    vật tư. Trạm, hồ, lực lượng, kho, điểm sơ tán, vùng nguy hiểm, danh bạ phải nhập từ dữ liệu chính thức
    (README.md mục 2) — tuyệt đối không hiển thị điểm sơ tán / số điện thoại giả cho người dân. Không nạp sơ đồ đường
    vẽ tay (chỉ đường người dân sẽ vẽ tuyến trên đường giả lập) và xoá sơ đồ cũ nếu còn (drop_sample_roads).
DEMO_MODE=true (trình diễn, CI): thêm toàn bộ dữ liệu MẪU + tài khoản demo + sơ đồ đường nối tâm các xã.

python -m app.seed            # nạp nếu CSDL trống
python -m app.seed --reset    # xoá dữ liệu nghiệp vụ và nạp lại (bị chặn ở APP_ENV=production)
"""

import asyncio
import json
import random
import sys
from datetime import UTC, date, datetime, timedelta
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncConnection

from app import preflight
from app import seed_data as D
from app.auth import hash_secret
from app.config import settings
from app.db import engine, execute, fetch_all, fetch_one
from app.infra.cache import invalidate
from app.infra.redis import close_redis
from app.services import scenario
from app.services.safe_routing import haversine_km

PROVINCE_FILE = (
    Path(__file__).resolve().parents[1] / "seed" / "caobang_province.geojson"
)  # OSM relation 1844412
# Ranh giới 56 xã/phường sau sắp xếp (nguồn ghi trong tệp; README 13). Cùng định dạng công cụ nhập "ranh_gioi_xa".
COMMUNES_FILE = Path(__file__).resolve().parents[1] / "seed" / "caobang_communes.geojson"
rng = random.Random(2025)
PRESET_TAGS = {"LV_BANG_GIANG": "vung_trung", "VUNG_NUI_CAO": "vung_nui", "BIEN_GIOI": "bien_gioi"}


def phone(i: int) -> str:
    return f"{D.DEMO_PHONE_PREFIX} {100 + i // 1000:03d} {i % 1000:03d}"


def pt(lat: float, lon: float) -> str:
    return f"SRID=4326;POINT({lon} {lat})"


def jitter(lat: float, lon: float, km: float = 1.0) -> tuple[float, float]:
    d = km / 111.0
    return lat + rng.uniform(-d, d), lon + rng.uniform(-d, d)


async def ex(conn: AsyncConnection, sql: str, params=None):
    await execute(sql, params, conn)


async def seed_admin(conn: AsyncConnection) -> dict[str, dict]:
    province_geojson = json.loads(PROVINCE_FILE.read_text(encoding="utf-8"))["geometry"]
    await ex(
        conn,
        """INSERT INTO spatial_admin.administrative_units (code, name, level, unit_type, geom, center, population, households)
           VALUES ('CB', 'Tỉnh Cao Bằng', 'tinh', 'tinh',
                   ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(:g), 4326)),
                   ST_PointOnSurface(ST_SetSRID(ST_GeomFromGeoJSON(:g), 4326)), 0, 0)""",
        {"g": json.dumps(province_geojson)},
    )
    for name, utype, district, lat, lon in D.COMMUNES:
        if utype == "phuong":
            pop = rng.randint(24_000, 38_000)
        elif district in ("Bảo Lâm", "Bảo Lạc", "Nguyên Bình", "Hà Quảng", "Hạ Lang"):
            pop = rng.randint(6_000, 12_000)
        else:
            pop = rng.randint(8_000, 15_000)
        # một xã có thể thuộc nhiều nhóm đặc thù
        tag_list = sorted({PRESET_TAGS[p[0]] for p in D.PRESETS if name in p[4]})
        await ex(
            conn,
            """INSERT INTO spatial_admin.administrative_units
                 (code, name, level, unit_type, parent_id, old_district, center, population, households, tags)
               VALUES (:code, :name, 'xa', :utype, (SELECT id FROM spatial_admin.administrative_units WHERE code = 'CB'),
                       :district, ST_SetSRID(ST_MakePoint(:lon, :lat), 4326), :pop, :hh, :tags)""",
            {
                "code": D.unit_code(name),
                "name": name,
                "utype": utype,
                "district": district,
                "lat": lat,
                "lon": lon,
                "pop": pop,
                "hh": pop // 4,
                "tags": tag_list,
            },
        )
    # Ranh giới, dân số thật từ tệp (tâm xã = điểm nằm trong ranh giới) — thay toạ độ tâm xấp xỉ trong seed_data
    if COMMUNES_FILE.exists():
        for feat in json.loads(COMMUNES_FILE.read_text(encoding="utf-8"))["features"]:
            p = feat["properties"]
            await ex(
                conn,
                """WITH g AS (SELECT ST_Multi(ST_CollectionExtract(ST_MakeValid(
                                  ST_SetSRID(ST_GeomFromGeoJSON(:g), 4326)), 3)) AS geom)
                   UPDATE spatial_admin.administrative_units u
                      SET geom = g.geom, center = ST_PointOnSurface(g.geom),
                          population = COALESCE(:pop, u.population), households = COALESCE(:hh, u.households)
                     FROM g WHERE u.code = :ma AND u.level = 'xa'""",
                {
                    "g": json.dumps(feat["geometry"]),
                    "ma": p["ma"],
                    "pop": p.get("dan_so"),
                    "hh": p.get("so_ho"),
                },
            )
    await ex(
        conn,
        """UPDATE spatial_admin.administrative_units
              SET population = (SELECT sum(population) FROM spatial_admin.administrative_units WHERE level = 'xa'),
                  households = (SELECT sum(households) FROM spatial_admin.administrative_units WHERE level = 'xa')
            WHERE code = 'CB'""",
    )

    # Xã chưa có trong tệp ranh giới (không có tệp): tâm xấp xỉ, kéo tâm lọt ra ngoài tỉnh vào trong (cách biên ~1 km)
    await ex(
        conn,
        """
        WITH prov AS (SELECT geom FROM spatial_admin.administrative_units WHERE code = 'CB')
        UPDATE spatial_admin.administrative_units u
           SET center = ST_ClosestPoint(ST_Buffer((SELECT geom FROM prov), -0.01), u.center)
         WHERE u.level = 'xa' AND u.geom IS NULL
           AND NOT ST_Contains(ST_Buffer((SELECT geom FROM prov), -0.005), u.center)
        """,
    )
    # ... và ranh giới xấp xỉ: Voronoi từ tâm xã, cắt theo ranh giới tỉnh
    await ex(
        conn,
        """
        WITH prov AS (SELECT geom FROM spatial_admin.administrative_units WHERE code = 'CB'),
        cells AS (
          SELECT (ST_Dump(ST_VoronoiPolygons(ST_Collect(center), 0, (SELECT ST_Expand(geom, 0.5) FROM prov)))).geom AS cell
            FROM spatial_admin.administrative_units WHERE level = 'xa'
        )
        UPDATE spatial_admin.administrative_units u
           SET geom = ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_Intersection(c.cell, (SELECT geom FROM prov))), 3))
          FROM cells c
         WHERE u.level = 'xa' AND u.geom IS NULL AND ST_Contains(c.cell, u.center)
        """,
    )
    # Phạm vi RBAC: "<CUM>/<MA_XA>" (cụm = địa bàn huyện cũ)
    await ex(
        conn,
        """UPDATE spatial_admin.administrative_units
              SET rbac_domain = CASE WHEN level = 'tinh' THEN '*'
                  ELSE regexp_replace(upper(spatial_admin.norm(old_district)), '[^A-Z0-9]', '', 'g') || '/' || code END
            WHERE level IN ('tinh', 'xa')""",
    )

    for code, name, desc, hazard, names in D.PRESETS:
        await ex(
            conn,
            "INSERT INTO spatial_admin.presets (code, name, description, hazard, kind, unit_codes) VALUES (:c,:n,:d,:h,'luu_vuc',:u)",
            {"c": code, "n": name, "d": desc, "h": hazard, "u": [D.unit_code(n) for n in names]},
        )
    # Không tạo nhóm lọc "Địa bàn … (cũ)" theo huyện cũ: giao diện chỉ dùng 56 xã/phường sau 01/07/2025
    # (migration 0019 xoá các nhóm đã tạo trước đây)

    rows = await fetch_all(
        "SELECT id, code, name, ST_Y(center) AS lat, ST_X(center) AS lon, population, households FROM spatial_admin.administrative_units WHERE level = 'xa'",
        conn=conn,
    )
    by_name = {r["name"]: r for r in rows}

    # Thôn / tổ dân phố + địa danh
    for name, kind, commune, lat, lon in D.PLACE_NAMES:
        await ex(
            conn,
            "INSERT INTO spatial_admin.place_names (name, kind, admin_unit_id, geom) VALUES (:n, :k, :u, ST_SetSRID(ST_MakePoint(:lon,:lat),4326))",
            {"n": name, "k": kind, "u": by_name[commune]["id"], "lat": lat, "lon": lon},
        )
        if kind == "thon":
            await ex(
                conn,
                """INSERT INTO spatial_admin.administrative_units (code, name, level, unit_type, parent_id, center, population, households)
                              VALUES (:code, :n, 'thon', 'thon', :p, ST_SetSRID(ST_MakePoint(:lon,:lat),4326), :pop, :hh)""",
                {
                    "code": f"{D.unit_code(commune)}-{D.slug(name)}",
                    "n": name,
                    "p": by_name[commune]["id"],
                    "lat": lat,
                    "lon": lon,
                    "pop": rng.randint(250, 900),
                    "hh": rng.randint(60, 220),
                },
            )
    return by_name


async def seed_roads(conn: AsyncConnection, units: dict[str, dict]):
    coords = {name: (u["lat"], u["lon"]) for name, u in units.items()}
    coords.update(D.EXTRA_NODES)
    node_ids: dict[str, int] = {}
    for _road, seq, _ in D.ROADS:
        for n in seq:
            if n not in node_ids:
                node_ids[n] = len(node_ids) + 1
                lat, lon = coords[n]
                await ex(
                    conn,
                    "INSERT INTO operations.road_nodes (id, name, geom) VALUES (:i, :n, ST_SetSRID(ST_MakePoint(:lon,:lat),4326))",
                    {"i": node_ids[n], "n": n, "lat": lat, "lon": lon},
                )
    for road, seq, speed in D.ROADS:
        for a, b in zip(seq, seq[1:], strict=False):
            (la, lo), (lb, lob) = coords[a], coords[b]
            # thêm điểm giữa lệch nhẹ để mô phỏng đường uốn lượn miền núi
            mid_lat, mid_lon = (
                (la + lb) / 2 + rng.uniform(-0.006, 0.006),
                (lo + lob) / 2 + rng.uniform(-0.006, 0.006),
            )
            length = haversine_km(la, lo, lb, lob) * 1.35
            await ex(
                conn,
                """INSERT INTO operations.road_segments (road_name, source_node, target_node, length_km, speed_kmh, geom, source)
                              VALUES (:r, :a, :b, :l, :s, ST_SetSRID(ST_MakeLine(ARRAY[ST_MakePoint(:lo,:la), ST_MakePoint(:mlo,:mla), ST_MakePoint(:lob,:lb)]),4326), 'so_do')""",
                {
                    "r": road,
                    "a": node_ids[a],
                    "b": node_ids[b],
                    "l": round(length, 2),
                    "s": speed,
                    "la": la,
                    "lo": lo,
                    "mla": mid_lat,
                    "mlo": mid_lon,
                    "lb": lb,
                    "lob": lob,
                },
            )


async def seed_telemetry(conn: AsyncConnection, units: dict[str, dict], now: datetime):
    anchor = now  # mốc kịch bản: đỉnh mưa quanh anchor + 2h
    for sid, name, stype, river, unit, commune, lat, lon, thr, params in D.STATIONS:
        await ex(
            conn,
            """INSERT INTO iot_telemetry.monitoring_stations (id, name, type, river, unit, admin_unit_id, alarm_thresholds, location)
                          VALUES (:id, :n, :t, :r, :u, :a, CAST(:thr AS jsonb), ST_SetSRID(ST_MakePoint(:lon,:lat),4326))""",
            {
                "id": sid,
                "n": name,
                "t": stype,
                "r": river,
                "u": unit,
                "a": units[commune]["id"],
                "thr": json.dumps(thr),
                "lat": lat,
                "lon": lon,
            },
        )
        # 72 giờ lịch sử, mỗi 20 phút một bản ghi
        rows = []
        for k in range(72 * 3, -1, -1):
            t_rel = -k / 3
            noise = {
                "luong_mua": rng.uniform(-0.6, 0.6),
                "muc_nuoc": rng.uniform(-0.03, 0.03),
                "do_nghieng": rng.uniform(-0.01, 0.01),
                "do_am_dat": rng.uniform(-0.4, 0.4),
            }[stype]
            rows.append(
                {
                    "t": anchor + timedelta(hours=t_rel),
                    "s": sid,
                    "v": scenario.value_for(stype, params, t_rel, noise),
                }
            )
        await conn.exec_driver_sql(
            "INSERT INTO iot_telemetry.sensor_readings (time, station_id, value) VALUES (%(t)s, %(s)s, %(v)s)",
            rows,
        )
        # Dự báo: mực nước 24h (HEC-HMS mô phỏng), mưa 3h (QPF nowcast)
        if stype in ("muc_nuoc", "luong_mua"):
            horizon, model = (24, "HEC-HMS") if stype == "muc_nuoc" else (3, "QPF-NOWCAST")
            for h in range(1, horizon + 1):
                await ex(
                    conn,
                    "INSERT INTO iot_telemetry.forecasts (station_id, time, value, model, issued_at) VALUES (:s,:t,:v,:m,:i)",
                    {
                        "s": sid,
                        "t": anchor + timedelta(hours=h),
                        "v": scenario.value_for(stype, params, h),
                        "m": model,
                        "i": anchor,
                    },
                )

    for rid, name, river, commune, mw, normal, current, gates, lat, lon in D.RESERVOIRS:
        inflow = rng.randint(180, 900)
        await ex(
            conn,
            """INSERT INTO iot_telemetry.reservoirs (id, name, river, admin_unit_id, capacity_mw, normal_level, current_level,
                               inflow_m3s, outflow_m3s, spill_gates_open, spill_gates, location, operating_at)
                          VALUES (:id,:n,:r,:a,:mw,:nl,:cl,:inf,:out,:go,:g, ST_SetSRID(ST_MakePoint(:lon,:lat),4326), now())""",
            {
                "id": rid,
                "n": name,
                "r": river,
                "a": units[commune]["id"],
                "mw": mw,
                "nl": normal,
                "cl": current,
                "inf": inflow,
                "out": round(inflow * 0.7),
                "go": 1 if current > normal - 1 else 0,
                "g": gates,
                "lat": lat,
                "lon": lon,
            },
        )

    for cid, name, commune, lat, lon in D.CAMERAS:
        await ex(
            conn,
            "INSERT INTO iot_telemetry.cameras (id, name, admin_unit_id, stream_url, location) VALUES (:i,:n,:a,:u, ST_SetSRID(ST_MakePoint(:lon,:lat),4326))",
            {
                "i": cid,
                "n": name,
                "a": units[commune]["id"],
                "u": f"rtsp://camera.local/{cid.lower()}",
                "lat": lat,
                "lon": lon,
            },
        )

    for htype, level, name, desc, commune, lat, lon in D.HAZARD_POINTS:
        await ex(
            conn,
            """INSERT INTO iot_telemetry.hazard_points (type, level, name, description, admin_unit_id, reported_at, location)
                          VALUES (:t,:l,:n,:d,:a,:r, ST_SetSRID(ST_MakePoint(:lon,:lat),4326))""",
            {
                "t": htype,
                "l": level,
                "n": name,
                "d": desc,
                "a": units[commune]["id"],
                "r": now - timedelta(minutes=rng.randint(20, 600)),
                "lat": lat,
                "lon": lon,
            },
        )

    for ztype, level, name, depth, commune, shape in D.HAZARD_ZONES:
        if shape[0] == "line":
            wkt = "LINESTRING(" + ", ".join(f"{lon} {lat}" for lat, lon in shape[1]) + ")"
            radius = shape[2]
        else:
            wkt = f"POINT({shape[1][1]} {shape[1][0]})"
            radius = shape[2]
        await ex(
            conn,
            """INSERT INTO iot_telemetry.hazard_zones (type, level, name, depth_m, source, admin_unit_id, valid_until, geom)
                          VALUES (:t,:l,:n,:d,'model',:a,:v, ST_Multi(ST_Buffer(ST_GeomFromText(:w, 4326)::geography, :r)::geometry))""",
            {
                "t": ztype,
                "l": level,
                "n": name,
                "d": depth,
                "a": units[commune]["id"],
                "v": now + timedelta(hours=36),
                "w": wkt,
                "r": radius,
            },
        )


async def seed_item_catalog(conn: AsyncConnection):
    for code, name, cat, unit in D.ITEMS:
        await ex(
            conn,
            "INSERT INTO resources.items (code, name, category, unit) VALUES (:c,:n,:cat,:u)",
            {"c": code, "n": name, "cat": cat, "u": unit},
        )


async def seed_templates(conn: AsyncConnection):
    for code, name, sev, body, params in D.TEMPLATES:
        await ex(
            conn,
            "INSERT INTO communications.message_templates (code, name, severity, body, params) VALUES (:c,:n,:s,:b,:p)",
            {"c": code, "n": name, "s": sev, "b": body, "p": params},
        )


async def seed_resources(conn: AsyncConnection, units: dict[str, dict], now: datetime):
    force_ids: dict[str, str] = {}
    for i, (code, name, org, level, commune, commander, total, skills) in enumerate(D.FORCES):
        lat, lon = jitter(units[commune]["lat"], units[commune]["lon"], 0.6)
        on_mission = 0
        ready = total - rng.randint(0, max(1, total // 8))
        row = await fetch_one(
            """INSERT INTO resources.forces (code, name, org_type, level, admin_unit_id, base_name, commander, contact_phone, radio_freq,
                   personnel_total, personnel_ready, personnel_on_mission, skills, home_location, location)
               VALUES (:c,:n,:o,:l,:a,:b,:cmd,:p,:rf,:t,:r,:m,:s, ST_SetSRID(ST_MakePoint(:lon,:lat),4326), ST_SetSRID(ST_MakePoint(:lon,:lat),4326))
               RETURNING id""",
            {
                "c": code,
                "n": name,
                "o": org,
                "l": level,
                "a": units[commune]["id"],
                "b": f"Trụ sở tại {commune}",
                "cmd": commander,
                "p": phone(200 + i),
                "rf": f"{142 + i * 0.125:.3f} MHz",
                "t": total,
                "r": ready,
                "m": on_mission,
                "s": skills,
                "lat": lat,
                "lon": lon,
            },
            conn,
        )
        force_ids[code] = row["id"]

    for code, name, vtype, cat, fcode, cap in D.VEHICLES:
        loc = await fetch_one(
            "SELECT ST_Y(location) AS lat, ST_X(location) AS lon FROM resources.forces WHERE code = :c",
            {"c": fcode},
            conn,
        )
        lat, lon = jitter(loc["lat"], loc["lon"], 0.3)
        status = "bao_duong" if code in ("CB-X04", "CB-MX03", "CB-FC03") else "san_sang"
        await ex(
            conn,
            """INSERT INTO resources.vehicles (code, name, vehicle_type, category, force_id, status, fuel_level, fuel_updated_at,
                                              capacity, current_location)
                          VALUES (:c,:n,:t,:cat,:f,:s,:fuel, now(),:cap, ST_SetSRID(ST_MakePoint(:lon,:lat),4326))""",
            {
                "c": code,
                "n": name,
                "t": vtype,
                "cat": cat,
                "f": force_ids[fcode],
                "s": status,
                "fuel": rng.choice([35, 55, 70, 80, 90, 100, 100]),
                "cap": cap,
                "lat": lat,
                "lon": lon,
            },
        )

    await seed_item_catalog(conn)

    low_stock = {
        ("K-BLAM", "NUOC_CHAI"),
        ("K-BLAM", "MI_TOM"),
        ("K-NB", "AO_PHAO"),
        ("K-DC-01", "LUONG_KHO"),
        ("K-HL", "TUI_SO_CUU"),
        ("K-BLAC", "GAO"),
        ("K-HA", "AO_PHAO"),
    }
    expiring = {
        ("K-TINH", "THUOC_CO_BAN"),
        ("K-QH", "LUONG_KHO"),
        ("K-TK", "CLORAMIN_B"),
        ("K-NB", "TUI_SO_CUU"),
    }
    for i, (code, name, level, commune) in enumerate(D.WAREHOUSES):
        lat, lon = jitter(units[commune]["lat"], units[commune]["lon"], 0.5)
        row = await fetch_one(
            """INSERT INTO resources.warehouses (code, name, level, admin_unit_id, manager, phone, location)
                                 VALUES (:c,:n,:l,:a,:m,:p, ST_SetSRID(ST_MakePoint(:lon,:lat),4326)) RETURNING id""",
            {
                "c": code,
                "n": name,
                "l": level,
                "a": units[commune]["id"],
                "m": f"Thủ kho {name.split()[-1]}",
                "p": phone(400 + i),
                "lat": lat,
                "lon": lon,
            },
            conn,
        )
        factor = {"tinh": 4.0, "cum": 1.0, "da_chien": 0.35}[level]
        for item, base in D.ITEM_QUOTA.items():
            quota = max(1, round(base * factor))
            if (code, item) in low_stock:
                qty = round(quota * rng.uniform(0.05, 0.18))
            else:
                qty = round(quota * rng.uniform(0.45, 1.25))
            expiry = None
            if item in ("MI_TOM", "LUONG_KHO", "NUOC_CHAI", "THUOC_CO_BAN", "CLORAMIN_B", "TUI_SO_CUU"):
                expiry = date.today() + timedelta(
                    days=rng.randint(12, 25) if (code, item) in expiring else rng.randint(120, 540)
                )
            await ex(
                conn,
                """INSERT INTO resources.inventory (warehouse_id, item_code, quantity, safety_quota, expiry_date, last_updated)
                              VALUES (:w,:i,:q,:s,:e,:t)""",
                {
                    "w": row["id"],
                    "i": item,
                    "q": qty,
                    "s": quota,
                    "e": expiry,
                    "t": now - timedelta(minutes=rng.randint(5, 900)),
                },
            )

    for i, (name, stype, commune, cap) in enumerate(D.EVAC_SITES):
        lat, lon = jitter(units[commune]["lat"], units[commune]["lon"], 0.8)
        risky = commune in D.PRESETS[0][4] or commune in D.PRESETS[1][4]
        occ = round(cap * rng.uniform(0.35, 1.02)) if risky else round(cap * rng.uniform(0, 0.25))
        await ex(
            conn,
            """INSERT INTO resources.evacuation_sites (name, site_type, admin_unit_id, capacity, current_occupancy, contact_phone, location)
                          VALUES (:n,:t,:a,:c,:o,:p, ST_SetSRID(ST_MakePoint(:lon,:lat),4326))""",
            {
                "n": name,
                "t": stype,
                "a": units[commune]["id"],
                "c": cap,
                "o": min(occ, cap + 20),
                "p": phone(600 + i),
                "lat": lat,
                "lon": lon,
            },
        )

    for commune in ["Tân Giang", "Nguyên Bình", "Bảo Lạc", "Trùng Khánh", "Đông Khê", "Bảo Lâm"]:
        lat, lon = jitter(units[commune]["lat"], units[commune]["lon"], 0.5)
        cap = 40_000 if commune == "Tân Giang" else 15_000
        await ex(
            conn,
            """INSERT INTO resources.fuel_depots (name, admin_unit_id, gasoline_l, diesel_l, capacity_l, location)
                          VALUES (:n,:a,:g,:d,:c, ST_SetSRID(ST_MakePoint(:lon,:lat),4326))""",
            {
                "n": f"Điểm tiếp nhiên liệu {commune}",
                "a": units[commune]["id"],
                "g": round(cap * rng.uniform(0.15, 0.5)),
                "d": round(cap * rng.uniform(0.2, 0.5)),
                "c": cap,
                "lat": lat,
                "lon": lon,
            },
        )

    # Kế hoạch sơ tán cho các xã vùng trũng & vùng núi
    for name in set(D.PRESETS[0][4]) | set(D.PRESETS[1][4]):
        u = units[name]
        planned_hh = round(u["households"] * rng.uniform(0.04, 0.12))
        done = rng.uniform(0.3, 0.95)
        await ex(
            conn,
            """INSERT INTO operations.evacuation_progress (admin_unit_id, planned_households, evacuated_households, planned_persons, evacuated_persons)
                          VALUES (:a,:ph,:eh,:pp,:ep)""",
            {
                "a": u["id"],
                "ph": planned_hh,
                "eh": round(planned_hh * done),
                "pp": planned_hh * 4,
                "ep": round(planned_hh * 4 * done),
            },
        )


async def seed_comms(conn: AsyncConnection, units: dict[str, dict], now: datetime) -> dict[str, dict]:
    users = {}
    for username, full, pos, pw, pin, role, domain in D.USERS:
        row = await fetch_one(
            """INSERT INTO communications.users (username, full_name, position, password_hash, pin_hash, email)
                                 VALUES (:u,:f,:p,:pw,:pin,:e) RETURNING id, full_name""",
            {
                "u": username,
                "f": full,
                "p": pos,
                "e": f"{username}@{D.DEMO_EMAIL_DOMAIN}",
                "pw": hash_secret(pw),
                "pin": hash_secret(pin) if pin else None,
            },
            conn,
        )
        users[username] = row
        # Gán vai trò ngay khi tạo (bootstrap RBAC lúc khởi động chỉ gán cho tài khoản do chính nó tạo)
        await ex(
            conn,
            "INSERT INTO public.casbin_rule (ptype, v0, v1, v2) VALUES ('g', :u, :r, :d)",
            {"u": username, "r": role, "d": domain},
        )
    await seed_templates(conn)

    # Danh bạ phân cấp Tỉnh → Xã → Thôn (tên, số điện thoại là giả định)
    idx = 0

    async def add_contact(parent, unit_id, level, org, name, pos, status="truc", sort=0):
        nonlocal idx
        idx += 1
        row = await fetch_one(
            """INSERT INTO communications.contacts (parent_id, admin_unit_id, level, org, full_name, position, phone, radio_freq, status, sort)
                                 VALUES (:pa,:a,:l,:o,:n,:p,:ph,:rf,:s,:so) RETURNING id""",
            {
                "pa": parent,
                "a": unit_id,
                "l": level,
                "o": org,
                "n": name,
                "p": pos,
                "ph": phone(idx),
                "rf": f"{146 + (idx % 40) * 0.025:.3f} MHz" if level != "thon" else None,
                "s": status,
                "so": sort,
            },
            conn,
        )
        return row["id"]

    province = await fetch_one(
        "SELECT id FROM spatial_admin.administrative_units WHERE code = 'CB'", conn=conn
    )
    root = await add_contact(
        None,
        province["id"],
        "tinh",
        "BCH PCTT & TKCN tỉnh",
        "Lê Quang Minh",
        "Trưởng ban – Chủ tịch UBND tỉnh",
    )
    prov_members = [
        ("BCH PCTT & TKCN tỉnh", "Hoàng Đức Chỉ", "Phó Trưởng ban Thường trực – Giám đốc Sở NN&MT"),
        ("Bộ CHQS tỉnh", "Đại tá Nông Văn Hòa", "Phó Trưởng ban – Chỉ huy trưởng Bộ CHQS tỉnh"),
        ("Công an tỉnh", "Đại tá Triệu Minh Quân", "Phó Trưởng ban – Phó Giám đốc Công an tỉnh"),
        ("BĐBP tỉnh", "Đại tá Bế Văn Lực", "Thành viên – Chỉ huy trưởng BĐBP tỉnh"),
        ("Sở Y tế", "BSCKII Hà Thị Thu", "Thành viên – Giám đốc Sở Y tế"),
        ("Đài KTTV tỉnh", "KS. Đàm Văn Tân", "Trưởng phòng Dự báo – Đài KTTV Cao Bằng"),
        ("Văn phòng thường trực BCH", "Nông Văn Trực", "Cán bộ trực ban 24/7"),
    ]
    for i, (org, name, pos) in enumerate(prov_members):
        await add_contact(
            root, province["id"], "tinh", org, name, pos, "truc" if i % 3 != 2 else "san_sang", i + 1
        )
    surnames = [
        "Nông",
        "Hoàng",
        "Bế",
        "Lương",
        "Đàm",
        "Triệu",
        "Lục",
        "Ma",
        "Hà",
        "Lâm",
        "Mông",
        "Sầm",
        "Vi",
        "Lý",
    ]
    given = [
        "Văn Hùng",
        "Thị Lan",
        "Văn Thắng",
        "Đức Anh",
        "Văn Tuấn",
        "Thị Hoa",
        "Minh Khang",
        "Văn Sơn",
        "Quốc Bảo",
        "Văn Phúc",
    ]
    thon_by_unit: dict[str, list[tuple]] = {}
    for pname, kind, commune, *_ in D.PLACE_NAMES:
        if kind == "thon":
            thon_by_unit.setdefault(commune, []).append(pname)
    for j, (cname, *_rest) in enumerate(D.COMMUNES):
        u = units[cname]
        chair = await add_contact(
            root,
            u["id"],
            "xa",
            f"UBND {'phường' if _rest[0] == 'phuong' else 'xã'} {cname}",
            f"{surnames[j % 14]} {given[j % 10]}",
            "Chủ tịch UBND – Trưởng BCH PCTT cấp xã",
            rng.choice(["truc", "truc", "san_sang", "vang"]),
            j,
        )
        await add_contact(
            chair,
            u["id"],
            "xa",
            f"Công an {cname}",
            f"{surnames[(j + 3) % 14]} {given[(j + 4) % 10]}",
            "Trưởng Công an xã",
            "truc",
            1,
        )
        await add_contact(
            chair,
            u["id"],
            "xa",
            f"Ban CHQS {cname}",
            f"{surnames[(j + 6) % 14]} {given[(j + 7) % 10]}",
            "Chỉ huy trưởng Ban CHQS xã",
            "san_sang",
            2,
        )
        for k, thon in enumerate(thon_by_unit.get(cname, [])):
            await add_contact(
                chair,
                u["id"],
                "thon",
                thon,
                f"{surnames[(j + k + 9) % 14]} {given[(j + k + 2) % 10]}",
                "Trưởng thôn / Tổ trưởng",
                "truc",
                3 + k,
            )
    return users


async def seed_operations(conn: AsyncConnection, units: dict[str, dict], users: dict, now: datetime):
    from app.services.sos_nlp import norm, parse_rules

    # đọc từ điển địa danh trong cùng transaction (dữ liệu chưa commit)
    rows = await fetch_all(
        """SELECT u.name, u.code AS unit_code, ST_Y(u.center) AS lat, ST_X(u.center) AS lon, 'xa' AS kind
             FROM spatial_admin.administrative_units u WHERE u.level = 'xa'
           UNION ALL
           SELECT p.name, u.code, ST_Y(p.geom), ST_X(p.geom), p.kind
             FROM spatial_admin.place_names p JOIN spatial_admin.administrative_units u ON u.id = p.admin_unit_id""",
        conn=conn,
    )
    for r in rows:
        base = r["name"]
        for prefix in ("Thôn ", "Tổ dân phố ", "Khu di tích "):
            base = base.removeprefix(prefix)
        r["norm"] = norm(base)

    statuses = [
        "moi",
        "moi",
        "moi",
        "dieu_phoi",
        "thuc_thi",
        "hoan_thanh",
        "hoan_thanh",
        "moi",
        "dieu_phoi",
        "hoan_thanh",
    ]
    for i, (source, msg) in enumerate(D.SOS_MESSAGES[:10]):
        p = parse_rules(msg, rows)
        place = p["place"] or {
            "lat": units["Thục Phán"]["lat"],
            "lon": units["Thục Phán"]["lon"],
            "unit_code": "CB-THUCPHAN",
            "name": "Thục Phán",
        }
        lat, lon = jitter(place["lat"], place["lon"], 0.4)
        status = statuses[i]
        received = now - timedelta(minutes=rng.randint(4, 25) if status == "moi" else rng.randint(40, 300))
        await ex(
            conn,
            """INSERT INTO operations.sos_tickets (reporter_name, reporter_phone, source, raw_message, address, admin_unit_id, location,
                              incident_type, priority, status, trapped_count, vulnerable, received_at, acknowledged_at, resolved_at,
                              status_changed_at)
                          VALUES (:rn,:rp,:src,:msg,:addr,(SELECT id FROM spatial_admin.administrative_units WHERE code = :uc),
                                  ST_SetSRID(ST_MakePoint(:lon,:lat),4326),:it,:pr,:st,:tc,:vu,:rec,:ack,:res,
                                  COALESCE(CAST(:res AS timestamptz), CAST(:ack AS timestamptz), CAST(:rec AS timestamptz)))""",
            {
                "rn": f"Người dân {i + 1}",
                "rp": phone(800 + i),
                "src": source,
                "msg": msg,
                "addr": place["name"],
                "uc": place["unit_code"],
                "lat": lat,
                "lon": lon,
                "it": p["incident_type"],
                "pr": p["priority"],
                "st": status,
                "tc": p["trapped_count"],
                "vu": p["vulnerable"],
                "rec": received,
                "ack": None if status == "moi" else received + timedelta(minutes=2),
                "res": received + timedelta(minutes=95) if status == "hoan_thanh" else None,
            },
        )

    logs = [
        (-190, "van_hanh", "info", "Thủy điện Bảo Lạc B mở 1 cửa xả, lưu lượng xả 420 m³/s", "Bảo Lạc"),
        (
            -160,
            "canh_bao",
            "warning",
            "Đài KTTV: mưa lớn diện rộng, lượng mưa 24h tại Phja Oắc vượt 180 mm",
            "Tĩnh Túc",
        ),
        (
            -140,
            "cuu_ho",
            "info",
            "Đại đội TKCN – Bộ CHQS tỉnh triển khai 2 xuồng trực tại cầu Bằng Giang",
            "Thục Phán",
        ),
        (-120, "van_hanh", "warning", "Thủy điện Bảo Lạc B nâng lên 2 cửa xả, lưu lượng 860 m³/s", "Bảo Lạc"),
        (
            -95,
            "nguoi_dan",
            "info",
            "Zalo OA: người dân gửi 14 ảnh ngập tổ Sông Bằng, phường Nùng Trí Cao",
            "Nùng Trí Cao",
        ),
        (-80, "canh_bao", "danger", "Cảm biến nghiêng đèo Khau Cốc Chà vượt BĐ I (0,52°)", "Khánh Xuân"),
        (
            -60,
            "cuu_ho",
            "info",
            "Đội dân quân xã Hòa An đã di dời 12 hộ thôn Bản Ngắn đến Trường THPT Hòa An",
            "Hòa An",
        ),
        (-45, "he_thong", "info", "Đồng bộ bản tin dự báo HEC-HMS 24h cho 5 trạm thủy văn", None),
        (
            -30,
            "cuu_ho",
            "info",
            "Xuồng CB-X02 đã tiếp cận điểm ngập sâu tổ Hợp Giang, đưa 5 người an toàn",
            "Thục Phán",
        ),
        (-12, "van_hanh", "warning", "Hồ Khuổi Lái mực nước 249,2 m, còn 0,8 m đến MNDBT", "Tam Kim"),
    ]
    for minutes, cat, sev, msg, commune in logs:
        await ex(
            conn,
            "INSERT INTO operations.event_logs (time, category, severity, message, admin_unit_id) VALUES (:t,:c,:s,:m,:a)",
            {
                "t": now + timedelta(minutes=minutes),
                "c": cat,
                "s": sev,
                "m": msg,
                "a": units[commune]["id"] if commune else None,
            },
        )

    # Lịch sử phát tin
    maker, checker = users["trucban"]["id"], users["chihuy"]["id"]
    history = [
        (
            "Cảnh báo xả lũ Thủy điện Bảo Lạc B",
            "XA_LU",
            "cam",
            ["Bảo Lạc", "Hưng Đạo", "Cô Ba"],
            ["SMS", "ZALO_OA", "LOA"],
            -170,
            "sent",
        ),
        (
            "Chuẩn bị sơ tán vùng ven sông Bằng Giang",
            "CHUAN_BI_SO_TAN",
            "vang",
            ["Thục Phán", "Nùng Trí Cao", "Tân Giang"],
            ["SMS", "ZALO_OA", "PUSH"],
            -100,
            "sent",
        ),
        (
            "Yêu cầu di dời khẩn cấp khu Nà Pồng",
            "SAT_LO",
            "do",
            ["Bảo Lâm"],
            ["CELL_BROADCAST", "SMS", "LOA"],
            -8,
            "pending_approval",
        ),
    ]
    for title, tpl, sev, communes, channels, minutes, status in history:
        codes = [D.unit_code(c) for c in communes]
        body = next(t[3] for t in D.TEMPLATES if t[0] == tpl)
        pop = sum(units[c]["population"] for c in communes)
        audience = {
            "households": pop // 4,
            "subscribers": round(pop * 0.82),
            "zalo_followers": round(pop * 0.31),
            "app_users": round(pop * 0.12),
            "speakers": 9 * len(communes),
        }
        metrics = {}
        if status == "sent":
            metrics = {
                "SMS": {
                    "target": audience["subscribers"],
                    "sent": audience["subscribers"],
                    "delivered": round(audience["subscribers"] * 0.97),
                },
                "ZALO_OA": {
                    "target": audience["zalo_followers"],
                    "sent": audience["zalo_followers"],
                    "delivered": round(audience["zalo_followers"] * 0.99),
                    "read": round(audience["zalo_followers"] * 0.71),
                },
                "PUSH": {
                    "target": audience["app_users"],
                    "sent": audience["app_users"],
                    "delivered": round(audience["app_users"] * 0.93),
                },
                "LOA": {
                    "target": audience["speakers"],
                    "sent": audience["speakers"],
                    "delivered": audience["speakers"] - 1,
                },
                "CELL_BROADCAST": {
                    "target": audience["subscribers"],
                    "sent": audience["subscribers"],
                    "delivered": round(audience["subscribers"] * 0.95),
                },
            }
            metrics = {k: v for k, v in metrics.items() if k in channels}
        filled = body
        for key, val in {
            "ten_ho": "Thủy điện Bảo Lạc B",
            "luu_luong": "860",
            "thoi_gian": "14h00",
            "song": "Gâm",
            "dia_diem": ", ".join(communes),
            "so_gio": "6",
            "nguy_co": "ngập lụt ven sông",
            "luong_mua": "215",
            "diem_so_tan": "Trường PTDTNT Bảo Lâm",
        }.items():
            filled = filled.replace("{" + key + "}", val)
        await ex(
            conn,
            """INSERT INTO communications.alert_broadcasts (title, message_body, template_code, severity, target_admin_codes, target_polygon,
                              channels, status, audience, metrics, created_by, created_at, approved_by, approved_at, sent_at)
                          VALUES (:ti,:b,:tpl,:sev,:codes,(SELECT ST_Multi(ST_Union(geom)) FROM spatial_admin.administrative_units WHERE code = ANY(:codes)),
                                  :ch,:st,CAST(:aud AS jsonb),CAST(:met AS jsonb),:mk,:ca,:ck,:aa,:sa)""",
            {
                "ti": title,
                "b": filled,
                "tpl": tpl,
                "sev": sev,
                "codes": codes,
                "ch": channels,
                "st": status,
                "aud": json.dumps(audience),
                "met": json.dumps(metrics),
                "mk": maker,
                "ca": now + timedelta(minutes=minutes),
                "ck": checker if status == "sent" else None,
                "aa": now + timedelta(minutes=minutes + 3) if status == "sent" else None,
                "sa": now + timedelta(minutes=minutes + 3) if status == "sent" else None,
            },
        )

    for i in range(8):
        key = rng.choice(["1", "1", "2", "3"])
        await ex(
            conn,
            "INSERT INTO communications.call_logs (time, caller, ivr_key, category, routed_to, duration_s) VALUES (:t,:c,:k,:cat,:r,:d)",
            {
                "t": now - timedelta(minutes=rng.randint(3, 240)),
                "c": phone(900 + i),
                "k": key,
                "cat": {"1": "Báo ngập lụt", "2": "Báo sạt lở", "3": "Cần hỗ trợ y tế"}[key],
                "r": {
                    "1": "Ca trực Bộ CHQS tỉnh",
                    "2": "Ca trực Công an tỉnh (CNCH)",
                    "3": "Trung tâm Cấp cứu 115",
                }[key],
                "d": rng.randint(40, 320),
            },
        )

    await ex(
        conn,
        """INSERT INTO communications.audit_logs (time, actor_id, actor_name, action, entity, entity_id, details)
                      SELECT created_at, created_by, 'Nông Văn Trực', 'broadcast.create', 'alert_broadcast', code, jsonb_build_object('title', title)
                        FROM communications.alert_broadcasts""",
    )
    await ex(
        conn,
        """INSERT INTO communications.audit_logs (time, actor_id, actor_name, action, entity, entity_id, details)
                      SELECT approved_at, approved_by, 'Hoàng Đức Chỉ', 'broadcast.approve', 'alert_broadcast', code, jsonb_build_object('title', title)
                        FROM communications.alert_broadcasts WHERE approved_at IS NOT NULL""",
    )


# Gán lại xã theo vị trí thực tế (ranh giới xã là xấp xỉ) — phạm vi RBAC dựa trên ranh giới này
RECONCILE = [
    ("spatial_admin.place_names", "geom"),
    ("iot_telemetry.monitoring_stations", "location"),
    ("iot_telemetry.hazard_points", "location"),
    ("iot_telemetry.reservoirs", "location"),
    ("iot_telemetry.cameras", "location"),
    ("resources.forces", "home_location"),
    ("resources.warehouses", "location"),
    ("resources.evacuation_sites", "location"),
    ("resources.fuel_depots", "location"),
    ("operations.sos_tickets", "location"),
]


async def reconcile_admin_units(conn: AsyncConnection):
    for table, col in RECONCILE:
        await ex(
            conn,
            f"""UPDATE {table} t SET admin_unit_id = (
                   SELECT u.id FROM spatial_admin.administrative_units u WHERE u.level = 'xa'
                    ORDER BY u.geom <-> t.{col} LIMIT 1)""",
        )


RESET_SQL = """
TRUNCATE communications.audit_logs, communications.rbac_audit_log, communications.password_reset_tokens,
         community.citizen_reports, communications.call_logs, communications.alert_broadcasts, communications.contacts,
         communications.message_templates, communications.users,
         iot_telemetry.sensor_readings, iot_telemetry.forecasts, iot_telemetry.hazard_zones, iot_telemetry.hazard_points,
         iot_telemetry.cameras, iot_telemetry.reservoirs, iot_telemetry.monitoring_stations,
         operations.dispatch_orders, operations.sos_tickets, operations.event_logs, operations.evacuation_progress,
         operations.road_segments, operations.road_nodes, operations.system_settings, operations.data_submissions,
         resources.inventory, resources.items, resources.warehouses, resources.vehicles, resources.forces,
         resources.fuel_depots, resources.evacuation_sites,
         spatial_admin.place_names, spatial_admin.presets, spatial_admin.administrative_units RESTART IDENTITY CASCADE;
ALTER SEQUENCE operations.sos_code_seq RESTART WITH 1001;
ALTER SEQUENCE communications.broadcast_code_seq RESTART WITH 101;
ALTER SEQUENCE operations.data_submission_code_seq RESTART WITH 1001;
DELETE FROM public.casbin_rule WHERE ptype = 'g'
"""


async def clear_unverified_fuel() -> int:
    """Chạy thật: nhiên liệu phương tiện trước migration 0015 là mặc định 100% (không có cách cập nhật) → xoá về "chưa cập
    nhật". Số đã báo qua giao diện / tệp nhập có fuel_updated_at, giữ nguyên. Trả về số phương tiện đã xoá."""
    async with engine.begin() as conn:
        rows = await fetch_all(
            """UPDATE resources.vehicles SET fuel_level = NULL
                WHERE fuel_updated_at IS NULL AND fuel_level IS NOT NULL RETURNING id""",
            conn=conn,
        )
    return len(rows)


async def drop_sample_roads() -> int:
    """Xoá sơ đồ đường vẽ tay (``source = 'so_do'``) mà bản cũ nạp cả khi chạy thật — chỉ đường cho người dân không được
    vẽ tuyến trên đường giả lập. Đường chính thức (source khác) giữ nguyên. Trả về số đoạn đã xoá."""
    async with engine.begin() as conn:
        removed = await fetch_all(
            "DELETE FROM operations.road_segments WHERE source = 'so_do' RETURNING id", conn=conn
        )
        await ex(
            conn,
            """DELETE FROM operations.road_nodes n WHERE NOT EXISTS (
                   SELECT 1 FROM operations.road_segments s WHERE n.id IN (s.source_node, s.target_node))""",
        )
    return len(removed)


async def main(reset: bool = False):
    preflight.enforce()
    if reset and settings.app_env == "production":
        raise SystemExit("[seed] --reset xoá toàn bộ dữ liệu nghiệp vụ — không cho phép ở APP_ENV=production")
    # Trước bước "đã có dữ liệu → bỏ qua": CSDL đang chạy thật cũng được dọn ở lần triển khai tới (service migrate)
    if not settings.demo_mode and (n := await drop_sample_roads()):
        print(f"[seed] Đã xoá {n} đoạn đường của sơ đồ vẽ tay (chỉ dùng khi DEMO_MODE=true)")
        await invalidate("public:")  # bản đồ công khai bỏ lớp "đường bị chia cắt" vẽ trên đường giả lập
    if not settings.demo_mode and (n := await clear_unverified_fuel()):
        print(f'[seed] {n} phương tiện: nhiên liệu mặc định 100% không có nguồn → "chưa cập nhật"')
    existing = await fetch_one("SELECT count(*) AS n FROM spatial_admin.administrative_units")
    if existing["n"] and not reset:
        print(f"[seed] Đã có {existing['n']} đơn vị hành chính — bỏ qua.")
        await close_redis()
        return
    now = datetime.now(UTC).replace(second=0, microsecond=0)
    async with engine.begin() as conn:
        if reset:
            for stmt in RESET_SQL.split(";"):
                await ex(conn, stmt)
        await ex(
            conn,
            "INSERT INTO operations.system_settings (key, value) VALUES ('scenario_anchor', to_jsonb(CAST(:t AS text)))",
            {"t": now.isoformat()},
        )
        units = await seed_admin(conn)
        if settings.demo_mode:
            # Sơ đồ nối tâm các xã — chỉ để trình diễn định tuyến; chạy thật chờ mạng đường chính thức (README 2.2)
            await seed_roads(conn, units)
            await seed_telemetry(conn, units, now)
            await seed_resources(conn, units, now)
            users = await seed_comms(conn, units, now)
            await seed_operations(conn, units, users, now)
        else:
            await seed_item_catalog(conn)
            await seed_templates(conn)
        await reconcile_admin_units(conn)
    counts = await fetch_one(
        """SELECT (SELECT count(*) FROM spatial_admin.administrative_units WHERE level IN ('tinh','xa')) AS units,
                  (SELECT count(*) FROM iot_telemetry.sensor_readings) AS readings,
                  (SELECT count(*) FROM resources.forces) AS forces,
                  (SELECT count(*) FROM operations.sos_tickets) AS sos"""
    )
    print(f"[seed] Hoàn tất ({'dữ liệu mẫu' if settings.demo_mode else 'dữ liệu nền'}): {counts}")
    await invalidate("public:")  # --reset tạo lại đơn vị hành chính (id mới) → bỏ bản cache công khai cũ
    await close_redis()
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main(reset="--reset" in sys.argv))
