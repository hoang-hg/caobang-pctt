"""Phiên đăng nhập của NGƯỜI DÂN (cổng công khai, Đ5 — docs/ke-hoach-lam-moi-giao-dien.md mục 11).

Tách hẳn phiên cán bộ (``app.auth``): JWT ký cùng khoá nhưng mang ``aud = "citizen"``. PyJWT từ chối token CÓ ``aud`` khi
nơi đọc không khai audience (``app.auth.user_from_token`` của cán bộ) và từ chối token KHÔNG có ``aud`` khi khai audience
(ở đây) → token người dân không gọi được API điều hành, token cán bộ không thay được phiên người dân.
``tv`` (token_version) như cán bộ: đổi / đặt lại mật khẩu, bị khoá → phiên cũ và đường dẫn đặt lại mật khẩu cũ hết hiệu lực.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import settings
from app.db import fetch_one

AUD = "citizen"
RESET_AUD = "citizen-reset"  # đường dẫn đặt lại mật khẩu gửi qua email
RESET_MINUTES = 30
MUST_CHANGE = (
    "Bạn đang dùng mật khẩu tạm do cán bộ đặt lại — đổi sang mật khẩu của riêng bạn trước khi gửi phản ánh"
)

_bearer = HTTPBearer(auto_error=False)

CITIZEN_SELECT = """SELECT c.id, c.phone, c.full_name, c.email, c.token_version, c.must_change_password, c.is_active,
                           c.locked_reason, c.created_at, c.last_login_at, c.password_hash,
                           u.code AS admin_code, u.name AS admin_name
                      FROM community.citizen_accounts c
                      LEFT JOIN spatial_admin.administrative_units u ON u.id = c.admin_unit_id"""


def _encode(acc: dict, aud: str, ttl: timedelta) -> str:
    now = datetime.now(UTC)
    payload = {"sub": str(acc["id"]), "aud": aud, "tv": acc["token_version"], "iat": now, "exp": now + ttl}
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


def create_citizen_token(acc: dict) -> str:
    return _encode(acc, AUD, timedelta(days=settings.citizen_session_days))


def create_reset_token(acc: dict) -> str:
    return _encode(acc, RESET_AUD, timedelta(minutes=RESET_MINUTES))


def decode_citizen_token(token: str, aud: str = AUD) -> dict | None:
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=["HS256"], audience=aud)
    except jwt.PyJWTError:
        return None


async def citizen_by_id(citizen_id: str) -> dict | None:
    return await fetch_one(CITIZEN_SELECT + " WHERE c.id = CAST(:id AS uuid)", {"id": str(citizen_id)})


async def citizen_from_token(token: str, aud: str = AUD) -> dict | None:
    payload = decode_citizen_token(token, aud)
    if not payload:
        return None
    acc = await citizen_by_id(payload["sub"])
    if not acc or not acc["is_active"] or acc["token_version"] != payload.get("tv"):
        return None
    return acc


async def citizen_session(creds: HTTPAuthorizationCredentials | None = Depends(_bearer)) -> dict:
    """Người dân đang đăng nhập, kể cả đang phải đổi mật khẩu tạm — chỉ dùng cho /me, /change-password."""
    if creds is None:
        raise HTTPException(401, "Chưa đăng nhập tài khoản người dân")
    acc = await citizen_from_token(creds.credentials)
    if acc is None:
        raise HTTPException(401, "Phiên đăng nhập đã hết hạn hoặc tài khoản bị khoá — vui lòng đăng nhập lại")
    return acc


async def current_citizen(acc: dict = Depends(citizen_session)) -> dict:
    if acc["must_change_password"]:
        raise HTTPException(403, MUST_CHANGE, headers={"X-Must-Change-Password": "1"})
    return acc


async def optional_citizen(creds: HTTPAuthorizationCredentials | None = Depends(_bearer)) -> dict | None:
    """Gửi phản ánh: có phiên người dân hợp lệ → tài khoản; không có, hoặc là token cán bộ (cán bộ đang đăng nhập cũng mở
    cổng) → None, không báo lỗi. Bắt buộc đăng nhập hay không do nơi gọi quyết định (CITIZEN_ACCOUNT_REQUIRED)."""
    if creds is None:
        return None
    acc = await citizen_from_token(creds.credentials)
    if acc is None or acc["must_change_password"]:
        return None
    return acc
