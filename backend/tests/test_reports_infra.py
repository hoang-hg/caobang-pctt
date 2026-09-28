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
    # số lưu ngắn (máy bàn không mã vùng) → so toàn bộ; trước đây không bao giờ khớp → người gửi không tra được
    assert phone_matches("3852 123", "3852123")
    assert not phone_matches("3852123", "3852124")
    assert not phone_matches("12345", "12345")  # quá ngắn để làm bằng chứng


def test_ws_events_reach_only_clients_with_permission():
    from app.ws.hub import EVENT_SCOPE, Client

    province = Client(None, "chihuy", {"sos": None, "hotline": None, "monitoring": None})
    commune = Client(None, "coba", {"sos": {"CB-COBA"}, "hotline": set(), "monitoring": {"CB-COBA"}})
    storekeeper = Client(
        None, "thukho", {"sos": set(), "hotline": set(), "resource": None, "monitoring": set()}
    )
    # Sự kiện của xã → chỉ phạm vi chứa xã đó
    assert province.sees("sos", "CB-COBA") and commune.sees("sos", "CB-COBA")
    assert not commune.sees("sos", "CB-THUCPHAN") and not storekeeper.sees("sos", "CB-COBA")
    # Không gắn xã (VD SĐT người gọi đường dây nóng, nhật ký hệ thống) → cần có quyền nhóm đó; trước đây gửi cho TẤT CẢ
    assert EVENT_SCOPE["call.new"] == "hotline"
    assert province.sees("hotline", None)
    assert not commune.sees("hotline", None) and not storekeeper.sees("hotline", None)
    assert commune.sees("monitoring", None) and not storekeeper.sees("monitoring", None)
    assert storekeeper.sees(None, None)  # sự kiện chung (data.imported)


async def test_hub_listeners_run_without_clients_and_errors_do_not_block():
    import json

    from app.ws.hub import Hub

    hub = Hub()
    seen = []

    async def boom(data):
        raise RuntimeError("lỗi xử lý")

    async def record(data):
        seen.append(data["dataset"])

    hub.on("data.imported", boom)
    hub.on("data.imported", record)
    envelope = json.dumps(
        {"event": "data.imported", "data": {"dataset": "ranh_gioi_xa"}, "ts": "", "scope": None}
    )
    await hub._deliver(envelope)  # tiến trình không có kết nối WebSocket nào vẫn phải xử lý
    assert seen == ["ranh_gioi_xa"]


async def test_units_reload_only_after_boundary_import(monkeypatch):
    from app import lifecycle
    from app.rbac import domains

    calls = []

    async def fake_load(force=False):
        calls.append(force)

    monkeypatch.setattr(domains, "load_units", fake_load)
    await lifecycle._reload_units_after_import({"dataset": "xom"})
    await lifecycle._reload_units_after_import({"dataset": "ranh_gioi_xa"})
    assert calls == [True]


async def test_rejected_ingest_logging_is_capped(monkeypatch):
    from app.api.v1 import ingest as ingest_api
    from app.infra import ratelimit

    monkeypatch.setattr(ratelimit, "get_redis", lambda: None)
    monkeypatch.setattr(ratelimit, "_memory", {})
    written = []

    async def fake_log(source, message, accepted=0, rejected=0, level="info"):
        written.append(source)

    monkeypatch.setattr(ingest_api, "ingest_log", fake_log)
    for i in range(ingest_api.REJECTED_LOG_PER_MIN + 20):
        await ingest_api._log_rejected("IOT_HTTP", f"Thiết bị chưa đăng ký: rac-{i}")
    assert len(written) == ingest_api.REJECTED_LOG_PER_MIN


def test_process_image_accepts_png_webp_and_iphone_mpo():
    # Image.open(formats=JPEG/PNG/WebP): ảnh nhiều khung của iPhone (MPO) do bộ đọc JPEG mở → vẫn phải nhận
    second = Image.new("RGB", (40, 30), (1, 2, 3))
    for fmt, extra in (("PNG", {}), ("WEBP", {}), ("MPO", {"save_all": True, "append_images": [second]})):
        buf = io.BytesIO()
        Image.new("RGB", (40, 30), (200, 10, 10)).save(buf, fmt, **extra)
        full, _thumb, w, h = process_image(buf.getvalue())
        assert (w, h) == (40, 30) and full[:2] == b"\xff\xd8", fmt
