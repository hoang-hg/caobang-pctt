"""Rà soát luồng vận hành lần 3 (10/2026) — phần không cần CSDL: phiên tự gia hạn có giới hạn kể từ lúc đăng nhập, bắt đổi
mật khẩu do cấp trên đặt, giờ "Chờ điều động" của phiếu SOS tính vào quá hạn."""

from datetime import UTC, datetime, timedelta

import jwt
import pytest
from fastapi import HTTPException

from app.auth import create_token, current_user, session_user, token_expiry
from app.config import settings
from app.main import app
from app.services.sos import OVERDUE_SQL, SLA_MINUTES

NOW = datetime(2026, 10, 3, 9, 0, tzinfo=UTC)
USER = {"id": "6f1c2a8e-0000-4000-8000-000000000001", "full_name": "Nông Văn Trực", "token_version": 4}


def _claims(token: str) -> dict:
    return jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])


def test_each_token_lives_jwt_expire_hours_but_never_past_session_cap():
    just_now = int(NOW.timestamp())
    assert token_expiry(just_now, NOW) == NOW + timedelta(hours=settings.jwt_expire_hours)
    # Đăng nhập 70 giờ trước (trực ban xuyên ca): gia hạn chỉ tới mốc 72 giờ — còn 2 giờ, không thêm 12 giờ
    long_ago = int((NOW - timedelta(hours=settings.session_max_hours - 2)).timestamp())
    assert token_expiry(long_ago, NOW) == NOW + timedelta(hours=2)


def test_renewed_token_keeps_login_time():
    first = _claims(create_token(USER))
    assert abs(first["exp"] - first["auth_time"] - settings.jwt_expire_hours * 3600) <= 1
    login = first["auth_time"] - 3600
    renewed = _claims(create_token(USER, login))
    assert renewed["auth_time"] == login and renewed["tv"] == USER["token_version"]
    assert renewed["sub"] == USER["id"]


async def test_must_change_password_blocks_with_header_for_the_ui():
    with pytest.raises(HTTPException) as e:
        await current_user({"must_change_password": True})
    assert e.value.status_code == 403 and e.value.headers == {"X-Must-Change-Password": "1"}
    ok = {"must_change_password": False}
    assert await current_user(ok) is ok


def test_only_account_endpoints_accept_users_who_must_change_password():
    # Mọi API khác đi qua current_user (chặn khi chưa đổi mật khẩu); chỉ 3 API này dùng thẳng session_user
    direct = sorted(
        r.path.removeprefix("/api/v1")
        for r in app.routes
        if getattr(r, "dependant", None) and any(d.call is session_user for d in r.dependant.dependencies)
    )
    assert direct == ["/auth/change-password", "/auth/me", "/auth/refresh"]


def test_dispatch_wait_counts_toward_overdue():
    # "Đang điều phối" mà chưa có đội đang đi / ở hiện trường: quá SLA kể từ lúc chuyển cột → quá hạn như "Chờ xử lý"
    assert "t.status = 'dieu_phoi' AND t.status_changed_at <" in OVERDUE_SQL
    assert "NOT EXISTS" in OVERDUE_SQL and "o.status IN ('dang_di', 'da_den')" in OVERDUE_SQL
    for p, m in SLA_MINUTES.items():
        assert OVERDUE_SQL.count(f"WHEN {p} THEN {m}") == 2
