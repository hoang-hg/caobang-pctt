from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app import seed_data as D
from app.auth import create_token, current_user, verify_secret
from app.config import settings
from app.db import fetch_one

router = APIRouter(prefix="/auth", tags=["Xác thực"])


class LoginIn(BaseModel):
    username: str
    password: str


def public_user(u: dict) -> dict:
    return {k: u[k] for k in ("id", "username", "full_name", "position", "role")}


@router.post("/login")
async def login(body: LoginIn):
    user = await fetch_one("SELECT * FROM communications.users WHERE username = :u", {"u": body.username})
    if not user or not verify_secret(body.password, user["password_hash"]):
        raise HTTPException(401, "Sai tên đăng nhập hoặc mật khẩu")
    return {"token": create_token(user), "user": public_user(user)}


@router.get("/me")
async def me(user: dict = Depends(current_user)):
    return public_user(user)


@router.get("/demo-accounts")
async def demo_accounts():
    """Tài khoản demo (chỉ khi DEMO_MODE=true)."""
    if not settings.demo_mode:
        raise HTTPException(404, "Không khả dụng")
    return [
        {"username": u[0], "full_name": u[1], "position": u[2], "role": u[3], "password": u[4], "pin": u[5]}
        for u in D.USERS
    ]
