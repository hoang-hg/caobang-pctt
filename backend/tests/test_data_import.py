"""Kiểm thử đơn vị nhập dữ liệu: đọc tệp, chuẩn hoá giá trị, kiểm tra theo dòng (phần không cần CSDL)."""

import io
import json
from datetime import date, datetime

import pytest
from openpyxl import Workbook

from app.rbac.permissions import SYSTEM_ROLES, get_permission
from app.services.data_import import parsing
from app.services.data_import.engine import (
    Report,
    _plain,
    _replace_filter,
    _same,
    check_duplicates,
    convert_rows,
    xom_code,
    xom_sort_key,
)
from app.services.data_import.parsing import ImportFileError, norm_key, read_file
from app.services.data_import.specs import DATASETS, SCOPED_REPLACE_EXTRA, SUBMITTABLE
from app.services.data_import.templates import template


def test_norm_key_handles_vietnamese_headers():
    assert norm_key("Vĩ độ") == "vi_do"
    assert norm_key("Đơn vị") == "don_vi"
    assert norm_key(" Sức chứa (người) ") == "suc_chua_nguoi"
    assert norm_key("MA XA") == "ma_xa"


def test_value_parsers():
    assert parsing.to_int("1.200") == parsing.to_int("1 200") == parsing.to_int("1200") == 1200
    assert parsing.to_float("22,666") == 22.666
    assert parsing.to_date("31/12/2026") == date(2026, 12, 31) == parsing.to_date("2026-12-31")
    assert parsing.to_enum("Trường học", ("truong_hoc", "khac")) == "truong_hoc"
    assert parsing.to_bool("Có") is True and parsing.to_bool("không") is False
    assert parsing.to_list("cứu nạn; vượt lũ") == ["cuu_nan", "vuot_lu"]
    for bad in (
        lambda: parsing.to_int("12a"),
        lambda: parsing.to_float("1.234,5"),
        lambda: parsing.to_code("mã có dấu"),
    ):
        with pytest.raises(ValueError):
            bad()


def test_read_csv_semicolon_bom_vietnamese_headers():
    data = "Mã;Tên;Loại;Sức chứa;Vĩ độ;Kinh độ\nA1;Trường A;Trường học;300;22,66;106,25\n;;;;;\n".encode(
        "utf-8-sig"
    )
    rows = read_file("diem.csv", data)
    assert len(rows) == 1  # dòng trống bị bỏ
    assert rows[0].number == 2
    assert rows[0].values["ma"] == "A1" and rows[0].values["vi_do"] == "22,66"


def test_read_csv_rejects_non_utf8():
    with pytest.raises(ImportFileError, match="UTF-8"):
        read_file("x.csv", "Mã,Tên\nA,Bé\n".encode("latin-1"))  # Excel lưu "CSV" thường → không phải UTF-8


def test_read_xlsx_keeps_numbers_and_dates():
    wb = Workbook()
    ws = wb.active
    ws.append(["ma", "so_luong", "han_su_dung"])
    ws.append(["K1", 1200.0, datetime(2027, 6, 30)])
    buf = io.BytesIO()
    wb.save(buf)
    rows = read_file("ton_kho.xlsx", buf.getvalue())
    assert rows[0].values == {"ma": "K1", "so_luong": "1200", "han_su_dung": datetime(2027, 6, 30)}


def test_read_geojson_rejects_vn2000():
    doc = {
        "type": "FeatureCollection",
        "crs": {"type": "name", "properties": {"name": "EPSG:3405"}},
        "features": [],
    }
    with pytest.raises(ImportFileError, match="VN-2000"):
        read_file("vung.geojson", json.dumps(doc).encode())


def test_unsupported_file_type():
    with pytest.raises(ImportFileError):
        read_file("du_lieu.xls", b"...")


def _rows(dataset: str, csv_text: str):
    ds = DATASETS[dataset]
    report = Report(ds.name)
    rows = convert_rows(ds, read_file("t.csv", csv_text.encode("utf-8")), report)
    check_duplicates(ds, rows, report)
    return rows, report


