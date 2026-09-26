"""Nghiệp vụ quản trị RBAC: vai trò, tài khoản, cấp/thu hồi quyền, uỷ quyền có rào chắn chống leo thang.

Rào chắn uỷ quyền (``assert_can_delegate``) — áp dụng cho mọi thao tác cấp / thu hồi:
  1. super_admin làm được mọi thứ.
  2. Người khác chỉ cấp vai trò có cờ ``is_delegatable`` và không thuộc ``NON_DELEGATABLE``.
  3. Phạm vi cấp phải nằm trong phạm vi ``user.manage`` của người cấp (cụm Bảo Lạc không cấp được cho cụm khác).
  4. Không leo thang: mọi quyền của vai trò được cấp, người cấp cũng phải đang có tại phạm vi đó.
"""

from __future__ import annotations

import json

from fastapi import HTTPException

from app.auth import bump_token_version, hash_secret
from app.db import execute, fetch_all, fetch_one
from app.rbac import domains
from app.rbac.authz import allowed_patterns, can, groupings
from app.rbac.enforcer import get_enforcer
from app.rbac.permissions import (
    GLOBAL_SCOPE,
    NON_DELEGATABLE,
    ROLE_NAME_PATTERN,
    SUPER_ADMIN_ROLE,
    SYSTEM_ROLE_NAMES,
    get_permission,
)


def is_super(user: dict) -> bool:
    return (SUPER_ADMIN_ROLE, GLOBAL_SCOPE) in groupings(user["username"])


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


# ---------------------------------------------------------------- roles
def role_permissions(role: str) -> list[str]:
    return sorted({f"{p[2]}.{p[3]}" for p in get_enforcer().get_filtered_policy(0, role) if len(p) >= 4})


async def list_roles() -> list[dict]:
    meta = await fetch_all(
        """SELECT * FROM communications.rbac_role_metadata
            ORDER BY is_system DESC, array_position(ARRAY['super_admin', 'truong_ban', 'chi_huy_cum', 'truc_ban', 'can_bo_xa',
                                                           'thu_kho', 'quan_sat'], name), name"""
    )
    e = get_enforcer()
    counts: dict[str, int] = {}
    for g in e.get_grouping_policy():
        counts[g[1]] = counts.get(g[1], 0) + 1
    return [
        {**m, "permissions": role_permissions(m["name"]), "user_count": counts.get(m["name"], 0)}
        for m in meta
    ]


def _validate_perm_codes(codes: list[str]) -> list[tuple[str, str]]:
    out = []
    for c in codes:
        if not get_permission(c):
            raise HTTPException(422, f"Quyền không hợp lệ: {c}")
        o, a = c.split(".")
        out.append((o, a))
    if not out:
        raise HTTPException(422, "Vai trò phải có ít nhất một quyền")
    return out


async def create_role(actor, name, display_name, description, is_delegatable, codes) -> dict:
    if not ROLE_NAME_PATTERN.match(name):
        raise HTTPException(
            422, "Tên vai trò: chữ thường không dấu, số, gạch dưới (3–41 ký tự), bắt đầu bằng chữ"
        )
    if await fetch_one("SELECT 1 FROM communications.rbac_role_metadata WHERE name = :n", {"n": name}):
        raise HTTPException(409, "Vai trò đã tồn tại")
    pairs = _validate_perm_codes(codes)
    e = get_enforcer()
    for o, a in pairs:
        await e.add_policy(name, GLOBAL_SCOPE, o, a)
    await execute(
        """INSERT INTO communications.rbac_role_metadata (name, display_name, description, is_system, is_delegatable)
           VALUES (:n, :d, :desc, FALSE, :dg)""",
        {"n": name, "d": display_name, "desc": description, "dg": is_delegatable},
    )
    await rbac_audit(
        actor, "role.create", role=name, details={"permissions": codes, "is_delegatable": is_delegatable}
    )
    return next(r for r in await list_roles() if r["name"] == name)


