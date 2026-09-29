"""Kiểm tra Go / No-Go (app.golive, app.golive_web): phần logic không cần CSDL / mạng."""


def test_sample_codes_cover_import_templates_but_not_real_style_ids():
    """Bản ghi mẫu = mã ví dụ …-001 của tệp mẫu nhập dữ liệu; mã kiểu thật (CB-WL-BANGGIANG) không bị coi là mẫu."""
    from app.golive import SAMPLE_CODE_RE
    from app.services.data_import.specs import DATASETS

    sample = {d.name: d.get_field("ma").example for d in DATASETS.values() if d.get_field("ma")}
    assert SAMPLE_CODE_RE.search(sample["diem_so_tan"]) and SAMPLE_CODE_RE.search(sample["luc_luong"])
    assert not SAMPLE_CODE_RE.search("CB-WL-BANGGIANG") and not SAMPLE_CODE_RE.search("HO-BANGGIANG")
    assert not SAMPLE_CODE_RE.search("CB-DST-010")
    # Mọi loại có mã mẫu …-001 đều khoá theo cột code → golive kiểm được bằng WHERE code = <mã mẫu>
    for d in DATASETS.values():
        f = d.get_field("ma")
        if f and SAMPLE_CODE_RE.search(f.example or ""):
            assert d.key == ("code",), d.name


def test_public_leak_patterns():
    from app.golive_web import MAP_PRIVATE, REPORT_PRIVATE, _keys

    assert _keys({"a": [{"reporter_phone": 1, "x": {"track_key": 2}}]}) == {
        "a",
        "reporter_phone",
        "x",
        "track_key",
    }
    for k in ("reporter_phone", "reporter_name", "track_key", "ip_hash", "moderated_by", "reject_reason"):
        assert REPORT_PRIVATE.search(k), k
    # Trường công khai hợp lệ của phản ánh không bị báo nhầm
    for k in ("description", "public_note", "category_label", "approx_m", "photos", "admin_name"):
        assert not REPORT_PRIVATE.search(k), k
    for k in ("forces", "vehicle_ids", "warehouse", "personnel_ready", "commander"):
        assert MAP_PRIVATE.search(k), k
    for k in ("evacuation_sites", "hazard_zones", "stations", "capacity"):
        assert not MAP_PRIVATE.search(k), k
