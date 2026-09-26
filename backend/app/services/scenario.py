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
