import hashlib
import logging
import secrets
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from app import seed_data as D
from app.auth import audit, create_token, current_user, hash_secret, password_problem, verify_secret
from app.config import settings
from app.db import execute, fetch_all, fetch_one
from app.infra import ratelimit
from app.infra.mailer import send_mail
from app.rbac import domains
from app.rbac.authz import groupings, user_permissions

router = APIRouter(prefix="/auth", tags=["Xác thực"])
log = logging.getLogger(__name__)

MAX_FAILED_LOGINS = 10  # sai quá số lần này trong 15 phút → tạm khoá đăng nhập tài khoản
LOCK_WINDOW_S = 900
RESET_TTL = timedelta(minutes=30)
FORGOT_MESSAGE = (
    "Nếu tài khoản có email hợp lệ, hệ thống đã gửi hướng dẫn đặt lại mật khẩu (hiệu lực 30 phút)."
)


class LoginIn(BaseModel):
    username: str
    password: str


async def role_names() -> dict[str, str]:
    rows = await fetch_all("SELECT name, display_name FROM communications.rbac_role_metadata")
    return {m["name"]: m["display_name"] for m in rows}


async def profile(user: dict) -> dict:
    meta = await role_names()
    email = user.get("email")
    if email is None:
        row = await fetch_one(
            "SELECT email FROM communications.users WHERE id = CAST(:id AS uuid)", {"id": str(user["id"])}
        )
        email = row["email"] if row else None
    return {
        "id": user["id"],
        "username": user["username"],
        "full_name": user["full_name"],
        "position": user["position"],
        "email": email,
        "has_pin": bool(user["pin_hash"]),
        "assignments": [
            {"role": r, "role_name": meta.get(r, r), "domain": d, "domain_label": domains.label(d)}
            for r, d in groupings(user["username"])
        ],
        "permissions": user_permissions(user["username"]),
    }


@router.post("/login")
async def login(body: LoginIn):
    lock_key = f"loginfail:{body.username.lower()}"
    if await ratelimit.peek(lock_key) >= MAX_FAILED_LOGINS:
        raise HTTPException(429, "Đăng nhập sai quá nhiều lần — tài khoản tạm khoá 15 phút")
    user = await fetch_one("SELECT * FROM communications.users WHERE username = :u", {"u": body.username})
    if not user or not verify_secret(body.password, user["password_hash"]):
        await ratelimit.hit(lock_key, LOCK_WINDOW_S)
        raise HTTPException(401, "Sai tên đăng nhập hoặc mật khẩu")
    if not user["is_active"]:
        raise HTTPException(403, "Tài khoản đã bị khoá")
    await ratelimit.clear(lock_key)
    return {"token": create_token(user), "user": await profile(user)}


@router.get("/me")
async def me(user: dict = Depends(current_user)):
    return await profile(user)


class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str = Field(max_length=128)


@router.post("/change-password")
async def change_password(body: ChangePasswordIn, user: dict = Depends(current_user)):
    row = await fetch_one(
        "SELECT password_hash FROM communications.users WHERE id = CAST(:id AS uuid)", {"id": str(user["id"])}
    )
    if not verify_secret(body.current_password, row["password_hash"]):
        raise HTTPException(400, "Mật khẩu hiện tại không đúng")
    if problem := password_problem(body.new_password):
        raise HTTPException(422, problem)
    if body.new_password == body.current_password:
        raise HTTPException(422, "Mật khẩu mới phải khác mật khẩu hiện tại")
    await execute(
        """UPDATE communications.users SET password_hash = :pw, password_changed_at = now(), token_version = token_version + 1
            WHERE id = CAST(:id AS uuid)""",
        {"pw": hash_secret(body.new_password), "id": str(user["id"])},
    )
    await audit(user, "auth.change_password", "user", user["username"])
    fresh = await fetch_one(
        "SELECT * FROM communications.users WHERE id = CAST(:id AS uuid)", {"id": str(user["id"])}
    )
    # Phiên khác (máy khác) bị đăng xuất; phiên hiện tại nhận token mới
    return {"token": create_token(fresh), "user": await profile(fresh)}


