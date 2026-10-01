"""API quản trị phân quyền: /api/v1/rbac/* — 3 vai trò cố định theo cấp, mỗi tài khoản 1 vai trò (app/rbac/management.py)."""

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.auth import current_user
from app.db import fetch_all
from app.rbac import domains
from app.rbac import management as svc
from app.rbac.authz import allowed_patterns, require_any
from app.rbac.permissions import ALL_PERMISSIONS

router = APIRouter(prefix="/rbac", tags=["Phân quyền"])


@router.get("/permissions")
async def permissions(_: dict = Depends(require_any("user", "view"))):
    return [
        {
            "code": p.code,
            "resource": p.resource.value,
            "action": p.action.value,
            "scopable": p.scopable,
            "description": p.description,
        }
        for p in ALL_PERMISSIONS
    ]


@router.get("/scopes")
async def scopes(_: dict = Depends(current_user)):
    return domains.scope_tree()


@router.get("/roles")
async def roles(_: dict = Depends(require_any("user", "view"))):
    return await svc.list_roles()


@router.get("/users")
async def users(actor: dict = Depends(require_any("user", "view"))):
    return await svc.list_users(actor)


class UserIn(BaseModel):
    username: str = Field(pattern=r"^[a-z0-9._-]{3,40}$")
    full_name: str = Field(min_length=2)
    position: str | None = None
    password: str = Field(max_length=128)
    pin: str | None = Field(None, pattern=r"^\d{4,8}$")
    email: str | None = Field(None, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    role: str
    domain: str


@router.post("/users", status_code=201)
async def create_user(body: UserIn, actor: dict = Depends(require_any("user", "manage"))):
    return await svc.create_user(
        actor,
        body.username,
        body.full_name,
        body.position,
        body.password,
        body.pin,
        body.role,
        body.domain,
        body.email,
    )


class UserPatch(BaseModel):
    full_name: str | None = None
    position: str | None = None
    password: str | None = Field(None, max_length=128)
    pin: str | None = Field(None, pattern=r"^\d{4,8}$")
    is_active: bool | None = None
    email: str | None = Field(None, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


@router.patch("/users/{user_id}")
async def update_user(user_id: str, body: UserPatch, actor: dict = Depends(require_any("user", "manage"))):
    return await svc.update_user(actor, user_id, **body.model_dump())


class AssignmentIn(BaseModel):
    role: str
    domain: str


@router.put("/users/{user_id}/assignment")
async def set_assignment(
    user_id: str, body: AssignmentIn, actor: dict = Depends(require_any("user", "manage"))
):
    """Đổi cấp / phạm vi của tài khoản cấp dưới: thay vai trò hiện có bằng đúng 1 vai trò."""
    await svc.set_assignment(actor, user_id, body.role, body.domain)
    return {"ok": True}


@router.post("/users/{user_id}/mfa/reset")
async def reset_mfa(user_id: str, actor: dict = Depends(require_any("user", "manage"))):
    """Đặt lại xác thực 2 lớp (người dùng mất điện thoại và mã khôi phục) — xác minh danh tính trước khi bấm."""
    await svc.reset_mfa(actor, user_id)
    return {"ok": True}


@router.get("/audit")
async def audit(limit: int = 200, actor: dict = Depends(require_any("user", "view"))):
    rows = await fetch_all(
        """SELECT id, time, actor_name, action, target_user, role, domain, details
             FROM communications.rbac_audit_log ORDER BY time DESC LIMIT :l""",
        {"l": limit},
    )
    pats = allowed_patterns(actor, "user", "view")
    if pats is None:
        visible = rows
    else:  # chỉ thấy thao tác trong phạm vi của mình
        visible = [r for r in rows if r["domain"] and any(domains.covers(p, r["domain"]) for p in pats)]
    for r in visible:
        r["domain_label"] = domains.label(r["domain"]) if r["domain"] else None
    return visible
