"""Đọc toạ độ dán vào ô tìm kiếm (app/services/coords.py): GPS, điện thoại, văn bản, đường dẫn Google Maps."""

import pytest

from app.services.coords import parse_coords

LAT, LON = 22.6657, 106.2522


@pytest.mark.parametrize(
    "text",
    [
        "22.6657, 106.2522",
        "22.6657 106.2522",
        "22.6657;106.2522",
        "  22.6657 ,  106.2522 ",
        "22,6657 106,2522",  # dấu phẩy thập phân kiểu Việt Nam
        "22,6657; 106,2522",
        "106.2522, 22.6657",  # ghi ngược "kinh độ, vĩ độ"
        "22.6657N 106.2522E",
        "N22.6657 E106.2522",
        "106.2522E 22.6657N",
        "22.6657 B, 106.2522 Đ",  # Bắc / Đông
        "Vĩ độ: 22.6657, Kinh độ: 106.2522",
        "lat 22.6657 lon 106.2522",
        "https://www.google.com/maps/@22.6657,106.2522,15z",
        "https://maps.google.com/?q=22.6657,106.2522",
        "https://www.google.com/maps/dir/?api=1&destination=22.6657,106.2522&travelmode=driving",
    ],
)
def test_decimal_forms(text):
    lat, lon = parse_coords(text)
    assert lat == pytest.approx(LAT) and lon == pytest.approx(LON)


def test_degrees_minutes_seconds():
    lat, lon = parse_coords("22°39'56.5\"N 106°15'08\"E")
    assert lat == pytest.approx(22 + 39 / 60 + 56.5 / 3600) and lon == pytest.approx(106 + 15 / 60 + 8 / 3600)
    lat, lon = parse_coords("22º39,94'B 106º15,13'Đ")  # độ-phút thập phân, dấu phẩy, Bắc / Đông
    assert lat == pytest.approx(22 + 39.94 / 60) and lon == pytest.approx(106 + 15.13 / 60)
    lat, lon = parse_coords("106°15′08″E, 22°39′56″N")  # ký hiệu phút / giây chuẩn, ghi ngược có bán cầu
    assert round(lat, 4) == 22.6656 and round(lon, 4) == 106.2522


@pytest.mark.parametrize(
    "text",
    [
        "",
        "22.6657",  # một số
        "22 106",  # hai số nguyên trần: dễ nhầm số khác (VD "Tổ 22 số nhà 106")
        "SOS-1001",
        "Km 12 QL34",
        "Xóm Nà Pồng",
        "22.66N 23.11S",  # hai vĩ độ
        "95.5, 200.1",  # ngoài phạm vi
        "22°75'N 106°15'E",  # phút ≥ 60
        "22.66E 106.25N",  # bán cầu đặt ngược → vĩ độ 106 không hợp lệ
    ],
)
def test_not_coordinates(text):
    assert parse_coords(text) is None
