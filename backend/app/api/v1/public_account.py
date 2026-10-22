"""Tài khoản người dân của cổng công khai (Đ5 — docs/ke-hoach-lam-moi-giao-dien.md mục 11).

Người dân đăng ký (họ tên, số điện thoại để đăng nhập, mật khẩu, email và xã đang ở không bắt buộc, đồng ý dùng thông tin
theo Nghị định 13/2023/NĐ-CP) mới gửi được phản ánh / yêu cầu cứu hộ trên cổng (bật bằng CITIZEN_ACCOUNT_REQUIRED). Gọi
112, đường dây nóng, xem bản đồ / cảnh báo, tra cứu phiếu bằng mã + số điện thoại vẫn không cần tài khoản.

Quyết định 22/10/2026: chưa xác minh số điện thoại (chưa có cổng SMS — vẫn chống spam Turnstile + giới hạn theo IP / số);
quên mật khẩu: ai khai email thì tự lấy lại qua email, còn lại gọi đường dây nóng để cán bộ đặt lại (``/citizens``).
"""

from __future__ import annotations

import logging
import re

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from app.api.v1.public import phone_key
from app.auth import hash_secret, password_problem, verify_secret
from app.citizen_auth import (
    RESET_AUD,
    citizen_by_id,
    citizen_from_token,
    citizen_session,
    create_citizen_token,
    create_reset_token,
    current_citizen,
)
from app.config import settings
from app.db import execute, fetch_all, fetch_one
from app.infra import ratelimit
from app.infra.mailer import send_mail
from app.services.reports import CATEGORY, verify_turnstile

router = APIRouter(prefix="/public/account", tags=["Tài khoản người dân"])
log = logging.getLogger(__name__)

PHONE_RE = re.compile(r"^0\d{9,10}$")  # đã chuẩn hoá: di động 10 số, cố định 11 số
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
LOGIN_MAX_FAILS = 10  # sai mật khẩu / giờ theo số điện thoại (chống dò mật khẩu)
LOGIN_WINDOW_S = 3600
REGISTER_PER_PHONE = 3  # đăng ký thử / giờ theo số
FORGOT_PER_EMAIL = 3


def _phone(raw: str) -> str:
    phone = phone_key(raw or "")
    if not PHONE_RE.match(phone):
        raise HTTPException(422, "Số điện thoại chưa đúng — ví dụ 0912 345 678")
    return phone


def _email(raw: str | None) -> str | None:
    email = (raw or "").strip().lower() or None
    if email and not EMAIL_RE.match(email):
        raise HTTPException(422, "Email chưa đúng định dạng")
    return email


def _name(raw: str) -> str:
    name = " ".join((raw or "").split())
    if len(name) < 2:
        raise HTTPException(422, "Cần ghi họ tên")
    return name


async def _unit_id(code: str | None) -> str | None:
    if not code:
        return None
    row = await fetch_one(
        "SELECT id FROM spatial_admin.administrative_units WHERE code = :c AND level = 'xa'", {"c": code}
    )
    if not row:
        raise HTTPException(422, "Không có xã/phường này")
    return str(row["id"])


def public_view(acc: dict) -> dict:
    """Thông tin tài khoản trả cho chính người dân — không có mã băm mật khẩu, phiên bản phiên."""
    return {
        "id": str(acc["id"]),
        "full_name": acc["full_name"],
        "phone": acc["phone"],
        "email": acc["email"],
        "admin_code": acc["admin_code"],
        "admin_name": acc["admin_name"],
        "must_change_password": acc["must_change_password"],
        "created_at": acc["created_at"],
    }


def _session(acc: dict) -> dict:
    return {"token": create_citizen_token(acc), "account": public_view(acc)}


class RegisterIn(BaseModel):
    full_name: str = Field(..., max_length=100)
    phone: str = Field(..., max_length=20)
    password: str = Field(..., max_length=128)
    email: str | None = Field(None, max_length=120)
    admin_code: str | None = Field(None, max_length=40, description="Mã xã/phường đang ở (không bắt buộc)")
    consent: bool = Field(
        False, description="Đồng ý cho cơ quan dùng thông tin để liên hệ xử lý (NĐ 13/2023)"
    )
    turnstile_token: str | None = None
    website: str | None = None  # honeypot — người thật không điền


