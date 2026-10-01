"""Nghiệp vụ quản trị RBAC: tài khoản, vai trò (3 cấp cố định), rào chắn chống leo thang và mạo danh.

Mô hình (app/rbac/permissions.py): mỗi cấp 1 vai trò, mỗi tài khoản đúng 1 vai trò tại 1 phạm vi.
  Cấp 1 Quản trị hệ thống (toàn tỉnh) · Cấp 2 Quản trị tỉnh (toàn tỉnh) · Cấp 3 Quản trị xã/phường (1 xã).

Rào chắn — áp dụng cho tạo tài khoản, đổi vai trò, đổi mật khẩu / PIN / 2 lớp / khoá:
  1. Quản trị hệ thống làm được mọi thứ (trừ tự đổi vai trò / tự khoá mình).
  2. Người khác chỉ tác động tài khoản CẤP DƯỚI mình (Cấp 2 → Cấp 3); cùng cấp không đổi mật khẩu / PIN / 2 lớp của
     nhau → không mạo danh được, nhật ký luôn đúng người.
  3. Vai trò được cấp phải thấp hơn cấp của người cấp, đúng loại phạm vi (Cấp 1–2 toàn tỉnh, Cấp 3 đúng 1 xã), nằm trong
     phạm vi ``user.manage`` của người cấp, và người cấp có đủ mọi quyền của vai trò đó (không leo thang).
"""

from __future__ import annotations

import json

from fastapi import HTTPException

from app.auth import bump_token_version, hash_secret, password_problem
from app.db import execute, fetch_all, fetch_one
from app.rbac import domains
from app.rbac.authz import allowed_patterns, can, groupings
from app.rbac.enforcer import get_enforcer, notify_policy_changed
from app.rbac.permissions import (
    GLOBAL_SCOPE,
    LEVEL_LABEL,
    NO_LEVEL,
    ROLE_LEVEL,
    SUPER_ADMIN_ROLE,
    SYSTEM_ROLES,
    level_of,
    scope_fits,
)


def is_super(user: dict) -> bool:
    return (SUPER_ADMIN_ROLE, GLOBAL_SCOPE) in groupings(user["username"])


def user_level(username: str) -> int:
    return level_of([r for r, _ in groupings(username)])


async def rbac_audit(
    actor: dict, action: str, target: str | None = None, role=None, domain=None, details=None
):
    await execute(
        """INSERT INTO communications.rbac_audit_log (actor_id, actor_name, action, target_user, role, domain, details)
           VALUES (:a, :an, :ac, :t, :r, :d, CAST(:det AS jsonb))""",
        {
            "a": actor["id"],
            "an": actor["full_name"],
            "ac": action,
            "t": target,
            "r": role,
            "d": domain,
            "det": json.dumps(details or {}, ensure_ascii=False),
        },
    )
    if action != "user.update":  # thay đổi policy → các tiến trình khác nạp lại
        await notify_policy_changed()


# ---------------------------------------------------------------- roles (cố định, chỉ đọc)
def role_permissions(role: str) -> list[str]:
    return sorted({f"{p[2]}.{p[3]}" for p in get_enforcer().get_filtered_policy(0, role) if len(p) >= 4})


async def list_roles() -> list[dict]:
    counts: dict[str, int] = {}
    for g in get_enforcer().get_grouping_policy():
        counts[g[1]] = counts.get(g[1], 0) + 1
    return [
        {
            "name": name,
            "display_name": display,
            "description": desc,
            "is_system": True,
            "is_delegatable": delegatable,
            "level": ROLE_LEVEL[name],
            "level_label": LEVEL_LABEL[ROLE_LEVEL[name]],
            "scope_kind": "tinh" if ROLE_LEVEL[name] <= 2 else "xa",
            "permissions": role_permissions(name),
            "user_count": counts.get(name, 0),
        }
        for name, display, desc, delegatable, _ in SYSTEM_ROLES
    ]


def _display(role: str) -> str:
    return next((r[1] for r in SYSTEM_ROLES if r[0] == role), role)


# ---------------------------------------------------------------- delegation
def _manage_covers(actor: dict, domain: str) -> bool:
    pats = allowed_patterns(actor, "user", "manage")
    return pats is None or any(domains.covers(p, domain) for p in pats)


