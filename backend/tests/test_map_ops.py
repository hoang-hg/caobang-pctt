"""Kiểm thử số liệu cán bộ nhập trên bản đồ điều hành (app/services/map_ops.py) + quỹ đạo bão + loại dữ liệu "Vùng ngập
theo kịch bản" — phần không cần CSDL."""

import json
from datetime import UTC, datetime, timedelta

from app.api.v1 import map_layers
from app.config import settings
from app.services import map_ops
from app.services.data_import.engine import Report, check_duplicates, convert_rows
from app.services.data_import.parsing import read_file
from app.services.data_import.specs import DATASETS
from app.services.map_ops import StormBulletinIn, occupancy_problem, storm_class, storm_problem, value_at

NOW = datetime(2026, 10, 3, 8, 0, tzinfo=UTC)


def bulletin(points, issued_at=NOW, **kw) -> StormBulletinIn:
    return StormBulletinIn(
        name="Bão số 3 (YAGI)",
        issued_at=issued_at,
        points=[
            {"time": NOW + timedelta(hours=h), "lat": la, "lon": lo, "wind_level": w, "gust_level": g, **kw}
            for h, la, lo, w, g in points
        ],
    )


TRACK = [
    (-12, 19.8, 110.5, 14, 17),
    (0, 20.6, 108.9, 13, 16),
    (12, 21.4, 107.2, 11, 14),
    (24, 22.1, 105.8, 7, 9),
]


def test_storm_class_follows_decision_18_2021():
    assert [storm_class(x) for x in (None, 5, 6, 7, 8, 9, 10, 11, 12, 15, 16, 17)] == [
        "Vùng áp thấp",
        "Vùng áp thấp",
        "Áp thấp nhiệt đới",
        "Áp thấp nhiệt đới",
        "Bão",
        "Bão",
        "Bão mạnh",
        "Bão mạnh",
        "Bão rất mạnh",
        "Bão rất mạnh",
        "Siêu bão",
        "Siêu bão",
    ]


def test_storm_bulletin_checks():
    assert storm_problem(bulletin(TRACK), NOW) is None
    assert "tương lai" in storm_problem(bulletin(TRACK, issued_at=NOW + timedelta(hours=2)), NOW)
    assert "trùng" in storm_problem(bulletin([TRACK[1], TRACK[1]]), NOW)
    assert "thứ tự vĩ độ" in storm_problem(
        bulletin([(0, 108.9, 20.6, 13, 16), TRACK[2]]), NOW
    )  # đảo vĩ / kinh
    assert "cấp giật" in storm_problem(bulletin([(0, 20.6, 108.9, 13, 10), TRACK[2]]), NOW)
    assert "hiện tại" in storm_problem(bulletin(TRACK[2:]), NOW)  # chỉ có mốc dự báo, thiếu tâm bão hiện tại
    assert "7 ngày" in storm_problem(bulletin([TRACK[1], (24 * 9, 22.0, 106.0, 6, 8)]), NOW)
    naive = bulletin(TRACK).model_copy(update={"issued_at": datetime(2026, 10, 3, 8, 0)})
    assert "múi giờ" in storm_problem(naive, NOW)


def test_value_at_interpolates_between_bulletin_points_only():
    pts = [(NOW, 180.0), (NOW + timedelta(hours=6), 181.2), (NOW + timedelta(hours=12), 181.8)]
    assert value_at(pts, NOW + timedelta(hours=3)) == 180.6
    assert value_at(pts, NOW + timedelta(hours=6)) == 181.2
    assert value_at(pts, NOW + timedelta(hours=13)) is None  # sau mốc cuối: không kéo dài số cuối
    assert value_at(pts, NOW - timedelta(hours=1)) is None
    far = [(NOW, 180.0), (NOW + timedelta(hours=30), 182.0)]
    assert value_at(far, NOW + timedelta(hours=15)) is None  # hai mốc cách quá 12 giờ: không đoán
    assert value_at([(NOW, 180.0)], NOW) == 180.0


def test_occupancy_and_active_point_sql():
    assert occupancy_problem(450, 500) is None
    assert occupancy_problem(620, 500) is None  # vượt sức chứa vẫn nhận (thực tế có lúc chen chúc)
    assert "2 lần sức chứa" in occupancy_problem(1200, 500)
    assert occupancy_problem(30, 0) is None
    assert map_ops.active_point_sql("h") == "h.active AND (h.expires_at IS NULL OR h.expires_at > now())"


async def test_storm_track_returns_bulletins_and_hides_passed_storms(monkeypatch):
    def row(name, hours):
        pts = [
            {"time": (NOW + timedelta(hours=h)).isoformat(), "lat": 20.0, "lon": 108.0, "wind_level": w}
            for h, w in hours
        ]
        return {"id": "b1", "name": name, "issued_at": NOW, "source": "TT Dự báo KTTV", "points": pts}

    now = datetime.now(UTC)
    current = row("Bão số 3", [(-6, 12), (0, 11), (12, 9)])
    current["issued_at"] = now
    for p, h in zip(current["points"], (-6, 0, 12), strict=True):
        p["time"] = (now + timedelta(hours=h)).isoformat()
    passed = row("Bão số 2", [(-80, 10), (-60, 6)])  # mốc cuối đã qua quá 24 giờ

    async def rows(*a, **kw):
        return [current, passed]

    monkeypatch.setattr(map_layers, "fetch_all", rows)
    monkeypatch.setattr(settings, "simulator", True)  # có bản tin thật → không trả kịch bản mô phỏng
    (storm,) = (await map_layers.storm_track({}))["storms"]
    assert storm["name"] == "Bão số 3" and storm["simulated"] is False
    assert [p["label"] for p in storm["points"]] == ["Bão rất mạnh", "Bão mạnh", "Bão"]
    assert [p["forecast"] for p in storm["points"]] == [False, False, True]


def _scenario_rows(features):
    ds = DATASETS["ngap_kich_ban"]
    report = Report(ds.name)
    data = json.dumps({"type": "FeatureCollection", "features": features}).encode()
    rows = convert_rows(ds, read_file("ngap.geojson", data), report)
    check_duplicates(ds, rows, report)
    return rows, report


SQUARE = {
    "type": "Polygon",
    "coordinates": [[[106.25, 22.66], [106.26, 22.66], [106.26, 22.67], [106.25, 22.67], [106.25, 22.66]]],
}


def test_flood_scenario_needs_exactly_one_trigger():
    def feature(code, **props):
        return {
            "type": "Feature",
            "geometry": SQUARE,
            "properties": {"ma": code, "ten": f"Vùng {code}", "ma_tram": "CB-WL-01", **props},
        }

    _, report = _scenario_rows(
        [
            feature("N1", cap_bao_dong=2),
            feature("N2", muc_nuoc_m=181.5, do_sau_m=0.8),
            feature("N3"),  # thiếu ngưỡng
            feature("N4", cap_bao_dong=3, muc_nuoc_m=182),  # ghi cả hai
            feature("N5", cap_bao_dong=4),  # cấp không tồn tại
        ]
    )
    errors = {(i.row, i.field) for i in report.errors}
    assert not any(row in (1, 2) for row, _ in errors)
    assert (3, "cap_bao_dong") in errors and (4, "cap_bao_dong") in errors and (5, "cap_bao_dong") in errors
