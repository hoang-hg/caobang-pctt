"""Phiên người dân tách hẳn phiên cán bộ (Đ5 — docs/ke-hoach-lam-moi-giao-dien.md mục 11).

Token người dân (``aud = "citizen"``) không qua được chỗ đọc token cán bộ (``app.auth.user_from_token`` — không khai
audience) và token cán bộ không qua được chỗ đọc token người dân; đường dẫn đặt lại mật khẩu không dùng làm phiên được.
"""

import jwt
import pytest

from app.auth import create_token
from app.citizen_auth import RESET_AUD, create_citizen_token, create_reset_token, decode_citizen_token
from app.config import settings

CITIZEN = {"id": "4fd84111-f99f-4260-98bd-de07f87fcddf", "token_version": 3}
STAFF = {"id": "0b6c7a9e-6a5f-4c1e-9d8e-2f1a3b4c5d6e", "full_name": "Cán bộ thử", "token_version": 0}


def test_token_nguoi_dan_khong_qua_cho_doc_token_can_bo():
    token = create_citizen_token(CITIZEN)
    # app.auth.user_from_token đọc token cán bộ đúng như sau (không khai audience)
    with pytest.raises(jwt.InvalidAudienceError):
        jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])


def test_token_can_bo_khong_qua_cho_doc_token_nguoi_dan():
    assert decode_citizen_token(create_token(STAFF)) is None


def test_token_nguoi_dan_mang_dung_tai_khoan_va_phien_ban():
    payload = decode_citizen_token(create_citizen_token(CITIZEN))
    assert payload["sub"] == CITIZEN["id"] and payload["tv"] == CITIZEN["token_version"]


def test_duong_dan_dat_lai_mat_khau_khong_dung_lam_phien():
    reset = create_reset_token(CITIZEN)
    assert decode_citizen_token(reset) is None
    assert decode_citizen_token(reset, RESET_AUD)["sub"] == CITIZEN["id"]
    assert decode_citizen_token(create_citizen_token(CITIZEN), RESET_AUD) is None
