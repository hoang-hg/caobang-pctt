"""Đọc toạ độ người dùng dán vào ô tìm kiếm: từ máy GPS, điện thoại, văn bản, đường dẫn Google Maps.

Nhận: thập phân (``22.6657, 106.2522``; dấu phẩy thập phân kiểu Việt Nam ``22,6657 106,2522``), độ-phút-giây
(``22°39'56.5"N 106°15'08"E``), độ-phút (``22°39.94'N``), ký hiệu bán cầu N/S/E/W hoặc B (Bắc) / Đ (Đông) / T (Tây),
nhãn "Vĩ độ / Kinh độ / lat / lon", ghi ngược "kinh độ, vĩ độ", đường dẫn Google Maps (``@lat,lon`` hoặc
``?q= / query= / ll= / destination=``). Hai số nguyên trần (``22 106``) không coi là toạ độ — dễ nhầm số khác.
"""

from __future__ import annotations

import re
import unicodedata

_URL = re.compile(r"(?:@|[?&](?:q|query|ll|destination)=)(-?\d{1,3}\.\d+),\s*(-?\d{1,3}\.\d+)")
_LABELS = re.compile(r"\b(?:VI DO|KINH DO|TOA DO|LATITUDE|LONGITUDE|LAT|LONG|LNG|LON)\b\s*[:=]?")
_COMP = r"""
    ([NSEWBDT])?\s*                                  # bán cầu đứng trước (N22.66)
    (-?\d{1,3}(?:\.\d+)?)\s*(?:°|º|˚)?\s*            # độ
    (?:(\d{1,2}(?:\.\d+)?)\s*(?:'|′|’)\s*)?          # phút
    (?:(\d{1,2}(?:\.\d+)?)\s*(?:"|″|”|''|′′)\s*)?    # giây
    ([NSEWBDT])?                                     # bán cầu đứng sau (22.66N)
"""
_PAIR = re.compile(rf"^\s*{_COMP}\s*[,;/\s]\s*{_COMP}\s*$", re.X)
_HEMI = {"N": "N", "B": "N", "S": "S", "E": "E", "D": "E", "W": "W", "T": "W"}


def _plain(text: str) -> str:
    text = unicodedata.normalize("NFD", text.replace("đ", "d").replace("Đ", "D"))
    return "".join(c for c in text if unicodedata.category(c) != "Mn").upper()


def _component(before, deg, minutes, seconds, after):
    """(giá trị có dấu, trục 'lat' / 'lon' / None, đủ chính xác) — None nếu phút / giây ≥ 60 hoặc 2 bán cầu khác nhau."""
    if (before and after) or any(x is not None and float(x) >= 60 for x in (minutes, seconds)):
        return None
    hemi = _HEMI.get(before or after or "")
    value = abs(float(deg)) + float(minutes or 0) / 60 + float(seconds or 0) / 3600
    negative = deg.startswith("-") or hemi in ("S", "W")
    axis = {"N": "lat", "S": "lat", "E": "lon", "W": "lon"}.get(hemi)
    precise = "." in deg or minutes is not None
    return (-value if negative else value), axis, precise


def parse_coords(text: str) -> tuple[float, float] | None:
    """(vĩ độ, kinh độ) hoặc None nếu chuỗi không phải một cặp toạ độ hợp lệ."""
    if m := _URL.search(text):
        lat, lon = float(m.group(1)), float(m.group(2))
        return (lat, lon) if -90 <= lat <= 90 and -180 <= lon <= 180 else None
    s = _LABELS.sub(" ", _plain(text))
    if "." not in s:  # dấu phẩy thập phân (22,6657) — chỉ khi chuỗi không dùng dấu chấm
        s = re.sub(r"(\d),(\d)", r"\1.\2", s)
    m = _PAIR.match(s)
    if not m:
        return None
    a, b = _component(*m.groups()[:5]), _component(*m.groups()[5:])
    if a is None or b is None or not (a[2] and b[2]):
        return None
    if a[1] and a[1] == b[1]:  # hai vĩ độ / hai kinh độ
        return None
    if a[1] == "lon" or b[1] == "lat" or (a[1] is None and b[1] is None and abs(a[0]) > 90 >= abs(b[0])):
        a, b = b, a  # ghi ngược "kinh độ, vĩ độ"
    lat, lon = a[0], b[0]
    return (lat, lon) if -90 <= lat <= 90 and -180 <= lon <= 180 else None
