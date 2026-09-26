from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app import seed_data as D
from app.auth import create_token, current_user, verify_secret
from app.config import settings
from app.db import fetch_all, fetch_one
from app.rbac import domains
from app.rbac.authz import groupings, user_permissions

router = APIRouter(prefix="/auth", tags=["Xác thực"])


class LoginIn(BaseModel):
    username: str
    password: str


async def role_names() -> dict[str, str]:
    rows = await fetch_all("SELECT name, display_name FROM communications.rbac_role_metadata")
    return {m["name"]: m["display_name"] for m in rows}


async def profile(user: dict) -> dict:
    meta = await role_names()
    return {
        "id": user["id"],
        "username": user["username"],
        "full_name": user["full_name"],
        "position": user["position"],
        "has_pin": bool(user["pin_hash"]),
        "assignments": [
            {"role": r, "role_name": meta.get(r, r), "domain": d, "domain_label": domains.label(d)}
            for r, d in groupings(user["username"])
        ],
        "permissions": user_permissions(user["username"]),
    }


@router.post("/login")
async def login(body: LoginIn):
    user = await fetch_one("SELECT * FROM communications.users WHERE username = :u", {"u": body.username})
    if not user or not verify_secret(body.password, user["password_hash"]):
        raise HTTPException(401, "Sai tên đăng nhập hoặc mật khẩu")
    if not user["is_active"]:
        raise HTTPException(403, "Tài khoản đã bị khoá")
    return {"token": create_token(user), "user": await profile(user)}


@router.get("/me")
async def me(user: dict = Depends(current_user)):
    return await profile(user)


@router.get("/demo-accounts")
async def demo_accounts():
    """Tài khoản demo cho nút đăng nhập nhanh (chỉ khi DEMO_MODE=true)."""
    if not settings.demo_mode:
        raise HTTPException(404, "Không khả dụng")
    meta = await role_names()
    return [
        {
            "username": u[0],
            "full_name": u[1],
            "position": u[2],
            "password": u[3],
            "pin": u[4],
            "role": u[5],
            "role_name": meta.get(u[5], u[5]),
            "domain_label": domains.label(u[6]),
        }
        for u in D.USERS
    ]
