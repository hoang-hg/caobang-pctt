"""Vùng nguy cơ do cảm biến tạo (sạt lở: nghiêng / độ ẩm đất ≥ BĐ II) — an toàn khi cảm biến mất tín hiệu.

Vùng tự hết hạn sau 12 giờ (``simulator._insert_sensor_zone``). Cảm biến mất tín hiệu đúng lúc đang báo động (bị vùi,
mất điện) mà để vùng tự hết hạn → chỉ đường lại báo tuyến qua đó "không qua vùng nguy hiểm". Worker gọi
``hold_stale_sensor_zones`` mỗi nhịp: vùng sắp / vừa hết hạn của trạm KHÔNG có số đo trong ``STALE_MINUTES`` được gia
hạn từng giờ và ghi rõ "trạm mất tín hiệu". Có số đo mới thì vùng hết hạn bình thường (đã dưới ngưỡng) hoặc được tạo lại
(vẫn vượt ngưỡng) theo luồng cảnh báo tự động.
"""

from __future__ import annotations

from app.db import fetch_all
from app.infra.cache import invalidate
from app.services.events import log_event
from app.services.readings import STALE_MINUTES

HELD_MARK = "trạm mất tín hiệu"
HELD_SUFFIX = f" ({HELD_MARK} — giữ cảnh báo)"


async def hold_stale_sensor_zones() -> list[str]:
    """Gia hạn vùng cảm biến của trạm mất tín hiệu. Trả về tên các vùng LẦN ĐẦU bị giữ (đã ghi nhật ký)."""
    rows = await fetch_all(
        f"""WITH t AS (
                SELECT z.id, z.name LIKE '%' || :mark || '%' AS held FROM iot_telemetry.hazard_zones z
                 WHERE z.source = 'sensor' AND z.station_id IS NOT NULL
                   AND z.valid_until < now() + interval '30 minutes'
                   AND z.valid_until > now() - interval '1 hour'  -- vừa hết hạn (worker chậm nhịp) vẫn giữ
                   AND NOT EXISTS (SELECT 1 FROM iot_telemetry.sensor_readings r
                                    WHERE r.station_id = z.station_id
                                      AND r.time > now() - interval '{STALE_MINUTES} minutes')
                 FOR UPDATE)
            UPDATE iot_telemetry.hazard_zones z
               SET valid_until = now() + interval '1 hour',
                   name = CASE WHEN t.held THEN z.name ELSE z.name || :suffix END
              FROM t WHERE z.id = t.id
         RETURNING z.name, t.held""",
        {"mark": HELD_MARK, "suffix": HELD_SUFFIX},
    )
    first = [r["name"] for r in rows if not r["held"]]
    if rows:
        await invalidate("public:")  # vùng nguy hiểm hiện trên cổng công khai
    for name in first:
        await log_event(
            f"Giữ vùng nguy cơ “{name}”: cảm biến mất tín hiệu khi đang báo động — vùng không tự hết hạn cho tới khi "
            "có số đo mới; cử người kiểm tra hiện trường",
            "canh_bao",
            "warning",
        )
    return first
