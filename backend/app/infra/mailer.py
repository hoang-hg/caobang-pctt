"""Gửi email qua SMTP (quên mật khẩu). Không cấu hình SMTP_HOST → chỉ ghi log (môi trường dev)."""

from __future__ import annotations

import asyncio
import logging
import smtplib
from email.message import EmailMessage

from app.config import settings

log = logging.getLogger(__name__)


def _send(to: str, subject: str, body: str) -> None:
    msg = EmailMessage()
    msg["From"] = settings.smtp_from
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body)
    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=20) as s:
        if settings.smtp_starttls:
            s.starttls()
        if settings.smtp_user:
            s.login(settings.smtp_user, settings.smtp_password)
        s.send_message(msg)


async def send_mail(to: str, subject: str, body: str) -> bool:
    if not settings.smtp_host:
        log.warning("[mail] SMTP chưa cấu hình — không gửi email tới %s: %s", to, subject)
        return False
    try:
        await asyncio.to_thread(_send, to, subject, body)
        return True
    except Exception:
        log.exception("[mail] gửi email thất bại tới %s", to)
        return False
