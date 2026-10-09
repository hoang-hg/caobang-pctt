"""Nhóm lọc nhanh theo thiên tai nhập từ tệp (loại dữ liệu nhom_loc_nhanh): đọc danh sách xã theo mã hoặc tên, tệp
mẫu điền sẵn nhóm đang dùng. CSDL giả lập."""

from app.services.data_import import engine
from app.services.data_import.engine import Report, convert_rows, plain_unit_name
from app.services.data_import.parsing import read_file, to_code_list
from app.services.data_import.specs import DATASETS
from app.services.data_import.templates import template

DS = DATASETS["nhom_loc_nhanh"]
UNITS = [
    {"code": "CB-BAOLAC", "name": "Bảo Lạc"},
    {"code": "CB-COCPANG", "name": "Cốc Pàng"},
    {"code": "CB-HOAAN", "name": "Hòa An"},
    {"code": "CB-HOAAN-2", "name": "Hoà An"},  # giả định tên trùng (khác cách đặt dấu)
]


def _fake_db(monkeypatch, presets=()):
    async def fetch_all(sql, params=None, conn=None):
        if "kind <> 'luu_vuc'" in sql:
            return [{"code": "DB_00"}]  # nhóm hệ thống (kind khác 'luu_vuc')
        if "spatial_admin.presets" in sql:
            return list(presets)
        return UNITS

    monkeypatch.setattr(engine, "fetch_all", fetch_all)


def _rows(csv_text):
    report = Report(DS.name)
    return convert_rows(DS, read_file("nhom.csv", csv_text.encode("utf-8")), report), report


def test_list_keeps_codes_and_names():
    assert to_code_list("CB-BAOLAC; Cốc Pàng ,CB-BAOLAC|  \nHòa An") == ["CB-BAOLAC", "Cốc Pàng", "Hòa An"]
    assert to_code_list(";;") == []
    assert plain_unit_name("Xã  Cô Ba") == plain_unit_name("co ba") == "co ba"
    assert plain_unit_name("Phường Thục Phán") == "thuc phan"


def test_group_needs_at_least_one_commune():
    _, report = _rows("ma,ten,danh_sach_xa\nLV_X,Nhóm X,;\n")
    assert [i.field for i in report.errors] == ["danh_sach_xa"]


async def test_names_become_codes_unknown_ambiguous_and_reserved_rejected(monkeypatch):
    _fake_db(monkeypatch)
    rows, report = _rows(
        "ma,ten,loai_thien_tai,danh_sach_xa\n"
        "LV_GAM,Lưu vực sông Gâm,ngap_lut,xã bảo lạc; CB-COCPANG; Bảo Lạc\n"
        "DB_00,Trùng nhóm cũ,,CB-BAOLAC\n"
        "LV_X,Nhóm X,,Không Có Xã; Hoa An\n"
    )
    await engine._check_preset_units(rows, report)
    assert rows[0].values["danh_sach_xa"] == ["CB-BAOLAC", "CB-COCPANG"]  # tên → mã, bỏ mục trùng
    assert rows[1].values["loai_thien_tai"] == "tong_hop"  # để trống → tổng hợp
    errors = [(i.row, i.field, i.message) for i in report.errors]
    assert any(r == rows[1].number and f == "ma" and "nhóm hệ thống" in m for r, f, m in errors)
    assert any(r == rows[2].number and "Không có xã/phường: Không Có Xã" in m for r, _, m in errors)
    assert any(
        r == rows[2].number and "Tên trùng nhiều xã/phường" in m and "Hoa An" in m for r, _, m in errors
    )
    assert not any(r == rows[0].number for r, _, _ in errors)


async def test_template_is_prefilled_with_current_groups(monkeypatch):
    groups = [
        {
            "code": "LV_BANG_GIANG",
            "name": "Vùng trũng hạ lưu sông Bằng Giang",
            "description": None,
            "hazard": "ngap_lut",
            "unit_codes": ["CB-HOAAN", "CB-BAOLAC"],
        }
    ]
    _fake_db(monkeypatch, groups)
    rows = await engine.template_rows(DS)
    # Xã ghi theo tên cho dễ đọc; tên trùng nhiều xã thì ghi mã
    assert rows == [
        {
            "ma": "LV_BANG_GIANG",
            "ten": "Vùng trũng hạ lưu sông Bằng Giang",
            "mo_ta": "",
            "loai_thien_tai": "ngap_lut",
            "danh_sach_xa": "CB-HOAAN; Bảo Lạc",
        }
    ]
    body, filename, _ = template(DS, rows=rows)
    report = Report(DS.name)
    parsed = convert_rows(DS, read_file(filename, body), report)
    assert not report.errors and parsed[0].values["danh_sach_xa"] == ["CB-HOAAN", "Bảo Lạc"]
    await engine._check_preset_units(parsed, report)
    assert not report.errors and parsed[0].values["danh_sach_xa"] == ["CB-HOAAN", "CB-BAOLAC"]
    assert await engine.template_rows(DATASETS["kho"]) is None  # loại khác: một dòng ví dụ như cũ
    _fake_db(monkeypatch, [])
    assert await engine.template_rows(DS) is None  # chưa có nhóm nào → dòng ví dụ


def test_replace_only_touches_hazard_groups():
    assert DS.replaceable and DS.replace_scope == "kind = 'luu_vuc'" and DS.fixed == {"kind": "luu_vuc"}
    assert "nhom_loc_nhanh" not in __import__("app.services.data_import.specs", fromlist=["x"]).SUBMITTABLE
