"""Bộ nối Open-Meteo: dự báo mưa tổ hợp (ensemble) ECMWF IFS + NOAA GEFS cho tâm 56 xã/phường.

- 1 lần gọi ensemble cho cả 56 toạ độ (ECMWF 51 thành phần + GEFS 31 thành phần, bước 1 giờ, 72 giờ).
- Tính phân vị P10/P50/P90, trung bình, xác suất mưa ≥ 5 mm/h cho từng mô hình và KẾT HỢP (gộp mọi thành phần).
- Tuỳ chọn gọi thêm dự báo tất định ECMWF để lấy nhiệt độ, gió giật.
- Ghi ``iot_telemetry.area_forecasts``; cập nhật nowcast 3 giờ cho trạm mưa (``forecasts`` model QPF-NOWCAST).

Gói miễn phí: phi thương mại, ~10.000 lượt/ngày. Có API key (gói thương mại) → dùng máy chủ customer-*.
Tài liệu: https://open-meteo.com/en/docs/ensemble-api
"""

from __future__ import annotations

import re
from datetime import UTC, datetime

import httpx

from app.db import execute, fetch_all, transaction

ENSEMBLE_URL = "https://ensemble-api.open-meteo.com/v1/ensemble"
FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
CUSTOMER = {
    ENSEMBLE_URL: "https://customer-ensemble-api.open-meteo.com/v1/ensemble",
    FORECAST_URL: "https://customer-api.open-meteo.com/v1/forecast",
}

DEFAULT_CONFIG = {
    "models": ["ecmwf_ifs025", "gfs025"],
    "forecast_days": 3,
    "include_deterministic": True,
    "heavy_mm_h": 5.0,
    "alert_24h_mm": 100.0,
}

KEY_RE = re.compile(r"^(?P<var>[a-z_0-9]+?)(?:_member\d+)?_(?P<model>[a-z0-9_]+)$")


def model_label(suffix: str) -> str:
    if "ecmwf" in suffix:
        return "ECMWF_ENS"
    if "gefs" in suffix or "gfs" in suffix:
        return "GFS_ENS"
    return suffix.upper()


def quantile(sorted_vals: list[float], q: float) -> float:
    if not sorted_vals:
        return 0.0
    pos = (len(sorted_vals) - 1) * q
    lo = int(pos)
    hi = min(lo + 1, len(sorted_vals) - 1)
    return sorted_vals[lo] + (sorted_vals[hi] - sorted_vals[lo]) * (pos - lo)


def summarize_members(values: list[float], heavy: float) -> dict:
    vals = sorted(v for v in values if v is not None)
    if not vals:
        return {}
    return {
        "precip_p10": round(quantile(vals, 0.1), 2),
        "precip_p50": round(quantile(vals, 0.5), 2),
        "precip_p90": round(quantile(vals, 0.9), 2),
        "precip_mean": round(sum(vals) / len(vals), 2),
        "prob_heavy": round(sum(1 for v in vals if v >= heavy) / len(vals), 3),
        "members": len(vals),
    }


def parse_ensemble(location: dict, heavy: float = 5.0) -> list[dict]:
    """Một vị trí của API ensemble → các dòng (model, time, phân vị). Hàm thuần."""
    hourly = location["hourly"]
    times = hourly["time"]
    groups: dict[str, list[list]] = {}
    for key, series in hourly.items():
        if key == "time":
            continue
        m = KEY_RE.match(key)
        if not m or m.group("var") != "precipitation":
            continue
        groups.setdefault(model_label(m.group("model")), []).append(series)
    rows = []
    for i, t in enumerate(times):
        ts = datetime.fromisoformat(t).replace(tzinfo=UTC)
        pooled: list[float] = []
        for label, members in groups.items():
            vals = [s[i] for s in members if i < len(s) and s[i] is not None]
            pooled.extend(vals)
            summary = summarize_members(vals, heavy)
            if summary:
                rows.append({"model": label, "time": ts, **summary})
        summary = summarize_members(pooled, heavy)
        if summary and len(groups) > 1:
            rows.append({"model": "BLEND", "time": ts, **summary})
    return rows


def parse_deterministic(location: dict) -> dict[datetime, dict]:
    """Nhiệt độ, gió giật tất định (ưu tiên ECMWF) theo giờ."""
    hourly = location["hourly"]
    temp_key = next((k for k in hourly if k.startswith("temperature_2m") and "ecmwf" in k), None) or next(
        (k for k in hourly if k.startswith("temperature_2m")), None
    )
    gust_key = next((k for k in hourly if k.startswith("wind_gusts_10m") and "ecmwf" in k), None) or next(
        (k for k in hourly if k.startswith("wind_gusts_10m")), None
    )
    out = {}
    for i, t in enumerate(hourly["time"]):
        out[datetime.fromisoformat(t).replace(tzinfo=UTC)] = {
            "temp_c": hourly[temp_key][i] if temp_key else None,
            "gust_kmh": hourly[gust_key][i] if gust_key else None,
        }
    return out


