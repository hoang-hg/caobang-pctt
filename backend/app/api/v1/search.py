"""Omni-search: địa danh, đơn vị hành chính, trạm, hồ chứa, lực lượng, kho, mã SOS hoặc toạ độ GPS."""

import re

from fastapi import APIRouter, Depends

from app.db import fetch_all
from app.rbac.authz import allowed_codes, require_any

router = APIRouter(prefix="/search", tags=["Tìm kiếm"])

COORD_RE = re.compile(r"^\s*(-?\d{1,2}\.\d+)\s*[,; ]\s*(-?\d{2,3}\.\d+)\s*$")


@router.get("")
async def search(q: str, limit: int = 12, user: dict = Depends(require_any("monitoring", "view"))):
    sos_codes = allowed_codes(user, "sos", "view")
    res_codes = allowed_codes(user, "resource", "view")
    q = q.strip()
    if not q:
        return []
    m = COORD_RE.match(q)
    if m:
        lat, lon = float(m.group(1)), float(m.group(2))
        unit = await fetch_all(
            """SELECT name, code FROM spatial_admin.administrative_units
                WHERE level = 'xa' AND ST_Contains(geom, ST_SetSRID(ST_MakePoint(:lon, :lat), 4326))""",
            {"lat": lat, "lon": lon},
        )
        label = f"Toạ độ {lat:.5f}, {lon:.5f}" + (f" – {unit[0]['name']}" if unit else " (ngoài tỉnh)")
        return [
            {
                "kind": "toa_do",
                "label": label,
                "sub": "GPS",
                "lat": lat,
                "lon": lon,
                "admin_code": unit[0]["code"] if unit else None,
            }
        ]

    return await fetch_all(
        """
        WITH q AS (SELECT spatial_admin.norm(:q) AS n)
        SELECT * FROM (
          -- Xóm / tổ dân phố (cấp thôn): dòng phụ là xã trực thuộc, admin_code = mã xã (lọc, phân quyền theo xã)
          SELECT 'hanh_chinh' AS kind, CASE WHEN u.unit_type = 'phuong' THEN 'Phường ' WHEN u.unit_type = 'xa' THEN 'Xã '
                 ELSE '' END || u.name AS label,
                 CASE WHEN u.level = 'thon' THEN CASE WHEN par.unit_type = 'phuong' THEN 'Phường ' ELSE 'Xã ' END || par.name
                      ELSE COALESCE('Địa bàn ' || u.old_district || ' cũ', 'Tỉnh Cao Bằng') END AS sub,
                 ST_Y(COALESCE(u.center, par.center)) AS lat, ST_X(COALESCE(u.center, par.center)) AS lon,
                 CASE WHEN u.level = 'thon' THEN par.code ELSE u.code END AS admin_code, u.code AS ref,
                 similarity(spatial_admin.norm(u.name), (SELECT n FROM q)) AS score
            FROM spatial_admin.administrative_units u
            LEFT JOIN spatial_admin.administrative_units par ON par.id = u.parent_id
          UNION ALL
          SELECT 'dia_danh', p.name, u.name, ST_Y(p.geom), ST_X(p.geom), u.code, p.id::text,
                 similarity(spatial_admin.norm(p.name), (SELECT n FROM q))
            FROM spatial_admin.place_names p JOIN spatial_admin.administrative_units u ON u.id = p.admin_unit_id
           WHERE p.kind <> 'thon'  -- xóm đã có ở cấp thôn phía trên
          UNION ALL
          SELECT 'tram', s.name, s.id, ST_Y(s.location), ST_X(s.location), NULL, s.id,
                 greatest(similarity(spatial_admin.norm(s.name), (SELECT n FROM q)), similarity(lower(s.id), lower(:q)))
            FROM iot_telemetry.monitoring_stations s
          UNION ALL
          SELECT 'ho_chua', r.name, 'Sông ' || r.river, ST_Y(r.location), ST_X(r.location), NULL, r.id,
                 similarity(spatial_admin.norm(r.name), (SELECT n FROM q))
            FROM iot_telemetry.reservoirs r
          UNION ALL
          SELECT 'luc_luong', f.name, f.commander, ST_Y(f.location), ST_X(f.location), NULL, f.id::text,
                 similarity(spatial_admin.norm(f.name), (SELECT n FROM q))
            FROM resources.forces f
           WHERE CAST(:res_all AS boolean) OR f.admin_unit_id IN (SELECT id FROM spatial_admin.administrative_units WHERE code = ANY(:res_codes))
          UNION ALL
          SELECT 'kho', w.name, w.code, ST_Y(w.location), ST_X(w.location), NULL, w.id::text,
                 similarity(spatial_admin.norm(w.name), (SELECT n FROM q))
            FROM resources.warehouses w
           WHERE CAST(:res_all AS boolean) OR w.admin_unit_id IN (SELECT id FROM spatial_admin.administrative_units WHERE code = ANY(:res_codes))
          UNION ALL
          SELECT 'sos', t.code, left(COALESCE(t.address, ''), 60), ST_Y(t.location), ST_X(t.location), NULL, t.id::text,
                 CASE WHEN lower(t.code) = lower(:q) THEN 1 ELSE similarity(lower(t.code), lower(:q)) END
            FROM operations.sos_tickets t
           WHERE CAST(:sos_all AS boolean) OR t.admin_unit_id IN (SELECT id FROM spatial_admin.administrative_units WHERE code = ANY(:sos_codes))
        ) s
        WHERE score > 0.15 OR spatial_admin.norm(label) LIKE '%' || (SELECT n FROM q) || '%'
        ORDER BY (spatial_admin.norm(label) LIKE (SELECT n FROM q) || '%') DESC, score DESC
        LIMIT :limit
        """,
        {
            "q": q,
            "limit": limit,
            "sos_all": sos_codes is None,
            "sos_codes": sos_codes or [],
            "res_all": res_codes is None,
            "res_codes": res_codes or [],
        },
    )
