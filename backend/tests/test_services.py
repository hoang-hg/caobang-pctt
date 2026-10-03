"""Kiểm thử đơn vị cho các thuật toán nghiệp vụ (không cần CSDL)."""

import random

from app.api.v1.dashboard import classify_landslide, threshold_intensity
from app.services import scenario
from app.services.broadcast import advance_delivery, fill_template, init_metrics
from app.services.dispatch_matching import score_force, suggest_needs
from app.services.reservoirs import NO_DATA, classify_reservoir_status, get_downstream_warning
from app.services.safe_routing import Edge, build_route, dijkstra, haversine_km
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


def test_metrics_not_integrated_are_flagged_per_channel():
    """Vận hành thật (chưa nối cổng gửi tin): từng kênh mang cờ integrated=False → giao diện không hiện "đang phát"."""
    aud = {"subscribers": 1000, "zalo_followers": 300}
    assert all("integrated" not in m for m in init_metrics(["SMS", "ZALO_OA"], aud).values())
    off = init_metrics(["SMS", "ZALO_OA"], aud, integrated=False)
    assert all(m["integrated"] is False and m["sent"] == 0 for m in off.values())


def test_reservoir_without_operating_data_is_not_reported_safe():
    base = {"normal_level": 100.0, "current_level": 100.0, "spill_gates": 3, "spill_gates_open": 0}
    assert classify_reservoir_status({**base, "operating_at": None}) == NO_DATA
    assert (
        classify_reservoir_status({**base, "operating_at": "2026-09-28T00:00:00+00:00"})[0] == "binh_thuong"
    )
    assert classify_reservoir_status(base)[0] == "binh_thuong"  # bản ghi không kèm cột operating_at
    assert "Chưa có báo cáo vận hành" in get_downstream_warning({"river": "Gâm"}, NO_DATA[0])


def test_fill_template():
    assert (
        fill_template("Xả {luu_luong} m3/s tại {ten_ho}", {"luu_luong": 500, "ten_ho": "Bảo Lạc B"})
        == "Xả 500 m3/s tại Bảo Lạc B"
    )


def test_scenario_is_periodic_and_bounded():
    assert scenario.rain_intensity(30, 2) > scenario.rain_intensity(30, 30)
    assert abs(scenario.water_level(178, 3, 7) - scenario.water_level(178, 3, 7 + scenario.PERIOD_H)) < 1e-9
    assert scenario.water_level(178, 3, 7) <= 181.0 + 1e-9


def test_route_counts_gap_between_disconnected_road_networks():
    # 2 mạng đường rời nhau: nút 1–2 và nút 3–4 cách nhau ~40 km → quãng đường phải gồm cả đoạn chim bay 2→3
    nodes = {1: (22.60, 106.20), 2: (22.61, 106.21), 3: (22.95, 105.70), 4: (22.96, 105.71)}
    edges = [_edge(1, 1, 2, 1.5), _edge(2, 3, 4, 1.5)]
    route = build_route(edges, nodes, 22.60, 106.20, 22.96, 105.71)
    direct = haversine_km(22.60, 106.20, 22.96, 105.71)
    assert route["roads"] == [] and route["safe"] is False  # không có đường nối → giao diện vẽ nét chim bay
    assert route["distance_km"] >= direct * 0.95


def test_route_without_road_network_is_straight_line():
    route = build_route([], {}, 22.60, 106.20, 22.70, 106.30)
    assert route["roads"] == [] and route["safe"] is False and route["distance_km"] > 10
    assert len(route["geometry"]["coordinates"]) == 2