async def update_role(
    actor, name, display_name=None, description=None, is_delegatable=None, codes=None
) -> dict:
    meta = await fetch_one("SELECT * FROM communications.rbac_role_metadata WHERE name = :n", {"n": name})
    if not meta:
        raise HTTPException(404, "Không tìm thấy vai trò")
    if meta["is_system"] and (codes is not None or is_delegatable is not None):
        raise HTTPException(400, "Vai trò hệ thống chỉ được sửa tên hiển thị / mô tả")
    e = get_enforcer()
    if codes is not None:
        pairs = set(_validate_perm_codes(codes))
        current = {(p[2], p[3]) for p in e.get_filtered_policy(0, name)}
        for o, a in current - pairs:
            await e.remove_policy(name, GLOBAL_SCOPE, o, a)
        for o, a in pairs - current:
            await e.add_policy(name, GLOBAL_SCOPE, o, a)
        await bump_holders(name)
    await execute(
        """UPDATE communications.rbac_role_metadata SET display_name = COALESCE(CAST(:d AS text), display_name),
                  description = COALESCE(CAST(:desc AS text), description),
                  is_delegatable = COALESCE(CAST(:dg AS boolean), is_delegatable), updated_at = now()
            WHERE name = :n""",
        {"n": name, "d": display_name, "desc": description, "dg": is_delegatable},
    )
    await rbac_audit(
        actor, "role.update", role=name, details={"permissions": codes, "is_delegatable": is_delegatable}
    )
    return next(r for r in await list_roles() if r["name"] == name)


async def delete_role(actor, name) -> None:
    if name in SYSTEM_ROLE_NAMES:
        raise HTTPException(400, "Không xoá được vai trò hệ thống")
    e = get_enforcer()
    if e.get_filtered_grouping_policy(1, name):
        raise HTTPException(409, "Vai trò đang được gán cho người dùng — thu hồi trước khi xoá")
    await e.remove_filtered_policy(0, name)
    await execute("DELETE FROM communications.rbac_role_metadata WHERE name = :n", {"n": name})
    await rbac_audit(actor, "role.delete", role=name)


async def bump_holders(role: str) -> None:
    for g in get_enforcer().get_filtered_grouping_policy(1, role):
        u = await fetch_one("SELECT id FROM communications.users WHERE username = :u", {"u": g[0]})
        if u:
            await bump_token_version(u["id"])


# ---------------------------------------------------------------- delegation
def _manage_covers(actor: dict, domain: str) -> bool:
    pats = allowed_patterns(actor, "user", "manage")
    return pats is None or any(domains.covers(p, domain) for p in pats)


async def assert_can_delegate(actor: dict, role: str, domain: str) -> None:
    if not domains.is_valid_domain(domain):
        raise HTTPException(422, "Phạm vi không hợp lệ")
    meta = await fetch_one("SELECT * FROM communications.rbac_role_metadata WHERE name = :n", {"n": role})
    if not meta:
        raise HTTPException(404, "Không tìm thấy vai trò")
    if is_super(actor):
        return
    if role in NON_DELEGATABLE or not meta["is_delegatable"]:
        raise HTTPException(403, f"Vai trò “{meta['display_name']}” chỉ Quản trị hệ thống được cấp")
    if not _manage_covers(actor, domain):
        raise HTTPException(403, f"Phạm vi “{domains.label(domain)}” nằm ngoài phạm vi bạn được quản lý")
    missing = [c for c in role_permissions(role) if not can(actor, *c.split("."), domain)]
    if missing:
        raise HTTPException(403, f"Không thể cấp quyền bạn không có tại phạm vi này: {', '.join(missing)}")


async def assert_can_manage_user(actor: dict, target: dict) -> None:
    if is_super(actor):
        return
    target_groups = groupings(target["username"])
    if any(r == SUPER_ADMIN_ROLE for r, _ in target_groups):
        raise HTTPException(403, "Không quản lý được tài khoản Quản trị hệ thống")
    if not target_groups:
        if target.get("created_by") == actor["id"]:
            return
        raise HTTPException(403, "Tài khoản ngoài phạm vi quản lý")
    if not all(_manage_covers(actor, d) for _, d in target_groups):
        raise HTTPException(403, "Tài khoản có vai trò ngoài phạm vi bạn quản lý")


