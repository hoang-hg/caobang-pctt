"""Dọn nhật ký cũ (worker chạy mỗi giờ): các bảng ghi liên tục không được phình mãi làm đầy ổ đĩa, chậm sao lưu.

Chỉ xoá nhật ký kỹ thuật và dòng sự kiện vận hành. Nhật ký thao tác (audit — chứng cứ pháp lý), phiếu SOS, phản ánh,
lệnh cảnh báo, số đo cảm biến (TimescaleDB đã nén) giữ nguyên. Phiếu SOS, phản ánh, cuộc gọi quá thời hạn lưu dữ liệu cá
nhân (PII_RETENTION_DAYS) được ẩn thông tin cá nhân, không xoá bản ghi (clear_old_pii).
"""

from __future__ import annotations

import logging

from app.config import settings
from app.db import fetch_all, fetch_one
from app.infra import storage

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


# Ẩn dữ liệu cá nhân (DB4): (tên, câu UPDATE theo lô). Giữ số liệu thống kê / vận hành (xã, loại sự cố, mốc thời gian, số
# người, ghi chú của cán bộ, nội dung đã duyệt công khai); vị trí làm tròn lưới 0,001° (~100 m — đủ cho thống kê điểm nóng,
# không chỉ ra nhà ai). Mỗi câu chỉ chọn bản ghi CHƯA ẩn → chạy lại nhiều lần vẫn đúng.
PII_TARGETS = (
    (
        "phiếu SOS",
        f"""UPDATE operations.sos_tickets SET reporter_name = NULL, reporter_phone = NULL, raw_message = NULL, address = NULL,
                   location = ST_SnapToGrid(location, 0.001), pii_cleared_at = now()
             WHERE id IN (SELECT id FROM operations.sos_tickets
                           WHERE pii_cleared_at IS NULL AND status = 'hoan_thanh'
                             AND resolved_at < now() - make_interval(days => :d) LIMIT {BATCH})
            RETURNING NULL::jsonb AS photos""",
    ),
    (
        "phản ánh",
        f"""UPDATE community.citizen_reports r SET reporter_name = NULL, reporter_phone = NULL, address = NULL,
                   description = '[Đã ẩn — quá thời hạn lưu dữ liệu cá nhân]', client_ip_hash = NULL, photos = '[]'::jsonb,
                   location = ST_SnapToGrid(r.location, 0.001), pii_cleared_at = now()
              FROM (SELECT id, photos FROM community.citizen_reports
                     WHERE pii_cleared_at IS NULL AND status <> 'cho_duyet'
                       AND created_at < now() - make_interval(days => :d) LIMIT {BATCH}) old
             WHERE r.id = old.id
            RETURNING old.photos AS photos""",
    ),
    (
        "cuộc gọi tổng đài",
        # SĐT có thể ghi kèm dấu cách / chấm ("0912 345 678") → bỏ ký tự không phải số trước, giữ 3 số cuối
        f"""UPDATE communications.call_logs
               SET caller = regexp_replace(regexp_replace(caller, '\\D', '', 'g'), '\\d(?=\\d{{3}})', 'x', 'g'),
                   pii_cleared_at = now()
             WHERE id IN (SELECT id FROM communications.call_logs
                           WHERE pii_cleared_at IS NULL AND time < now() - make_interval(days => :d) LIMIT {BATCH})
            RETURNING NULL::jsonb AS photos""",
    ),
)


async def clear_old_pii(days: int | None = None) -> dict[str, int]:
    """Ẩn dữ liệu cá nhân quá thời hạn lưu (PII_RETENTION_DAYS, 0 = giữ mãi). Trả về số bản ghi đã ẩn theo loại. Ảnh của
    phản ánh xoá khỏi kho lưu trữ sau khi CSDL đã ghi (lỗi xoá ảnh chỉ ghi log — ảnh mồ côi không còn ai trỏ tới)."""
    days = settings.pii_retention_days if days is None else days
    if days <= 0:
        return {}
    cleared: dict[str, int] = {}
    for name, sql in PII_TARGETS:
        total = 0
        for _ in range(MAX_BATCHES):
            rows = await fetch_all(sql, {"d": days})
            total += len(rows)
            for r in rows:
                for p in r["photos"] or []:
                    for key in (p.get("key"), p.get("thumb_key")):
                        if key:
                            try:
                                await storage.delete(key)
                            except Exception:  # noqa: BLE001 — kho ảnh lỗi không chặn việc ẩn dữ liệu
                                log.warning("Không xoá được ảnh %s", key, exc_info=True)
            if len(rows) < BATCH:
                break
        if total:
            cleared[name] = total
    if cleared:
        log.info("Đã ẩn dữ liệu cá nhân quá %d ngày: %s", days, cleared)
    return cleared
