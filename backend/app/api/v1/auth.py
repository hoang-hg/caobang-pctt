import hashlib
import logging
import secrets
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from app import mfa
from app.auth import audit, create_token, hash_secret, password_problem, session_user, verify_secret
from app.config import settings
from app.db import execute, fetch_all, fetch_one
from app.infra import ratelimit
from app.infra.mailer import send_mail
from app.rbac import domains
from app.rbac.authz import groupings, user_permissions

router = APIRouter(prefix="/auth", tags=["Xác thực"])
log = logging.getLogger(__name__)

MAX_FAILED_LOGINS = (
    10  # sai quá số lần này trong 15 phút (cùng tài khoản, cùng IP; hoặc sai mã 2 lớp) → tạm khoá
)
ACCOUNT_MAX_FAILED = (
    100  # tổng sai mật khẩu của 1 tài khoản từ MỌI IP (dò phân tán) → chặn tài khoản chưa bật 2 lớp
)
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
    extra = await fetch_one(
        """SELECT email, totp_enabled_at, cardinality(totp_recovery_hashes) AS recovery_left, must_change_password
             FROM communications.users WHERE id = CAST(:id AS uuid)""",
        {"id": str(user["id"])},
    )
    return {
        "id": user["id"],
        "username": user["username"],
        "full_name": user["full_name"],
        "position": user["position"],
        "email": extra["email"],
        "has_pin": bool(user["pin_hash"]),
        # Mật khẩu do cấp trên đặt → giao diện chỉ hiện màn hình đổi mật khẩu (app/auth.py current_user)
        "must_change_password": extra["must_change_password"],
        "mfa": {
            "enabled": extra["totp_enabled_at"] is not None,
            "required": mfa.required(user["username"]),
            "recovery_left": extra["recovery_left"],
        },
        "assignments": [
            {"role": r, "role_name": meta.get(r, r), "domain": d, "domain_label": domains.label(d)}
            for r, d in groupings(user["username"])
        ],
        "permissions": user_permissions(user["username"]),
    }


def lock_key(username: str) -> str:
    """Bộ đếm sai MÃ XÁC THỰC 2 LỚP theo tài khoản (tới được bước này là đã biết mật khẩu → khoá cả tài khoản đúng
    ý). Nhập username hay email đều chung 1 bộ đếm; đặt lại mật khẩu xoá khoá này."""
    return f"loginfail:{username.lower()}"


def password_fail_keys(username: str, ip: str) -> tuple[str, str]:
    """(theo tài khoản + IP, tổng theo tài khoản) cho sai MẬT KHẨU."""
    ip_tag = hashlib.sha256(ip.encode()).hexdigest()[:16]
    return f"pwfail:{username.lower()}:{ip_tag}", f"pwfail:{username.lower()}:all"


def login_blocked(ip_fails: int, account_fails: int, mfa_enabled: bool) -> bool:
    """Chặn bước mật khẩu? Sai mật khẩu chỉ khoá (tài khoản, IP) đó → kẻ xấu biết tên đăng nhập của lãnh đạo gõ sai
    liên tục chỉ tự khoá IP của mình, KHÔNG khoá được người duyệt cảnh báo giữa lúc thiên tai. Tổng theo tài khoản (dò
    từ nhiều IP) chỉ chặn tài khoản CHƯA bật 2 lớp; đã bật thì vẫn cho qua bước mật khẩu — còn phải đoán mã TOTP (bộ
    đếm ``lock_key`` theo tài khoản)."""
    return ip_fails >= MAX_FAILED_LOGINS or (account_fails >= ACCOUNT_MAX_FAILED and not mfa_enabled)


async def check_lock(key: str) -> None:
    if await ratelimit.peek(key) >= MAX_FAILED_LOGINS:
        raise HTTPException(429, "Đăng nhập sai quá nhiều lần — tài khoản tạm khoá 15 phút")


async def session(user: dict, auth_time: int | None = None) -> dict:
    """auth_time: giữ mốc đăng nhập khi gia hạn (/auth/refresh); bỏ trống = phiên mới."""
    return {"token": create_token(user, auth_time), "user": await profile(user)}


async def complete_login(user: dict, method: str = "password") -> dict:
    await ratelimit.clear(lock_key(user["username"]))
    await audit(user, "auth.login", "user", user["username"], {"method": method})
    return await session(user)


