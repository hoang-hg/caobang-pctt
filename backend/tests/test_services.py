"""Kiểm thử đơn vị cho các thuật toán nghiệp vụ (không cần CSDL)."""

import random

from app.api.v1.dashboard import classify_landslide, threshold_intensity
from app.services import scenario
from app.services.broadcast import advance_delivery, fill_template, init_metrics
from app.services.dispatch_matching import score_force, suggest_needs
from app.services.safe_routing import Edge, dijkstra, haversine_km
from app.services.simulator import alarm_level
from app.services.sos_nlp import norm, parse_rules

GAZ = [
    {"name": "Hòa An", "unit_code": "CB-HOAAN", "lat": 22.72, "lon": 106.18, "kind": "xa"},
    {"name": "Bảo Lâm", "unit_code": "CB-BAOLAM", "lat": 22.86, "lon": 105.47, "kind": "xa"},
    {"name": "Nùng Trí Cao", "unit_code": "CB-NUNGTRICAO", "lat": 22.66, "lon": 106.28, "kind": "xa"},
    {"name": "Thôn Bản Ngắn", "unit_code": "CB-HOAAN", "lat": 22.735, "lon": 106.17, "kind": "thon"},
    {"name": "Thôn Nà Pồng", "unit_code": "CB-BAOLAM", "lat": 22.872, "lon": 105.482, "kind": "thon"},
]
for g in GAZ:
    g["norm"] = norm(g["name"].removeprefix("Thôn "))


def test_norm_removes_diacritics():
    assert norm("Đèo Khau Cốc Chà") == "deo khau coc cha"


def test_parse_flood_with_households_and_children():
    r = parse_rules("Nhà ở thôn Bản Ngắn xã Hòa An ngập sâu, 3 hộ có trẻ em cần xuồng", GAZ)
    assert r["incident_type"] == "ngap_lut"
    assert r["trapped_count"] == 12 and r["counted_households"]
    assert "tre_em" in r["vulnerable"]
    # ưu tiên thôn (cụ thể hơn) thay vì xã
    assert r["place"]["name"] == "Thôn Bản Ngắn"


def test_parse_landslide_injured_is_priority_1():
    r = parse_rules("Sạt lở vùi nhà ở thôn Nà Pồng xã Bảo Lâm, 2 người bị thương nặng", GAZ)
    assert r["incident_type"] == "sat_lo"
    assert r["priority"] == 1
    assert r["trapped_count"] == 2
    assert r["place"]["unit_code"] == "CB-BAOLAM"


def test_parse_supply_request_is_priority_3():
    r = parse_rules("Xã Hòa An hết lương thực và nước sạch, 15 hộ cần tiếp tế", GAZ)
    assert r["incident_type"] == "tiep_te" and r["priority"] == 3


# Sau sáp nhập: hàng nghìn xóm, tên trùng ở nhiều xã
GAZ_DUP = [
    *GAZ,
    {"name": "Phục Hòa", "unit_code": "CB-PHUCHOA", "lat": 22.52, "lon": 106.53, "kind": "xa"},
    {
        "name": "Xóm Nà Pò",
        "unit_code": "CB-PHUCHOA",
        "lat": 22.505,
        "lon": 106.572,
        "kind": "thon",
        "norm": "na po",
    },
    {
        "name": "Xóm Nà Pò",
        "unit_code": "CB-HOAAN",
        "lat": 22.73,
        "lon": 106.17,
        "kind": "thon",
        "norm": "na po",
    },
]
for g in GAZ_DUP:
    g.setdefault("norm", norm(g["name"].removeprefix("Thôn ")))


def test_parse_duplicate_hamlet_uses_commune_in_message():
    r = parse_rules("Nước ngập nhà ở xóm Nà Pò xã Phục Hòa, 2 hộ cần di dời", GAZ_DUP)
    assert r["place"]["kind"] == "thon" and r["place"]["unit_code"] == "CB-PHUCHOA"


