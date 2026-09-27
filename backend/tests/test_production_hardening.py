"""Kiểm thử đơn vị: kiểm tra cấu hình production, xác định IP sau proxy, giới hạn theo SĐT / phiên,
khoá cổng tiếp nhận SOS, che SĐT trước khi gửi LLM."""

import asyncio
import uuid

import pytest
from fastapi import HTTPException
from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware

from app import preflight
from app.api.v1 import sos
from app.api.v1.public import phone_key
from app.config import PRIVATE_NETWORKS, Settings, settings
from app.infra import ratelimit
from app.infra.ratelimit import match_rule
from app.services.sos_nlp import redact_for_llm

STRONG = {
    "jwt_secret": "a" * 20 + "9f8e7d6c5b4a39281706f5e4d3c2b1a0",
    "secret_key": "b" * 20 + "0a1b2c3d4e5f60718293a4b5c6d7e8f9",
    "database_url": "postgresql+psycopg://pctt:Str0ng-Db-Pass-2026@db:5432/caobang_pctt",
    "superadmin_password": "QuanTri-CaoBang-2026",
    "superadmin_pin": "480193",
    "public_base_url": "https://pctt.caobang.gov.vn",
    "cors_origins": "https://pctt.caobang.gov.vn",
    "smtp_host": "smtp.caobang.gov.vn",
    "turnstile_site_key": "0x4AAA-site",
    "turnstile_secret": "0x4AAA-secret",
}


def make(**kw) -> Settings:
    """Settings từ giá trị mặc định + tham số, KHÔNG đọc biến môi trường/.env (kiểm thử chạy được cả trong container)."""
    return Settings.model_construct(**kw)


def test_preflight_skips_development():
    assert preflight.check(make()) == ([], [])


def test_preflight_rejects_dev_defaults_in_production():
    errors, _ = preflight.check(make(app_env="production"))
    text = "\n".join(errors)
    for name in (
        "JWT_SECRET",
        "SECRET_KEY",
        "DATABASE_URL",
        "SUPERADMIN_PASSWORD",
        "SUPERADMIN_PIN",
        "PUBLIC_BASE_URL",
    ):
        assert name in text, name


def test_preflight_accepts_hardened_production():
    errors, warnings = preflight.check(make(app_env="production", **STRONG))
    assert errors == []
    assert warnings == []


@pytest.mark.parametrize(
    ("override", "needle"),
    [
        ({"demo_mode": True}, "DEMO_MODE"),
        ({"simulator": True}, "SIMULATOR"),
        ({"rate_limit_enabled": False}, "RATE_LIMIT_ENABLED"),
        ({"trusted_proxies": "*"}, "TRUSTED_PROXIES"),
        ({"turnstile_site_key": ""}, "TURNSTILE"),
        ({"secret_key": STRONG["jwt_secret"]}, "SECRET_KEY phải khác"),
        ({"intake_api_key": "ngan"}, "INTAKE_API_KEY"),
        ({"minio_endpoint": "minio:9000", "minio_secret_key": "pctt_minio_dev_password"}, "MINIO"),
    ],
)
def test_preflight_production_errors(override, needle):
    errors, _ = preflight.check(make(app_env="production", **{**STRONG, **override}))
    assert any(needle in e for e in errors), errors


def test_preflight_staging_allows_demo_with_warning():
    errors, warnings = preflight.check(make(app_env="staging", demo_mode=True, simulator=True, **STRONG))
    assert errors == []
    assert any("DEMO_MODE" in w for w in warnings)


def test_preflight_unknown_env_and_enforce_raises():
    assert preflight.check(make(app_env="prod"))[0]
    with pytest.raises(RuntimeError, match="JWT_SECRET"):
        preflight.enforce(make(app_env="production"))


def test_weak_pin():
    for pin in ("0000", "1234", "123456", "654321", "111111", "12a456"):
        assert preflight.weak_pin(pin), pin
    for pin in ("480193", "13579024"):
        assert not preflight.weak_pin(pin), pin


def _proxied_client(peer: str, xff: str | None) -> str:
    """Chạy ProxyHeadersMiddleware với cấu hình mặc định của app, trả về IP mà ứng dụng nhìn thấy."""
    seen = {}

    async def app(scope, receive, send):
        seen["client"] = scope["client"][0]

    headers = [(b"x-forwarded-for", xff.encode())] if xff else []
    scope = {"type": "http", "client": (peer, 5000), "headers": headers, "scheme": "http"}
    asyncio.run(ProxyHeadersMiddleware(app, trusted_hosts=PRIVATE_NETWORKS)(scope, None, None))
    return seen["client"]


def test_client_ip_behind_trusted_proxy():
    # nginx (mạng docker) ghi đè X-Forwarded-For bằng IP thật → lấy IP đó
    assert _proxied_client("172.18.0.5", "203.0.113.9") == "203.0.113.9"
    # nginx nối thêm (cấu hình cũ): IP giả do client tự gửi nằm bên trái → bị bỏ qua
    assert _proxied_client("172.18.0.5", "1.2.3.4, 203.0.113.9") == "203.0.113.9"
    # Kết nối thẳng từ Internet kèm header giả → không tin
    assert _proxied_client("203.0.113.50", "1.2.3.4") == "203.0.113.50"


