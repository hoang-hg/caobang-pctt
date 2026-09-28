"""Dọn nhật ký cũ (worker chạy mỗi giờ): các bảng ghi liên tục không được phình mãi làm đầy ổ đĩa, chậm sao lưu.

Chỉ xoá nhật ký kỹ thuật và dòng sự kiện vận hành. Nhật ký thao tác (audit — chứng cứ pháp lý), phiếu SOS, phản ánh,
lệnh cảnh báo, số đo cảm biến (TimescaleDB đã nén) giữ nguyên.
"""

from __future__ import annotations

import logging

from app.config import settings
from app.db import fetch_one

log = logging.getLogger(__name__)

BATCH = 5000  # xoá từng lô: lần đầu dọn bảng đã tích luỹ nhiều năm không khoá bảng / phình WAL một lần
MAX_BATCHES = 40  # tối đa 200.000 dòng / bảng / lần chạy — phần còn lại để giờ sau


def targets() -> list[tuple[str, str, int]]:
    """(bảng, cột thời gian, số ngày giữ). ≤ 0 = giữ mãi."""
    return [
        ("integrations.ingest_log", "time", settings.ingest_log_retention_days),
        ("operations.event_logs", "time", settings.event_log_retention_days),
        # Link đặt lại mật khẩu hết hạn sau 1 giờ; giữ 30 ngày để tra yêu cầu bất thường (IP gửi)
        ("communications.password_reset_tokens", "created_at", 30),
    ]


async def purge_old_logs() -> dict[str, int]:
    """Xoá bản ghi quá hạn giữ. Trả về số dòng đã xoá theo bảng (chỉ bảng có xoá)."""
    deleted: dict[str, int] = {}
    for table, col, days in targets():
        if days <= 0:
            continue
        total = 0
        for _ in range(MAX_BATCHES):
            # Tên bảng / cột từ danh sách cố định ở trên, không từ đầu vào
            row = await fetch_one(
                f"""WITH d AS (
                        DELETE FROM {table} WHERE id IN (
                            SELECT id FROM {table} WHERE {col} < now() - make_interval(days => :d) LIMIT {BATCH})
                        RETURNING 1)
                    SELECT count(*) AS n FROM d""",
                {"d": days},
            )
            total += row["n"]
            if row["n"] < BATCH:
                break
        if total:
            deleted[table] = total
    if deleted:
        log.info("Đã dọn nhật ký cũ: %s", deleted)
    return deleted