def test_convert_rows_reports_errors_per_row():
    rows, report = _rows(
        "diem_so_tan",
        "ma,ten,loai,suc_chua,dang_o,vi_do,kinh_do,cot_la\n"
        "S1,Trường A,truong_hoc,300,0,22.66,106.25,x\n"  # hợp lệ
        "S2,,benh_vien,abc,0,22.66,106.25,x\n"  # thiếu tên, loại sai, sức chứa không phải số
        "S3,Nhà văn hoá,Nhà văn hoá,50,80,22.66,106.25,x\n"  # đang ở > sức chứa
        "S4,UBND,tru_so,50,0,106.25,22.66,x\n"  # đảo vĩ độ / kinh độ
        "S1,Trùng,khac,10,0,22.66,106.25,x\n",  # trùng mã
    )
    by_row = {}
    for issue in report.errors:
        by_row.setdefault(issue.row, set()).add(issue.field)
    assert 2 not in by_row
    assert by_row[3] >= {"ten", "loai", "suc_chua"}
    assert by_row[4] == {"dang_o"}
    assert "vi_do" in by_row[5]
    assert 6 in by_row  # trùng mã với dòng 2
    assert any("cot_la" in w.message for w in report.warnings)  # cột không dùng
    assert rows[0].lat == 22.66 and rows[0].values["loai"] == "truong_hoc"


def test_water_level_thresholds_must_strictly_increase():
    """Trạm mực nước: ngưỡng BĐ đảo thứ tự / gõ nhầm → LỖI (cấp báo động cho người dân tính từ đây); thiếu ngưỡng giữa
    vẫn nhập được (go-live mới bắt buộc đủ 3). Loại trạm khác: chỉ cảnh báo như trước."""
    _, report = _rows(
        "tram_quan_trac",
        "ma,ten,loai,don_vi,bao_dong_1,bao_dong_2,bao_dong_3,vi_do,kinh_do\n"
        "W1,Trạm A,muc_nuoc,m,180,181,182,22.66,106.25\n"  # đúng
        "W2,Trạm B,muc_nuoc,m,182,181,180,22.66,106.25\n"  # đảo thứ tự
        "W3,Trạm C,muc_nuoc,m,180,18.1,182,22.66,106.25\n"  # gõ nhầm
        "W4,Trạm D,muc_nuoc,m,180,,182,22.66,106.25\n"  # thiếu BĐ II
        "W5,Trạm E,muc_nuoc,m,180,180,182,22.66,106.25\n"  # hai ngưỡng bằng nhau
        "R1,Trạm mưa,luong_mua,mm,100,50,150,22.66,106.25\n",
    )
    assert {i.row for i in report.errors if i.field == "bao_dong_1"} == {3, 4, 6}
    assert any(i.row == 7 for i in report.warnings) and not any(i.row == 7 for i in report.errors)


def test_defaults_and_derived_values():
    rows, report = _rows(
        "luc_luong",
        "ma,ten,loai,cap,quan_so,ky_nang,vi_do,kinh_do\nLL1,Đội A,Quân sự,Tỉnh,40,cứu nạn;vượt lũ,22.66,106.25\n",
    )
    assert not report.errors
    assert rows[0].values["san_sang"] == 40  # trống → bằng quân số
    assert rows[0].values["ky_nang"] == ["cuu_nan", "vuot_lu"]


def test_xom_code_ignores_type_prefix_and_accents():
    assert xom_code("CB-PHUCHOA", "Xóm Nà Pò") == "CB-PHUCHOA-NAPO"
    assert xom_code("CB-PHUCHOA", "  nà   pò ") == "CB-PHUCHOA-NAPO"
    assert xom_code("CB-THUCPHAN", "Tổ dân phố 3") == xom_code("CB-THUCPHAN", "Tổ 3") == "CB-THUCPHAN-3"
    assert xom_code("CB-HOAAN", "Bản Ngắn") == "CB-HOAAN-BANNGAN"  # "Bản" là một phần tên riêng, giữ lại
    assert xom_code("CB-DAMTHUY", "Xóm Đông Đuốc") == "CB-DAMTHUY-DONGDUOC"


