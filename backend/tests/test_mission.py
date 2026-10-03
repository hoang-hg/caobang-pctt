"""Kiểm thử link nhiệm vụ cho trưởng nhóm hiện trường (app/services/mission.py, app/api/v1/mission.py) — phần không
cần CSDL."""

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.api.v1 import mission as mission_api
from app.config import settings
from app.infra.ratelimit import match_rule
from app.main import app
from app.services import mission
from app.services.mission import MissionReportIn, report_problem

TICKET = {
    "code": "SOS-1001",
    "address": "Xóm Nà Pồng",
    "admin_name": "Xã Cô Ba",
    "lat": 22.81234,
    "lon": 105.98765,
}


def test_token_is_random_hashed_and_sent_after_fragment(monkeypatch):
    monkeypatch.setattr(settings, "public_base_url", "https://pctt.example.vn/")
    token, digest = mission.new_token()
    other, _ = mission.new_token()
    assert token != other and len(token) >= 32 and mission.valid_format(token)
    assert digest == mission.hash_token(token) and token not in digest and len(digest) == 64
    # Mã sau dấu # → trình duyệt không gửi lên máy chủ (không vào log nginx / backend)
    assert mission.mission_url(token) == f"https://pctt.example.vn/nhiem-vu#{token}"
    msg = mission.order_message(TICKET, mission.mission_url(token), 18)
    assert msg.startswith("[LỆNH KHẨN] SOS-1001: Xóm Nà Pồng – toạ độ 22.81234,105.98765. ETA 18 phút.")
    assert msg.endswith(f"/nhiem-vu#{token}")
    assert "ETA" not in mission.order_message(TICKET, "u")  # cấp lại link: không còn ETA lúc phát lệnh


def test_token_format_rejects_garbage_before_touching_db():
    for bad in (
        None,
        "",
        "ngan",
        "a" * 101,
        "mã-có-dấu-tiếng-việt-dài-dài",
        "abc def ghi jkl mno pqr",
        "x/../../etc/passwd/xx",
    ):
        assert not mission.valid_format(bad)


def test_report_rules():
    assert report_problem(MissionReportIn(kind="arrived")) is None
    assert "chi viện gì" in report_problem(MissionReportIn(kind="need_support", note="  "))
    assert (
        report_problem(MissionReportIn(kind="need_support", note="Thêm 1 xuồng, có người gãy chân")) is None
    )
    assert "số người" in report_problem(MissionReportIn(kind="rescued"))
    assert report_problem(MissionReportIn(kind="rescued", people_safe=0, note="Dân đã tự sơ tán")) is None
    assert "chỉ ghi khi báo đã cứu" in report_problem(MissionReportIn(kind="arrived", people_safe=3))
    with pytest.raises(ValidationError):
        MissionReportIn(kind="resolved")  # đội KHÔNG đóng được phiếu — chỉ trực ban xác nhận hoàn thành
    with pytest.raises(ValidationError):
        MissionReportIn(kind="rescued", people_safe=-1)
    with pytest.raises(ValidationError):
        MissionReportIn(kind="need_support", note="x" * 501)


def test_report_log_flags_people_left_and_support():
    msg, level = mission.report_log("rescued", "SOS-1001", "Đội cứu hộ Bảo Lạc", None, 3, 5)
    assert "3/5 người" in msg and "CÒN 2 NGƯỜI CHƯA RÕ" in msg and "chờ trực ban xác nhận" in msg
    assert level == "warning"
    assert mission.report_log("rescued", "SOS-1001", "Đội", None, 5, 5)[1] == "info"
    msg, level = mission.report_log("need_support", "SOS-1001", "Đội", "Cần cáng", None, 5)
    assert "CẦN CHI VIỆN: Cần cáng" in msg and level == "danger"


def test_mission_api_is_outside_cached_public_prefix_and_rate_limited():
    paths = {r.path for r in app.routes}
    assert {"/api/v1/mission", "/api/v1/mission/report", "/api/v1/dispatch/{order_id}/mission-link"} <= paths
    # nginx cache /api/v1/public/ theo URI (không theo header) → nhiệm vụ đội này sẽ trả cho đội khác
    assert not any(p.startswith("/api/v1/public") and "mission" in p for p in paths)
    rule = match_rule("POST", "/api/v1/mission/report")
    assert rule.name == "mission" and not rule.per_session
    assert (
        match_rule("POST", "/api/v1/dispatch/abc/mission-link").name == "api"
    )  # trực ban: theo phiên đăng nhập


def _order(**kw):
    return {"id": "o1", "ticket_id": "t1", "status": "dang_di", "live": True, **kw}


async def test_load_order_states(monkeypatch):
    async def never(*a, **kw):
        raise AssertionError("mã sai định dạng không được truy vấn CSDL")

    monkeypatch.setattr(mission_api, "fetch_one", never)
    with pytest.raises(HTTPException) as e:
        await mission_api.load_order("ngan")
    assert e.value.status_code == 404

    token, digest = mission.new_token()
    seen = {}

    def returning(row):
        async def fetch(sql, params, conn=None):
            seen["hash"] = params["h"]
            return row

        return fetch

    monkeypatch.setattr(mission_api, "fetch_one", returning(None))
    with pytest.raises(HTTPException) as e:
        await mission_api.load_order(token)
    assert e.value.status_code == 404 and seen["hash"] == digest  # tra theo SHA-256, không theo mã

    for row, detail in (
        (_order(status="hoan_thanh"), mission.FINISHED),
        (_order(status="huy"), mission.CANCELLED),
        (_order(live=False), mission.EXPIRED),
    ):
        monkeypatch.setattr(mission_api, "fetch_one", returning(row))
        with pytest.raises(HTTPException) as e:
            await mission_api.load_order(token)
        assert e.value.status_code == 410 and e.value.detail == detail

    monkeypatch.setattr(mission_api, "fetch_one", returning(_order(status="da_den")))
    assert (await mission_api.load_order(token))["status"] == "da_den"
