"""Kiểm thử đơn vị xác thực 2 lớp (app/mfa.py): mã TOTP, chống dùng lại, mã khôi phục, phiếu đăng nhập."""

import uuid

import jwt
import pyotp
import pytest

from app import mfa, preflight
from app.config import Settings, settings

SECRET = "JBSWY3DPEHPK3PXP"
NOW = 1_790_000_000.0  # cố định thời điểm
STEP = int(NOW // 30)


def code_at(step: int) -> str:
    return pyotp.TOTP(SECRET).generate_otp(step)


def test_code_matches_current_and_adjacent_steps():
    assert mfa.match_step(SECRET, code_at(STEP), None, NOW) == STEP
    assert mfa.match_step(SECRET, code_at(STEP - 1), None, NOW) == STEP - 1  # điện thoại chậm 30 giây
    assert mfa.match_step(SECRET, code_at(STEP + 1), None, NOW) == STEP + 1
    assert mfa.match_step(SECRET, code_at(STEP - 2), None, NOW) is None
    assert mfa.match_step(SECRET, code_at(STEP + 2), None, NOW) is None


def test_code_cannot_be_reused():
    assert mfa.match_step(SECRET, code_at(STEP), STEP, NOW) is None
    assert mfa.match_step(SECRET, code_at(STEP - 1), STEP, NOW) is None  # mã cũ hơn mã đã dùng
    assert mfa.match_step(SECRET, code_at(STEP + 1), STEP, NOW) == STEP + 1


@pytest.mark.parametrize("bad", ["", "12345", "1234567", "abcdef", "12 34 5"])
def test_malformed_codes_rejected(bad):
    assert mfa.match_step(SECRET, bad, None, NOW) is None


def test_code_with_spaces_accepted():
    c = code_at(STEP)
    assert mfa.match_step(SECRET, f" {c[:3]} {c[3:]} ", None, NOW) == STEP


def test_recovery_codes_unique_and_normalized():
    codes = mfa.new_recovery_codes()
    assert len(codes) == mfa.RECOVERY_COUNT == len(set(codes))
    for c in codes:
        assert len(c) == 9 and c[4] == "-"
        assert mfa.looks_like_recovery(c)
    c = codes[0]
    assert mfa.recovery_hash(c) == mfa.recovery_hash(c.upper().replace("-", " "))
    assert mfa.recovery_hash(c) != mfa.recovery_hash(codes[1])
    assert not mfa.looks_like_recovery("123456")


def test_setup_payload_has_qr_and_uri():
    p = mfa.setup_payload(SECRET, "chihuy")
    assert p["uri"].startswith("otpauth://totp/") and "secret=" + SECRET in p["uri"]
    assert p["qr"].startswith("data:image/svg+xml")


def test_challenge_token_is_not_a_session_token():
    user = {"id": uuid.uuid4(), "token_version": 3}
    token = mfa.challenge_token(user, "verify")
    with pytest.raises(jwt.InvalidAudienceError):
        jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])  # cách app.auth.user_from_token giải mã
    payload = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"], audience=mfa.CHALLENGE_AUD)
    assert payload["stage"] == "verify" and payload["tv"] == 3


class FakeEnforcer:
    def get_filtered_grouping_policy(self, _index, username):
        return {"lanhdao": [["lanhdao", "admin_tinh", "*"]], "canbo": [["canbo", "admin_xa", "CB-X"]]}.get(
            username, []
        )


def test_required_roles(monkeypatch):
    monkeypatch.setattr(mfa, "get_enforcer", FakeEnforcer)
    monkeypatch.setattr(settings, "totp_required_roles", "")
    assert not mfa.required("lanhdao")
    monkeypatch.setattr(settings, "totp_required_roles", " super_admin, admin_tinh ")
    assert mfa.required("lanhdao")
    assert not mfa.required("canbo")
    assert not mfa.required("khong-co")


def test_preflight_warns_without_required_roles():
    s = Settings.model_construct(app_env="staging", totp_required_roles="")
    _, warnings = preflight.check(s)
    assert any("TOTP_REQUIRED_ROLES" in w for w in warnings)