class ForgotIn(BaseModel):
    login: str = Field(min_length=3, max_length=200)  # tên đăng nhập hoặc email


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


@router.post("/forgot-password")
async def forgot_password(body: ForgotIn, request: Request):
    """Luôn trả cùng một thông báo (không tiết lộ tài khoản có tồn tại hay không)."""
    user = await fetch_one(
        """SELECT id, username, full_name, email, is_active FROM communications.users
            WHERE lower(username) = lower(:l) OR lower(email) = lower(:l)""",
        {"l": body.login.strip()},
    )
    if user and user["is_active"] and user["email"]:
        token = secrets.token_urlsafe(32)
        await execute(
            "UPDATE communications.password_reset_tokens SET used_at = now() WHERE user_id = :u AND used_at IS NULL",
            {"u": user["id"]},
        )
        await execute(
            """INSERT INTO communications.password_reset_tokens (user_id, token_hash, expires_at, requested_ip)
               VALUES (:u, :h, :e, :ip)""",
            {
                "u": user["id"],
                "h": _hash_token(token),
                "e": datetime.now(UTC) + RESET_TTL,
                "ip": request.client.host if request.client else None,
            },
        )
        link = f"{settings.public_base_url.rstrip('/')}/dat-lai-mat-khau?token={token}"
        await send_mail(
            user["email"],
            "[BCH PCTT Cao Bằng] Đặt lại mật khẩu",
            f"Xin chào {user['full_name']},\n\nCó yêu cầu đặt lại mật khẩu cho tài khoản {user['username']}.\n"
            f"Mở liên kết sau trong 30 phút để đặt mật khẩu mới:\n\n{link}\n\n"
            "Nếu bạn không yêu cầu, hãy bỏ qua email này — mật khẩu hiện tại vẫn giữ nguyên.\n",
        )
        await audit(None, "auth.forgot_password", "user", user["username"])
    return {"message": FORGOT_MESSAGE}


class ResetIn(BaseModel):
    token: str = Field(min_length=20, max_length=200)
    new_password: str = Field(max_length=128)


@router.post("/reset-password")
async def reset_password(body: ResetIn):
    row = await fetch_one(
        """SELECT t.id, t.user_id, u.username, u.is_active FROM communications.password_reset_tokens t
             JOIN communications.users u ON u.id = t.user_id
            WHERE t.token_hash = :h AND t.used_at IS NULL AND t.expires_at > now()""",
        {"h": _hash_token(body.token)},
    )
    if not row or not row["is_active"]:
        raise HTTPException(400, "Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn")
    if problem := password_problem(body.new_password):
        raise HTTPException(422, problem)
    await execute(
        """UPDATE communications.users SET password_hash = :pw, password_changed_at = now(), token_version = token_version + 1
            WHERE id = :u""",
        {"pw": hash_secret(body.new_password), "u": row["user_id"]},
    )
    await execute(
        "UPDATE communications.password_reset_tokens SET used_at = now() WHERE user_id = :u AND used_at IS NULL",
        {"u": row["user_id"]},
    )
    await ratelimit.clear(f"loginfail:{row['username'].lower()}")
    await audit(None, "auth.reset_password", "user", row["username"])
    return {"message": "Đã đặt lại mật khẩu — hãy đăng nhập bằng mật khẩu mới"}


@router.get("/demo-accounts")
async def demo_accounts():
    """Tài khoản demo cho nút đăng nhập nhanh (chỉ khi DEMO_MODE=true)."""
    if not settings.demo_mode:
        raise HTTPException(404, "Không khả dụng")
    meta = await role_names()
    return [
        {
            "username": u[0],
            "full_name": u[1],
            "position": u[2],
            "password": u[3],
            "pin": u[4],
            "role": u[5],
            "role_name": meta.get(u[5], u[5]),
            "domain_label": domains.label(u[6]),
        }
        for u in D.USERS
    ]
