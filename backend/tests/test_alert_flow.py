"""Rà soát luồng vận hành lần 4 (10/2026) — luồng lệnh cảnh báo, phần không cần CSDL: email người duyệt khi có lệnh chờ,
nhắc trước khi cảnh báo hết hiệu lực (1 lần mỗi mốc hạn), danh sách lệnh xếp lệnh chờ duyệt / đang hiệu lực lên đầu."""

from datetime import UTC, datetime, timedelta

from app.api.v1 import alerts as alerts_api
from app.services import alert_watch
from app.services.alert_watch import EXPIRING_SQL, AlertWatch, draft_mail, expiring_mail
from app.ws.hub import EVENT_SCOPE

DRAFT = {
    "code": "CB-120",
    "title": "Lũ lớn sông Bằng Giang",
    "message_body": "Người dân ven sông di chuyển tới điểm sơ tán",
    "severity": "do",
    "target_admin_codes": ["CB-THUCPHAN", "CB-TANGIANG"],
    "audience": {"households": 1520},
    "valid_hours": 48,
}


def test_draft_mail_tells_approver_what_where_and_how_to_act(monkeypatch):
    monkeypatch.setattr(alert_watch.settings, "public_base_url", "https://pctt.example.vn/")
    subject, body = draft_mail(DRAFT, "Nông Văn Trực")
    assert "CB-120" in subject and "chờ phê duyệt" in subject
    assert "Nông Văn Trực" in body and "Rất cao" in body and "2 xã/phường" in body and "1520 hộ" in body
    assert "https://pctt.example.vn/canh-bao" in body and "48 giờ" in body
    # Lệnh hệ thống tự sinh (dự báo / cảm biến): không có người soạn
    assert "Hệ thống" in draft_mail(DRAFT, None)[1]


def test_expiring_mail_uses_vietnam_time():
    subject, body = expiring_mail(
        {"code": "CB-104", "title": "Sơ tán", "valid_until": datetime(2026, 10, 4, 17, 30, tzinfo=UTC)}
    )
    assert "00:30 05/10" in subject and "gia hạn" in body


def test_expiring_window_is_one_hour_or_half_of_a_short_alert():
    assert (
        "LEAST(make_interval(mins => 60)" in EXPIRING_SQL
        and "make_interval(hours => b.valid_hours) / 2" in EXPIRING_SQL
    )
    assert "ended_at IS NULL" in EXPIRING_SQL  # chỉ lệnh còn hiệu lực


async def test_expiring_reminder_once_per_deadline(monkeypatch):
    until = datetime(2026, 10, 4, 15, 0, tzinfo=UTC)
    rows = [{"id": "b1", "code": "CB-104", "title": "Sơ tán", "valid_until": until}]
    published, mails, events = [], [], []

    async def fake_fetch_all(sql, params=None, conn=None):
        return [dict(r) for r in rows]

    async def fake_publish(event, data, scope=None, code=None):
        published.append((event, data["code"]))

    async def fake_mail(to, subject, body):
        mails.append(to)
        return True

    async def fake_emails(exclude_user_id=None):
        return ["lanhdao@example.vn"]

    async def fake_log(*a, **k):
        events.append(a[0])

    monkeypatch.setattr(alert_watch, "fetch_all", fake_fetch_all)
    monkeypatch.setattr(alert_watch.hub, "publish", fake_publish)
    monkeypatch.setattr(alert_watch, "send_mail", fake_mail)
    monkeypatch.setattr(alert_watch, "approver_emails", fake_emails)
    monkeypatch.setattr(alert_watch, "log_event", fake_log)
    monkeypatch.setattr(alert_watch, "get_redis", lambda: None)
    watch = AlertWatch()
    assert await watch.remind_expiring() == ["CB-104"]
    assert await watch.remind_expiring() == []  # vòng sau (mỗi phút) không nhắc lại
    assert (
        published == [("broadcast.expiring", "CB-104")]
        and mails == ["lanhdao@example.vn"]
        and len(events) == 1
    )
    rows[0]["valid_until"] = until + timedelta(hours=12)  # gia hạn → mốc mới → nhắc lại trước mốc mới
    assert await watch.remind_expiring() == ["CB-104"]


def test_expiring_event_reaches_only_alert_viewers():
    assert EVENT_SCOPE["broadcast.expiring"] == "alert"


async def test_broadcast_list_puts_pending_and_active_first(monkeypatch):
    seen = {}

    async def fake_fetch_all(sql, params=None, conn=None):
        seen["sql"], seen["params"] = sql, params
        return []

    monkeypatch.setattr(alerts_api, "fetch_all", fake_fetch_all)
    monkeypatch.setattr(alerts_api, "allowed_codes", lambda *a: None)
    await alerts_api.broadcasts(limit=500, status="pending_approval", user={"id": "u1", "pin_hash": None})
    assert "ORDER BY (b.status = 'pending_approval') DESC, (" in seen["sql"]
    assert seen["params"]["st"] == "pending_approval" and seen["params"]["l"] == 200
