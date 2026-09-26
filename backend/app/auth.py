"""Xác thực JWT đơn giản + băm mật khẩu/PIN bằng PBKDF2 (thư viện chuẩn)."""

import hashlib
import hmac
import os
from datetime import UTC, datetime, timedelta

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import settings
from app.db import execute, fetch_one

_bearer = HTTPBearer(auto_error=False)


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
        "role": user["role"],
        "exp": datetime.now(UTC) + timedelta(hours=settings.jwt_expire_hours),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


async def current_user(creds: HTTPAuthorizationCredentials | None = Depends(_bearer)) -> dict:
    if creds is None:
        raise HTTPException(401, "Chưa đăng nhập")
    try:
        payload = jwt.decode(creds.credentials, settings.jwt_secret, algorithms=["HS256"])
    except jwt.PyJWTError as exc:
        raise HTTPException(401, "Phiên đăng nhập không hợp lệ") from exc
    user = await fetch_one(
        "SELECT id, username, full_name, position, role, pin_hash FROM communications.users WHERE id = CAST(:id AS uuid)",
        {"id": payload["sub"]},
    )
    if not user:
        raise HTTPException(401, "Tài khoản không tồn tại")
    return user


def require_role(*roles: str):
    async def dep(user: dict = Depends(current_user)) -> dict:
        if user["role"] not in roles and user["role"] != "admin":
            raise HTTPException(403, "Không đủ quyền thực hiện thao tác này")
        return user

    return dep


async def audit(
    user: dict | None, action: str, entity: str, entity_id: str | None, details: dict | None = None, conn=None
):
    import json

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