async def assert_can_delegate(actor: dict, role: str, domain: str) -> None:
    if role not in ROLE_LEVEL:
        raise HTTPException(
            404,
            "Không tìm thấy vai trò — hệ thống chỉ có Quản trị hệ thống, Quản trị tỉnh, Quản trị xã/phường",
        )
    if not domains.is_valid_domain(domain) or not scope_fits(role, domain):
        where = "toàn tỉnh" if ROLE_LEVEL[role] <= 2 else "đúng 1 xã/phường"
        raise HTTPException(422, f"Vai trò “{_display(role)}” chỉ cấp ở phạm vi {where}")
    if is_super(actor):
        return
    if ROLE_LEVEL[role] <= user_level(actor["username"]):
        raise HTTPException(
            403, f"Chỉ cấp trên được cấp vai trò “{_display(role)}” ({LEVEL_LABEL[ROLE_LEVEL[role]]})"
        )
    if not _manage_covers(actor, domain):
        raise HTTPException(403, f"Phạm vi “{domains.label(domain)}” nằm ngoài phạm vi bạn được quản lý")
    missing = [c for c in role_permissions(role) if not can(actor, *c.split("."), domain)]
    if missing:
        raise HTTPException(403, f"Không thể cấp quyền bạn không có tại phạm vi này: {', '.join(missing)}")


async def assert_can_manage_user(actor: dict, target: dict) -> None:
    """Đổi mật khẩu / PIN / 2 lớp / khoá / đổi vai trò: chỉ cấp trên của tài khoản đó."""
    if is_super(actor):
        return
    target_groups = groupings(target["username"])
    if not target_groups:
        if target.get("created_by") == actor["id"]:
            return
        raise HTTPException(403, "Tài khoản ngoài phạm vi quản lý")
    if level_of([r for r, _ in target_groups]) <= user_level(actor["username"]):
        raise HTTPException(
            403,
            "Chỉ cấp trên quản lý được tài khoản này (cùng cấp không đổi mật khẩu, PIN, xác thực 2 lớp của nhau)",
        )
    if not all(_manage_covers(actor, d) for _, d in target_groups):
        raise HTTPException(403, "Tài khoản có vai trò ngoài phạm vi bạn quản lý")


def _assert_pin_allowed(role_level: int, pin: str | None) -> None:
    if pin and role_level > 2:
        raise HTTPException(422, "Cấp 3 không duyệt cảnh báo — không cấp mã PIN phê duyệt")


# ---------------------------------------------------------------- users
USER_COLS = (
    "id, username, full_name, position, email, is_active, created_at, created_by, (pin_hash IS NOT NULL) AS has_pin, "
    "(totp_enabled_at IS NOT NULL) AS mfa_enabled"
)


async def list_users(actor: dict) -> list[dict]:
    rows = await fetch_all(f"SELECT {USER_COLS} FROM communications.users ORDER BY created_at, username")
    pats = allowed_patterns(actor, "user", "view")
    meta = {r[0]: r[1] for r in SYSTEM_ROLES}
    out = []
    for u in rows:
        gs = groupings(u["username"])
        visible = (
            pats is None
            or u["created_by"] == actor["id"]
            or any(any(domains.covers(p, d) for p in pats) for _, d in gs)
        )
        if not visible:
            continue
        level = level_of([r for r, _ in gs])
        out.append(
            {
                **u,
                "level": level if level != NO_LEVEL else None,
                "assignments": [
                    {"role": r, "role_name": meta.get(r, r), "domain": d, "domain_label": domains.label(d)}
                    for r, d in gs
                ],
            }
        )
    return out


async def get_user(user_id: str) -> dict:
    import uuid

    try:
        uid = str(uuid.UUID(user_id))
    except ValueError as exc:
        raise HTTPException(404, "Không tìm thấy tài khoản") from exc
    u = await fetch_one(
        f"SELECT {USER_COLS} FROM communications.users WHERE id = CAST(:id AS uuid)", {"id": uid}
    )
    if not u:
        raise HTTPException(404, "Không tìm thấy tài khoản")
    return u


async def create_user(actor, username, full_name, position, password, pin, role, domain, email=None) -> dict:
    await assert_can_delegate(actor, role, domain)
    _assert_pin_allowed(ROLE_LEVEL[role], pin)
    if problem := password_problem(password):
        raise HTTPException(422, problem)
    if email and await fetch_one(
        "SELECT 1 FROM communications.users WHERE lower(email) = lower(:e)", {"e": email}
    ):
        raise HTTPException(409, "Email đã được dùng cho tài khoản khác")
    if await fetch_one("SELECT 1 FROM communications.users WHERE username = :u", {"u": username}):
        raise HTTPException(409, "Tên đăng nhập đã tồn tại")
    row = await fetch_one(
        """INSERT INTO communications.users (username, full_name, position, password_hash, pin_hash, created_by, email)
           VALUES (:u, :f, :p, :pw, :pin, :by, :e) RETURNING id""",
        {
            "u": username,
            "f": full_name,
            "p": position,
            "pw": hash_secret(password),
            "pin": hash_secret(pin) if pin else None,
            "by": actor["id"],
            "e": email or None,
        },
    )
    await get_enforcer().add_grouping_policy(username, role, domain)
    await rbac_audit(actor, "user.create", username, role, domain, {"full_name": full_name})
    return await get_user(str(row["id"]))


