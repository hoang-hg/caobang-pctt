"""Xác thực JWT + băm mật khẩu/PIN (PBKDF2). Phân quyền nằm ở ``app.rbac.authz``.

JWT mang ``tv`` (token_version): mỗi lần cấp/thu hồi quyền hoặc khoá tài khoản,
token_version tăng → token cũ bị từ chối, người dùng phải đăng nhập lại để nhận quyền mới.
"""

import hashlib
import hmac
import json
import os
from datetime import UTC, datetime, timedelta

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import settings
from app.db import execute, fetch_one

_bearer = HTTPBearer(auto_error=False)

USER_SELECT = """SELECT id, username, full_name, position, pin_hash, token_version, is_active
                   FROM communications.users"""


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


def create_token(user: dict) -> str:
    payload = {
        "sub": str(user["id"]),
        "name": user["full_name"],
        "tv": user["token_version"],
        "exp": datetime.now(UTC) + timedelta(hours=settings.jwt_expire_hours),
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
    return user


async def current_user(creds: HTTPAuthorizationCredentials | None = Depends(_bearer)) -> dict:
    if creds is None:
        raise HTTPException(401, "Chưa đăng nhập")
    user = await user_from_token(creds.credentials)
    if user is None:
        raise HTTPException(401, "Phiên đăng nhập hết hạn hoặc quyền đã thay đổi — vui lòng đăng nhập lại")
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
