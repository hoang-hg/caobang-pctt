"""Kiểm thử số liệu hậu cần cập nhật tay (app/services/logistics.py) + cột trạng thái / nhiên liệu của tệp nhập phương
tiện — phần không cần CSDL."""

from datetime import date

import pytest
from pydantic import ValidationError

from app.services.data_import.engine import Report, convert_rows
from app.services.data_import.parsing import read_file
from app.services.data_import.specs import DATASETS
from app.services.logistics import (
    ReceiveIn,
    VehicleUpdateIn,
    depot_problem,
    merged_expiry,
    receive_problem,
    supplies_shortage,
)

TODAY = date(2026, 10, 3)


def test_vehicle_update_rules():
    assert VehicleUpdateIn(status="bao_duong", note="Hỏng máy").status == "bao_duong"
    assert VehicleUpdateIn(fuel_level=0).fuel_level == 0
    with pytest.raises(ValidationError, match="trạng thái hoặc"):
        VehicleUpdateIn()  # không có gì để cập nhật
    with pytest.raises(ValidationError):
        VehicleUpdateIn(status="nhiem_vu")  # "đang làm nhiệm vụ" chỉ do lệnh điều động gán
    with pytest.raises(ValidationError):
        VehicleUpdateIn(fuel_level=120)


def test_receive_keeps_earliest_expiry_and_needs_quota_for_new_item():
    assert merged_expiry(date(2026, 12, 1), date(2027, 6, 1)) == date(2026, 12, 1)  # lô cũ hết hạn trước
    assert merged_expiry(None, date(2027, 6, 1)) == date(2027, 6, 1)
    assert merged_expiry(date(2026, 12, 1), None) == date(2026, 12, 1)
    assert merged_expiry(None, None) is None
    body = ReceiveIn(item_code="MI_TOM", quantity=200)
    assert "định mức" in receive_problem(body, existing=False, today=TODAY)
    assert receive_problem(body, existing=True, today=TODAY) is None
    expired = ReceiveIn(item_code="MI_TOM", quantity=200, expiry_date=date(2026, 9, 1))
    assert "hết hạn" in receive_problem(expired, existing=True, today=TODAY)
    with pytest.raises(ValidationError):
        ReceiveIn(item_code="MI_TOM", quantity=0)


def test_fuel_depot_and_supplies_shortage():
    assert depot_problem(8_000, 12_000, 30_000) is None
    assert "vượt sức chứa" in depot_problem(20_000, 12_000, 30_000)
    assert depot_problem(5, 5, 0) is None  # chưa khai báo sức chứa: không chặn
    stock = {"AO_PHAO": 10, "TUI_SO_CUU": 0}
    assert supplies_shortage({"AO_PHAO": 5}, stock) == []
    assert supplies_shortage({"AO_PHAO": 12, "TUI_SO_CUU": 1, "DEN_PIN": 2}, stock) == [
        "AO_PHAO",
        "TUI_SO_CUU",
        "DEN_PIN",
    ]
    assert supplies_shortage({"AO_PHAO": 0}, {}) == []


def test_vehicle_import_status_and_fuel_columns():
    ds = DATASETS["phuong_tien"]
    report = Report(ds.name)
    csv = (
        "ma,ten,loai,nhom,trang_thai,nhien_lieu\n"
        "PT1,Xuồng 1,xuong,duong_thuy,,\n"  # trống: sẵn sàng, nhiên liệu chưa rõ
        "PT2,Xe 2,xe_tai,duong_bo,bao_duong,35\n"
        "PT3,Xe 3,xe_tai,duong_bo,nhiem_vu,150\n"  # không nhận "nhiệm vụ" từ tệp; nhiên liệu > 100%
    )
    rows = convert_rows(ds, read_file("pt.csv", csv.encode()), report)
    assert rows[0].values["trang_thai"] == "san_sang" and rows[0].values["nhien_lieu"] is None
    assert rows[1].values["trang_thai"] == "bao_duong" and rows[1].values["nhien_lieu"] == 35
    assert {i.field for i in report.errors if i.row == 4} == {"trang_thai", "nhien_lieu"}
    # Chỉ ghi khi thêm mới: nhập lại tệp giữa đợt ứng phó không đổi trạng thái / nhiên liệu đang có
    assert {"status", "fuel_level", "fuel_updated_at"} <= set(ds.insert_only)
