"""Bộ lọc địa phương dùng chung (Global filter).

Frontend chỉ gửi mã hành chính (`admin_codes=CB-XA-THUCPHAN,CB-XA-TANGIANG`, hoặc để trống = toàn tỉnh).
Backend hợp nhất ranh giới các đơn vị và lọc đối tượng bằng ST_Intersects.
"""

from fastapi import Query

PROVINCE_CODE = "CB"

# Điểm (:lat, :lon) thuộc tỉnh, cho phép lệch 5 km ở biên; ``p`` = dòng ranh giới tỉnh (code 'CB').
# ST_Intersects dùng hộp bao → nhanh cho điểm trong tỉnh; chỉ điểm ngoài ranh giới mới tính khoảng cách geography
# (chậm, ~20 ms với ranh giới ~5.000 đỉnh). CASE bảo đảm thứ tự đánh giá.
IN_PROVINCE_SQL = """CASE WHEN ST_Intersects(p.geom, ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)) THEN TRUE
       ELSE ST_DWithin(p.geom::geography, ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography, 5000) END"""


def parse_codes(
    admin_codes: str | None = Query(None, description="Danh sách mã hành chính, phân tách bởi dấu phẩy"),
) -> list[str]:
    if not admin_codes:
        return []
    codes = [c.strip() for c in admin_codes.split(",") if c.strip()]
    return [] if PROVINCE_CODE in codes else codes


def area_clause(geom_col: str, codes: list[str]) -> str:
    """Trả về điều kiện SQL (luôn hợp lệ) — cần truyền tham số `codes` khi có lọc."""
    if not codes:
        return "TRUE"
    return (
        f"ST_Intersects({geom_col}, (SELECT ST_Union(geom) FROM spatial_admin.administrative_units "
        f"WHERE code = ANY(:codes)))"
    )


def thiessen_ctes(codes: list[str]) -> str:
    """CTE tính trọng số đa giác Thiessen cho mưa bình quân lưu vực (vùng đang xem), viết tiếp sau một CTE `tot(id, …)`
    chứa các trạm CÓ số đo trong khung giờ. Kết quả: `w(id, m2)` = diện tích phần vùng gần trạm đó nhất.

    Mưa bình quân = Σ(mưa trạm × m2) / Σ m2 — trạm đại diện vùng rộng nặng hơn trạm đặt sát nhau (trung bình cộng đếm mỗi trạm
    như nhau). Ranh giới làm đơn giản (~0,1 km) chỉ để tính diện tích nhanh. Dưới 2 trạm (không dựng được đa giác) hoặc vùng
    chưa có ranh giới → `w` rỗng, nơi dùng quay về trung bình cộng. Cần tham số `codes` khi có lọc.

    MATERIALIZED: tính đa giác / diện tích MỘT lần — để PostgreSQL gộp vào truy vấn chính thì phép giao + diện tích lặp lại
    cho từng dòng trạm × giờ (~250 lần, 0,5 giây). Chạy qua `fetch_all_no_jit` (app.db)."""
    units = "code = ANY(:codes)" if codes else f"code = '{PROVINCE_CODE}'"
    return f"""
        area AS MATERIALIZED (
          SELECT ST_SimplifyPreserveTopology(ST_Union(geom), 0.001) AS g
            FROM spatial_admin.administrative_units WHERE {units}),
        pts AS (SELECT s.id, s.location FROM iot_telemetry.monitoring_stations s WHERE s.id IN (SELECT id FROM tot)),
        cells AS MATERIALIZED (
          SELECT (ST_Dump(ST_VoronoiPolygons(ST_Collect(p.location), 0, ST_Expand(ST_Envelope(a.g), 1)))).geom AS cell
            FROM pts p CROSS JOIN area a WHERE a.g IS NOT NULL GROUP BY a.g),
        w AS MATERIALIZED (
          SELECT p.id, ST_Area(ST_Intersection(c.cell, a.g)::geography) AS m2
            FROM pts p JOIN cells c ON ST_Contains(c.cell, p.location) CROSS JOIN area a)"""


def unit_clause(unit_col: str, codes: list[str]) -> str:
    """Lọc theo khoá ngoại admin_unit_id (nhanh hơn cho bảng không có hình học)."""
    if not codes:
        return "TRUE"
    return f"{unit_col} IN (SELECT id FROM spatial_admin.administrative_units WHERE code = ANY(:codes))"
