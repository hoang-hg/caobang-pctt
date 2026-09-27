"""Kiểm thử đơn vị nhập dữ liệu: đọc tệp, chuẩn hoá giá trị, kiểm tra theo dòng (phần không cần CSDL)."""

import io
import json
from datetime import date, datetime

import pytest
from openpyxl import Workbook

from app.services.data_import import parsing
from app.services.data_import.engine import Report, check_duplicates, convert_rows
from app.services.data_import.parsing import ImportFileError, norm_key, read_file
from app.services.data_import.specs import DATASETS
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


def test_defaults_and_derived_values():
    rows, report = _rows(
        "luc_luong",
        "ma,ten,loai,cap,quan_so,ky_nang,vi_do,kinh_do\nLL1,Đội A,Quân sự,Tỉnh,40,cứu nạn;vượt lũ,22.66,106.25\n",
    )
    assert not report.errors
    assert rows[0].values["san_sang"] == 40  # trống → bằng quân số
    assert rows[0].values["ky_nang"] == ["cuu_nan", "vuot_lu"]


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
