"""Dịch vụ giám sát hồ chứa thủy điện, hồ thủy lợi & cảnh báo xả lũ tỉnh Cao Bằng.

Cung cấp thông tin trực quan theo thời gian thực về:
- Mực nước hiện tại so với Mực nước dâng bình thường (MNDBT).
- Lưu lượng nước về hồ (Inflow) và Tổng lưu lượng xả về hạ du (Outflow).
- Số cửa xả tràn đang mở và phân loại cấp độ rủi ro (Bình thường / Xả điều tiết / Xả khẩn cấp).
- Cảnh báo chủ động cho nhân dân các xã hạ du lưu vực sông Bằng Giang, sông Gâm, sông Neo.
"""

from __future__ import annotations

from app.db import fetch_all


def classify_reservoir_status(r: dict) -> tuple[str, str, str]:
    """Phân loại theo số cửa xả tràn đang mở (số liệu vận hành thật), không theo ngưỡng lưu lượng cố định:
    hồ đầy tới MNDBT mà chưa mở cửa là vận hành bình thường, không phải "xả khẩn cấp"."""
    gates_open = r.get("spill_gates_open") or 0
    gates_total = r.get("spill_gates") or 0
    diff = (r.get("current_level") or 0.0) - (r.get("normal_level") or 0.0)

    if gates_open <= 0:
        return "binh_thuong", "Chưa xả tràn", "green"
    if diff > 0 or (gates_total and gates_open * 2 >= gates_total):
        return "xa_khan_cap", "Xả lũ lớn", "red"
    return "xa_dieu_tiet", "Đang xả điều tiết", "orange"


def get_downstream_warning(r: dict, status_code: str) -> str:
    river = r.get("river") or "Bằng Giang"
    gates_open = r.get("spill_gates_open", 0) or 0
    gates_total = r.get("spill_gates", 0) or 0
    outflow = int(r.get("outflow_m3s") or 0)

    # Khuyến cáo chung theo số liệu vận hành; lệnh sơ tán chính thức vẫn đi qua quy trình cảnh báo Maker–Checker
    if status_code == "xa_khan_cap":
        return (
            f"Hồ đang mở {gates_open}/{gates_total} cửa xả tràn, tổng xả khoảng {outflow} m³/s về hạ du sông {river}. "
            f"Người dân vùng hạ du tránh xa mép nước, bãi bồi; neo đậu thuyền bè, di chuyển gia súc lên cao "
            f"và theo dõi cảnh báo chính thức của chính quyền."
        )
    elif status_code == "xa_dieu_tiet":
        return (
            f"Hồ đang mở {gates_open}/{gates_total} cửa xả điều tiết ({outflow} m³/s) để đón lũ. "
            f"Mực nước hạ du sông {river} có thể lên nhanh. Cẩn thận khi qua các ngầm tràn, "
            f"nghiêm cấm trẻ em tắm suối hoặc đánh bắt cá ven bờ."
        )
    else:
        return f"Hồ chưa mở cửa xả tràn. Vẫn theo dõi cảnh báo chính thức khi có mưa lớn trên lưu vực sông {river}."


async def get_reservoirs_overview() -> dict:
    """Lấy danh sách chi tiết các hồ chứa kèm thống kê lưu vực."""
    rows = await fetch_all(
        """
        SELECT r.id, r.name, r.river, r.capacity_mw, r.normal_level, r.current_level,
               r.inflow_m3s, r.outflow_m3s, r.spill_gates_open, r.spill_gates, r.updated_at,
               u.name as admin_name, u.code as admin_code,
               round(ST_Y(r.location)::numeric, 4)::float as lat,
               round(ST_X(r.location)::numeric, 4)::float as lon
          FROM iot_telemetry.reservoirs r
          LEFT JOIN spatial_admin.administrative_units u ON u.id = r.admin_unit_id
         ORDER BY r.river, r.name
        """
    )

    items = []
    total_inflow = 0.0
    total_outflow = 0.0
    spill_count = 0
    emergency_count = 0

    for r in rows:
        st_code, st_label, st_color = classify_reservoir_status(r)
        warning = get_downstream_warning(r, st_code)

        normal = r.get("normal_level") or 1.0
        current = r.get("current_level") or 0.0
        pct = round((current / normal) * 100, 1)
        diff = round(current - normal, 2)

        inflow = round(r.get("inflow_m3s") or 0.0, 1)
        outflow = round(r.get("outflow_m3s") or 0.0, 1)
        total_inflow += inflow
        total_outflow += outflow

        if st_code == "xa_khan_cap":
            emergency_count += 1
            spill_count += 1
        elif st_code == "xa_dieu_tiet":
            spill_count += 1

        items.append(
            {
                "id": r["id"],
                "name": r["name"],
                "river": r["river"] or "Bằng Giang",
                "admin_name": r["admin_name"] or "Cao Bằng",
                "admin_code": r["admin_code"],
                "capacity_mw": r["capacity_mw"],
                "normal_level": r["normal_level"],
                "current_level": r["current_level"],
                "level_diff": diff,
                "volume_pct": pct,
                "inflow_m3s": inflow,
                "outflow_m3s": outflow,
                "spill_gates_open": r["spill_gates_open"],
                "spill_gates": r["spill_gates"],
                "status_code": st_code,
                "status_label": st_label,
                "status_color": st_color,
                "downstream_warning": warning,
                "updated_at": r["updated_at"].isoformat() if r.get("updated_at") else None,
                "lat": r["lat"],
                "lon": r["lon"],
            }
        )

    # Nhóm theo lưu vực sông
    basins = {}
    for it in items:
        basin_name = it["river"]
        if basin_name not in basins:
            basins[basin_name] = {
                "name": basin_name,
                "reservoirs_count": 0,
                "total_inflow": 0.0,
                "total_outflow": 0.0,
                "spilling_count": 0,
            }
        basins[basin_name]["reservoirs_count"] += 1
        basins[basin_name]["total_inflow"] += it["inflow_m3s"]
        basins[basin_name]["total_outflow"] += it["outflow_m3s"]
        if it["status_code"] in ("xa_dieu_tiet", "xa_khan_cap"):
            basins[basin_name]["spilling_count"] += 1

    return {
        "total_reservoirs": len(items),
        "spill_count": spill_count,
        "emergency_count": emergency_count,
        "total_inflow_m3s": round(total_inflow, 1),
        "total_outflow_m3s": round(total_outflow, 1),
        "basins": list(basins.values()),
        "reservoirs": items,
    }