def test_xom_sort_key_orders_like_people_read():
    names = ["Xóm Đại Tiến 2", "Tổ dân phố 10", "Xóm An Bình", "Tổ 2", "Xóm Đại Tiến 1", "Xóm Bản Sẩy"]
    assert sorted(names, key=xom_sort_key) == [
        "Tổ 2",
        "Tổ dân phố 10",
        "Xóm An Bình",
        "Xóm Bản Sẩy",
        "Xóm Đại Tiến 1",
        "Xóm Đại Tiến 2",
    ]


def test_xom_rows_derive_code_and_catch_duplicate_names():
    rows, report = _rows(
        "xom",
        "ma,ma_xa,ten,loai,dan_so,so_ho\n"
        ",CB-PHUCHOA,Xóm Nà Pò,Xóm,320,80\n"
        ",CB-PHUCHOA,Nà Pò,,,\n"  # cùng xóm viết khác → trùng mã
        ",CB-DAMTHUY,Nà Pò,Tổ dân phố,,\n"  # cùng tên, xã khác → mã khác
        "CB-PHUCHOA-KHUOI,CB-PHUCHOA,Xóm Khuổi Lường,xom,,\n"  # mã tự đặt được giữ
        ",,Xóm Thiếu Xã,,,\n",
    )
    assert [r.values["ma"] for r in rows[:4]] == [
        "CB-PHUCHOA-NAPO",
        "CB-PHUCHOA-NAPO",
        "CB-DAMTHUY-NAPO",
        "CB-PHUCHOA-KHUOI",
    ]
    assert rows[0].values["loai"] == "xom" and rows[1].values["loai"] == "xom"  # trống → mặc định
    assert rows[2].values["loai"] == "to_dan_pho"
    errors = {(i.row, i.field) for i in report.errors}
    assert (3, None) in errors  # trùng mã với dòng 2
    assert (6, "ma_xa") in errors  # thiếu mã xã
    assert not any(row in (2, 4, 5) for row, _ in errors)


def test_inventory_duplicate_key_uses_codes():
    _, report = _rows(
        "ton_kho",
        "ma_kho,ma_vat_tu,so_luong,dinh_muc\nK1,MI_TOM,10,5\nK1,NUOC,10,5\nK1,MI_TOM,3,5\n",
    )
    assert [i.row for i in report.errors] == [4]


@pytest.mark.parametrize("name", list(DATASETS))
def test_every_dataset_is_consistent_and_template_is_valid(name):
    ds = DATASETS[name]
    provided = (
        {f.column for f in ds.fields if f.column} | {r.column for r in ds.refs} | set(ds.geometry_columns)
    )
    assert set(ds.key) <= provided, f"{name}: khoá {ds.key} không có cột nguồn"
    body, filename, _ = template(ds)
    report = Report(ds.name)
    rows = convert_rows(ds, read_file(filename, body), report)
    assert len(rows) == 1
    assert not report.errors, f"{name}: dòng mẫu lỗi {report.errors}"
    if filename.endswith(".csv"):
        assert body.startswith(b"\xef\xbb\xbf")  # BOM để Excel hiện đúng tiếng Việt


def test_submittable_datasets_and_level_rules_are_consistent():
    """Loại xã được gửi phải tồn tại; giới hạn cấp phải là tập con lựa chọn của trường; loại chỉ tỉnh nhập không có."""
    assert set(SUBMITTABLE) <= set(DATASETS)
    assert not {"ranh_gioi_xa", "tram_quan_trac", "ho_chua", "cay_xang"} & set(SUBMITTABLE)
    for name, rules in SUBMITTABLE.items():
        for fld, ok in rules.items():
            field = DATASETS[name].get_field(fld)
            assert field is not None and set(ok) <= set(field.choices), f"{name}.{fld}"
    for name in SCOPED_REPLACE_EXTRA:
        assert DATASETS[name].replaceable and name in SUBMITTABLE


