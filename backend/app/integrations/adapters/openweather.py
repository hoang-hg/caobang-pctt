"""Bộ nối OpenWeatherMap One Call 3.0 (cần API key; gói miễn phí 1.000 lượt/ngày).

Để tiết kiệm lượt gọi, mặc định chỉ lấy tại xã có trạm đo mưa (~10 điểm/lượt, chu kỳ 1 giờ ≈ 240 lượt/ngày).
Mưa theo giờ (``hourly[].rain['1h']``, 48 giờ) ghi vào ``area_forecasts`` model OPENWEATHER (tất định → P10=P50=P90).
Tài liệu: https://openweathermap.org/api/one-call-3
"""

from __future__ import annotations

from datetime import UTC, datetime

import httpx

from app.db import execute, fetch_all, transaction

URL = "https://api.openweathermap.org/data/3.0/onecall"
DEFAULT_CONFIG = {"targets": "rain_stations", "units": "metric"}


def parse_onecall(payload: dict) -> list[dict]:
    """Hàm thuần: One Call → dòng dự báo theo giờ."""
    rows = []
    for h in payload.get("hourly", []):
        rain = (h.get("rain") or {}).get("1h", 0.0) or 0.0
        rows.append(
            {
                "time": datetime.fromtimestamp(h["dt"], UTC),
                "precip": round(float(rain), 2),
                "temp_c": h.get("temp"),
                "gust_kmh": round(h["wind_gust"] * 3.6, 1) if h.get("wind_gust") is not None else None,
                "pop": h.get("pop"),
            }
        )
    return rows


async def run(source: dict, api_key: str | None) -> dict:
    if not api_key:
        raise RuntimeError("Chưa cấu hình API key OpenWeather")
    config = {**DEFAULT_CONFIG, **(source.get("config") or {})}
    if config["targets"] == "all":
        units = await fetch_all(
            "SELECT id, ST_Y(center) AS lat, ST_X(center) AS lon FROM spatial_admin.administrative_units WHERE level = 'xa'"
        )
    else:
        units = await fetch_all(
            """SELECT DISTINCT u.id, ST_Y(u.center) AS lat, ST_X(u.center) AS lon
                 FROM iot_telemetry.monitoring_stations s JOIN spatial_admin.administrative_units u ON u.id = s.admin_unit_id
                WHERE s.type = 'luong_mua'"""
        )
    total = 0
    issued = datetime.now(UTC)
    async with httpx.AsyncClient(timeout=30) as client:
        for u in units:
            r = await client.get(
                URL,
                params={
                    "lat": u["lat"],
                    "lon": u["lon"],
                    "appid": api_key,
                    "units": config["units"],
                    "exclude": "minutely,daily,alerts",
                },
            )
            r.raise_for_status()
            async with transaction() as conn:
                for row in parse_onecall(r.json()):
                    await execute(
                        """INSERT INTO iot_telemetry.area_forecasts (admin_unit_id, model, time, precip_p10, precip_p50,
                                  precip_p90, precip_mean, prob_heavy, temp_c, gust_kmh, members, issued_at)
                           VALUES (:u, 'OPENWEATHER', :t, :p, :p, :p, :p, :pop, :temp, :gust, 1, :iss)
                           ON CONFLICT (admin_unit_id, model, time) DO UPDATE SET precip_p10 = EXCLUDED.precip_p10,
                             precip_p50 = EXCLUDED.precip_p50, precip_p90 = EXCLUDED.precip_p90,
                             precip_mean = EXCLUDED.precip_mean, prob_heavy = EXCLUDED.prob_heavy,
                             temp_c = EXCLUDED.temp_c, gust_kmh = EXCLUDED.gust_kmh, issued_at = EXCLUDED.issued_at""",
                        {
                            "u": u["id"],
                            "t": row["time"],
                            "p": row["precip"],
                            "pop": row["pop"],
                            "temp": row["temp_c"],
                            "gust": row["gust_kmh"],
                            "iss": issued,
                        },
                        conn,
                    )
                    total += 1
    return {"points": len(units), "rows": total}