def test_rate_limit_rules_for_citizens_and_sessions():
    assert match_rule("POST", "/api/v1/public/reports").limit >= 30  # CGNAT: nhiều người chung 1 IP
    assert match_rule("POST", "/api/v1/sos/intake").name == "intake"
    assert match_rule("GET", "/api/v1/sos").per_session
    assert not match_rule("POST", "/api/v1/auth/login").per_session


def test_keyed_limit_counts_only_successes(monkeypatch):
    monkeypatch.setattr(settings, "rate_limit_enabled", True)
    key = uuid.uuid4().hex

    async def run():
        for _ in range(10):  # kiểm tra nhiều lần mà không thành công → không mất lượt
            await ratelimit.check_limit("test_phone", key, 5, 3600)
        for _ in range(5):
            await ratelimit.check_limit("test_phone", key, 5, 3600)
            await ratelimit.count_hit("test_phone", key, 3600)
        with pytest.raises(HTTPException) as exc:
            await ratelimit.check_limit("test_phone", key, 5, 3600)
        assert exc.value.status_code == 429
        assert "Retry-After" in exc.value.headers

    asyncio.run(run())


def test_keyed_limit_respects_rate_limit_switch(monkeypatch):
    monkeypatch.setattr(settings, "rate_limit_enabled", False)
    key = uuid.uuid4().hex

    async def run():
        for _ in range(10):
            await ratelimit.count_hit("test_phone", key, 3600)
            await ratelimit.check_limit("test_phone", key, 5, 3600)  # tắt giới hạn → không bao giờ 429

    asyncio.run(run())


def test_phone_key_normalizes():
    assert (
        phone_key("0912 345 678") == phone_key("+84 912-345-678") == phone_key("84912345678") == "0912345678"
    )


def test_intake_requires_key(monkeypatch):
    monkeypatch.setattr(settings, "intake_api_key", "")
    with pytest.raises(HTTPException) as exc:
        sos.require_intake_key("bat-ky")
    assert exc.value.status_code == 503
    monkeypatch.setattr(settings, "intake_api_key", "k" * 40)
    with pytest.raises(HTTPException) as exc:
        sos.require_intake_key("sai")
    assert exc.value.status_code == 401
    with pytest.raises(HTTPException):
        sos.require_intake_key(None)
    sos.require_intake_key("k" * 40)


def test_redact_for_llm():
    msg = "Nhà tôi ở xóm Nà Rì bị ngập, 3 người già mắc kẹt, gọi 0912 345 678 hoặc +84 987.654.321, CCCD 001203004567"
    out = redact_for_llm(msg)
    assert "345" not in out and "654" not in out and "004567" not in out
    assert out.count("[SỐ]") == 3
    assert "3 người già" in out and "Nà Rì" in out
    kept = "Mưa 150mm, toạ độ 22.666, 106.258 hoặc 22.123456, 106.123456, lúc 14:30 ngày 26/09/2026, 12 hộ"
    assert redact_for_llm(kept) == kept


def test_access_log_drops_query_string():
    import logging

    from app.main import DropQueryString

    http = logging.LogRecord(
        "uvicorn.access",
        logging.INFO,
        "",
        0,
        '%s - "%s %s HTTP/%s" %d',
        ("203.0.113.9:0", "GET", "/api/v1/public/locate?lat=22.6&lon=106.2", "1.1", 200),
        None,
    )
    ws = logging.LogRecord(
        "uvicorn.error",
        logging.INFO,
        "",
        0,
        '%s - "WebSocket %s" [accepted]',
        (("203.0.113.9", 0), "/ws?token=eyJhbGciOi.secret"),
        None,
    )
    for rec in (http, ws):
        assert DropQueryString().filter(rec)
        msg = rec.getMessage()
        assert "token" not in msg and "lat=" not in msg, msg
    assert "/ws" in ws.getMessage() and "/api/v1/public/locate" in http.getMessage()


def test_turnstile_fails_open_only_on_outage(monkeypatch):
    import httpx

    from app.services import reports

    monkeypatch.setattr(settings, "turnstile_secret", "bi-mat")
    real_client = httpx.AsyncClient

    def cloudflare(handler):
        monkeypatch.setattr(
            reports.httpx,
            "AsyncClient",
            lambda **kw: real_client(transport=httpx.MockTransport(handler), **kw),
        )
        return asyncio.run(reports.verify_turnstile("token", "203.0.113.9"))

    def down(request):
        raise httpx.ConnectError("mất kết nối quốc tế")

    assert cloudflare(down) is True  # mất kết nối lúc thiên tai → cho người dân gửi
    assert cloudflare(lambda r: httpx.Response(503)) is True  # Cloudflare sự cố
    assert cloudflare(lambda r: httpx.Response(429)) is False  # bị giới hạn khi bị tấn công → không cho qua
    assert cloudflare(lambda r: httpx.Response(200, json={"success": False})) is False
    assert cloudflare(lambda r: httpx.Response(200, json={"success": True})) is True
    assert asyncio.run(reports.verify_turnstile(None, None)) is False  # thiếu token