@router.post("/register", status_code=201)
async def register(body: RegisterIn, request: Request):
    """Đăng ký tài khoản người dân → đăng nhập luôn (trả phiên). Số điện thoại là tên đăng nhập, mỗi số một tài khoản."""
    ip = request.client.host if request.client else None
    if body.website:
        raise HTTPException(400, "Yêu cầu không hợp lệ")
    if not body.consent:
        raise HTTPException(422, "Cần đồng ý cho cơ quan dùng thông tin để liên hệ, xử lý phản ánh của bạn")
    if not await verify_turnstile(body.turnstile_token, ip):
        raise HTTPException(400, "Xác minh chống spam không thành công")
    phone = _phone(body.phone)
    # Thử đăng ký trùng số = dò xem số nào có tài khoản → giới hạn theo số; tạo hàng loạt bị chặn theo IP (RULES)
    await ratelimit.check_limit("citizen_register", phone, REGISTER_PER_PHONE, 3600)
    email = _email(body.email)
    name = _name(body.full_name)
    if problem := password_problem(body.password):
        raise HTTPException(422, problem)
    unit_id = await _unit_id(body.admin_code)
    if await fetch_one("SELECT 1 FROM community.citizen_accounts WHERE phone = :p", {"p": phone}):
        await ratelimit.count_hit("citizen_register", phone, 3600)
        raise HTTPException(409, "Số điện thoại này đã có tài khoản — đăng nhập, hoặc lấy lại mật khẩu")
    if email and await fetch_one(
        "SELECT 1 FROM community.citizen_accounts WHERE lower(email) = :e", {"e": email}
    ):
        raise HTTPException(409, "Email này đã dùng cho một tài khoản khác")
    row = await fetch_one(
        """INSERT INTO community.citizen_accounts
                  (phone, full_name, email, admin_unit_id, password_hash, consent_at, last_login_at)
           VALUES (:p, :n, :e, CAST(:u AS uuid), :h, now(), now())
           RETURNING id""",
        {"p": phone, "n": name, "e": email, "u": unit_id, "h": hash_secret(body.password)},
    )
    return _session(await citizen_by_id(row["id"]))


class LoginIn(BaseModel):
    phone: str = Field(..., max_length=20)
    password: str = Field(..., max_length=128)


@router.post("/login")
async def login(body: LoginIn):
    phone = phone_key(body.phone or "")
    # Đếm theo số điện thoại (nhiều người chung IP nhà mạng) — giới hạn theo IP ở RULES (ratelimit.py)
    await ratelimit.check_limit("citizen_login", phone, LOGIN_MAX_FAILS, LOGIN_WINDOW_S)
    row = await fetch_one("SELECT id FROM community.citizen_accounts WHERE phone = :p", {"p": phone})
    acc = await citizen_by_id(row["id"]) if row else None
    if not acc or not verify_secret(body.password, acc["password_hash"]):
        await ratelimit.count_hit("citizen_login", phone, LOGIN_WINDOW_S)
        raise HTTPException(401, "Sai số điện thoại hoặc mật khẩu")
    if not acc["is_active"]:
        raise HTTPException(403, "Tài khoản đã bị khoá — gọi đường dây nóng của Ban Chỉ huy để được hỗ trợ")
    await execute(
        "UPDATE community.citizen_accounts SET last_login_at = now() WHERE id = :id", {"id": acc["id"]}
    )
    return _session(acc)


@router.get("/me")
async def me(acc: dict = Depends(citizen_session)):
    return public_view(acc)


class ProfileIn(BaseModel):
    full_name: str | None = Field(None, max_length=100)
    email: str | None = Field(None, max_length=120, description='Chuỗi rỗng "" = bỏ email')
    admin_code: str | None = Field(None, max_length=40, description='Chuỗi rỗng "" = bỏ xã đang ở')


@router.patch("/me")
async def update_me(body: ProfileIn, acc: dict = Depends(current_citizen)):
    sets, params = [], {"id": acc["id"]}
    if body.full_name is not None:
        sets.append("full_name = :n")
        params["n"] = _name(body.full_name)
    if body.email is not None:
        email = _email(body.email)
        if email and await fetch_one(
            "SELECT 1 FROM community.citizen_accounts WHERE lower(email) = :e AND id <> :id",
            {"e": email, "id": acc["id"]},
        ):
            raise HTTPException(409, "Email này đã dùng cho một tài khoản khác")
        sets.append("email = :e")
        params["e"] = email
    if body.admin_code is not None:
        sets.append("admin_unit_id = CAST(:u AS uuid)")
        params["u"] = await _unit_id(body.admin_code or None)
    if sets:
        await execute(f"UPDATE community.citizen_accounts SET {', '.join(sets)} WHERE id = :id", params)
    return public_view(await citizen_by_id(acc["id"]))


class ChangePasswordIn(BaseModel):
    old_password: str = Field(..., max_length=128)
    new_password: str = Field(..., max_length=128)


