"""Đơn vị hành chính, preset lọc nhanh, vùng lọc (phục vụ Bộ lọc địa phương).

Không cần đăng nhập — cổng công khai gọi danh sách xã, ranh giới xã / tỉnh mỗi lần mở trang → cache Redis 1 giờ với tiền
tố "public:" (nhập ranh giới xã bằng công cụ nhập dữ liệu gọi invalidate("public:") nên bản mới có hiệu lực ngay).
"""

from fastapi import APIRouter, Depends

from app.area import parse_codes
from app.db import fetch_all, fetch_one
from app.infra.cache import cached

LEVELS = ("tinh", "xa")  # chỉ cache cấp có thật — tham số lạ không tạo thêm khoá cache
TTL = 3600

router = APIRouter(prefix="/admin-units", tags=["Hành chính"])


@router.get("")
async def list_units(level: str | None = None):
    if level is None or level in LEVELS:
        return await cached(f"public:admin-units:{level or 'all'}", TTL, lambda: _list_units(level))
    return await _list_units(level)


async def _list_units(level: str | None) -> list[dict]:
    return await fetch_all(
        """SELECT u.id, u.code, u.name, u.level, u.unit_type, u.old_district, u.population, u.households, u.tags, u.rbac_domain,
                  p.code AS parent_code, ST_Y(u.center) AS lat, ST_X(u.center) AS lon,
                  CASE WHEN u.geom IS NULL THEN NULL ELSE
                    json_build_array(ST_XMin(u.geom), ST_YMin(u.geom), ST_XMax(u.geom), ST_YMax(u.geom)) END AS bbox
             FROM spatial_admin.administrative_units u
             LEFT JOIN spatial_admin.administrative_units p ON p.id = u.parent_id
            WHERE CAST(:level AS text) IS NULL OR u.level = :level
            ORDER BY u.level, u.old_district, u.name""",
        {"level": level},
    )


@router.get("/geojson")
async def units_geojson(level: str = "xa"):
    if level in LEVELS:
        return await cached(f"public:admin-units-geojson:{level}", TTL, lambda: _units_geojson(level))
    return await _units_geojson(level)


async def _units_geojson(level: str) -> dict:
    rows = await fetch_all(
        """SELECT code, name, unit_type, old_district, population, households, tags,
                  ST_AsGeoJSON(ST_SimplifyPreserveTopology(geom, 0.001), 5)::json AS geom
             FROM spatial_admin.administrative_units WHERE level = :level AND geom IS NOT NULL""",
        {"level": level},
    )
    return {
        "type": "FeatureCollection",
        "features": [{"type": "Feature", "geometry": r.pop("geom"), "properties": r} for r in rows],
    }


@router.get("/presets")
async def presets():
    return await fetch_all(
        "SELECT code, name, description, hazard, kind, unit_codes FROM spatial_admin.presets ORDER BY kind DESC, code"
    )


@router.get("/area")
async def area(codes: list[str] = Depends(parse_codes)):
    """Hình học hợp nhất + bbox của vùng đang lọc (để bản đồ fitBounds và phủ mask ngoài ranh giới).
    Toàn tỉnh (cổng công khai vẽ ranh giới tỉnh) được cache; vùng lọc của cán bộ thì tính mỗi lần."""
    if not codes:
        return await cached("public:admin-units-area:CB", TTL, lambda: _area(codes))
    return await _area(codes)


async def _area(codes: list[str]) -> dict | None:
    where = "code = ANY(:codes)" if codes else "code = 'CB'"
    return await fetch_one(
        f"""SELECT ST_AsGeoJSON(ST_SimplifyPreserveTopology(ST_Union(geom), 0.001), 5)::json AS geometry,
                   json_build_array(ST_XMin(ST_Union(geom)), ST_YMin(ST_Union(geom)), ST_XMax(ST_Union(geom)), ST_YMax(ST_Union(geom))) AS bbox,
                   sum(population) AS population, sum(households) AS households, count(*) AS unit_count
              FROM spatial_admin.administrative_units WHERE {where}""",
        {"codes": codes},
    )


@router.get("/tree")
async def tree():
    rows = await fetch_all(
        """SELECT u.code, u.name, u.level, u.unit_type, u.old_district, p.code AS parent_code
             FROM spatial_admin.administrative_units u LEFT JOIN spatial_admin.administrative_units p ON p.id = u.parent_id
            ORDER BY u.level, u.name"""
    )
    by_code = {r["code"]: {**r, "children": []} for r in rows}
    root = None
    for node in by_code.values():
        if node["parent_code"]:
            by_code[node["parent_code"]]["children"].append(node)
        else:
            root = node
    return root