def test_scoped_replace_only_deletes_inside_submitter_communes():
    rows, _ = _rows("danh_ba", "ma,cap,co_quan,ho_ten,chuc_vu,sdt\nD1,xa,UBND,A,Chủ tịch,0912000001\n")
    cond, params = _replace_filter(DATASETS["danh_ba"], rows, ["CB-COBA"])
    assert "admin_unit_id IN" in cond and ":scope" in cond and "level IN ('xa', 'thon')" in cond
    assert params["scope"] == ["CB-COBA"]
    full, full_params = _replace_filter(DATASETS["danh_ba"], rows)  # cấp tỉnh: không giới hạn xã
    assert "scope" not in full and "scope" not in full_params
    xom, _ = _rows("xom", "ma_xa,ten\nCB-COBA,Xóm A\n")
    assert "parent_id IN" in _replace_filter(DATASETS["xom"], xom, ["CB-COBA"])[0]
    # Không xác định được xã của bản ghi (phương tiện) → xã không xoá được gì
    pt, _ = _rows("phuong_tien", "ma,ten,loai,nhom\nP1,Xuồng,xuong,duong_thuy\n")
    assert _replace_filter(DATASETS["phuong_tien"], pt, ["CB-COBA"])[0].endswith("AND FALSE")


def test_commune_template_uses_own_commune_and_location():
    body, filename, _ = template(DATASETS["kho"], {"cap": "xa", "ma_xa": "CB-COBA"}, center=(22.9, 105.8))
    report = Report("kho")
    rows = convert_rows(DATASETS["kho"], read_file(filename, body), report)
    assert not report.errors
    assert rows[0].values["cap"] == "xa" and rows[0].values["ma_xa"] == "CB-COBA"
    assert (rows[0].lat, rows[0].lon) == (22.9, 105.8)
    body, filename, _ = template(DATASETS["vung_nguy_hiem"], {"ma_xa": "CB-COBA"}, center=(22.9, 105.8))
    ring = json.loads(body)["features"][0]["geometry"]["coordinates"][0]
    assert min(p[0] for p in ring) < 105.8 < max(p[0] for p in ring)
    assert min(p[1] for p in ring) < 22.9 < max(p[1] for p in ring)


def test_change_comparison_normalises_values():
    assert _same(300, 300.0) and not _same(300, 450)
    assert _same(None, None) and not _same(None, 0)
    assert _same(["cuu_nan"], ("cuu_nan",)) and _same(None, [])
    assert _plain(date(2027, 6, 30)) == "2027-06-30"


def test_submit_permission_is_scoped_and_given_to_commune_admins():
    assert get_permission("data.submit").scopable and not get_permission("data.import").scopable
    roles = {r[0]: {f"{o}.{a}" for o, a in r[4]} for r in SYSTEM_ROLES}
    assert "data.submit" in roles["admin_xa"] and "data.import" not in roles["admin_xa"]
    assert "data.import" in roles["admin_tinh"]


def test_float_rejects_nan_and_infinity():
    for bad in ("nan", "NaN", "inf", "-inf", float("nan")):
        with pytest.raises(ValueError):
            parsing.to_float(bad)
    assert parsing.to_float("185,2") == 185.2


def test_xlsx_stops_reading_past_row_limit(monkeypatch):
    wb = Workbook()
    ws = wb.active
    ws.append(["ma", "ten"])
    for i in range(50):
        ws.append([f"X{i}", f"Tên {i}"])
    buf = io.BytesIO()
    wb.save(buf)
    monkeypatch.setattr(parsing, "MAX_ROWS", 5)
    with pytest.raises(parsing.ImportFileError, match="Quá 5 dòng"):
        parsing.read_file("tep.xlsx", buf.getvalue())