@router.post("/change-password")
async def change_password(body: ChangePasswordIn, acc: dict = Depends(citizen_session)):
    """Đổi mật khẩu (kể cả mật khẩu tạm cán bộ đặt lại) → các phiên khác hết hiệu lực, trả phiên mới."""
    if not verify_secret(body.old_password, acc["password_hash"]):
        raise HTTPException(400, "Mật khẩu hiện tại chưa đúng")
    if problem := password_problem(body.new_password):
        raise HTTPException(422, problem)
    await execute(
        """UPDATE community.citizen_accounts
              SET password_hash = :h, must_change_password = false, token_version = token_version + 1
            WHERE id = :id""",
        {"h": hash_secret(body.new_password), "id": acc["id"]},
    )
    return _session(await citizen_by_id(acc["id"]))


class ForgotIn(BaseModel):
    email: str = Field(..., max_length=120)


@router.post("/forgot")
async def forgot(body: ForgotIn):
    """Gửi đường dẫn đặt lại mật khẩu (30 phút, dùng một lần) tới email đã khai. Luôn trả cùng một câu — không lộ email nào
    có tài khoản. Không khai email → gọi đường dây nóng để cán bộ đặt lại."""
    email = _email(body.email)
    answer = {
        "message": "Nếu email này đã khai cho một tài khoản, đường dẫn đặt lại mật khẩu đã được gửi tới (hiệu lực 30 phút). "
        "Không nhận được thư: gọi đường dây nóng của Ban Chỉ huy để được đặt lại."
    }
    if not email:
        return answer
    await ratelimit.check_limit("citizen_forgot", email, FORGOT_PER_EMAIL, 3600)
    await ratelimit.count_hit("citizen_forgot", email, 3600)
    row = await fetch_one(
        "SELECT id FROM community.citizen_accounts WHERE lower(email) = :e AND is_active", {"e": email}
    )
    if row:
        acc = await citizen_by_id(row["id"])
        link = f"{settings.public_base_url.rstrip('/')}/cong-khai/dat-lai-mat-khau?token={create_reset_token(acc)}"
        sent = await send_mail(
            email,
            "Đặt lại mật khẩu tài khoản cổng cảnh báo thiên tai Cao Bằng",
            f"Xin chào {acc['full_name']},\n\nBạn (hoặc ai đó) vừa yêu cầu đặt lại mật khẩu tài khoản người dân "
            f"(số điện thoại {acc['phone'][:3]}…{acc['phone'][-3:]}). Mở đường dẫn sau trong 30 phút để đặt mật khẩu mới:\n\n"
            f"{link}\n\nKhông phải bạn yêu cầu thì bỏ qua thư này — mật khẩu hiện tại vẫn dùng được.\n\n"
            "Đang gặp nguy hiểm? Gọi ngay 112.",
        )
        if not sent:
            log.warning("Không gửi được thư đặt lại mật khẩu người dân (chưa cấu hình SMTP?)")
    return answer


class ResetIn(BaseModel):
    token: str = Field(..., max_length=2000)
    password: str = Field(..., max_length=128)


@router.post("/reset")
async def reset(body: ResetIn):
    acc = await citizen_from_token(body.token, RESET_AUD)
    if acc is None:
        raise HTTPException(400, "Đường dẫn đặt lại mật khẩu đã hết hạn hoặc đã dùng — gửi yêu cầu mới")
    if problem := password_problem(body.password):
        raise HTTPException(422, problem)
    # tăng token_version: đường dẫn này và mọi phiên cũ hết hiệu lực
    await execute(
        """UPDATE community.citizen_accounts
              SET password_hash = :h, must_change_password = false, token_version = token_version + 1
            WHERE id = :id""",
        {"h": hash_secret(body.password), "id": acc["id"]},
    )
    return {"message": "Đã đặt mật khẩu mới — đăng nhập bằng số điện thoại và mật khẩu mới"}


@router.get("/reports")
async def my_reports(acc: dict = Depends(current_citizen)):
    """ "Phiếu của tôi": phản ánh đã gửi khi đăng nhập (mới trước). Xem tiến độ từng phiếu: POST /public/track với mã +
    số điện thoại của tài khoản (giao diện tự điền)."""
    rows = await fetch_all(
        """SELECT r.code, r.category, r.status, r.created_at, left(r.description, 140) AS description,
                  u.name AS admin_name
             FROM community.citizen_reports r
             LEFT JOIN spatial_admin.administrative_units u ON u.id = r.admin_unit_id
            WHERE r.citizen_id = :id
            ORDER BY r.created_at DESC
            LIMIT 50""",
        {"id": acc["id"]},
    )
    return [{**r, "category_label": CATEGORY.get(r["category"], r["category"])} for r in rows]
