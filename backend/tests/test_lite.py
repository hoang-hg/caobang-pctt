"""Kiểm thử trang bản nhẹ /ban-nhe (app/services/lite.py): dựng HTML từ dữ liệu mẫu, không cần CSDL."""

from datetime import UTC, datetime

from app.services import lite

NOW = datetime(2026, 9, 27, 3, 5, tzinfo=UTC)
UNITS = [{"code": f"X{i:02d}", "name": f"Xã Thử Nghiệm Số {i}"} for i in range(56)]


def alert(i: int, severity: str = "cam", here: bool = True, body: str = "Mưa lớn kéo dài. " * 200) -> dict:
    return {
        "code": f"CB-{i:04d}",
        "title": f"Cảnh báo mưa lớn số {i}",
        "message_body": body,
        "severity": severity,
        "issued_at": NOW,
        "target_admin_codes": ["X01"],
        "here": here,
    }


def page(**kw) -> str:
    args = {
        "units": UNITS,
        "unit": None,
        "alerts": [],
        "rivers": [],
        "commune": None,
        "hotlines": [],
        "now": NOW,
    }
    return lite.render(**(args | kw))


def test_empty_province_page_is_small_and_has_hotlines():
    html = page()
    assert html.startswith("<!doctype html>")
    assert "<script" not in html and "<img" not in html
    assert 'href="tel:112"' in html and "Không có cảnh báo" in html
    assert "10:05 27/09" in html  # giờ Việt Nam (UTC+7)
    assert html.count("<option") == 57


def test_worst_case_stays_under_limit():
    """Nhiều cảnh báo dài, nhiều sông vượt báo động, xã có đủ vùng nguy hiểm và điểm sơ tán → vẫn < 50 KB."""
    unit = UNITS[1]
    commune = {
        "risk": "cao",
        "hazards": [{"type": "sat_lo", "level": "do", "name": "Taluy dương Km " * 5}] * lite.MAX_HAZARDS,
        "forecast": {"p50": 120.5, "p90": 180.0},
        "sites": [
            {
                "name": "Trường tiểu học " * 6,
                "site_type": "truong_hoc",
                "capacity": 300,
                "current_occupancy": 120,
                "hotline": "0206 3852 111",
                "lat": 22.12345,
                "lon": 106.12345,
            }
        ]
        * lite.MAX_SITES,
    }
    # Đủ trần số sông, mọi trạm mất tín hiệu (thêm chú thích thời điểm → dài nhất)
    rivers = [
        {"name": "Trạm " * 8, "unit": "m", "value": 180.25, "level": 3, "time": NOW, "stale": True}
    ] * lite.MAX_RIVERS
    html = page(
        unit=unit,
        alerts=[alert(i, "do") for i in range(40)],
        rivers=rivers,
        commune=commune,
        hotlines=[{"org": "BCH PCTT & TKCN tỉnh", "position": "Trực ban", "phone": "02063852000"}] * 2,
    )
    assert len(html.encode()) < lite.MAX_BYTES
    assert html.count('class="b do"') == lite.MAX_ALERTS + 1  # + khung mức nguy cơ của xã
    assert "NGUY CƠ CAO" in html and "Chỉ đường" in html
    assert html.count('href="tel:02063852111"') == lite.MAX_SITES  # số trực điểm sơ tán (công khai)
    assert (
        html.count("trạm mất tín hiệu") == lite.MAX_RIVERS
    )  # số đo cũ ghi rõ thời điểm, không như số hiện tại


def test_commune_filter_and_counts():
    alerts = [alert(1, here=True), alert(2, here=False), alert(3, here=False)]
    commune = {"risk": "trung_binh", "hazards": [], "forecast": None, "sites": []}
    html = page(unit=UNITS[1], alerts=alerts, commune=commune)
    assert "Cảnh báo đang hiệu lực tại xã (1)" in html
    assert "2 cảnh báo khác trong tỉnh" in html
    assert 'value="X01" selected' in html
    assert "Chưa có điểm sơ tán" in html


def test_long_alert_is_trimmed():
    html = page(alerts=[alert(1)])
    assert "…" in html
    assert html.count("Mưa lớn kéo dài.") < 60


def test_user_content_is_escaped():
    bad = alert(1, body="<script>alert(1)</script>")
    bad["title"] = '"><img src=x onerror=alert(1)>'
    html = page(alerts=[bad])
    assert "<script>alert" not in html and "<img" not in html
    assert "&lt;script&gt;" in html
