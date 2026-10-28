"""Ngưỡng cảnh báo mưa lớn và sạt lở (toàn tỉnh) — lưu ở `operations.system_settings` (khoá `nguong_canh_bao`), cán bộ có
quyền nhập dữ liệu chính thức (`data.import`) sửa ở trang Nhập dữ liệu → tab "Ngưỡng cảnh báo". Chưa ai lưu → giá trị mặc
định dưới đây, giao diện ghi là MINH HOẠ (chưa hiệu chỉnh theo số liệu của tỉnh).

- `mua_24h`: mưa 24 giờ (mm) → Vàng / Cam / Đỏ — màu theo dõi (thuật ngữ KTTV: mưa to > 50, mưa rất to > 100 mm), không phải
  cấp độ rủi ro thiên tai chính thức (docs/trang-a-viec-con-lai.md D6).
- `sat_lo`: ngưỡng kích hoạt sạt lở theo trạm mưa: cường độ I = a · (R/100)^-b (R mưa tích luỹ 72 giờ, mm; I mm/giờ) hoặc
  R vượt `mua_72h`, hoặc cảm biến nghiêng gần đó vượt `nghieng_do` (độ).
"""

from __future__ import annotations

import json
from copy import deepcopy
from typing import Any

from app.db import execute, fetch_one

KEY = "nguong_canh_bao"
LEVELS = ("vang", "cam", "do")
NAME = {"vang": "Vàng", "cam": "Cam", "do": "Đỏ"}

DEFAULTS: dict[str, Any] = {
    "mua_24h": {"vang": 50.0, "cam": 100.0, "do": 200.0},
    "sat_lo": {
        "he_so_a": {"vang": 14.0, "cam": 24.0, "do": 36.0},
        "so_mu_b": 0.6,
        "mua_72h": {"vang": 180.0, "cam": 300.0, "do": 450.0},
        "nghieng_do": {"cam": 1.0, "do": 2.0},
    },
}

# (đường dẫn, nhãn, nhỏ nhất, lớn nhất)
LIMITS = {
    "mua_24h": ("Mưa 24 giờ (mm)", 1, 2000),
    "sat_lo.he_so_a": ("Hệ số a của đường ngưỡng (mm/giờ)", 0.1, 500),
    "sat_lo.mua_72h": ("Mưa tích luỹ 72 giờ (mm)", 1, 5000),
    "sat_lo.nghieng_do": ("Độ nghiêng taluy (độ)", 0.01, 45),
}


def _num(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def validate(body: dict) -> tuple[dict, list[str]]:
    """Kiểm tra ngưỡng gửi lên → (ngưỡng đã chuẩn hoá, danh sách lỗi tiếng Việt). Mỗi nhóm phải tăng dần Vàng < Cam < Đỏ."""
    errors: list[str] = []
    out = deepcopy(DEFAULTS)

    def group(path: str, src: dict | None, levels: tuple[str, ...]) -> dict:
        label, lo, hi = LIMITS[path]
        vals: dict[str, float] = {}
        for lv in levels:
            v = _num((src or {}).get(lv))
            if v is None:
                errors.append(f"{label}: thiếu giá trị mức {NAME[lv]}")
            elif not lo <= v <= hi:
                errors.append(f"{label}: mức {NAME[lv]} phải trong khoảng {lo}–{hi}")
            else:
                vals[lv] = round(v, 2)
        if len(vals) == len(levels) and any(
            vals[a] >= vals[b] for a, b in zip(levels, levels[1:], strict=False)
        ):
            errors.append(f"{label}: phải tăng dần " + " < ".join(NAME[lv] for lv in levels))
        return vals

    sat = body.get("sat_lo") or {}
    out["mua_24h"] = group("mua_24h", body.get("mua_24h"), LEVELS)
    out["sat_lo"]["he_so_a"] = group("sat_lo.he_so_a", sat.get("he_so_a"), LEVELS)
    out["sat_lo"]["mua_72h"] = group("sat_lo.mua_72h", sat.get("mua_72h"), LEVELS)
    out["sat_lo"]["nghieng_do"] = group("sat_lo.nghieng_do", sat.get("nghieng_do"), ("cam", "do"))
    b = _num(sat.get("so_mu_b"))
    if b is None or not 0.05 <= b <= 3:
        errors.append("Số mũ b của đường ngưỡng phải trong khoảng 0,05–3")
    else:
        out["sat_lo"]["so_mu_b"] = round(b, 3)
    source = str(body.get("nguon") or "").strip()
    if len(source) < 5:
        errors.append("Ghi căn cứ của ngưỡng (văn bản, nghiên cứu, cơ quan ban hành) — ít nhất 5 ký tự")
    out["nguon"] = source[:500]
    return out, errors


async def get_thresholds() -> dict:
    """Ngưỡng đang dùng. `minh_hoa`: chưa ai lưu (giá trị mặc định); `nguon`, `cap_nhat`, `nguoi_cap_nhat` khi đã lưu."""
    row = await fetch_one("SELECT value FROM operations.system_settings WHERE key = :k", {"k": KEY})
    if not row or not isinstance(row["value"], dict):
        return {
            **deepcopy(DEFAULTS),
            "minh_hoa": True,
            "nguon": None,
            "cap_nhat": None,
            "nguoi_cap_nhat": None,
        }
    saved = row["value"]
    return {**deepcopy(DEFAULTS), **saved, "minh_hoa": False}


async def save_thresholds(values: dict, user: dict, now_iso: str, conn=None) -> dict:
    stored = {**values, "cap_nhat": now_iso, "nguoi_cap_nhat": user.get("full_name")}
    await execute(
        """INSERT INTO operations.system_settings (key, value) VALUES (:k, CAST(:v AS jsonb))
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()""",
        {"k": KEY, "v": json.dumps(stored, ensure_ascii=False)},
        conn,
    )
    return {**stored, "minh_hoa": False}


def threshold_intensity(t: dict, level: str, rain_72h: float) -> float:
    s = t["sat_lo"]
    return s["he_so_a"][level] * (max(rain_72h, 20) / 100) ** -s["so_mu_b"]


def threshold_curves(t: dict) -> dict:
    """Đường ngưỡng cường độ – lượng mưa tích luỹ 72 giờ cho 3 mức Vàng / Cam / Đỏ."""
    return {
        lv: [
            {"rain_72h": r, "intensity": round(threshold_intensity(t, lv, r), 1)} for r in range(60, 601, 20)
        ]
        for lv in LEVELS
    }


def classify_landslide(t: dict, rain_72h: float, intensity: float, tilt: float | None) -> str:
    s = t["sat_lo"]
    tilt = tilt or 0
    if (
        intensity >= threshold_intensity(t, "do", rain_72h)
        or tilt >= s["nghieng_do"]["do"]
        or rain_72h >= s["mua_72h"]["do"]
    ):
        return "do"
    if (
        intensity >= threshold_intensity(t, "cam", rain_72h)
        or tilt >= s["nghieng_do"]["cam"]
        or rain_72h >= s["mua_72h"]["cam"]
    ):
        return "cam"
    if intensity >= threshold_intensity(t, "vang", rain_72h) or rain_72h >= s["mua_72h"]["vang"]:
        return "vang"
    return "an_toan"