def test_route_reports_offroad_distance_to_and_from_road_network():
    # Mạng đường nhỏ; điểm đi / đến cách nút giao gần nhất ~4,4 km → phải báo phần chim bay (chưa có dữ liệu đường):
    # giao diện không được khẳng định cả tuyến an toàn khi chỉ kiểm tra được đoạn trên đường
    nodes = {1: (22.60, 106.20), 2: (22.61, 106.21)}
    route = build_route([_edge(1, 1, 2, 1.5)], nodes, 22.56, 106.20, 22.65, 106.21)
    legs = haversine_km(22.56, 106.20, 22.60, 106.20) + haversine_km(22.61, 106.21, 22.65, 106.21)
    assert route["roads"] and abs(route["offroad_km"] - legs) <= 0.1 and route["offroad_km"] > 8
    straight = build_route([], {}, 22.60, 106.20, 22.70, 106.30)
    assert straight["offroad_km"] == straight["distance_km"]  # không có mạng đường: cả tuyến là chim bay


def test_river_level_never_claims_safe_without_fresh_data():
    from app.api.v1.public import river_level

    thr = {"bd1": 180, "bd2": 181, "bd3": 182}
    assert river_level(None, False, thr) == (None, "Chưa có số liệu")
    assert river_level(179.0, True, thr) == (None, "Mất tín hiệu")  # số cũ dưới báo động → không khẳng định
    assert river_level(181.5, True, thr) == (2, "Trên báo động II · mất tín hiệu")  # nguy cơ đã biết vẫn báo
    assert river_level(179.0, False, thr) == (0, "Dưới báo động I")


def test_track_items_never_include_address_or_description():
    """Tra cứu công khai: kể cả đúng mã + SĐT cũng không trả địa chỉ / nội dung — lỡ bị dò trúng không lộ nơi người
    đang mắc kẹt (người gửi đã biết địa chỉ của mình)."""
    from datetime import UTC, datetime

    from app.services.tracking import format_report_item, format_sos_item

    now = datetime(2026, 9, 29, 8, 0, tzinfo=UTC)
    sos = format_sos_item(
        {
            "code": "SOS-1001", "status": "thuc_thi", "incident_type": "ngap_lut", "received_at": now,
            "acknowledged_at": now, "dispatched_at": now, "resolved_at": None, "eta": now, "force_name": "Đội 1",
            "dispatch_status": "dang_di", "admin_name": "Cô Ba", "reporter_phone": "0912345678",
            "address": "Nhà ông A, xóm Nà Rì",
        },
        now,
    )  # fmt: skip
    report = format_report_item(
        {
            "code": "PA-1001", "status": "da_duyet", "category": "ngap", "description": "Nhà ông A ngập sâu",
            "created_at": now, "moderated_at": now, "public_note": None, "address": "xóm Nà Rì",
            "admin_name": "Cô Ba", "reporter_phone": "0912345678", "force_name": None, "sos_status": None,
        }
    )  # fmt: skip
    for item in (sos, report):
        assert "address" not in item and "description" not in item
        assert "Nà Rì" not in str(item) and "ông A" not in str(item)


def test_overdue_sql_uses_sla_per_priority():
    from app.services.sos import OVERDUE_SQL, SLA_MINUTES

    for p, m in SLA_MINUTES.items():
        assert f"WHEN {p} THEN {m}" in OVERDUE_SQL


def test_number_words_do_not_misread_common_phrases():
    # Bỏ dấu rồi mới so: "phía sau hộ" = "sáu hộ" (24 người), "tin từ người dân" = "tư người" (4 người)
    assert (
        parse_rules("Sạt lở phía sau hộ gia đình ông Nông Văn A, đất đá tràn vào bếp", [])["trapped_count"]
        == 0
    )
    assert parse_rules("Tin từ người dân xã Bảo Lâm: nước suối dâng cao", [])["trapped_count"] == 0
    r = parse_rules("Sáu hộ bị cô lập do lũ", [])
    assert r["trapped_count"] == 24 and r["counted_households"]
    assert parse_rules("Có năm người mắc kẹt trên mái nhà", [])["trapped_count"] == 5
    assert parse_rules("Nhà bà Hoàng Thị B bị ngập, có ba người trên gác", [])["trapped_count"] == 3
    assert parse_rules("co bon nguoi mac ket tren mai nha", [])["trapped_count"] == 4  # tin gõ không dấu
    # chữ tổ hợp (NFD) từ một số bàn phím
    import unicodedata

    assert parse_rules(unicodedata.normalize("NFD", "Bảy người mắc kẹt"), [])["trapped_count"] == 7


