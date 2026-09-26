"""Đồng bộ vai trò hệ thống (idempotent, mỗi lần khởi động) + gán vai trò cho tài khoản demo lần đầu."""

from __future__ import annotations

import logging

from app import seed_data as D
from app.db import execute, fetch_all
from app.rbac.enforcer import get_enforcer
from app.rbac.permissions import GLOBAL_SCOPE, SYSTEM_ROLES

log = logging.getLogger(__name__)


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


async def seed_demo_assignments() -> None:
    """Chỉ gán cho tài khoản demo CHƯA có vai trò nào (không ghi đè thay đổi của quản trị viên)."""
    e = get_enforcer()
    users = {u["username"] for u in await fetch_all("SELECT username FROM communications.users")}
    for username, *_rest, role, domain in D.USERS:
        if username in users and not e.get_filtered_grouping_policy(0, username):
            await e.add_grouping_policy(username, role, domain)
            log.info("[rbac] gán %s → %s @ %s", username, role, domain)


async def bootstrap() -> None:
    await sync_system_roles()
    await seed_demo_assignments()
