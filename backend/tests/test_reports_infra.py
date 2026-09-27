"""Kiểm thử đơn vị: xử lý ảnh phản ánh, luật giới hạn tần suất, chính sách mật khẩu, cache, link ảnh có chữ ký."""

import asyncio
import io
import time

import pytest
from PIL import Image

from app.auth import password_problem
from app.infra import cache
from app.infra.ratelimit import match_rule
from app.services import reports
from app.services.reports import ReportError, process_image


def _jpeg_with_exif(w=3000, h=2000) -> bytes:
    img = Image.new("RGB", (w, h), (30, 120, 200))
    exif = Image.Exif()
    exif[0x010F] = "Hang dien thoai"  # Make
    exif[0x0110] = "Model bi mat"  # Model
    buf = io.BytesIO()
    img.save(buf, "JPEG", exif=exif.tobytes())
    return buf.getvalue()


def test_process_image_resizes_and_strips_exif():
    raw = _jpeg_with_exif()
    assert b"Model bi mat" in raw
    full, thumb, w, h = process_image(raw)
    assert (w, h) == (1600, 1067)
    assert b"Exif" not in full and b"Model bi mat" not in full
    t = Image.open(io.BytesIO(thumb))
    assert max(t.size) == 400 and t.format == "JPEG"


def test_process_image_rejects_non_image_and_oversize():
    with pytest.raises(ReportError):
        process_image(b"<?php system($_GET['c']); ?>")
    with pytest.raises(ReportError):
        process_image(b"\xff\xd8" + b"0" * (reports.MAX_BYTES + 10))


def test_process_image_rejects_decompression_bomb():
    buf = io.BytesIO()
    Image.new("1", (9000, 9000)).save(buf, "PNG")  # 81 MP nhưng tệp rất nhỏ
    assert len(buf.getvalue()) < 2_000_000
    with pytest.raises(ReportError):
        process_image(buf.getvalue())


def test_process_image_rejects_gif():
    buf = io.BytesIO()
    Image.new("RGB", (10, 10)).save(buf, "GIF")
    with pytest.raises(ReportError):
        process_image(buf.getvalue())


def test_signed_photo_url_roundtrip():
    url = reports.signed_photo_url("abc", 0, thumb=True)
    params = dict(p.split("=") for p in url.split("?")[1].split("&"))
    assert reports.verify_photo_signature("abc", 0, True, int(params["exp"]), params["sig"])
    assert not reports.verify_photo_signature("abc", 1, True, int(params["exp"]), params["sig"])
    assert not reports.verify_photo_signature("abc", 0, True, int(time.time()) - 1, params["sig"])


def test_rate_limit_rule_matching():
    assert match_rule("POST", "/api/v1/auth/login").name == "login"
    assert match_rule("GET", "/api/v1/public/locate").name == "public_locate"
    assert match_rule("POST", "/api/v1/public/reports").name == "public_report"
    assert match_rule("GET", "/api/v1/public/map").name == "public"
    assert match_rule("POST", "/api/v1/public/track").name == "public_track"
    assert match_rule("GET", "/api/v1/sos").name == "api"
    assert match_rule("GET", "/health") is None


def test_password_policy():
    assert password_problem("abc123") is not None  # ngắn
    assert password_problem("12345678") is not None  # thiếu chữ
    assert password_problem("abcdefgh") is not None  # thiếu số
    assert password_problem("MatKhau2026") is None


def test_memory_cache_hits_and_invalidates(monkeypatch):
    # luôn kiểm bộ nhớ trong, không đụng Redis đang chạy
    monkeypatch.setattr(cache, "get_redis", lambda: None)
    calls = {"n": 0}

    async def producer():
        calls["n"] += 1
        return {"v": calls["n"]}

    async def run():
        a = await cache.cached("public:test", 60, producer)
        b = await cache.cached("public:test", 60, producer)
        await cache.invalidate("public:")
        c = await cache.cached("public:test", 60, producer)
        return a, b, c

    a, b, c = asyncio.run(run())
    assert a == b == {"v": 1} and c == {"v": 2}


def test_track_code_and_phone_matching():
    from app.services.tracking import normalize_code, phone_matches

    assert normalize_code("pa 1017") == "PA-1017"
    assert normalize_code("SOS1021") == "SOS-1021"
    assert normalize_code("SOS") is None  # không cho tìm gần đúng / liệt kê
    assert normalize_code("100") is None
    assert normalize_code("0999555666") is None
    assert phone_matches("0999 555 666", "+84999555666")
    assert not phone_matches("0999555666", "555666")  # đuôi ngắn không đủ
    assert not phone_matches(None, "0999555666")
