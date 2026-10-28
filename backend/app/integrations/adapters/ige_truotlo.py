"""Bộ nối hệ thống Cảnh báo đa thiên tai của Viện Địa công nghệ và Môi trường (caobang.canhbaothientai.org.vn).

API công khai (không cần khoá) `GET {base_url}/stations` → danh sách trạm (`rain_gauge`, `siren_warning`, `light_warning`);
`GET {base_url}/stations/{id}/records?hours=N` → lượng mưa từng 10 phút (`rainfall`, mm trong khoảng đo).

- Chỉ nhận TRẠM ĐO MƯA nằm trong tỉnh Cao Bằng (danh sách của Viện có cả trạm tỉnh khác) → `monitoring_stations`
  mã `IGE-<mã trạm>`, `source = 'external'` (bộ mô phỏng không bao giờ sinh số cho trạm này).
- Số đo của hệ thống là CƯỜNG ĐỘ mm/giờ (cộng trung bình từng giờ = tổng mưa): lượng mưa một khoảng đo × 60 / số phút
  của khoảng. Ghi `ON CONFLICT DO NOTHING` — kéo lại không nhân đôi.
- Còi hú, đèn cảnh báo: chưa nhận (hệ thống chưa có loại thiết bị này).
- Dự báo nguy cơ trượt lở / sạt lở / lũ quét theo xã: chờ Viện mở API (bảng theo ngày dựng phía máy chủ Next.js, chưa có
  đường gọi công khai).
"""

from __future__ import annotations

import math
from datetime import UTC, datetime

import httpx
from sqlalchemy import text

from app.config import settings
from app.db import fetch_all, fetch_one, transaction

DEFAULT_CONFIG = {"base_url": settings.ige_truotlo_url, "max_hours": 24}
MAX_MM_PER_RECORD = 120  # > 120 mm trong một khoảng đo (≤ 1 giờ) coi là lỗi thiết bị — bỏ, không ghi
STATION_PREFIX = "IGE-"


def _parse_time(raw: str) -> datetime | None:
    try:
        t = datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
    except ValueError:
        return None
    return t if t.tzinfo else t.replace(tzinfo=UTC)


def to_intensity(records: list[dict], now: datetime) -> tuple[list[tuple[datetime, float]], int]:
    """Lượng mưa từng khoảng đo → (thời điểm, cường độ mm/giờ). Khoảng đo = khoảng cách nhỏ nhất giữa 2 bản ghi liền nhau
    (mặc định 10 phút). Bỏ bản ghi thiếu / âm / quá lớn / ở tương lai. → (danh sách, số bản ghi bị bỏ)."""
    pts = []
    skipped = 0
    for r in records:
        t = _parse_time(r.get("record_time"))
        mm = r.get("rainfall")
        if (
            t is None
            or not isinstance(mm, int | float)
            or isinstance(mm, bool)
            or not 0 <= mm <= MAX_MM_PER_RECORD
        ):
            skipped += 1
            continue
        if t > now:
            skipped += 1
            continue
        pts.append((t, float(mm)))
    pts.sort()
    gaps = [(b[0] - a[0]).total_seconds() / 60 for a, b in zip(pts, pts[1:], strict=False) if b[0] > a[0]]
    step = min(gaps) if gaps else 10.0
    step = min(max(step, 1.0), 60.0)
    return [(t, round(mm * 60 / step, 2)) for t, mm in pts], skipped


async def run(source: dict, _secret: str | None) -> dict:
    cfg = {**DEFAULT_CONFIG, **(source.get("config") or {})}
    base = str(cfg["base_url"]).rstrip("/")
    now = datetime.now(UTC)
    stats = {"rows": 0, "stations": 0, "outside_province": 0, "skipped_records": 0}
    async with httpx.AsyncClient(timeout=30, headers={"Accept": "application/json"}) as client:
        r = await client.get(f"{base}/stations")
        r.raise_for_status()
        gauges = [
            s
            for s in (r.json().get("data") or [])
            if s.get("station_type") == "rain_gauge"
            and isinstance(s.get("lat"), int | float)
            and isinstance(s.get("lon"), int | float)
        ]
        if not gauges:
            return stats
        # Trong tỉnh: trong ranh giới tỉnh (hoặc sát ranh giới ≤ 2 km) — cùng ranh giới với mặt nạ bản đồ
        inside = {
            row["code"]: row["admin_unit_id"]
            for row in await fetch_all(
                """SELECT g.code,
                          (SELECT u.id FROM spatial_admin.administrative_units u WHERE u.level = 'xa' AND u.geom IS NOT NULL
                            ORDER BY u.geom <-> g.pt LIMIT 1) AS admin_unit_id
                     FROM (SELECT code, ST_SetSRID(ST_MakePoint(lon, lat), 4326) AS pt
                             FROM unnest(CAST(:codes AS text[]), CAST(:lats AS float8[]), CAST(:lons AS float8[]))
                                  AS t(code, lat, lon)) g
                    WHERE EXISTS (SELECT 1 FROM spatial_admin.administrative_units p
                                   WHERE p.level = 'tinh' AND p.geom IS NOT NULL
                                     AND ST_DWithin(p.geom::geography, g.pt::geography, 2000))""",
                {
                    "codes": [str(s["code"]) for s in gauges],
                    "lats": [float(s["lat"]) for s in gauges],
                    "lons": [float(s["lon"]) for s in gauges],
                },
            )
        }
        stats["outside_province"] = len(gauges) - len(inside)
        for s in gauges:
            code = str(s["code"])
            if code not in inside:
                continue
            sid = f"{STATION_PREFIX}{code}"
            last = await fetch_one(
                "SELECT max(time) AS t FROM iot_telemetry.sensor_readings WHERE station_id = :s", {"s": sid}
            )
            since_h = (now - last["t"]).total_seconds() / 3600 if last and last["t"] else cfg["max_hours"]
            hours = max(1, min(int(cfg["max_hours"]), math.ceil(since_h) + 1))
            rec = await client.get(f"{base}/stations/{s['id']}/records", params={"hours": hours})
            rec.raise_for_status()
            points, skipped = to_intensity((rec.json().get("data") or {}).get("records") or [], now)
            stats["skipped_records"] += skipped
            async with transaction() as conn:
                await conn.execute(
                    text(
                        """INSERT INTO iot_telemetry.monitoring_stations
                                  (id, name, type, unit, admin_unit_id, alarm_thresholds, status, source, location)
                           VALUES (:id, :name, 'luong_mua', 'mm/h', :adm, '{}', 'online', 'external',
                                   ST_SetSRID(ST_MakePoint(:lon, :lat), 4326))
                           ON CONFLICT (id) DO UPDATE SET location = EXCLUDED.location, admin_unit_id = EXCLUDED.admin_unit_id"""
                    ),
                    {
                        "id": sid,
                        "name": f"Trạm đo mưa {s.get('name') or code} (Viện ĐCN&MT)",
                        "adm": inside[code],
                        "lat": float(s["lat"]),
                        "lon": float(s["lon"]),
                    },
                )
                for t, v in points:
                    res = await conn.execute(
                        text(
                            """INSERT INTO iot_telemetry.sensor_readings (time, station_id, value) VALUES (:t, :s, :v)
                               ON CONFLICT (station_id, time) DO NOTHING"""
                        ),
                        {"t": t, "s": sid, "v": v},
                    )
                    stats["rows"] += res.rowcount or 0
            stats["stations"] += 1
    return stats