def _url(base: str, api_key: str | None) -> str:
    return CUSTOMER[base] if api_key else base


async def fetch(
    units: list[dict], config: dict, api_key: str | None
) -> tuple[list[list[dict]], list[dict] | None]:
    lats = ",".join(f"{u['lat']:.4f}" for u in units)
    lons = ",".join(f"{u['lon']:.4f}" for u in units)
    common = {
        "latitude": lats,
        "longitude": lons,
        "forecast_days": config["forecast_days"],
        "timezone": "UTC",
    }
    if api_key:
        common["apikey"] = api_key
    async with httpx.AsyncClient(timeout=60) as client:
        r = await client.get(
            _url(ENSEMBLE_URL, api_key),
            params={**common, "hourly": "precipitation", "models": ",".join(config["models"])},
        )
        r.raise_for_status()
        ens = r.json()
        det = None
        if config.get("include_deterministic"):
            r2 = await client.get(
                _url(FORECAST_URL, api_key),
                params={**common, "hourly": "temperature_2m,wind_gusts_10m", "models": "ecmwf_ifs025"},
            )
            r2.raise_for_status()
            det = r2.json()
    ens = ens if isinstance(ens, list) else [ens]
    if det is not None:
        det = det if isinstance(det, list) else [det]
    return ens, det


async def run(source: dict, api_key: str | None) -> dict:
    config = {**DEFAULT_CONFIG, **(source.get("config") or {})}
    units = await fetch_all(
        """SELECT id, code, name, ST_Y(center) AS lat, ST_X(center) AS lon
             FROM spatial_admin.administrative_units WHERE level = 'xa' ORDER BY code"""
    )
    ens, det = await fetch(units, config, api_key)
    if len(ens) != len(units):
        raise RuntimeError(f"Open-Meteo trả {len(ens)} vị trí, cần {len(units)}")

    issued = datetime.now(UTC)
    total = 0
    async with transaction() as conn:
        for idx, u in enumerate(units):
            rows = parse_ensemble(ens[idx], config["heavy_mm_h"])
            extra = parse_deterministic(det[idx]) if det else {}
            for row in rows:
                weather = extra.get(row["time"], {}) if row["model"] == "BLEND" else {}
                await execute(
                    """INSERT INTO iot_telemetry.area_forecasts (admin_unit_id, model, time, precip_p10, precip_p50,
                              precip_p90, precip_mean, prob_heavy, temp_c, gust_kmh, members, issued_at)
                       VALUES (:u, :m, :t, :p10, :p50, :p90, :mean, :ph, :temp, :gust, :n, :iss)
                       ON CONFLICT (admin_unit_id, model, time) DO UPDATE SET
                         precip_p10 = EXCLUDED.precip_p10, precip_p50 = EXCLUDED.precip_p50,
                         precip_p90 = EXCLUDED.precip_p90, precip_mean = EXCLUDED.precip_mean,
                         prob_heavy = EXCLUDED.prob_heavy, temp_c = EXCLUDED.temp_c, gust_kmh = EXCLUDED.gust_kmh,
                         members = EXCLUDED.members, issued_at = EXCLUDED.issued_at""",
                    {
                        "u": u["id"],
                        "m": row["model"],
                        "t": row["time"],
                        "p10": row["precip_p10"],
                        "p50": row["precip_p50"],
                        "p90": row["precip_p90"],
                        "mean": row["precip_mean"],
                        "ph": row["prob_heavy"],
                        "temp": weather.get("temp_c"),
                        "gust": weather.get("gust_kmh"),
                        "n": row["members"],
                        "iss": issued,
                    },
                    conn,
                )
                total += 1
        await execute(
            "DELETE FROM iot_telemetry.area_forecasts WHERE time < now() - interval '24 hours'", None, conn
        )
        # Nowcast 3 giờ cho trạm đo mưa = P50 kết hợp của xã chứa trạm
        await execute(
            """DELETE FROM iot_telemetry.forecasts f USING iot_telemetry.monitoring_stations s
                WHERE f.station_id = s.id AND s.type = 'luong_mua' AND f.model = 'QPF-NOWCAST'""",
            None,
            conn,
        )
        await execute(
            """INSERT INTO iot_telemetry.forecasts (station_id, time, value, model, issued_at)
               SELECT s.id, a.time, a.precip_p50, 'QPF-NOWCAST', a.issued_at
                 FROM iot_telemetry.monitoring_stations s
                 JOIN iot_telemetry.area_forecasts a ON a.admin_unit_id = s.admin_unit_id AND a.model = 'BLEND'
                WHERE s.type = 'luong_mua' AND a.time > now() AND a.time <= now() + interval '3 hours'""",
            None,
            conn,
        )
    members = {r["model"]: r["members"] for r in parse_ensemble(ens[0], config["heavy_mm_h"])[:3]}
    return {"units": len(units), "rows": total, "members": members, "models": config["models"]}
