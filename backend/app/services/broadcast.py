"""Phát cảnh báo đa kênh: ước tính đối tượng nhận trong vùng + adapter giả lập các kênh.

Các adapter (SMS Brandname, Cell Broadcast, Zalo OA, Push, loa thông minh) ở đây là MÔ PHỎNG:
chúng sinh số liệu giao nhận tăng dần để hiển thị Delivery Dashboard. Khi tích hợp thật, thay
`advance_delivery` bằng callback trạng thái từ nhà mạng / Zalo / FCM.
"""

import json
import random

from app.db import fetch_one

ALERT_VALID_HOURS = (6, 12, 24, 48, 72)  # lựa chọn thời hạn hiệu lực khi soạn (API nhận 1–168 giờ)


def valid_until_sql(alias: str = "") -> str:
    """Hết hiệu lực lúc: valid_until (đặt khi duyệt, gia hạn được); lệnh cũ / dữ liệu mẫu chưa có thì lúc phát + hạn."""
    a = f"{alias}." if alias else ""
    return f"COALESCE({a}valid_until, COALESCE({a}sent_at, {a}approved_at) + make_interval(hours => {a}valid_hours))"


def active_alert_sql(alias: str = "") -> str:
    """Điều kiện SQL "cảnh báo đang hiệu lực" — dùng chung cổng công khai, "Tôi đang ở đâu?", bản nhẹ, màn hình cảnh
    báo: đã duyệt phát, chưa bị kết thúc, chưa quá hạn hiệu lực."""
    a = f"{alias}." if alias else ""
    return f"{a}status IN ('sending', 'sent') AND {a}ended_at IS NULL AND {valid_until_sql(alias)} > now()"


CHANNELS = {
    "SMS": "SMS Brandname",
    "CELL_BROADCAST": "Cell Broadcast (theo trạm BTS)",
    "ZALO_OA": "Zalo OA",
    "PUSH": "Push Notification (Critical Alert)",
    "LOA": "Loa truyền thanh thông minh",
}

# Tỷ lệ tối đa cuối cùng theo kênh (giao thành công / đã xem)
FINAL_RATES = {
    "SMS": {"delivered": 0.965},
    "CELL_BROADCAST": {"delivered": 0.95},
    "ZALO_OA": {"delivered": 0.99, "read": 0.72},
    "PUSH": {"delivered": 0.93, "read": 0.64},
    "LOA": {"delivered": 0.97},
}


async def estimate_audience(target_codes: list[str], polygon_geojson: dict | None) -> dict:
    """Đếm hộ dân / thuê bao / loa trong vùng — nội suy theo tỷ lệ diện tích giao cắt với từng xã."""
    if polygon_geojson:
        target_sql = "ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(:poly), 4326))"
        params = {"poly": json.dumps(polygon_geojson)}
    else:
        target_sql = (
            "(SELECT ST_Union(geom) FROM spatial_admin.administrative_units WHERE code = ANY(:codes))"
        )
        params = {"codes": target_codes}
    row = await fetch_one(
        f"""
        WITH target AS (SELECT {target_sql} AS g),
        parts AS (
          SELECT u.code, u.population, u.households,
                 ST_Area(ST_Intersection(u.geom, t.g)::geography) / NULLIF(ST_Area(u.geom::geography), 0) AS ratio
            FROM spatial_admin.administrative_units u, target t
           WHERE u.level = 'xa' AND ST_Intersects(u.geom, t.g)
        )
        SELECT COALESCE(round(sum(population * ratio)), 0)::int AS population,
               COALESCE(round(sum(households * ratio)), 0)::int AS households,
               COALESCE(array_agg(code) FILTER (WHERE ratio > 0.01), '{{}}') AS codes,
               (SELECT round(ST_Area(g::geography) / 1e6)::int FROM target) AS area_km2
          FROM parts
        """,
        params,
    )
    pop = row["population"] or 0
    return {
        "population": pop,
        "households": row["households"] or 0,
        "subscribers": round(pop * 0.82),
        "zalo_followers": round(pop * 0.31),
        "app_users": round(pop * 0.12),
        "speakers": max(1, round(pop / 1200)),
        "area_km2": row["area_km2"] or 0,
        "admin_codes": row["codes"] or [],
    }


def channel_target(channel: str, audience: dict) -> int:
    return {
        "SMS": audience.get("subscribers", 0),
        "CELL_BROADCAST": audience.get("subscribers", 0),
        "ZALO_OA": audience.get("zalo_followers", 0),
        "PUSH": audience.get("app_users", 0),
        "LOA": audience.get("speakers", 0),
    }[channel]


def init_metrics(channels: list[str], audience: dict, integrated: bool = True) -> dict:
    """Số liệu giao nhận ban đầu từng kênh. ``integrated=False``: kênh chưa nối cổng gửi tin thật — giao diện hiện
    "chưa tích hợp" thay cho thanh tiến độ (không để trực ban tưởng tin đã tới điện thoại người dân)."""
    return {
        ch: {
            "target": channel_target(ch, audience),
            "sent": 0,
            "delivered": 0,
            **({"read": 0} if "read" in FINAL_RATES[ch] else {}),
            **({} if integrated else {"integrated": False}),
        }
        for ch in channels
    }


def advance_delivery(metrics: dict, rng: random.Random | None = None) -> tuple[dict, bool]:
    """Một bước mô phỏng giao nhận. Trả về (metrics mới, đã hoàn tất?)."""
    rng = rng or random.Random()
    done = True
    for ch, m in metrics.items():
        target = m["target"]
        m["sent"] = min(target, m["sent"] + max(1, round(target * rng.uniform(0.18, 0.35))))
        final_delivered = round(target * FINAL_RATES[ch]["delivered"])
        m["delivered"] = min(
            final_delivered, m["sent"], m["delivered"] + max(1, round(target * rng.uniform(0.12, 0.3)))
        )
        if "read" in m:
            final_read = round(target * FINAL_RATES[ch]["read"])
            m["read"] = min(
                final_read, m["delivered"], m["read"] + max(1, round(target * rng.uniform(0.05, 0.15)))
            )
            done = done and m["read"] >= final_read
        done = done and m["sent"] >= target and m["delivered"] >= final_delivered
    return metrics, done


def fill_template(body: str, params: dict[str, str]) -> str:
    for key, val in params.items():
        body = body.replace("{" + key + "}", str(val))
    return body
