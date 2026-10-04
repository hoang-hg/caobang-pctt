"""Xác thực JWT + băm mật khẩu/PIN (PBKDF2). Phân quyền nằm ở ``app.rbac.authz``.

JWT mang ``tv`` (token_version): mỗi lần cấp/thu hồi quyền hoặc khoá tài khoản,
token_version tăng → token cũ bị từ chối, người dùng phải đăng nhập lại để nhận quyền mới.
``auth_time``: lúc đăng nhập — POST /auth/refresh cấp token mới giữ nguyên mốc này, phiên không kéo dài quá
``session_max_hours`` kể từ lúc đăng nhập.
"""

import hashlib
import hmac
import json
import os
from datetime import UTC, datetime, timedelta

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app import mfa
from app.config import settings
from app.db import execute, fetch_one

_bearer = HTTPBearer(auto_error=False)

USER_SELECT = """SELECT id, username, full_name, position, pin_hash, token_version, is_active, totp_enabled_at,
                          must_change_password
                   FROM communications.users"""
MUST_CHANGE_PASSWORD = "Tài khoản đang dùng mật khẩu do cấp trên đặt — đổi sang mật khẩu của riêng bạn trước khi sử dụng hệ thống"


def hash_secret(secret: str) -> str:
    salt = os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", secret.encode(), salt, 120_000)
    return f"{salt.hex()}${digest.hex()}"


def verify_secret(secret: str, stored: str | None) -> bool:
    if not stored or "$" not in stored:
        return False
    salt_hex, digest_hex = stored.split("$", 1)
    digest = hashlib.pbkdf2_hmac("sha256", secret.encode(), bytes.fromhex(salt_hex), 120_000)
    return hmac.compare_digest(digest.hex(), digest_hex)


def token_expiry(auth_time: int, now: datetime) -> datetime:
    """Mỗi token sống jwt_expire_hours, nhưng không quá session_max_hours kể từ lúc đăng nhập."""
    cap = datetime.fromtimestamp(auth_time, UTC) + timedelta(hours=settings.session_max_hours)
    return min(now + timedelta(hours=settings.jwt_expire_hours), cap)


def create_token(user: dict, auth_time: int | None = None) -> str:
    """auth_time (giây UNIX) = lúc đăng nhập; bỏ trống = vừa đăng nhập."""
    now = datetime.now(UTC)
    auth_time = auth_time or int(now.timestamp())
    payload = {
        "sub": str(user["id"]),
        "name": user["full_name"],
        "tv": user["token_version"],
        "auth_time": auth_time,
        "exp": token_expiry(auth_time, now),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


async def user_from_token(token: str) -> dict | None:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
    except jwt.PyJWTError:
        return None
    user = await fetch_one(USER_SELECT + " WHERE id = CAST(:id AS uuid)", {"id": payload["sub"]})
    if not user or not user["is_active"] or user["token_version"] != payload.get("tv"):
        return None
    # Vai trò bắt buộc xác thực 2 lớp mà chưa bật (VD vừa được cấp vai trò / vừa đặt TOTP_REQUIRED_ROLES)
    # → đăng nhập lại để cài đặt
    if user["totp_enabled_at"] is None and mfa.required(user["username"]):
        return None
    # Token cấp trước khi có auth_time (bản cũ): lúc đăng nhập = lúc hết hạn − jwt_expire_hours
    user["auth_time"] = payload.get("auth_time") or int(payload["exp"]) - settings.jwt_expire_hours * 3600
    return user


async def session_user(creds: HTTPAuthorizationCredentials | None = Depends(_bearer)) -> dict:
    """Người đang đăng nhập, kể cả tài khoản còn phải đổi mật khẩu — chỉ dùng cho /auth/me, /auth/change-password,
    /auth/refresh. Mọi API khác dùng ``current_user``."""
    if creds is None:
        raise HTTPException(401, "Chưa đăng nhập")
    user = await user_from_token(creds.credentials)
    if user is None:
        raise HTTPException(401, "Phiên đăng nhập hết hạn hoặc quyền đã thay đổi — vui lòng đăng nhập lại")
    return user


async def current_user(user: dict = Depends(session_user)) -> dict:
    # Mật khẩu do cấp trên đặt (tạo tài khoản / đặt lại): chặn mọi chức năng tới khi tự đổi. Header này báo giao diện
    # chuyển sang màn hình đổi mật khẩu (VD phiên đã mở từ trước khi nâng cấp)
    if user["must_change_password"]:
        raise HTTPException(403, MUST_CHANGE_PASSWORD, headers={"X-Must-Change-Password": "1"})
    return user


async def bump_token_version(user_id, conn=None) -> None:
    await execute(
        "UPDATE communications.users SET token_version = token_version + 1 WHERE id = CAST(:id AS uuid)",
        {"id": str(user_id)},
        conn,
    )


async def audit(
    user: dict | None, action: str, entity: str, entity_id: str | None, details: dict | None = None, conn=None
):
    await execute(
        """INSERT INTO communications.audit_logs (actor_id, actor_name, action, entity, entity_id, details)
           VALUES (:aid, :aname, :action, :entity, :eid, CAST(:details AS jsonb))""",
        {
            "aid": user["id"] if user else None,
            "aname": user["full_name"] if user else "Hệ thống",
            "action": action,
            "entity": entity,
            "eid": entity_id,
            "details": json.dumps(details or {}, ensure_ascii=False, default=str),
        },
        conn,
    )


PASSWORD_HINT = "Mật khẩu tối thiểu 8 ký tự, gồm cả chữ và số"


def password_problem(password: str) -> str | None:
    if len(password) < 8 or not any(c.isdigit() for c in password) or not any(c.isalpha() for c in password):
        return PASSWORD_HINT
    return None
