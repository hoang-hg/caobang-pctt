"""Đồng bộ vai trò hệ thống (idempotent, mỗi lần khởi động) + tạo tài khoản Superadmin / tài khoản demo lần đầu.

Chuyển sang mô hình 3 cấp (mỗi cấp 1 vai trò, mỗi tài khoản 1 vai trò — app/rbac/permissions.py): vai trò cũ đổi theo
``RETIRED_ROLES``, vai trò tuỳ chỉnh / cụm bị gỡ; tài khoản mất hết vai trò vì chuyển đổi bị khoá chờ cấp trên cấp lại.
Mọi thay đổi ghi nhật ký phân quyền (người thực hiện: "Hệ thống").
"""

from __future__ import annotations

import json
import logging
from collections.abc import Callable
from dataclasses import dataclass, field

from app import seed_data as D
from app.auth import hash_secret
from app.config import settings
from app.db import execute, fetch_one
from app.rbac import domains
from app.rbac.enforcer import get_enforcer, notify_policy_changed
from app.rbac.permissions import (
    GLOBAL_SCOPE,
    RETIRED_ROLES,
    ROLE_LEVEL,
    SYSTEM_ROLE_NAMES,
    SYSTEM_ROLES,
    scope_fits,
)

log = logging.getLogger(__name__)
SYSTEM_ACTOR = "Hệ thống (chuyển sang phân quyền 3 cấp)"


@dataclass
class RolePlan:
    remove: list[tuple[str, str, str]] = field(default_factory=list)  # (tài khoản, vai trò, phạm vi) gỡ
    add: list[tuple[str, str, str]] = field(default_factory=list)
    lock: list[str] = field(default_factory=list)  # mất hết vai trò vì chuyển đổi → khoá chờ cấp lại


def plan_role_cleanup(groups: list[tuple[str, str, str]], is_commune: Callable[[str], bool]) -> RolePlan:
    """Mỗi tài khoản còn TỐI ĐA 1 vai trò hợp lệ: đổi vai trò cũ theo RETIRED_ROLES, bỏ vai trò tuỳ chỉnh, bỏ phạm vi
    sai cấp (cụm, xã không tồn tại); nhiều vai trò → giữ cấp cao nhất. Không có quyền nào được nới thêm phạm vi."""
    by_user: dict[str, list[tuple[str, str]]] = {}
    for user, role, dom in groups:
        by_user.setdefault(user, []).append((role, dom))
    plan = RolePlan()
    for user, items in by_user.items():
        candidates = []
        for role, dom in items:
            new = role if role in ROLE_LEVEL else RETIRED_ROLES.get(role)
            if new and scope_fits(new, dom) and (dom == GLOBAL_SCOPE or is_commune(dom)):
                candidates.append((ROLE_LEVEL[new], dom, new))
        wanted = {(min(candidates)[2], min(candidates)[1])} if candidates else set()
        current = set(items)
        plan.remove += [(user, r, d) for r, d in sorted(current - wanted)]
        plan.add += [(user, r, d) for r, d in sorted(wanted - current)]
        if current and not wanted:
            plan.lock.append(user)
    return plan


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


async def migrate_roles() -> None:
    """Gỡ định nghĩa vai trò ngoài 3 vai trò hệ thống, chuyển phân quyền của từng tài khoản (plan_role_cleanup)."""
    e = get_enforcer()
    for role in {p[0] for p in e.get_policy()} - SYSTEM_ROLE_NAMES:
        await e.remove_filtered_policy(0, role)
    await execute(
        "DELETE FROM communications.rbac_role_metadata WHERE NOT (name = ANY(:keep))",
        {"keep": sorted(SYSTEM_ROLE_NAMES)},
    )
    await domains.load_units()
    groups = [(g[0], g[1], g[2]) for g in e.get_grouping_policy() if len(g) >= 3]
    commune_domains = {u.domain for u in domains.units()}
    plan = plan_role_cleanup(groups, lambda d: d in commune_domains)
    if not (plan.remove or plan.add or plan.lock):
        return
    for user, role, dom in plan.remove:
        await e.remove_grouping_policy(user, role, dom)
    for user, role, dom in plan.add:
        await e.add_grouping_policy(user, role, dom)
    changed = sorted({u for u, _, _ in plan.remove + plan.add} | set(plan.lock))
    await execute(
        """UPDATE communications.users SET token_version = token_version + 1,
                  is_active = CASE WHEN username = ANY(:lock) THEN false ELSE is_active END
            WHERE username = ANY(:u)""",
        {"u": changed, "lock": plan.lock},
    )
    for user in changed:
        details = {
            "from": [f"{r}@{d}" for u, r, d in plan.remove if u == user],
            "to": [f"{r}@{d}" for u, r, d in plan.add if u == user],
            "locked": user in plan.lock,
        }
        new = next(((r, d) for u, r, d in plan.add if u == user), (None, None))
        await execute(
            """INSERT INTO communications.rbac_audit_log (actor_id, actor_name, action, target_user, role, domain, details)
               VALUES (NULL, :an, 'role.migrate', :t, :r, :d, CAST(:det AS jsonb))""",
            {
                "an": SYSTEM_ACTOR,
                "t": user,
                "r": new[0],
                "d": new[1],
                "det": json.dumps(details, ensure_ascii=False),
            },
        )
    log.warning(
        "[rbac] chuyển sang 3 cấp: %d tài khoản đổi vai trò, %d tài khoản bị khoá chờ cấp lại (%s)",
        len(changed) - len(plan.lock),
        len(plan.lock),
        ", ".join(plan.lock) or "không",
    )


async def bootstrap() -> None:
    await dedupe_policies()
    await sync_system_roles()
    await migrate_roles()
    await ensure_system_accounts()
    await notify_policy_changed()
