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


def unit_clause(unit_col: str, codes: list[str]) -> str:
    """Lọc theo khoá ngoại admin_unit_id (nhanh hơn cho bảng không có hình học)."""
    if not codes:
        return "TRUE"
    return f"{unit_col} IN (SELECT id FROM spatial_admin.administrative_units WHERE code = ANY(:codes))"
