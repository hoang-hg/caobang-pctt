"""Lớp phân quyền dùng trong route — KHÔNG import enforcer trực tiếp ở router.

* ``require_permission(obj, act, scope_loader?)`` — kiểm tra một hành động trên một tài nguyên cụ thể.
  scope_loader trả về domain của tài nguyên (xã chứa phiếu SOS, kho…); không truyền = kiểm tra toàn tỉnh.
* ``area_scope(obj, act)`` — dependency cho endpoint danh sách: giao giữa vùng người dùng đang lọc
  (``admin_codes``) và phạm vi được cấp quyền → danh sách mã xã dùng với ``area_clause``/``unit_clause``.
* ``allowed_patterns(user, obj, act)`` — ``None`` = không giới hạn; ``[]`` = không có quyền; còn lại = các mẫu domain.
"""

from __future__ import annotations

import logging
from collections.abc import Awaitable, Callable

from fastapi import Depends, HTTPException

from app.area import parse_codes
from app.auth import current_user
from app.rbac import domains
from app.rbac.enforcer import get_enforcer
from app.rbac.permissions import GLOBAL_SCOPE, SUPER_ADMIN_ROLE

log = logging.getLogger(__name__)

ScopeLoader = Callable[..., Awaitable[str | None]]
NO_MATCH = ["__khong_co_quyen__"]  # mã xã không tồn tại → truy vấn không trả dòng nào


def forbidden() -> HTTPException:
    return HTTPException(403, "Bạn không có quyền thực hiện thao tác này trong phạm vi này")


def can(user: dict, obj: str, act: str, domain: str = GLOBAL_SCOPE) -> bool:
    return bool(get_enforcer().enforce(user["username"], domain, obj, act))


def can_all(user: dict, obj: str, act: str, domain_list: list[str]) -> bool:
    return bool(domain_list) and all(can(user, obj, act, d) for d in domain_list)


def _role_grants(role: str, obj: str, act: str) -> bool:
    for p in get_enforcer().get_filtered_policy(0, role):
        if len(p) >= 4 and p[2] in ("*", obj) and p[3] in ("*", act):
            return True
    return False


def groupings(username: str) -> list[tuple[str, str]]:
    """[(role, domain)] của người dùng."""
    return [(g[1], g[2]) for g in get_enforcer().get_filtered_grouping_policy(0, username) if len(g) >= 3]


def allowed_patterns(user: dict, obj: str, act: str) -> list[str] | None:
    out: set[str] = set()
    for role, dom in groupings(user["username"]):
        if role == SUPER_ADMIN_ROLE and dom == GLOBAL_SCOPE:
            return None
        if _role_grants(role, obj, act):
            if dom == GLOBAL_SCOPE:
                return None
            out.add(dom)
    return sorted(out)


def allowed_codes(user: dict, obj: str, act: str) -> list[str] | None:
    pats = allowed_patterns(user, obj, act)
    return None if pats is None else domains.codes_for_patterns(pats)


def require_permission(obj: str, act: str, scope_loader: ScopeLoader | None = None):
    if scope_loader is None:

        async def _global(user: dict = Depends(current_user)) -> dict:
            if not can(user, obj, act):
                log.info("[authz] deny %s %s.%s @*", user["username"], obj, act)
                raise forbidden()
            return user

        return _global

    async def _scoped(user: dict = Depends(current_user), domain: str | None = Depends(scope_loader)) -> dict:
        if domain is None:
            raise HTTPException(404, "Không tìm thấy tài nguyên")
        if not can(user, obj, act, domain):
            log.info("[authz] deny %s %s.%s @%s", user["username"], obj, act, domain)
            raise forbidden()
        return user

    return _scoped


def require_any(obj: str, act: str):
    """Có quyền (obj, act) ở ít nhất một phạm vi — dùng cho trang/điều hướng."""

    async def _any(user: dict = Depends(current_user)) -> dict:
        if allowed_patterns(user, obj, act) == []:
            raise forbidden()
        return user

    return _any


def usernames_with(obj: str, act: str, domain: str = GLOBAL_SCOPE) -> set[str]:
    """Tài khoản được cấp (obj, act) đúng tại phạm vi ``domain`` (mặc định toàn tỉnh) — VD người nhận email báo có hồ
    sơ chờ duyệt."""
    out = set()
    for g in get_enforcer().get_grouping_policy():
        if len(g) >= 3 and g[2] == domain and (g[1] == SUPER_ADMIN_ROLE or _role_grants(g[1], obj, act)):
            out.add(g[0])
    return out


def restrict_codes(requested: list[str], allowed: list[str] | None) -> list[str]:
    """Giao vùng đang lọc với phạm vi được phép. [] = toàn tỉnh (không lọc)."""
    if allowed is None:
        return requested
    if not requested:
        return allowed or NO_MATCH
    inter = [c for c in requested if c in set(allowed)]
    return inter or NO_MATCH


def area_scope(obj: str, act: str):
    async def _dep(
        requested: list[str] = Depends(parse_codes), user: dict = Depends(current_user)
    ) -> list[str]:
        allowed = allowed_codes(user, obj, act)
        if allowed == []:
            raise forbidden()
        return restrict_codes(requested, allowed)

    return _dep


def user_permissions(username: str) -> list[dict]:
    """Mọi bộ (obj, act, dom) người dùng có — trả về cho frontend (/auth/me)."""
    seen: set[tuple[str, str, str]] = set()
    out: list[dict] = []
    for role, dom in groupings(username):
        for p in get_enforcer().get_filtered_policy(0, role):
            if len(p) < 4:
                continue
            key = (p[2], p[3], dom)
            if key not in seen:
                seen.add(key)
                out.append({"obj": p[2], "act": p[3], "dom": dom})
    return out
