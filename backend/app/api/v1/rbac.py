"""API quản trị phân quyền: /api/v1/rbac/*"""

from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel, Field

from app.auth import current_user
from app.db import fetch_all
from app.rbac import domains
from app.rbac import management as svc
from app.rbac.authz import allowed_patterns, require_any, require_permission
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


class RoleIn(BaseModel):
    name: str
    display_name: str = Field(min_length=2)
    description: str | None = None
    is_delegatable: bool = False
    permissions: list[str]


@router.post("/roles", status_code=201)
async def create_role(body: RoleIn, actor: dict = Depends(require_permission("rbac", "manage"))):
    return await svc.create_role(
        actor, body.name, body.display_name, body.description, body.is_delegatable, body.permissions
    )


class RolePatch(BaseModel):
    display_name: str | None = None
    description: str | None = None
    is_delegatable: bool | None = None
    permissions: list[str] | None = None


@router.patch("/roles/{name}")
async def update_role(
    name: str, body: RolePatch, actor: dict = Depends(require_permission("rbac", "manage"))
):
    return await svc.update_role(
        actor, name, body.display_name, body.description, body.is_delegatable, body.permissions
    )


@router.delete("/roles/{name}", status_code=204, response_class=Response)
async def delete_role(name: str, actor: dict = Depends(require_permission("rbac", "manage"))):
    await svc.delete_role(actor, name)


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


@router.post("/users/{user_id}/assignments", status_code=201)
async def grant(user_id: str, body: AssignmentIn, actor: dict = Depends(require_any("user", "manage"))):
    await svc.grant(actor, user_id, body.role, body.domain)
    return {"ok": True}


@router.delete("/users/{user_id}/assignments", status_code=204, response_class=Response)
async def revoke(user_id: str, role: str, domain: str, actor: dict = Depends(require_any("user", "manage"))):
    await svc.revoke(actor, user_id, role, domain)


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