def test_parse_duplicate_hamlet_without_commune_is_not_guessed():
    r = parse_rules("Nước ngập nhà ở xóm Nà Pò, 2 hộ cần di dời", GAZ_DUP)
    assert r["place"] is None  # 2 xóm Nà Pò ở 2 xã → không đoán bừa


def test_parse_explicit_coordinates():
    r = parse_rules("Kẹt tại 22.6612, 106.2701 nước lên nhanh", GAZ)
    assert r["coords"] == (22.6612, 106.2701)


def _edge(i, a, b, km, blocked=False):
    return Edge(i, a, b, km, 40, [[0, 0], [1, 1]], f"R{i}", blocked)


def test_dijkstra_avoids_blocked_edges():
    edges = [_edge(1, 1, 2, 10, blocked=True), _edge(2, 1, 3, 8), _edge(3, 3, 2, 8)]
    path = dijkstra(edges, 1, 2)
    assert [e.id for e, _ in path] == [2, 3]
    # không né thì đi thẳng
    assert [e.id for e, _ in dijkstra(edges, 1, 2, avoid_blocked=False)] == [1]


def test_dijkstra_returns_none_when_isolated():
    edges = [_edge(1, 1, 2, 10, blocked=True)]
    assert dijkstra(edges, 1, 2) is None


def test_haversine_known_distance():
    # TP Cao Bằng → Bảo Lạc ≈ 64 km đường chim bay
    assert 60 < haversine_km(22.666, 106.258, 22.95, 105.672) < 70


def test_suggest_needs_scales_boats_with_people():
    assert suggest_needs("ngap_lut", 13, [])["vehicles"]["xuong"] == 3
    needs = suggest_needs("sat_lo", 2, ["thuong_nang"])
    assert needs["vehicles"]["may_xuc"] == 1 and "xe_cuu_thuong" in needs["vehicles"]


def test_score_prefers_matching_skills():
    near_unskilled = {"distance_m": 5000, "skills": [], "personnel_ready": 10}
    farther_skilled = {"distance_m": 9000, "skills": ["lai_xuong", "boi_lan"], "personnel_ready": 10}
    assert score_force(farther_skilled, ["lai_xuong", "boi_lan"]) < score_force(
        near_unskilled, ["lai_xuong", "boi_lan"]
    )


def test_alarm_levels():
    thr = {"bd1": 180, "bd2": 181, "bd3": 182}
    assert [alarm_level(v, thr) for v in (179.9, 180.0, 181.5, 182.3)] == [0, 1, 2, 3]


def test_landslide_threshold_decreases_with_antecedent_rain():
    assert threshold_intensity("do", 400) < threshold_intensity("do", 100)
    assert classify_landslide(80, 3, None) == "an_toan"
    assert classify_landslide(250, 30, None) == "do"
    assert classify_landslide(100, 5, 2.1) == "do"


def test_delivery_simulation_converges_and_never_exceeds_target():
    metrics = init_metrics(["SMS", "ZALO_OA"], {"subscribers": 1000, "zalo_followers": 300})
    rng = random.Random(1)
    done = False
    for _ in range(60):
        metrics, done = advance_delivery(metrics, rng)
        for m in metrics.values():
            assert m["delivered"] <= m["sent"] <= m["target"]
            assert m.get("read", 0) <= m["delivered"]
        if done:
            break
    assert done
    assert metrics["SMS"]["delivered"] == round(1000 * 0.965)


def test_fill_template():
    assert (
        fill_template("Xả {luu_luong} m3/s tại {ten_ho}", {"luu_luong": 500, "ten_ho": "Bảo Lạc B"})
        == "Xả 500 m3/s tại Bảo Lạc B"
    )


def test_scenario_is_periodic_and_bounded():
    assert scenario.rain_intensity(30, 2) > scenario.rain_intensity(30, 30)
    assert abs(scenario.water_level(178, 3, 7) - scenario.water_level(178, 3, 7 + scenario.PERIOD_H)) < 1e-9
    assert scenario.water_level(178, 3, 7) <= 181.0 + 1e-9
