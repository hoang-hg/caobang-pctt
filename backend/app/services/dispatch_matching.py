"""Khớp nối thông minh: đề xuất nhu cầu và lực lượng/phương tiện phù hợp gần điểm sự cố nhất."""

import math

from app.db import fetch_all

# Yêu cầu theo loại sự cố: kỹ năng ưu tiên + loại phương tiện phù hợp
INCIDENT_PROFILE: dict[str, dict] = {
    "ngap_lut": {"skills": ["lai_xuong", "boi_lan"], "vehicles": ["xuong", "ca_no", "ghe", "xe_loi_nuoc"]},
    "lu_quet": {"skills": ["cuu_ho_vung_nui", "boi_lan"], "vehicles": ["xuong", "flycam", "xe_tai"]},
    "sat_lo": {"skills": ["cuu_ho_sat_lo", "cho_nghiep_vu"], "vehicles": ["may_xuc", "may_ui", "flycam"]},
    "sap_nha": {
        "skills": ["cuu_ho_sat_lo", "cho_nghiep_vu"],
        "vehicles": ["may_xuc", "may_cua", "xe_cuu_thuong"],
    },
    "cap_cuu": {"skills": ["y_te", "so_cuu"], "vehicles": ["xe_cuu_thuong", "xe_loi_nuoc", "xuong"]},
    "tiep_te": {"skills": [], "vehicles": ["xe_tai", "xuong", "xe_loi_nuoc"]},
}

SEARCH_RADII_M = [10_000, 25_000, 60_000]  # địa hình miền núi → nới dần bán kính quét


def suggest_needs(incident_type: str, trapped: int, vulnerable: list[str]) -> dict:
    """Nhu cầu gợi ý cho lệnh điều động."""
    people = max(trapped, 1)
    needs: dict = {"personnel": 3, "vehicles": {}, "supplies": {}}
    if incident_type in ("ngap_lut", "lu_quet"):
        needs["vehicles"]["xuong"] = max(1, math.ceil(people / 6))
        needs["personnel"] = 3 * needs["vehicles"]["xuong"]
        needs["supplies"] = {"AO_PHAO": people + 2, "TUI_SO_CUU": 1}
    elif incident_type in ("sat_lo", "sap_nha"):
        needs["vehicles"]["may_xuc"] = 1
        needs["personnel"] = 8 if people > 2 else 5
        needs["supplies"] = {"TUI_SO_CUU": 2, "DEN_PIN": 4, "BAT_TRAI": 4}
    elif incident_type == "cap_cuu":
        needs["vehicles"]["xe_cuu_thuong"] = 1
        needs["personnel"] = 3
        needs["supplies"] = {"TUI_SO_CUU": 2, "THUOC_CO_BAN": 1}
    else:  # tiếp tế
        needs["vehicles"]["xe_tai"] = 1
        needs["personnel"] = 4
        needs["supplies"] = {"MI_TOM": max(5, people), "NUOC_CHAI": max(5, people), "CLORAMIN_B": 2}
    if "thuong_nang" in vulnerable or "thai_phu" in vulnerable:
        needs["supplies"]["TUI_SO_CUU"] = needs["supplies"].get("TUI_SO_CUU", 0) + 1
        needs["vehicles"].setdefault("xe_cuu_thuong", 1)
    return needs


def score_force(force: dict, required_skills: list[str]) -> float:
    """Điểm càng nhỏ càng tốt: khoảng cách (km) trừ thưởng kỹ năng và quân số."""
    skill_hits = len(set(force["skills"]) & set(required_skills))
    return force["distance_m"] / 1000 - 4 * skill_hits - min(force["personnel_ready"], 30) / 10


async def match(ticket: dict) -> dict:
    profile = INCIDENT_PROFILE[ticket["incident_type"]]
    params = {"lat": ticket["lat"], "lon": ticket["lon"]}
    forces: list[dict] = []
    vehicles: list[dict] = []
    used_radius = SEARCH_RADII_M[-1]
    for radius in SEARCH_RADII_M:
        params["r"] = radius
        forces = await fetch_all(
            """
            SELECT f.id, f.code, f.name, f.org_type, f.commander, f.contact_phone, f.personnel_ready, f.skills, f.status,
                   ST_Y(f.location) AS lat, ST_X(f.location) AS lon,
                   ST_Distance(f.location::geography, ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography) AS distance_m
              FROM resources.forces f
             WHERE f.status = 'san_sang' AND f.personnel_ready > 0
               AND ST_DWithin(f.location::geography, ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography, :r)
            """,
            params,
        )
        vehicles = await fetch_all(
            """
            SELECT v.id, v.code, v.name, v.vehicle_type, v.fuel_level, v.capacity, f.name AS force_name, v.force_id,
                   ST_Y(v.current_location) AS lat, ST_X(v.current_location) AS lon,
                   ST_Distance(v.current_location::geography, ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography) AS distance_m
              FROM resources.vehicles v LEFT JOIN resources.forces f ON f.id = v.force_id
             -- Nhiên liệu chưa ai báo (NULL) vẫn gợi ý, giao diện ghi "chưa rõ nhiên liệu"; đã báo dưới 20% thì bỏ
             WHERE v.status = 'san_sang' AND v.vehicle_type = ANY(:types) AND (v.fuel_level IS NULL OR v.fuel_level >= 20)
               AND ST_DWithin(v.current_location::geography, ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography, :r)
             ORDER BY distance_m
            """,
            {**params, "types": profile["vehicles"]},
        )
        if forces and vehicles:
            used_radius = radius
            break

    forces.sort(key=lambda f: score_force(f, profile["skills"]))
    for f in forces:
        f["skill_match"] = sorted(set(f["skills"]) & set(profile["skills"]))
        f["distance_km"] = round(f.pop("distance_m") / 1000, 1)
    for v in vehicles:
        v["distance_km"] = round(v.pop("distance_m") / 1000, 1)

    return {
        "needs": suggest_needs(
            ticket["incident_type"], ticket["trapped_count"], ticket.get("vulnerable") or []
        ),
        "required_skills": profile["skills"],
        "vehicle_types": profile["vehicles"],
        "radius_km": used_radius / 1000,
        "forces": forces[:6],
        "vehicles": vehicles[:8],
    }
