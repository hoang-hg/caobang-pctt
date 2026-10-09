"""Kịch bản khí tượng – thủy văn mô phỏng (dùng chung cho seed lịch sử, dự báo và simulator).

Một đợt mưa lớn (hoàn lưu bão) lặp lại theo chu kỳ 96 giờ để bản demo luôn có diễn biến.
`t` = số giờ so với mốc kịch bản (anchor); đỉnh mưa quanh t≈2h, đỉnh lũ trễ ~5h.
"""

import math

PERIOD_H = 96.0


def _phase(t: float) -> float:
    return ((t + 48.0) % PERIOD_H) - 48.0


def rain_intensity(peak: float, t: float, jitter: float = 0.0) -> float:
    """Cường độ mưa mm/h."""
    p = _phase(t)
    storm = math.exp(-(((p - 2.0) / 9.0) ** 2))
    bands = 0.55 + 0.45 * math.sin(p * 1.3) ** 2  # dải mưa dông xen kẽ
    base = 0.25 if -20 < p < 28 else 0.0
    return max(0.0, peak * storm * bands + base + jitter)


def water_level(base: float, amp: float, t: float, jitter: float = 0.0) -> float:
    p = _phase(t)
    flood = math.exp(-(((p - 7.0) / 13.0) ** 2))
    return base + amp * flood + jitter


def tilt(peak: float, t: float, jitter: float = 0.0) -> float:
    """Độ nghiêng tích lũy (độ) — tăng dần sau đỉnh mưa, hồi lại khi hết chu kỳ."""
    p = _phase(t)
    return max(0.0, 0.08 + peak / (1.0 + math.exp(-(p - 1.0) / 3.0)) * (1.0 if p < 40 else 0.3) + jitter)


def soil_moisture(peak: float, t: float, jitter: float = 0.0) -> float:
    p = _phase(t)
    return 26.0 + (peak - 26.0) * math.exp(-(((p - 6.0) / 16.0) ** 2)) + jitter


def value_for(station_type: str, params: dict, t: float, jitter: float = 0.0) -> float:
    if station_type == "luong_mua":
        return round(rain_intensity(params["peak"], t, jitter), 1)
    if station_type == "muc_nuoc":
        return round(water_level(params["base"], params["amp"], t, jitter), 2)
    if station_type == "do_nghieng":
        return round(tilt(params["peak"], t, jitter), 3)
    return round(soil_moisture(params["peak"], t, jitter), 1)


# Hồ chứa mô phỏng: trạm mưa đại diện lưu vực của từng sông (nước về hồ theo mưa các trạm này)
RESERVOIR_RAIN_STATIONS = {
    "Gâm": ["CB-RN-04", "CB-RN-05"],
    "Neo": ["CB-RN-04"],
    "Bằng Giang": ["CB-RN-01", "CB-RN-02"],
    "Suối Khuổi Lái": ["CB-RN-01"],
}


# Mặt hồ quy đổi: Δmực nước (m) mỗi bước 20 giây = (Q về − Q xả) / RESERVOIR_AREA_FACTOR — 150 000 ≈ mặt hồ 3 km²: lũ về
# dư 400 m³/s làm hồ lên ~0,5 m/giờ (25 000 trước đây ≈ 0,5 km²: hồ lên / xuống ~1 m mỗi 20 phút, cửa xả đóng mở liên tục)
RESERVOIR_AREA_FACTOR = 150_000


def reservoir_tick(r: dict, intensity: float, noise: float = 0.0, may_change_gates: bool = True) -> dict:
    """Một bước (20 giây) của hồ mô phỏng: nước về theo mưa lưu vực (mm/h), mực nước theo chênh lệch về – xả, lưu lượng xả
    = 55 % nước về + 180 m³/s mỗi cửa xả đang mở. Vận hành như trưởng ca: mở thêm 1 cửa khi hồ gần MNDBT mà nước về còn
    nhiều hơn nước xả; đóng bớt 1 cửa khi hồ đã xuống thấp mà vẫn đang xả nhiều hơn nước về — `may_change_gates` (bên gọi
    rút thăm) giãn các lần đổi cửa ra vài phút. Dùng chung cho bộ mô phỏng và lịch sử vận hành mẫu 48 giờ (seed) → lịch sử
    và số liệu đang chạy nối liền. `r`: trạng thái hiện tại (current_level có thể None → bắt đầu dưới MNDBT 1,5 m)."""
    inflow = round(max(60, 120 + intensity * 38 + noise))
    outflow_before = r["outflow_m3s"] or 0
    current = r["current_level"] if r["current_level"] is not None else r["normal_level"] - 1.5
    level = current + (inflow - outflow_before) / RESERVOIR_AREA_FACTOR
    gates = r["spill_gates_open"] or 0
    if may_change_gates:
        if level > r["normal_level"] - 0.3 and gates < (r["spill_gates"] or 0) and inflow > outflow_before:
            gates += 1
        elif level < r["normal_level"] - 1.2 and gates > 0 and inflow < outflow_before:
            gates -= 1
    return {
        "inflow_m3s": inflow,
        "outflow_m3s": round(inflow * 0.55 + gates * 180),
        "current_level": round(min(level, r["normal_level"] + 0.4), 3),
        "spill_gates_open": gates,
    }
