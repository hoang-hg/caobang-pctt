"""Rà soát luồng vận hành người dân & cán bộ (10/2026) — phần không cần CSDL: tiến độ người dân tra cứu, điều kiện cảnh
báo còn hiệu lực, đầu vào huỷ lệnh / chuyển phản ánh thành SOS."""

from datetime import UTC, datetime, timedelta

import pytest
from pydantic import ValidationError

from app.api.v1.alerts import BroadcastIn, EndIn, ExtendIn
from app.api.v1.reports import ToSosIn
from app.api.v1.sos import CancelIn
from app.services.broadcast import active_alert_sql
from app.services.reports import REPORT_SOS_NOTE, REPORT_SOS_NOTES
from app.services.tracking import eta_text, format_report_item, format_sos_item

NOW = datetime(2026, 10, 3, 9, 0, tzinfo=UTC)


def _sos(**kw):
    return {
        "code": "SOS-1011",
        "status": "thuc_thi",
        "incident_type": "ngap_lut",
        "received_at": NOW - timedelta(hours=1),
        "acknowledged_at": NOW - timedelta(minutes=50),
        "dispatched_at": NOW - timedelta(minutes=45),
        "eta": NOW + timedelta(minutes=20),
        "dispatch_status": "dang_di",
        "force_name": "Ban CHQS khu vực Bảo Lạc",
        **kw,
    }


def test_eta_text_never_promises_minutes_after_eta_passed():
    assert eta_text(NOW + timedelta(minutes=38), NOW) == "Dự kiến khoảng 38 phút nữa tiếp cận"
    assert eta_text(NOW + timedelta(seconds=30), NOW) == "Dự kiến tiếp cận trong ít phút tới"
    late = eta_text(NOW - timedelta(minutes=40), NOW)
    assert "Chậm hơn dự kiến" in late and "ít phút" not in late
    assert eta_text(None, NOW) == "Đang di chuyển trên lộ trình an toàn"


def test_citizen_sees_team_arrived():
    item = format_sos_item(_sos(dispatch_status="da_den", arrived_at=NOW - timedelta(minutes=5)), NOW)
    s3, s4 = item["timeline"][2], item["timeline"][3]
    assert item["status_label"] == "Đội cứu hộ đã đến hiện trường"
    assert s3["state"] == "done" and s3["title"] == "Đội cứu hộ đã đến hiện trường" and s3["time"]
    assert s4["state"] == "current" and "Đang cứu hộ" in s4["title"]
    on_way = format_sos_item(_sos(), NOW)
    assert on_way["timeline"][2]["title"] == "Đội cứu hộ đang trên đường đến"
    assert on_way["timeline"][2]["time"] == "Dự kiến khoảng 20 phút nữa tiếp cận"
    done = format_sos_item(
        _sos(
            status="hoan_thanh", dispatch_status=None, resolved_at=NOW, arrived_at=NOW - timedelta(minutes=30)
        ),
        NOW,
    )
    assert (
        done["timeline"][2]["time"] == "15:30 (03/10/2026)"
    )  # giờ đến (giờ Việt Nam), không phải giờ xác nhận xong


def _report(**kw):
    return {
        "code": "PA-1001",
        "status": "da_duyet",
        "category": "mac_ket",
        "created_at": NOW - timedelta(hours=1),
        "moderated_at": NOW - timedelta(minutes=50),
        "public_note": REPORT_SOS_NOTE,
        "sos_code": "SOS-1011",
        "force_name": None,
        "dispatch_status": None,
        **kw,
    }


def test_report_converted_to_sos_follows_rescue_progress():
    waiting = format_report_item(_report(), NOW)["timeline"][2]
    assert waiting["title"] == "Đã chuyển thành yêu cầu cứu hộ SOS-1011" and "bố trí" in waiting["detail"]
    on_way = format_report_item(
        _report(force_name="Đội A", dispatch_status="dang_di", eta=NOW + timedelta(minutes=9)), NOW
    )
    assert on_way["timeline"][2]["title"] == "Đội cứu hộ đang trên đường đến"
    assert on_way["timeline"][2]["time"] == "Dự kiến khoảng 9 phút nữa tiếp cận"
    arrived = format_report_item(_report(force_name="Đội A", dispatch_status="da_den", arrived_at=NOW), NOW)
    assert (
        arrived["timeline"][2]["title"] == "Đội cứu hộ đã đến hiện trường"
        and arrived["sos_code"] == "SOS-1011"
    )
    # Phản ánh thường (không chuyển SOS) giữ như cũ
    plain = format_report_item(_report(sos_code=None, public_note="Đã báo điện lực"), NOW)["timeline"][2]
    assert plain["title"] == "Đang xử lý" and plain["detail"] == "Đã báo điện lực"
    assert (
        "Đã chuyển lực lượng cứu hộ xử lý" in REPORT_SOS_NOTES
    )  # câu cũ trong CSDL cũng được thay khi cứu xong


def test_active_alert_condition_covers_end_and_expiry():
    sql = active_alert_sql("b")
    assert "b.ended_at IS NULL" in sql and "b.status IN ('sending', 'sent')" in sql
    assert "b.valid_until" in sql and "b.valid_hours" in sql  # lệnh cũ chưa có valid_until: lúc phát + hạn


def test_inputs():
    base = {"title": "Lệnh sơ tán", "message_body": "Nội dung đủ dài để gửi", "channels": ["SMS"]}
    assert BroadcastIn(**base).valid_hours == 48
    with pytest.raises(ValidationError):
        BroadcastIn(**base, valid_hours=0)
    with pytest.raises(ValidationError):
        BroadcastIn(**base, valid_hours=200)
    with pytest.raises(ValidationError):
        EndIn(pin="2468", note="")  # kết thúc phải ghi lý do
    with pytest.raises(ValidationError):
        ExtendIn(pin="2468", hours=100)
    with pytest.raises(ValidationError):
        CancelIn(reason="x")
    assert CancelIn(reason="Đường bị sạt").return_supplies is False
    assert ToSosIn().trapped_count is None  # trống → bóc tách từ nội dung người dân gửi