@router.post("/login")
async def login(body: LoginIn, request: Request):
    """Mật khẩu đúng → token; tài khoản có xác thực 2 lớp → {"mfa": "verify" | "setup", "challenge"} (app/mfa.py)."""
    clean_u = body.username.strip()
    user = await fetch_one(
        """SELECT * FROM communications.users
            WHERE lower(username) = lower(:u) OR lower(email) = lower(:u)""",
        {"u": clean_u},
    )
    uname = user["username"] if user else clean_u
    ip_key, all_key = password_fail_keys(uname, request.client.host if request.client else "")
    await check_lock(lock_key(uname))  # sai mã 2 lớp quá nhiều (đã lộ mật khẩu) → khoá cả tài khoản
    if login_blocked(
        await ratelimit.peek(ip_key), await ratelimit.peek(all_key), bool(user and user["totp_enabled_at"])
    ):
        raise HTTPException(429, "Đăng nhập sai quá nhiều lần — tạm khoá 15 phút")
    if not user or not verify_secret(body.password, user["password_hash"]):
        await ratelimit.hit(ip_key, LOCK_WINDOW_S)
        await ratelimit.hit(all_key, LOCK_WINDOW_S)
        raise HTTPException(401, "Sai tên đăng nhập hoặc mật khẩu")
    await ratelimit.clear(ip_key)
    if not user["is_active"]:
        raise HTTPException(403, "Tài khoản đã bị khoá. Vui lòng liên hệ quản trị viên.")
    # Bộ đếm sai chỉ xoá khi qua đủ các bước (mật khẩu đúng + mã sai liên tục vẫn bị khoá)
    if user["totp_enabled_at"] is not None:
        return {"mfa": "verify", "challenge": mfa.challenge_token(user, "verify")}
    if mfa.required(user["username"]):
        return {"mfa": "setup", "challenge": mfa.challenge_token(user, "setup")}
    return await complete_login(user)


@router.get("/me")
async def me(user: dict = Depends(session_user)):
    return await profile(user)


@router.post("/refresh")
async def refresh(user: dict = Depends(session_user)):
    """Trang điều hành còn mở thì gọi định kỳ: token mới hạn thêm jwt_expire_hours, giữ mốc đăng nhập → phiên không quá
    session_max_hours kể từ lúc đăng nhập (trực ban xuyên đêm không bị đăng xuất giữa ca). Token cũ vẫn dùng được tới
    hạn của nó; đổi mật khẩu / khoá tài khoản / đổi quyền thì token_version tăng → không gia hạn được."""
    return await session(user, user["auth_time"])


class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str = Field(max_length=128)


@router.post("/change-password")
async def change_password(body: ChangePasswordIn, user: dict = Depends(session_user)):
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
        """UPDATE communications.users SET password_hash = :pw, password_changed_at = now(), must_change_password = false,
                  token_version = token_version + 1
            WHERE id = CAST(:id AS uuid)""",
        {"pw": hash_secret(body.new_password), "id": str(user["id"])},
    )
    await audit(user, "auth.change_password", "user", user["username"])
    fresh = await fetch_one(
        "SELECT * FROM communications.users WHERE id = CAST(:id AS uuid)", {"id": str(user["id"])}
    )
    # Phiên khác (máy khác) bị đăng xuất; phiên hiện tại nhận token mới
    return await session(fresh)


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
    invalid = HTTPException(400, "Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn")
    if problem := password_problem(body.new_password):
        # Kiểm tra trước khi dùng token: mật khẩu yếu thì liên kết vẫn còn hiệu lực để thử lại
        if not await fetch_one(
            """SELECT 1 FROM communications.password_reset_tokens
                WHERE token_hash = :h AND used_at IS NULL AND expires_at > now()""",
            {"h": _hash_token(body.token)},
        ):
            raise invalid
        raise HTTPException(422, problem)
    # Đánh dấu đã dùng NGAY trong 1 câu lệnh → hai yêu cầu đồng thời cùng token chỉ một yêu cầu đổi được mật khẩu
    row = await fetch_one(
        """UPDATE communications.password_reset_tokens t SET used_at = now()
             FROM communications.users u
            WHERE u.id = t.user_id AND t.token_hash = :h AND t.used_at IS NULL AND t.expires_at > now()
        RETURNING t.user_id, u.username, u.is_active""",
        {"h": _hash_token(body.token)},
    )
    if not row or not row["is_active"]:
        raise invalid
    await execute(
        """UPDATE communications.users SET password_hash = :pw, password_changed_at = now(), must_change_password = false,
                  token_version = token_version + 1
            WHERE id = :u""",
        {"pw": hash_secret(body.new_password), "u": row["user_id"]},
    )
    await execute(
        "UPDATE communications.password_reset_tokens SET used_at = now() WHERE user_id = :u AND used_at IS NULL",
        {"u": row["user_id"]},
    )
    await ratelimit.clear(lock_key(row["username"]))
    await ratelimit.clear(password_fail_keys(row["username"], "")[1])  # tổng sai mật khẩu của tài khoản
    await audit(None, "auth.reset_password", "user", row["username"])
    return {"message": "Đã đặt lại mật khẩu — hãy đăng nhập bằng mật khẩu mới"}


@router.get("/demo-accounts")
async def demo_accounts():
    """Endpoint không còn công khai tài khoản để bảo mật thông tin theo chuẩn ATTT."""
    raise HTTPException(404, "Chức năng xem nhanh tài khoản đã được gỡ bỏ để bảo mật thông tin.")