def test_llm_output_is_validated():
    from app.services.sos_nlp import clean_llm

    assert (
        clean_llm({"incident_type": "lu_lut", "priority": 4, "trapped_count": -3, "vulnerable": "tre_em"})
        == {}
    )
    assert clean_llm(
        {"incident_type": "sat_lo", "priority": "1", "trapped_count": "5", "vulnerable": ["tre_em", "x"]}
    ) == {
        "incident_type": "sat_lo",
        "priority": 1,
        "trapped_count": 5,
        "vulnerable": ["tre_em"],
    }


def test_landslide_without_any_evidence_is_no_data_not_safe():
    """Điểm đen không có vùng nguy hiểm gần, không đường bị cắt, không cảm biến báo số đo → "Chưa có dữ liệu giám sát"
    (xám), KHÔNG "Chưa ghi nhận nguy cơ" (xanh). Có bằng chứng thì giữ quy tắc cũ."""
    from app.services.landslides import NO_DATA, TRAFFIC, traffic_status

    assert traffic_status(False, "binh_thuong", near_zone=False, monitored=False) == NO_DATA
    assert TRAFFIC[NO_DATA][1] == "gray"
    assert traffic_status(False, "binh_thuong", near_zone=False, monitored=True) == "thong_suot"
    assert traffic_status(False, "vang", near_zone=True, monitored=False) == "thong_suot"
    assert traffic_status(False, "do", near_zone=True, monitored=False) == "canh_bao"
    assert traffic_status(True, "binh_thuong", near_zone=False, monitored=False) == "cam_duong"


async def test_storm_track_is_simulation_only(monkeypatch):
    """Chưa có bản tin bão trực ban nhập: chạy thật (SIMULATOR=false) → 404, không hiện kịch bản như bão thật; bộ mô phỏng
    trả kịch bản, tên ghi rõ "mô phỏng"."""
    import pytest
    from fastapi import HTTPException

    from app.api.v1 import map_layers
    from app.config import settings

    async def no_bulletins(*a, **kw):
        return []

    monkeypatch.setattr(map_layers, "fetch_all", no_bulletins)
    monkeypatch.setattr(settings, "simulator", False)
    with pytest.raises(HTTPException) as e:
        await map_layers.storm_track({})
    assert e.value.status_code == 404
    monkeypatch.setattr(settings, "simulator", True)
    (track,) = (await map_layers.storm_track({}))["storms"]
    assert track["simulated"] is True and "mô phỏng" in track["name"]


def test_people_count_sums_groups_and_roof_is_priority_one():
    # SOP (README 7.1): mắc kẹt trên mái / nước tới mái = Cấp 1; số người = cộng các nhóm, tin có tổng thì lấy tổng
    r = parse_rules("Cứu với! Nhà tôi ở tổ 5 nước ngập đến mái, có 2 cụ già và 1 trẻ em mắc kẹt", [])
    assert r["trapped_count"] == 3 and r["priority"] == 1
    assert parse_rules("3 người già và 1 trẻ em mắc kẹt trên gác", [])["trapped_count"] == 4
    assert parse_rules("Nhà ngập sâu, 4 người, trong đó 2 trẻ em", [])["trapped_count"] == 4
    assert parse_rules("Sạt lở, 2 người bị thương nặng và 1 cụ già", [])["trapped_count"] == 3
    assert parse_rules("3 người lớn và 2 trẻ em bị cô lập", [])["trapped_count"] == 5
    assert (
        parse_rules("Gia đình 5 người, có 2 cụ già và 1 cháu nhỏ, nước ngập trong nhà", [])["trapped_count"]
        == 5
    )
    assert parse_rules("co 3 nguoi mac ket tren mai nha", [])["priority"] == 1  # tin gõ không dấu
    rain = parse_rules(
        "Mưa to đến mai, nước ngập trong nhà, 2 người mắc kẹt", []
    )  # "mai" = ngày mai, không phải mái
    assert rain["priority"] == 2 and rain["trapped_count"] == 2