async def update_user(
    actor, user_id, *, full_name=None, position=None, password=None, pin=None, is_active=None, email=None
) -> dict:
    target = await get_user(user_id)
    await assert_can_manage_user(actor, target)
    _assert_pin_allowed(user_level(target["username"]), pin)
    if password and (problem := password_problem(password)):
        raise HTTPException(422, problem)
    if email and await fetch_one(
        "SELECT 1 FROM communications.users WHERE lower(email) = lower(:e) AND id <> CAST(:id AS uuid)",
        {"e": email, "id": user_id},
    ):
        raise HTTPException(409, "Email đã được dùng cho tài khoản khác")
    if is_active is False and target["id"] == actor["id"]:
        raise HTTPException(400, "Không tự khoá tài khoản của mình")
    await execute(
        """UPDATE communications.users SET full_name = COALESCE(CAST(:f AS text), full_name),
                  position = COALESCE(CAST(:p AS text), position),
                  password_hash = COALESCE(CAST(:pw AS text), password_hash),
                  pin_hash = COALESCE(CAST(:pin AS text), pin_hash),
                  is_active = COALESCE(CAST(:act AS boolean), is_active),
                  email = COALESCE(CAST(:email AS text), email)
            WHERE id = CAST(:id AS uuid)""",
        {
            "f": full_name,
            "p": position,
            "pw": hash_secret(password) if password else None,
            "pin": hash_secret(pin) if pin else None,
            "act": is_active,
            "email": email,
            "id": user_id,
        },
    )
    if password or is_active is not None:
        await bump_token_version(user_id)
    changed = [
        k
        for k, v in {
            "full_name": full_name,
            "position": position,
            "password": password,
            "pin": pin,
            "is_active": is_active,
            "email": email,
        }.items()
        if v is not None
    ]
    await rbac_audit(
        actor, "user.update", target["username"], details={"changed": changed, "is_active": is_active}
    )
    return await get_user(user_id)


async def set_assignment(actor, user_id, role, domain) -> dict:
    """Đổi cấp / phạm vi: thay vai trò hiện có bằng đúng 1 vai trò mới (mỗi tài khoản 1 vai trò)."""
    target = await get_user(user_id)
    if target["id"] == actor["id"]:
        raise HTTPException(400, "Không tự đổi vai trò của mình — đề nghị cấp trên")
    await assert_can_manage_user(actor, target)
    await assert_can_delegate(actor, role, domain)
    current = groupings(target["username"])
    if current == [(role, domain)]:
        return target
    e = get_enforcer()
    for r, d in current:
        await e.remove_grouping_policy(target["username"], r, d)
    await e.add_grouping_policy(target["username"], role, domain)
    if ROLE_LEVEL[role] > 2:  # Cấp 3 không duyệt cảnh báo → bỏ PIN cũ
        await execute(
            "UPDATE communications.users SET pin_hash = NULL WHERE id = CAST(:id AS uuid)",
            {"id": str(target["id"])},
        )
    await bump_token_version(target["id"])
    await rbac_audit(
        actor, "assign", target["username"], role, domain, {"from": [f"{r}@{d}" for r, d in current]}
    )
    return target


async def reset_mfa(actor, user_id) -> None:
    """Xoá xác thực 2 lớp của tài khoản (mất điện thoại / hết mã khôi phục) → đăng xuất mọi phiên; vai trò bắt buộc
    thì lần đăng nhập sau phải cài đặt lại."""
    target = await get_user(user_id)
    await assert_can_manage_user(actor, target)
    await execute(
        """UPDATE communications.users SET totp_secret_enc = NULL, totp_enabled_at = NULL, totp_last_step = NULL,
                  totp_recovery_hashes = '{}' WHERE id = CAST(:id AS uuid)""",
        {"id": str(target["id"])},
    )
    await bump_token_version(target["id"])
    await rbac_audit(actor, "user.mfa_reset", target["username"])
