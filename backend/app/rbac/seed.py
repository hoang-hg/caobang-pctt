"""Đồng bộ vai trò hệ thống (idempotent, mỗi lần khởi động) + tạo tài khoản Superadmin / tài khoản demo lần đầu."""

from __future__ import annotations

import logging

from app import seed_data as D
from app.auth import hash_secret
from app.config import settings
from app.db import execute, fetch_one
from app.rbac.enforcer import get_enforcer, notify_policy_changed
from app.rbac.permissions import GLOBAL_SCOPE, SYSTEM_ROLES

log = logging.getLogger(__name__)


async def dedupe_policies() -> None:
    """Xoá dòng policy trùng (nếu có) rồi nạp lại."""
    await execute(
        """DELETE FROM public.casbin_rule a USING public.casbin_rule b
            WHERE a.id > b.id AND a.ptype = b.ptype
              AND a.v0 IS NOT DISTINCT FROM b.v0 AND a.v1 IS NOT DISTINCT FROM b.v1
              AND a.v2 IS NOT DISTINCT FROM b.v2 AND a.v3 IS NOT DISTINCT FROM b.v3
              AND a.v4 IS NOT DISTINCT FROM b.v4 AND a.v5 IS NOT DISTINCT FROM b.v5"""
    )
    await get_enforcer().load_policy()


async def sync_system_roles() -> None:
    e = get_enforcer()
    for name, display, desc, delegatable, perm_list in SYSTEM_ROLES:
        wanted = {(GLOBAL_SCOPE, o, a) for o, a in perm_list}
        current = {tuple(p[1:4]) for p in e.get_filtered_policy(0, name)}
        for dom, o, a in current - wanted:
            await e.remove_policy(name, dom, o, a)
        for dom, o, a in wanted - current:
            await e.add_policy(name, dom, o, a)
        await execute(
            """INSERT INTO communications.rbac_role_metadata (name, display_name, description, is_system, is_delegatable)
               VALUES (:n, :d, :desc, TRUE, :dg)
               ON CONFLICT (name) DO UPDATE SET display_name = EXCLUDED.display_name, description = EXCLUDED.description,
                     is_system = TRUE, is_delegatable = EXCLUDED.is_delegatable, updated_at = now()""",
            {"n": name, "d": display, "desc": desc, "dg": delegatable},
        )


async def ensure_user(username, full_name, position, password, pin, email, role, domain) -> None:
    """Tạo tài khoản + gán vai trò CHỈ khi tài khoản chưa tồn tại. Tài khoản đã có thì không đụng tới: mật khẩu, trạng
    thái khoá và vai trò (kể cả khi quản trị viên đã gỡ hết vai trò) giữ nguyên qua các lần khởi động lại."""
    created = await fetch_one(
        """INSERT INTO communications.users (username, full_name, position, password_hash, pin_hash, email)
           VALUES (:u, :f, :p, :pw, :pin, :e) ON CONFLICT (username) DO NOTHING RETURNING id""",
        {
            "u": username,
            "f": full_name,
            "p": position,
            "pw": hash_secret(password),
            "pin": hash_secret(pin) if pin else None,
            "e": email,
        },
    )
    if created is not None:
        await get_enforcer().add_grouping_policy(username, role, domain)
        log.info("[rbac] tạo tài khoản %s → %s @ %s", username, role, domain)


async def ensure_system_accounts() -> None:
    """Superadmin từ cấu hình (.env) — chỉ tạo lần đầu. Tài khoản demo (mật khẩu công khai trong seed_data)
    chỉ tạo khi DEMO_MODE=true; khi chạy thật, admin tỉnh/xã do Superadmin tạo trong trang Phân quyền."""
    s = settings
    await ensure_user(
        s.superadmin_username,
        s.superadmin_full_name,
        "Quản trị hệ thống",
        s.superadmin_password,
        s.superadmin_pin,
        s.superadmin_email,
        s.superadmin_role,
        s.superadmin_domain,
    )
    if not s.demo_mode:
        return
    for username, full, pos, pw, pin, role, domain in D.USERS:
        if username != s.superadmin_username:
            await ensure_user(username, full, pos, pw, pin, f"{username}@{D.DEMO_EMAIL_DOMAIN}", role, domain)


async def bootstrap() -> None:
    await dedupe_policies()
    await sync_system_roles()
    await ensure_system_accounts()
    await notify_policy_changed()
