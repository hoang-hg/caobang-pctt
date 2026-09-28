"""Xác thực 2 lớp TOTP (RFC 6238 — Google Authenticator, Microsoft Authenticator…) cho tài khoản cán bộ (README 11.1).

- Khoá TOTP lưu mã hoá Fernet bằng SECRET_KEY (users.totp_secret_enc) — đổi SECRET_KEY thì mọi người phải cài lại.
- Mã hợp lệ trong khung ±1 bước (±30 giây, bù lệch giờ điện thoại); mỗi bước chỉ dùng được 1 lần (totp_last_step).
- 10 mã khôi phục dùng 1 lần, lưu HMAC-SHA256 (khoá dẫn xuất từ SECRET_KEY) — mã ngẫu nhiên ~40 bit, số lần thử bị
  giới hạn bởi khoá đăng nhập sai (MAX_FAILED_LOGINS / 15 phút).
- Đăng nhập 2 bước: mật khẩu đúng → "phiếu" JWT 5 phút mang aud=pctt-mfa → nhập mã → token phiên. Phiếu KHÔNG dùng
  được như token phiên: PyJWT từ chối token có `aud` khi bên giải mã không chờ aud (app.auth.user_from_token).
- TOTP_REQUIRED_ROLES: người có vai trò bắt buộc mà chưa bật → token phiên bị từ chối, đăng nhập lại phải cài đặt.
"""

from __future__ import annotations

import hashlib
import hmac
import secrets
import time
from datetime import UTC, datetime, timedelta

import jwt
import pyotp
import segno
from fastapi import HTTPException

from app.config import settings
from app.db import fetch_one
from app.integrations.crypto import decrypt
from app.rbac.enforcer import get_enforcer

CHALLENGE_AUD = "pctt-mfa"
CHALLENGE_TTL = timedelta(minutes=5)
STEP_SECONDS = 30
RECOVERY_COUNT = 10
RECOVERY_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"  # bỏ i, l, o, 0, 1 dễ nhầm khi chép tay


def required(username: str) -> bool:
    """Tài khoản có vai trò thuộc TOTP_REQUIRED_ROLES (ở bất kỳ phạm vi nào)."""
    roles = settings.totp_required_role_set
    if not roles:
        return False
    return any(
        len(g) >= 2 and g[1] in roles for g in get_enforcer().get_filtered_grouping_policy(0, username)
    )


# ------------------------------------------------------------------------------------------------ mã TOTP


def new_secret() -> str:
    return pyotp.random_base32()  # 160 bit


def setup_payload(secret: str, username: str) -> dict:
    """Khoá (để nhập tay), URI otpauth:// và mã QR (SVG data URI) cho ứng dụng xác thực."""
    uri = pyotp.TOTP(secret).provisioning_uri(name=username, issuer_name=settings.totp_issuer)
    qr = segno.make(uri, error="m").svg_data_uri(scale=5, border=2)
    return {"secret": secret, "uri": uri, "qr": qr}


def normalize(code: str) -> str:
    return "".join(code.split()).replace("-", "").lower()


def match_step(secret: str, code: str, last_step: int | None, now: float | None = None) -> int | None:
    """Bước thời gian mà mã 6 số khớp (khung ±1 bước) và chưa dùng; None nếu sai / đã dùng."""
    code = normalize(code)
    if len(code) != 6 or not (code.isascii() and code.isdigit()):  # isdigit() nhận cả chữ số Ả Rập…
        return None
    totp = pyotp.TOTP(secret)
    current = int((time.time() if now is None else now) // STEP_SECONDS)
    for step in (current - 1, current, current + 1):
        if hmac.compare_digest(totp.generate_otp(step), code) and (last_step is None or step > last_step):
            return step
    return None


# ------------------------------------------------------------------------------------------------ mã khôi phục


def new_recovery_codes() -> list[str]:
    def one() -> str:
        return "".join(secrets.choice(RECOVERY_ALPHABET) for _ in range(8))

    return [f"{c[:4]}-{c[4:]}" for c in (one() for _ in range(RECOVERY_COUNT))]


def recovery_hash(code: str) -> str:
    key = hashlib.sha256(("totp-recovery:" + (settings.secret_key or settings.jwt_secret)).encode()).digest()
    return hmac.new(key, normalize(code).encode(), hashlib.sha256).hexdigest()


def looks_like_recovery(code: str) -> bool:
    c = normalize(code)
    return len(c) == 8 and all(ch in RECOVERY_ALPHABET for ch in c)


async def check_code(user: dict, code: str) -> str | None:
    """Kiểm tra mã khi đăng nhập / thao tác nhạy cảm: "totp", "recovery" (đã gạch mã đó) hoặc None.

    Cập nhật CSDL có điều kiện → hai yêu cầu đồng thời cùng một mã chỉ một yêu cầu thành công.
    """
    secret = decrypt(user.get("totp_secret_enc"))
    if secret and (step := match_step(secret, code, user.get("totp_last_step"))) is not None:
        row = await fetch_one(
            """UPDATE communications.users SET totp_last_step = :s
                WHERE id = :id AND (totp_last_step IS NULL OR totp_last_step < :s) RETURNING id""",
            {"s": step, "id": user["id"]},
        )
        return "totp" if row else None
    if looks_like_recovery(code):
        row = await fetch_one(
            """UPDATE communications.users SET totp_recovery_hashes = array_remove(totp_recovery_hashes, :h)
                WHERE id = :id AND :h = ANY(totp_recovery_hashes) RETURNING id""",
            {"h": recovery_hash(code), "id": user["id"]},
        )
        return "recovery" if row else None
    return None


# ------------------------------------------------------------------------------------------------ phiếu đăng nhập


def challenge_token(user: dict, stage: str) -> str:
    """stage: "verify" (đã bật, nhập mã) | "setup" (vai trò bắt buộc, chưa bật → cài đặt)."""
    payload = {
        "sub": str(user["id"]),
        "tv": user["token_version"],
        "stage": stage,
        "aud": CHALLENGE_AUD,
        "exp": datetime.now(UTC) + CHALLENGE_TTL,
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


async def challenge_user(token: str, stage: str) -> dict:
    """Người dùng của phiếu còn hạn, đúng giai đoạn, tài khoản còn hoạt động và chưa đổi token_version."""
    expired = HTTPException(401, "Phiên xác thực đã hết hạn — vui lòng đăng nhập lại")
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"], audience=CHALLENGE_AUD)
    except jwt.PyJWTError:
        raise expired from None
    if payload.get("stage") != stage:
        raise expired
    user = await fetch_one(
        "SELECT * FROM communications.users WHERE id = CAST(:id AS uuid)", {"id": payload["sub"]}
    )
    if not user or not user["is_active"] or user["token_version"] != payload.get("tv"):
        raise expired
    return user
