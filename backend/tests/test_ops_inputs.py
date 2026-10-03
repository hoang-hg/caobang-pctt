"""Kiểm thử số liệu trực ban / xã nhập tay: tiến độ sơ tán, bản tin dự báo mực nước KTTV — chặn gõ nhầm trước khi
ghi (KPI toàn tỉnh và Hydrograph lấy thẳng các số này)."""

from datetime import UTC, datetime, timedelta

import pytest
from pydantic import ValidationError

from app.api.v1.dashboard import ForecastBulletinIn, forecast_problem
from app.api.v1.sos import EvacuationIn, evacuation_problem

NOW = datetime(2026, 10, 3, 8, 0, tzinfo=UTC)


def evac(**kw) -> EvacuationIn:
    return EvacuationIn(
        **{
            "planned_households": 120,
            "evacuated_households": 45,
            "planned_persons": 480,
            "evacuated_persons": 170,
            **kw,
        }
    )


def test_evacuation_persons_cannot_be_fewer_than_households():
    with pytest.raises(ValidationError, match="nhân khẩu"):
        evac(planned_persons=100)  # 120 hộ mà 100 người → gõ nhầm cột
    with pytest.raises(ValidationError):
        evac(evacuated_households=-1)


def test_evacuation_checked_against_commune_size():
    assert evacuation_problem(evac(), households=900, population=3600) is None
    # Xã chưa có số dân: không chặn
    assert evacuation_problem(evac(), households=None, population=None) is None
    assert "vượt tổng số hộ" in evacuation_problem(
        evac(planned_households=1200, planned_persons=4800), 900, 3600
    )
    assert "vượt dân số" in evacuation_problem(evac(evacuated_persons=5000), 900, 3600)


def bulletin(*points, issued_at=None) -> ForecastBulletinIn:
    return ForecastBulletinIn(
        points=[{"time": NOW + timedelta(hours=h), "value": v} for h, v in points], issued_at=issued_at
    )


def test_forecast_bulletin_accepts_normal_bulletin():
    assert forecast_problem(bulletin((1, 180.4), (7, 181.2), (13, 181.9)), NOW, ref_level=180.0) is None
    # Trạm chưa có ngưỡng, chưa có số đo
    assert forecast_problem(bulletin((1, 180.4)), NOW, ref_level=None) is None


def test_forecast_bulletin_rejects_typos_and_bad_times():
    assert "lệch mức tham chiếu" in forecast_problem(bulletin((1, 180.4), (7, 1812.0)), NOW, 180.0)
    assert "trùng thời điểm" in forecast_problem(bulletin((1, 180.4), (1, 180.6)), NOW, 180.0)
    assert "10 ngày" in forecast_problem(bulletin((24 * 11, 180.0)), NOW, 180.0)
    assert "10 ngày" in forecast_problem(bulletin((-13, 180.0)), NOW, 180.0)
    assert "phát hành" in forecast_problem(
        bulletin((1, 180.0), issued_at=NOW + timedelta(hours=1)), NOW, 180.0
    )
    naive = ForecastBulletinIn(points=[{"time": datetime(2026, 10, 3, 15, 0), "value": 180.0}])
    assert "múi giờ" in forecast_problem(naive, NOW, 180.0)
