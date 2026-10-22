"""Cán bộ cấp tỉnh quản lý tài khoản người dân (Đ5 — docs/ke-hoach-lam-moi-giao-dien.md mục 11).

Tìm theo số điện thoại / họ tên, khoá tài khoản phá rối (phiên đang mở hết hiệu lực ngay), đặt lại mật khẩu khi người dân
gọi đường dây nóng (mật khẩu tạm hiện MỘT lần cho cán bộ đọc qua điện thoại; người dân phải đổi ở lần đăng nhập sau).
Quyền ``citizen.view`` / ``citizen.manage`` chỉ cấp ở phạm vi toàn tỉnh. Mọi thay đổi ghi nhật ký pháp lý.
"""

from __future__ import annotations

import secrets
import string

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.auth import audit, hash_secret
from app.db import execute, fetch_all, fetch_one
from app.rbac.authz import require_permission

router = APIRouter(prefix="/citizens", tags=["Tài khoản người dân"])

LIST_SELECT = """SELECT c.id, c.phone, c.full_name, c.email, c.is_active, c.locked_reason, c.must_change_password,
                        c.created_at, c.last_login_at, u.name AS admin_name,
                        (SELECT count(*) FROM community.citizen_reports r WHERE r.citizen_id = c.id) AS report_count
                   FROM community.citizen_accounts c
                   LEFT JOIN spatial_admin.administrative_units u ON u.id = c.admin_unit_id"""


def _temp_password() -> str:
    """Mật khẩu tạm dễ đọc qua điện thoại: 4 chữ thường + 4 số, bỏ ký tự dễ nhầm (l, o, 0, 1)."""
    letters = "".join(ch for ch in string.ascii_lowercase if ch not in "lo")
    digits = "23456789"
    return "".join(secrets.choice(letters) for _ in range(4)) + "".join(
        secrets.choice(digits) for _ in range(4)
    )


@router.get("")
async def list_citizens(
    q: str = Query("", max_length=60, description="Số điện thoại (một phần) hoặc họ tên"),
    limit: int = Query(50, ge=1, le=200),
    _: dict = Depends(require_permission("citizen", "view")),
):
    term = q.strip()
    digits = "".join(ch for ch in term if ch.isdigit())
    if digits.startswith("84") and len(digits) >= 11:
        digits = "0" + digits[2:]
    where, params = "", {"limit": limit}
    if digits and len(digits) >= 3:
        where = "WHERE c.phone LIKE :p"
        params["p"] = f"%{digits}%"
    elif term:
        where = "WHERE c.full_name ILIKE :n"
        params["n"] = f"%{term}%"
    rows = await fetch_all(f"{LIST_SELECT} {where} ORDER BY c.created_at DESC LIMIT :limit", params)
    total = await fetch_one("SELECT count(*) AS n FROM community.citizen_accounts")
    return {"items": rows, "total": total["n"]}


class CitizenPatch(BaseModel):
    is_active: bool
    reason: str | None = Field(None, max_length=200, description="Lý do khoá (bắt buộc khi khoá)")


@router.patch("/{citizen_id}")
async def set_active(
    citizen_id: str, body: CitizenPatch, user: dict = Depends(require_permission("citizen", "manage"))
):
    """Khoá / mở khoá. Khoá → phiên đang mở của người đó hết hiệu lực ngay (tăng token_version)."""
    acc = await fetch_one(
        "SELECT id, phone, is_active FROM community.citizen_accounts WHERE id = CAST(:id AS uuid)",
        {"id": citizen_id},
    )
    if not acc:
        raise HTTPException(404, "Không tìm thấy tài khoản")
    reason = (body.reason or "").strip() or None
    if not body.is_active and not reason:
        raise HTTPException(422, "Ghi lý do khoá (VD phá rối, báo tin giả nhiều lần)")
    await execute(
        """UPDATE community.citizen_accounts
              SET is_active = :a, locked_reason = :r,
                  token_version = token_version + CASE WHEN :a THEN 0 ELSE 1 END
            WHERE id = :id""",
        {"a": body.is_active, "r": None if body.is_active else reason, "id": acc["id"]},
    )
    await audit(
        user,
        "citizen.unlock" if body.is_active else "citizen.lock",
        "citizen_account",
        str(acc["id"]),
        {"phone": acc["phone"], "reason": reason},
    )
    return await fetch_one(f"{LIST_SELECT} WHERE c.id = :id", {"id": acc["id"]})


@router.post("/{citizen_id}/reset-password")
async def reset_password(citizen_id: str, user: dict = Depends(require_permission("citizen", "manage"))):
    """Người dân gọi đường dây nóng báo quên mật khẩu → cán bộ đặt mật khẩu tạm, đọc cho người dân. Mật khẩu tạm chỉ trả
    MỘT lần ở đây (không lưu dạng đọc được); người dân phải đổi ở lần đăng nhập sau. Phiên cũ hết hiệu lực."""
    acc = await fetch_one(
        "SELECT id, phone, is_active FROM community.citizen_accounts WHERE id = CAST(:id AS uuid)",
        {"id": citizen_id},
    )
    if not acc:
        raise HTTPException(404, "Không tìm thấy tài khoản")
    temp = _temp_password()
    await execute(
        """UPDATE community.citizen_accounts
              SET password_hash = :h, must_change_password = true, token_version = token_version + 1
            WHERE id = :id""",
        {"h": hash_secret(temp), "id": acc["id"]},
    )
    await audit(user, "citizen.reset_password", "citizen_account", str(acc["id"]), {"phone": acc["phone"]})
    return {
        "temp_password": temp,
        "message": "Đọc mật khẩu tạm cho người dân; lần đăng nhập sau họ phải đổi mật khẩu mới",
    }
