"""Xác thực 2 lớp (TOTP): /api/v1/auth/mfa/* — logic ở app/mfa.py, README mục 11.1.

Đăng nhập: POST /auth/login trả {"mfa": "verify", "challenge"} → POST /verify {challenge, code};
hoặc {"mfa": "setup", "challenge"} (vai trò bắt buộc, chưa bật) → POST /setup {challenge} → POST /enable {challenge, code}.
Đang đăng nhập (tự bật / tắt): /setup, /enable, /disable, /recovery-codes với Bearer token.
"""

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field

from app import mfa
from app.api.v1.auth import LOCK_WINDOW_S, check_lock, complete_login, lock_key, session
from app.auth import audit, current_user, user_from_token, verify_secret
from app.db import execute, fetch_one
from app.infra import ratelimit
from app.integrations.crypto import decrypt, encrypt

router = APIRouter(prefix="/auth/mfa", tags=["Xác thực"])
_bearer = HTTPBearer(auto_error=False)

WRONG_CODE = "Mã xác thực không đúng hoặc đã dùng — kiểm tra giờ trên điện thoại"


class CodeIn(BaseModel):
    code: str = Field(min_length=6, max_length=20)


class VerifyIn(CodeIn):
    challenge: str = Field(max_length=2000)


class SetupIn(BaseModel):
    challenge: str | None = Field(None, max_length=2000)


class EnableIn(CodeIn):
    challenge: str | None = Field(None, max_length=2000)


class DisableIn(CodeIn):
    password: str = Field(max_length=128)


async def _full_user(user_id) -> dict:
    return await fetch_one(
        "SELECT * FROM communications.users WHERE id = CAST(:id AS uuid)", {"id": str(user_id)}
    )


async def _enrolling_user(challenge: str | None, creds: HTTPAuthorizationCredentials | None) -> dict:
    """Người đang cài đặt: qua phiếu "setup" (bắt buộc, lúc đăng nhập) hoặc token phiên (tự bật)."""
    if challenge:
        return await mfa.challenge_user(challenge, "setup")
    user = await user_from_token(creds.credentials) if creds else None
    if user is None:
        raise HTTPException(401, "Chưa đăng nhập")
    return await _full_user(user["id"])


async def _wrong_code(user: dict, status: int = 401, message: str = WRONG_CODE) -> HTTPException:
    await ratelimit.hit(lock_key(user["username"]), LOCK_WINDOW_S)
    await audit(user, "auth.mfa_failed", "user", user["username"])
    return HTTPException(status, message)


@router.post("/verify")
async def verify(body: VerifyIn):
    """Bước 2 khi đăng nhập: mã 6 số trong ứng dụng xác thực hoặc 1 mã khôi phục."""
    user = await mfa.challenge_user(body.challenge, "verify")
    await check_lock(lock_key(user["username"]))
    method = await mfa.check_code(user, body.code)
    if method is None:
        raise await _wrong_code(user)
    return await complete_login(user, method)


@router.post("/setup")
async def setup(body: SetupIn, creds: HTTPAuthorizationCredentials | None = Depends(_bearer)):
    """Tạo khoá mới (chưa bật) → mã QR để quét. Gọi lại = tạo khoá khác (phải quét lại)."""
    user = await _enrolling_user(body.challenge, creds)
    if user["totp_enabled_at"] is not None:
        raise HTTPException(409, "Tài khoản đã bật xác thực 2 lớp")
    secret = mfa.new_secret()
    await execute(
        """UPDATE communications.users SET totp_secret_enc = :s, totp_last_step = NULL
            WHERE id = :id AND totp_enabled_at IS NULL""",
        {"s": encrypt(secret), "id": user["id"]},
    )
    return mfa.setup_payload(secret, user["username"])


@router.post("/enable")
async def enable(body: EnableIn, creds: HTTPAuthorizationCredentials | None = Depends(_bearer)):
    """Xác nhận mã đầu tiên → bật, trả 10 mã khôi phục (chỉ hiện 1 lần) + token mới (phiên khác bị đăng xuất)."""
    user = await _enrolling_user(body.challenge, creds)
    if user["totp_enabled_at"] is not None:
        raise HTTPException(409, "Tài khoản đã bật xác thực 2 lớp")
    await check_lock(lock_key(user["username"]))
    secret = decrypt(user["totp_secret_enc"])
    if not secret:
        raise HTTPException(400, "Chưa tạo mã QR — bấm cài đặt lại")
    step = mfa.match_step(secret, body.code, None)
    if step is None:
        raise await _wrong_code(user, 400)
    codes = mfa.new_recovery_codes()
    await execute(
        """UPDATE communications.users SET totp_enabled_at = now(), totp_last_step = :s,
                  totp_recovery_hashes = CAST(:h AS text[]), token_version = token_version + 1
            WHERE id = :id""",
        {"s": step, "h": [mfa.recovery_hash(c) for c in codes], "id": user["id"]},
    )
    await audit(user, "auth.mfa_enable", "user", user["username"])
    fresh = await _full_user(user["id"])
    result = await (complete_login(fresh, "totp") if body.challenge else session(fresh))
    return {**result, "recovery_codes": codes}


@router.post("/disable")
async def disable(body: DisableIn, user: dict = Depends(current_user)):
    """Tắt (cần mật khẩu + mã). Vai trò bắt buộc không tự tắt được — quản trị đặt lại khi mất thiết bị."""
    if mfa.required(user["username"]):
        raise HTTPException(
            403, "Vai trò của bạn bắt buộc xác thực 2 lớp — mất thiết bị thì liên hệ quản trị"
        )
    full = await _full_user(user["id"])
    if full["totp_enabled_at"] is None:
        raise HTTPException(400, "Tài khoản chưa bật xác thực 2 lớp")
    await check_lock(lock_key(user["username"]))
    if (
        not verify_secret(body.password, full["password_hash"])
        or await mfa.check_code(full, body.code) is None
    ):
        raise await _wrong_code(full, 400, "Mật khẩu hoặc mã xác thực không đúng")
    await execute(
        """UPDATE communications.users SET totp_secret_enc = NULL, totp_enabled_at = NULL, totp_last_step = NULL,
                  totp_recovery_hashes = '{}', token_version = token_version + 1 WHERE id = :id""",
        {"id": full["id"]},
    )
    await audit(full, "auth.mfa_disable", "user", full["username"])
    return await session(await _full_user(user["id"]))


@router.post("/recovery-codes")
async def recovery_codes(body: CodeIn, user: dict = Depends(current_user)):
    """Tạo bộ mã khôi phục mới (bộ cũ hết hiệu lực) — cần mã 6 số hiện tại."""
    full = await _full_user(user["id"])
    if full["totp_enabled_at"] is None:
        raise HTTPException(400, "Tài khoản chưa bật xác thực 2 lớp")
    await check_lock(lock_key(user["username"]))
    if mfa.looks_like_recovery(body.code) or await mfa.check_code(full, body.code) != "totp":
        raise await _wrong_code(full, 400)
    codes = mfa.new_recovery_codes()
    await execute(
        "UPDATE communications.users SET totp_recovery_hashes = CAST(:h AS text[]) WHERE id = :id",
        {"h": [mfa.recovery_hash(c) for c in codes], "id": full["id"]},
    )
    await audit(full, "auth.mfa_recovery_codes", "user", full["username"])
    return {"recovery_codes": codes}
