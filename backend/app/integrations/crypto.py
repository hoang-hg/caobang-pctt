"""Mã hoá bí mật của nguồn dữ liệu (API key đối tác) và sinh / băm khoá thiết bị IoT."""

import base64
import hashlib
import hmac
import secrets

from cryptography.fernet import Fernet, InvalidToken

from app.config import settings


def _fernet() -> Fernet:
    raw = settings.secret_key or settings.jwt_secret
    return Fernet(base64.urlsafe_b64encode(hashlib.sha256(raw.encode()).digest()))


def encrypt(value: str | None) -> str | None:
    return _fernet().encrypt(value.encode()).decode() if value else None


def decrypt(token: str | None) -> str | None:
    if not token:
        return None
    try:
        return _fernet().decrypt(token.encode()).decode()
    except InvalidToken:
        return None


def new_device_key() -> str:
    return "cbk_" + secrets.token_urlsafe(24)


def hash_key(key: str) -> str:
    # Khoá ngẫu nhiên 192 bit → SHA-256 đủ an toàn và nhanh cho tần suất gửi dữ liệu cao
    return hashlib.sha256(key.encode()).hexdigest()


def key_matches(key: str | None, stored: str | None) -> bool:
    return bool(key and stored) and hmac.compare_digest(hash_key(key), stored)
