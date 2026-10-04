"""Báo người duyệt lệnh cảnh báo cả khi họ không mở hệ thống (trước đây chỉ có thông báo 6 giây trên màn hình đang mở):

- Lệnh mới chờ phê duyệt (trực ban soạn, hệ thống tự sinh từ dự báo / cảm biến) → email người có quyền phê duyệt toàn
  tỉnh đã được cấp PIN (trừ người soạn).
- Lệnh đang hiệu lực sắp hết hạn → sự kiện ``broadcast.expiring`` (thông báo trên màn hình đang mở) + email + nhật ký sự
  kiện, MỘT lần cho mỗi mốc hết hạn (gia hạn → mốc mới → nhắc lại trước mốc mới). Hết hạn thì cảnh báo thôi hiện cho
  người dân — bão kéo dài mà không ai gia hạn thì người dân mất cảnh báo giữa đêm. Chạy ở worker (1 bản).
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Coroutine

from app.config import settings
from app.db import fetch_all
from app.infra.mailer import send_mail
from app.infra.redis import get_redis
from app.rbac.authz import usernames_with
from app.services.broadcast import active_alert_sql, valid_until_sql
from app.services.events import log_event
from app.services.readings import vn_time
from app.ws.hub import hub

log = logging.getLogger(__name__)

EVERY_S = 60
REMIND_BEFORE_MIN = 60  # nhắc khi còn ngần này phút (lệnh hiệu lực ngắn: khi còn nửa thời hạn)
SEVERITY = {"do": "Rất cao (đỏ)", "cam": "Cao (cam)", "vang": "Trung bình (vàng)"}

# Lệnh còn hiệu lực và đã tới lúc nhắc: còn ≤ 60 phút, hoặc ≤ nửa thời hạn với lệnh ngắn (lệnh 1 giờ không bị nhắc ngay
# khi vừa duyệt)
EXPIRING_SQL = f"""
SELECT b.id, b.code, b.title, {valid_until_sql("b")} AS valid_until
  FROM communications.alert_broadcasts b
 WHERE {active_alert_sql("b")}
   AND {valid_until_sql("b")} <= now() + LEAST(make_interval(mins => {REMIND_BEFORE_MIN}),
                                                make_interval(hours => b.valid_hours) / 2)
"""

_background: set[asyncio.Task] = set()


def in_background(coro: Coroutine) -> None:
    """Gửi email không bắt người dùng chờ (máy chủ thư chậm tới 20 giây mỗi người nhận); giữ tham chiếu tới khi xong."""
    task = asyncio.create_task(coro)
    _background.add(task)
    task.add_done_callback(_background.discard)


def _link() -> str:
    return f"{settings.public_base_url.rstrip('/')}/canh-bao"


async def approver_emails(exclude_user_id=None) -> list[str]:
    """Email người duyệt được mọi lệnh: quyền phê duyệt toàn tỉnh (Cấp 1–2) + đã cấp PIN ký, tài khoản còn hoạt động."""
    names = usernames_with("alert", "approve")
    if not names:
        return []
    rows = await fetch_all(
        """SELECT DISTINCT email FROM communications.users
            WHERE username = ANY(:u) AND is_active AND pin_hash IS NOT NULL AND coalesce(email, '') <> ''
              AND (CAST(:x AS text) IS NULL OR id::text <> CAST(:x AS text))""",
        {"u": sorted(names), "x": str(exclude_user_id) if exclude_user_id else None},
    )
    return sorted(r["email"] for r in rows)


def draft_mail(b: dict, creator_name: str | None) -> tuple[str, str]:
    audience = b.get("audience") or {}
    subject = f"[BCH PCTT Cao Bằng] Lệnh cảnh báo {b['code']} chờ phê duyệt: {b['title']}"
    body = (
        f"{creator_name or 'Hệ thống (tự động từ dự báo / cảm biến)'} vừa soạn lệnh cảnh báo {b['code']} — mức "
        f"{SEVERITY.get(b.get('severity'), b.get('severity'))} — đang chờ phê duyệt.\n\n"
        f"Tiêu đề: {b['title']}\nNội dung: {b['message_body']}\n"
        f"Vùng nhận: {len(b.get('target_admin_codes') or [])} xã/phường"
        + (f", khoảng {audience['households']} hộ" if audience.get("households") else "")
        + f"\nHiệu lực: {b.get('valid_hours', 48)} giờ kể từ lúc phê duyệt\n\n"
        f"Phê duyệt (cần mã PIN) hoặc từ chối: {_link()}\n\n"
        "Lệnh chỉ được công bố cho người dân sau khi phê duyệt.\n"
    )
    return subject, body


async def mail_new_draft(b: dict, creator: dict | None) -> None:
    to = await approver_emails(creator["id"] if creator else None)
    if not to:
        return
    subject, body = draft_mail(b, creator["full_name"] if creator else None)
    await asyncio.gather(*(send_mail(e, subject, body) for e in to))


def expiring_mail(b: dict) -> tuple[str, str]:
    at = vn_time(b["valid_until"])
    subject = f"[BCH PCTT Cao Bằng] Cảnh báo {b['code']} hết hiệu lực lúc {at}"
    body = (
        f"Lệnh cảnh báo {b['code']} “{b['title']}” sẽ hết hiệu lực lúc {at} (giờ Việt Nam). Hết hiệu lực thì cảnh báo "
        "thôi hiện cho người dân trên cổng công khai, “Tôi đang ở đâu?” và bản nhẹ.\n\n"
        "Còn nguy hiểm: gia hạn (cần mã PIN). Đã hết nguy hiểm: kết thúc, hoặc để tự hết hạn.\n\n"
        f"Mở trang Cảnh báo: {_link()}\n"
    )
    return subject, body


class AlertWatch:
    def __init__(self) -> None:
        self._task: asyncio.Task | None = None
        self._reminded: set[str] = set()

    def start(self) -> None:
        self._task = asyncio.create_task(self._loop())

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()

    async def _loop(self) -> None:
        await asyncio.sleep(20)  # chờ các dịch vụ khác khởi động xong
        while True:
            try:
                await self.remind_expiring()
            except Exception:
                log.exception("[alert-watch] kiểm tra cảnh báo sắp hết hiệu lực lỗi")
            await asyncio.sleep(EVERY_S)

    async def _first_time(self, b: dict) -> bool:
        """Mỗi mốc hết hạn nhắc 1 lần; Redis giữ dấu qua lần khởi động lại worker."""
        key = f"{b['id']}:{b['valid_until'].isoformat()}"
        if key in self._reminded:
            return False
        self._reminded.add(key)
        r = get_redis()
        if r is None:
            return True
        try:
            return bool(await r.set(f"pctt:alert-expiring:{key}", "1", nx=True, ex=6 * 3600))
        except Exception:
            return True

    async def remind_expiring(self) -> list[str]:
        due = [b for b in await fetch_all(EXPIRING_SQL) if await self._first_time(b)]
        if not due:
            return []
        to = await approver_emails()
        for b in due:
            await hub.publish(
                "broadcast.expiring",
                {"id": b["id"], "code": b["code"], "title": b["title"], "valid_until": b["valid_until"]},
            )
            await log_event(
                f"Cảnh báo {b['code']} “{b['title']}” hết hiệu lực lúc {vn_time(b['valid_until'])} — gia hạn nếu còn "
                "nguy hiểm",
                "canh_bao",
                "warning",
            )
            subject, body = expiring_mail(b)
            await asyncio.gather(*(send_mail(e, subject, body) for e in to))
        return [b["code"] for b in due]


alert_watch = AlertWatch()