# ---------------------------------------------------------------- users
USER_COLS = (
    "id, username, full_name, position, is_active, created_at, created_by, (pin_hash IS NOT NULL) AS has_pin"
)


async def list_users(actor: dict) -> list[dict]:
    rows = await fetch_all(f"SELECT {USER_COLS} FROM communications.users ORDER BY created_at, username")
    pats = allowed_patterns(actor, "user", "view")
    meta = {
        m["name"]: m["display_name"]
        for m in await fetch_all("SELECT name, display_name FROM communications.rbac_role_metadata")
    }
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
        out.append(
            {
                **u,
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


async def create_user(actor, username, full_name, position, password, pin, role, domain) -> dict:
    await assert_can_delegate(actor, role, domain)
    if await fetch_one("SELECT 1 FROM communications.users WHERE username = :u", {"u": username}):
        raise HTTPException(409, "Tên đăng nhập đã tồn tại")
    row = await fetch_one(
        """INSERT INTO communications.users (username, full_name, position, password_hash, pin_hash, created_by)
           VALUES (:u, :f, :p, :pw, :pin, :by) RETURNING id""",
        {
            "u": username,
            "f": full_name,
            "p": position,
            "pw": hash_secret(password),
            "pin": hash_secret(pin) if pin else None,
            "by": actor["id"],
        },
    )
    await get_enforcer().add_grouping_policy(username, role, domain)
    await rbac_audit(actor, "user.create", username, role, domain, {"full_name": full_name})
    return await get_user(str(row["id"]))


async def update_user(
    actor, user_id, *, full_name=None, position=None, password=None, pin=None, is_active=None
) -> dict:
    target = await get_user(user_id)
    await assert_can_manage_user(actor, target)
    if is_active is False and target["id"] == actor["id"]:
        raise HTTPException(400, "Không tự khoá tài khoản của mình")
    await execute(
        """UPDATE communications.users SET full_name = COALESCE(CAST(:f AS text), full_name),
                  position = COALESCE(CAST(:p AS text), position),
                  password_hash = COALESCE(CAST(:pw AS text), password_hash),
                  pin_hash = COALESCE(CAST(:pin AS text), pin_hash),
                  is_active = COALESCE(CAST(:act AS boolean), is_active)
            WHERE id = CAST(:id AS uuid)""",
        {
            "f": full_name,
            "p": position,
            "pw": hash_secret(password) if password else None,
            "pin": hash_secret(pin) if pin else None,
            "act": is_active,
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
        }.items()
        if v is not None
    ]
    await rbac_audit(
        actor, "user.update", target["username"], details={"changed": changed, "is_active": is_active}
    )
    return await get_user(user_id)


async def grant(actor, user_id, role, domain) -> dict:
    target = await get_user(user_id)
    await assert_can_delegate(actor, role, domain)
    e = get_enforcer()
    if e.has_grouping_policy(target["username"], role, domain):
        raise HTTPException(409, "Tài khoản đã có vai trò này tại phạm vi này")
    await e.add_grouping_policy(target["username"], role, domain)
    await bump_token_version(target["id"])
    await rbac_audit(actor, "grant", target["username"], role, domain)
    return target


async def revoke(actor, user_id, role, domain) -> None:
    target = await get_user(user_id)
    e = get_enforcer()
    if not e.has_grouping_policy(target["username"], role, domain):
        raise HTTPException(404, "Không có phân quyền này")
    await assert_can_delegate(actor, role, domain)
    if target["id"] == actor["id"] and role == SUPER_ADMIN_ROLE:
        raise HTTPException(400, "Không tự thu hồi quyền Quản trị hệ thống của mình")
    await e.remove_grouping_policy(target["username"], role, domain)
    await bump_token_version(target["id"])
    await rbac_audit(actor, "revoke", target["username"], role, domain)
