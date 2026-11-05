#!/usr/bin/env python3
"""Sinh bộ tệp nhập giả lập vào tests/du-lieu-gia-lap/tep từ backend/app/seed_data.py (không giữ hai bản dữ liệu).

    python tests/du-lieu-gia-lap/tao_bo_du_lieu.py           # ghi lại các tệp
    python tests/du-lieu-gia-lap/tao_bo_du_lieu.py --check   # chỉ so sánh (CI): tệp lệch thì báo lỗi

Chỉ dùng thư viện chuẩn. Kết quả cố định: cùng mã nguồn cho ra đúng cùng tệp (số ngẫu nhiên có hạt giống, ngày theo
NGAY_GOC). Tên người, số điện thoại (đầu 0999), số lượng là GIẢ ĐỊNH — repo công khai, không đưa dữ liệu thật vào đây.
"""

from __future__ import annotations

import csv
import importlib.util
import io
import json
import math
import random
import re
import sys
from datetime import date, timedelta
from pathlib import Path

GOC = Path(__file__).resolve().parents[2]
RA = Path(__file__).resolve().parent / "tep"
NGAY_GOC = date(2026, 11, 5)  # nap.mjs dời hạn sử dụng theo ngày chạy để "sắp hết hạn" luôn đúng

_spec = importlib.util.spec_from_file_location("seed_data", GOC / "backend/app/seed_data.py")
D = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(D)

rng = random.Random(2026)
RANH_GIOI = json.loads((GOC / "backend/seed/caobang_communes.geojson").read_text(encoding="utf-8"))
HINH_XA = {f["properties"]["ma"]: f for f in RANH_GIOI["features"]}
BLACKSPOT_SQL = (GOC / "backend/alembic/sql/0028_landslide_blackspots_data.sql").read_text(encoding="utf-8")

# Cùng tình huống với dữ liệu mẫu (seed.py) để bộ lọc, cảnh báo thiếu hàng có dữ liệu thử
SAP_HET = {("K-BLAM", "NUOC_CHAI"), ("K-BLAM", "MI_TOM"), ("K-NB", "AO_PHAO"), ("K-DC-01", "LUONG_KHO"),
           ("K-HL", "TUI_SO_CUU"), ("K-BLAC", "GAO"), ("K-HA", "AO_PHAO")}
SAP_HET_HAN = {("K-TINH", "THUOC_CO_BAN"), ("K-QH", "LUONG_KHO"), ("K-TK", "CLORAMIN_B"), ("K-NB", "TUI_SO_CUU")}
CO_HAN_DUNG = {"MI_TOM", "LUONG_KHO", "NUOC_CHAI", "THUOC_CO_BAN", "CLORAMIN_B", "TUI_SO_CUU"}
HO = ["Nông", "Hoàng", "Bế", "Lương", "Đàm", "Triệu", "Lục", "Ma", "Hà", "Lâm", "Mông", "Sầm", "Vi", "Lý"]
TEN = ["Văn Hùng", "Thị Lan", "Văn Thắng", "Đức Anh", "Văn Tuấn", "Thị Hoa", "Minh Khang", "Văn Sơn", "Quốc Bảo", "Văn Phúc"]
KHO_XA = ["Cô Ba", "Thục Phán", "Bảo Lâm", "Đàm Thủy", "Ca Thành", "Trường Hà"]
HE_SO_KHO = {"tinh": 4.0, "cum": 1.0, "da_chien": 0.35, "xa": 0.2}


def sdt(i: int) -> str:
    return f"{D.DEMO_PHONE_PREFIX} {100 + i // 1000:03d} {i % 1000:03d}"


def _vong(polygon: list, lon: float, lat: float) -> bool:
    """Điểm trong đa giác (ray casting): trong vòng ngoài, không rơi vào lỗ."""

    def trong(ring: list) -> bool:
        hit = False
        for (x1, y1), (x2, y2) in zip(ring, ring[1:], strict=False):
            if (y1 > lat) != (y2 > lat) and lon < x1 + (lat - y1) * (x2 - x1) / (y2 - y1):
                hit = not hit
        return hit

    return trong(polygon[0]) and not any(trong(r) for r in polygon[1:])


def diem_trong_xa(ten_xa: str) -> tuple[float, float]:
    """Điểm ngẫu nhiên (có hạt giống) nằm trong ranh giới thật của xã → máy chủ không cảnh báo sai xã."""
    hinh = HINH_XA[D.unit_code(ten_xa)]["geometry"]
    polygons = hinh["coordinates"] if hinh["type"] == "MultiPolygon" else [hinh["coordinates"]]
    lon_lat = [p for poly in polygons for p in poly[0]]
    lons, lats = [p[0] for p in lon_lat], [p[1] for p in lon_lat]
    for _ in range(5000):
        lon, lat = rng.uniform(min(lons), max(lons)), rng.uniform(min(lats), max(lats))
        if any(_vong(poly, lon, lat) for poly in polygons):
            return round(lat, 5), round(lon, 5)
    raise SystemExit(f"Không tìm được điểm trong xã {ten_xa}")


def _m(lat: float) -> tuple[float, float]:
    """Số độ cho 1 m theo (vĩ, kinh) tại vĩ độ này."""
    return 1 / 111_320, 1 / (111_320 * math.cos(math.radians(lat)))


def da_giac(hinh: tuple, nhan: float = 1.0) -> dict:
    """Đổi ("line", điểm, rộng m) / ("circle", tâm, bán kính m) của seed_data thành Polygon GeoJSON."""
    if hinh[0] == "circle":
        (lat, lon), r = hinh[1], hinh[2] * nhan
        dlat, dlon = _m(lat)
        vong = [
            [round(lon + r * dlon * math.cos(i * math.tau / 32), 5), round(lat + r * dlat * math.sin(i * math.tau / 32), 5)]
            for i in range(32)
        ]
    else:
        pts, r = hinh[1], hinh[2] * nhan
        trai, phai = [], []
        for i, (lat, lon) in enumerate(pts):
            (a_lat, a_lon), (b_lat, b_lon) = pts[max(i - 1, 0)], pts[min(i + 1, len(pts) - 1)]
            dlat, dlon = _m(lat)
            # Pháp tuyến của hướng tuyến, tính theo mét để bề rộng đều
            vy, vx = (b_lat - a_lat) / dlat, (b_lon - a_lon) / dlon
            n = math.hypot(vx, vy) or 1
            trai.append([round(lon - vy / n * r * dlon, 5), round(lat + vx / n * r * dlat, 5)])
            phai.append([round(lon + vy / n * r * dlon, 5), round(lat - vx / n * r * dlat, 5)])
        vong = trai + phai[::-1]
    return {"type": "Polygon", "coordinates": [[*vong, vong[0]]]}


def bang(cot: list[str], dong: list[dict]) -> str:
    out = io.StringIO()
    w = csv.DictWriter(out, cot, lineterminator="\n")
    w.writeheader()
    w.writerows(dong)
    return "﻿" + out.getvalue()  # có BOM như tệp mẫu của hệ thống: Excel mở đúng tiếng Việt


def ban_do(features: list[tuple[dict, dict]]) -> str:
    dong = [json.dumps({"type": "Feature", "properties": p, "geometry": g}, ensure_ascii=False, separators=(",", ":"))
            for p, g in features]
    return '{"type":"FeatureCollection","features":[\n' + ",\n".join(dong) + "\n]}\n"


def ranh_gioi_xa() -> tuple[str, int]:
    ten = {D.unit_code(c[0]): c[0] for c in D.COMMUNES}
    rows = [
        ({"ma": f["properties"]["ma"], "ten": ten[f["properties"]["ma"]], "dan_so": f["properties"]["dan_so"],
          "so_ho": f["properties"]["so_ho"]}, f["geometry"])
        for f in RANH_GIOI["features"]
    ]
    return ban_do(rows), len(rows)


def xom() -> tuple[str, int]:
    rows = []
    for ten_tn, kind, xa, *_ in D.PLACE_NAMES:
        if kind == "thon":
            rows.append({"ma": f"{D.unit_code(xa)}-{D.slug(ten_tn)}", "ma_xa": D.unit_code(xa), "ten": ten_tn, "loai": "thon",
                         "dan_so": rng.randint(250, 900), "so_ho": rng.randint(60, 220)})
    for ten_xa, loai, *_ in D.COMMUNES:
        ten_goc, kieu = ("Tổ dân phố", "to_dan_pho") if loai == "phuong" else ("Xóm", "xom")
        for i in range(1, 4):
            rows.append({"ma": f"{D.unit_code(ten_xa)}-GL{i}", "ma_xa": D.unit_code(ten_xa), "ten": f"{ten_goc} {i} (giả định)",
                         "loai": kieu, "dan_so": rng.randint(250, 900), "so_ho": rng.randint(60, 220)})
    return bang(["ma", "ma_xa", "ten", "loai", "dan_so", "so_ho"], rows), len(rows)


def nhom_loc_nhanh() -> tuple[str, int]:
    rows = [{"ma": c, "ten": n, "mo_ta": m, "loai_thien_tai": h, "danh_sach_xa": ";".join(D.unit_code(x) for x in xa)}
            for c, n, m, h, xa in D.PRESETS]
    return bang(["ma", "ten", "mo_ta", "loai_thien_tai", "danh_sach_xa"], rows), len(rows)


def tram_quan_trac() -> tuple[str, int]:
    """Các loại có toạ độ / hình sẵn trong seed_data để trống ma_xa: máy chủ tự xác định xã theo ranh giới thật."""
    rows = []
    for ma, ten, loai, song, don_vi, _xa, lat, lon, nguong, *_ in D.STATIONS:
        rows.append({"ma": ma, "ten": ten, "loai": loai, "song": song or "", "don_vi": don_vi, "bao_dong_1": nguong.get("bd1", ""),
                     "bao_dong_2": nguong.get("bd2", ""), "bao_dong_3": nguong.get("bd3", ""), "vi_do": lat, "kinh_do": lon})
    cot = ["ma", "ten", "loai", "song", "don_vi", "bao_dong_1", "bao_dong_2", "bao_dong_3", "vi_do", "kinh_do"]
    return bang(cot, rows), len(rows)


def ngap_kich_ban() -> tuple[str, int]:
    tuyen = [z for z in D.HAZARD_ZONES if z[0] == "ngap" and z[5][0] == "line"]
    bang_giang, hien = tuyen[0], next(z for z in tuyen if "Hiến" in z[2])
    rows = []
    for cap, nhan, sau in ((1, 0.5, 0.3), (2, 1.0, 0.8), (3, 1.6, 1.5)):
        rows.append(({"ma": f"CB-NKB-BG-BD{cap}", "ten": f"Ngập ven sông Bằng Giang khi đạt BĐ {'I' * cap} (giả định)", "ma_tram": "CB-WL-01",
                      "cap_bao_dong": cap, "do_sau_m": sau}, da_giac(bang_giang[5], nhan)))
    rows.append(({"ma": "CB-NKB-HIEN-BD2", "ten": "Ngập ven sông Hiến khi đạt BĐ II (giả định)", "ma_tram": "CB-WL-02", "cap_bao_dong": 2,
                  "do_sau_m": 0.6}, da_giac(hien[5])))
    return ban_do(rows), len(rows)


def vung_nguy_hiem() -> tuple[str, int]:
    rows = []
    for i, (loai, muc, ten, sau, _xa, hinh) in enumerate(D.HAZARD_ZONES, 1):
        p = {"ma": f"CB-VNH-{i:03d}", "ten": ten, "loai": loai, "muc_do": muc}
        if sau is not None:
            p["do_sau_m"] = sau
        rows.append((p, da_giac(hinh)))
    return ban_do(rows), len(rows)


def diem_nguy_hiem() -> tuple[str, int]:
    rows = [{"ma": f"CB-DNH-{i:03d}", "ten": ten, "loai": loai, "muc_do": muc, "mo_ta": mo_ta, "dang_hoat_dong": "có", "vi_do": lat, "kinh_do": lon}
            for i, (loai, muc, ten, mo_ta, _xa, lat, lon) in enumerate(D.HAZARD_POINTS, 1)]
    return bang(["ma", "ten", "loai", "muc_do", "mo_ta", "dang_hoat_dong", "vi_do", "kinh_do"], rows), len(rows)


def _bo_null(v: str) -> str:
    return "" if v == "NULL" else v.strip("'")


def diem_den_sat_lo() -> tuple[str, int]:
    """Đọc từ tệp SQL của migration 0028 (12 điểm đen ban đầu) — không chép tay danh sách."""
    giua = BLACKSPOT_SQL[BLACKSPOT_SQL.index("FROM (VALUES") : BLACKSPOT_SQL.index(") AS v(")]
    mau = re.compile(
        r"\('([^']+)', '([^']+)', '([^']+)', '([a-z_]+)',\s*'([^']*)',\s*([\d.]+), ([\d.]+), (NULL|'[^']+'), (NULL|'[^']+'), (NULL|'[^']+')\)"
    )
    rows = [{"ma": m[0], "ten": m[1], "tuyen_duong": m[2], "loai": m[3], "dac_diem": m[4], "vi_do": m[5], "kinh_do": m[6],
             "ma_cam_bien_nghieng": _bo_null(m[7]), "ma_tram_mua": _bo_null(m[8]), "ma_cam_bien_do_am": _bo_null(m[9])} for m in mau.findall(giua)]
    if len(rows) != 12:
        raise SystemExit(f"Đọc được {len(rows)} điểm đen từ tệp SQL (cần 12) — sửa lại mẫu đọc")
    cot = ["ma", "ten", "tuyen_duong", "loai", "dac_diem", "ma_cam_bien_nghieng", "ma_tram_mua", "ma_cam_bien_do_am", "vi_do", "kinh_do"]
    return bang(cot, rows), len(rows)


def diem_so_tan() -> tuple[str, int]:
    co_diem = {xa for _, _, xa, _ in D.EVAC_SITES}
    nguon = list(D.EVAC_SITES) + [
        (f"Nhà văn hóa {'phường' if c[1] == 'phuong' else 'xã'} {c[0]} (giả định)", "nha_van_hoa", c[0], 100 + 50 * (j % 6))
        for j, c in enumerate(D.COMMUNES)
        if c[0] not in co_diem
    ]
    rows = []
    for i, (ten, loai, xa, suc_chua) in enumerate(nguon, 1):
        lat, lon = diem_trong_xa(xa)
        rows.append({"ma": f"CB-DST-{i:03d}", "ten": ten, "loai": loai, "suc_chua": suc_chua, "dang_o": 0, "sdt_lien_he": sdt(600 + i),
                     "vi_do": lat, "kinh_do": lon, "ma_xa": D.unit_code(xa)})
    return bang(["ma", "ten", "loai", "suc_chua", "dang_o", "sdt_lien_he", "vi_do", "kinh_do", "ma_xa"], rows), len(rows)


def danh_ba() -> tuple[str, int]:
    rows, so = [], [0]

    def them(cap_tren, cap, co_quan, ho_ten, chuc_vu, trang_thai="truc", thu_tu=0, ma_xa=""):
        so[0] += 1
        ma = f"CB-DB-{so[0]:04d}"
        rows.append({"ma": ma, "ma_cap_tren": cap_tren, "cap": cap, "co_quan": co_quan, "ho_ten": ho_ten, "chuc_vu": chuc_vu, "sdt": sdt(so[0]),
                     "tan_so_vo_tuyen": f"{146 + (so[0] % 40) * 0.025:.3f} MHz" if cap != "thon" else "", "trang_thai": trang_thai,
                     "thu_tu": thu_tu, "ma_xa": ma_xa})
        return ma

    goc = them("", "tinh", "BCH PCTT & TKCN tỉnh", "Lê Quang Minh", "Trưởng ban – Chủ tịch UBND tỉnh")
    tinh = [("BCH PCTT & TKCN tỉnh", "Hoàng Đức Chỉ", "Phó Trưởng ban Thường trực"), ("Bộ CHQS tỉnh", "Nông Văn Hòa", "Phó Trưởng ban"),
            ("Công an tỉnh", "Triệu Minh Quân", "Phó Trưởng ban"), ("BĐBP tỉnh", "Bế Văn Lực", "Thành viên"), ("Sở Y tế", "Hà Thị Thu", "Thành viên"),
            ("Đài KTTV tỉnh", "Đàm Văn Tân", "Trưởng phòng Dự báo"), ("Văn phòng thường trực BCH", "Nông Văn Trực", "Cán bộ trực ban 24/7")]
    for i, (co_quan, ten, chuc) in enumerate(tinh):
        them(goc, "tinh", co_quan, ten, chuc, "truc" if i % 3 != 2 else "san_sang", i + 1)
    thon: dict[str, list[str]] = {}
    for ten_tn, kind, xa, *_ in D.PLACE_NAMES:
        if kind == "thon":
            thon.setdefault(xa, []).append(ten_tn)
    for j, (xa, loai, *_) in enumerate(D.COMMUNES):
        ma_xa = D.unit_code(xa)
        chu_tich = them(goc, "xa", f"UBND {'phường' if loai == 'phuong' else 'xã'} {xa}", f"{HO[j % 14]} {TEN[j % 10]}",
                        "Chủ tịch UBND – Trưởng BCH PCTT cấp xã", rng.choice(["truc", "truc", "san_sang", "vang"]), j, ma_xa)
        them(chu_tich, "xa", f"Công an {xa}", f"{HO[(j + 3) % 14]} {TEN[(j + 4) % 10]}", "Trưởng Công an xã", "truc", 1, ma_xa)
        them(chu_tich, "xa", f"Ban CHQS {xa}", f"{HO[(j + 6) % 14]} {TEN[(j + 7) % 10]}", "Chỉ huy trưởng Ban CHQS xã", "san_sang", 2, ma_xa)
        for k, ten_tn in enumerate(thon.get(xa, [])):
            them(chu_tich, "thon", ten_tn, f"{HO[(j + k + 9) % 14]} {TEN[(j + k + 2) % 10]}", "Trưởng thôn / Tổ trưởng", "truc", 3 + k, ma_xa)
    cot = ["ma", "ma_cap_tren", "cap", "co_quan", "ho_ten", "chuc_vu", "sdt", "tan_so_vo_tuyen", "trang_thai", "thu_tu", "ma_xa"]
    return bang(cot, rows), len(rows)


def _cac_kho() -> list[tuple]:
    return list(D.WAREHOUSES) + [(f"K-XA-{D.slug(x)}", f"Kho xã {x} (giả định)", "xa", x) for x in KHO_XA]


def kho() -> tuple[str, int]:
    rows = []
    for i, (ma, ten, cap, xa) in enumerate(_cac_kho()):
        lat, lon = diem_trong_xa(xa)
        rows.append({"ma": ma, "ten": ten, "cap": cap, "thu_kho": f"Thủ kho {ten.split()[-1]}", "sdt": sdt(400 + i), "vi_do": lat, "kinh_do": lon,
                     "ma_xa": D.unit_code(xa)})
    return bang(["ma", "ten", "cap", "thu_kho", "sdt", "vi_do", "kinh_do", "ma_xa"], rows), len(rows)


def ton_kho() -> tuple[str, int]:
    rows = []
    for ma, _, cap, _xa in _cac_kho():
        for vat_tu, goc in D.ITEM_QUOTA.items():
            dinh_muc = max(1, round(goc * HE_SO_KHO[cap]))
            so_luong = round(dinh_muc * (rng.uniform(0.05, 0.18) if (ma, vat_tu) in SAP_HET else rng.uniform(0.45, 1.25)))
            han = ""
            if vat_tu in CO_HAN_DUNG:
                ngay = rng.randint(12, 25) if (ma, vat_tu) in SAP_HET_HAN else rng.randint(120, 540)
                han = (NGAY_GOC + timedelta(days=ngay)).isoformat()
            rows.append({"ma_kho": ma, "ma_vat_tu": vat_tu, "so_luong": so_luong, "dinh_muc": dinh_muc, "han_su_dung": han})
    return bang(["ma_kho", "ma_vat_tu", "so_luong", "dinh_muc", "han_su_dung"], rows), len(rows)


VI_TRI_LL: dict[str, tuple[float, float]] = {}
# Xã có kho riêng nhưng chưa có đơn vị nào trong seed_data: thêm một tiểu đội để trang cấp xã có lực lượng, phương tiện
_XA_CO_LL = {f[4] for f in D.FORCES}
LL_THEM = [
    (f"F-XA-{D.slug(x)}", f"Tiểu đội dân quân xã {x} (giả định)", "dan_quan", "xa", x, f"{HO[i % 14]} {TEN[i % 10]}", 12, ["so_cuu", "cuu_ho_sat_lo"])
    for i, x in enumerate(KHO_XA)
    if x not in _XA_CO_LL
]


def luc_luong() -> tuple[str, int]:
    rows = []
    for i, (ma, ten, loai, cap, xa, chi_huy, tong, ky_nang) in enumerate(list(D.FORCES) + LL_THEM):
        lat, lon = diem_trong_xa(xa)
        VI_TRI_LL[ma] = (lat, lon)
        rows.append({"ma": ma, "ten": ten, "loai": loai, "cap": cap, "noi_dong_quan": f"Trụ sở tại {xa}", "chi_huy": chi_huy, "sdt": sdt(200 + i),
                     "tan_so_vo_tuyen": f"{142 + i * 0.125:.3f} MHz", "quan_so": tong, "san_sang": tong - rng.randint(0, max(1, tong // 8)),
                     "ky_nang": ";".join(ky_nang), "vi_do": lat, "kinh_do": lon, "ma_xa": D.unit_code(xa)})
    cot = ["ma", "ten", "loai", "cap", "noi_dong_quan", "chi_huy", "sdt", "tan_so_vo_tuyen", "quan_so", "san_sang", "ky_nang", "vi_do", "kinh_do", "ma_xa"]
    return bang(cot, rows), len(rows)


def phuong_tien() -> tuple[str, int]:
    rows = []
    them = [(f"CB-GL-{ll[0][5:]}", f"Xe tải {ll[4]} (giả định)", "xe_tai", "duong_bo", ll[0], 8) for ll in LL_THEM]
    for i, (ma, ten, loai, nhom, ma_ll, suc_cho) in enumerate(list(D.VEHICLES) + them):
        lat, lon = VI_TRI_LL[ma_ll]
        # Đủ mọi mức nhiên liệu cho bộ lọc: chưa báo, dưới 20%, dưới 50%
        muc = "" if i % 11 == 10 else 15 if i % 13 == 12 else rng.choice([35, 55, 70, 80, 90, 100, 100])
        rows.append({"ma": ma, "ten": ten, "loai": loai, "nhom": nhom, "ma_luc_luong": ma_ll, "suc_cho": suc_cho,
                     "trang_thai": "bao_duong" if ma in ("CB-X04", "CB-MX03", "CB-FC03") else "san_sang", "nhien_lieu": muc,
                     "vi_do": round(lat + rng.uniform(-0.002, 0.002), 5), "kinh_do": round(lon + rng.uniform(-0.002, 0.002), 5)})
    return bang(["ma", "ten", "loai", "nhom", "ma_luc_luong", "suc_cho", "trang_thai", "nhien_lieu", "vi_do", "kinh_do"], rows), len(rows)


def cay_xang() -> tuple[str, int]:
    rows = []
    for i, xa in enumerate(["Tân Giang", "Nguyên Bình", "Bảo Lạc", "Trùng Khánh", "Đông Khê", "Bảo Lâm"], 1):
        lat, lon = diem_trong_xa(xa)
        suc_chua = 40_000 if xa == "Tân Giang" else 15_000
        rows.append({"ma": f"CB-CX-{i:03d}", "ten": f"Điểm tiếp nhiên liệu {xa}", "xang_l": round(suc_chua * rng.uniform(0.15, 0.5)),
                     "dau_l": round(suc_chua * rng.uniform(0.2, 0.5)), "suc_chua_l": suc_chua, "vi_do": lat, "kinh_do": lon, "ma_xa": D.unit_code(xa)})
    return bang(["ma", "ten", "xang_l", "dau_l", "suc_chua_l", "vi_do", "kinh_do", "ma_xa"], rows), len(rows)


# Thứ tự = thứ tự nhập: bảng tham chiếu đứng trước (trạm trước kịch bản ngập, kho trước tồn kho, lực lượng trước phương tiện)
BO: list[tuple[str, str, object]] = [
    ("ranh_gioi_xa", "geojson", ranh_gioi_xa),
    ("xom", "csv", xom),
    ("nhom_loc_nhanh", "csv", nhom_loc_nhanh),
    ("tram_quan_trac", "csv", tram_quan_trac),
    ("ngap_kich_ban", "geojson", ngap_kich_ban),
    ("vung_nguy_hiem", "geojson", vung_nguy_hiem),
    ("diem_nguy_hiem", "csv", diem_nguy_hiem),
    ("diem_den_sat_lo", "csv", diem_den_sat_lo),
    ("diem_so_tan", "csv", diem_so_tan),
    ("danh_ba", "csv", danh_ba),
    ("kho", "csv", kho),
    ("ton_kho", "csv", ton_kho),
    ("luc_luong", "csv", luc_luong),
    ("phuong_tien", "csv", phuong_tien),
    ("cay_xang", "csv", cay_xang),
]


def main() -> int:
    check = "--check" in sys.argv
    tep: dict[str, str] = {}
    muc_luc = []
    for i, (ten, duoi, ham) in enumerate(BO, 1):
        noi_dung, so_dong = ham()
        ten_tep = f"{i:02d}_{ten}.{duoi}"
        tep[ten_tep] = noi_dung
        muc_luc.append({"loai": ten, "tep": ten_tep, "so_dong": so_dong})
    tep["muc_luc.json"] = json.dumps({"ngay_goc": NGAY_GOC.isoformat(), "tep": muc_luc}, ensure_ascii=False, indent=2) + "\n"
    if check:
        lech = [t for t, nd in tep.items() if not (RA / t).exists() or (RA / t).read_bytes() != nd.encode("utf-8")]
        thua = sorted(p.name for p in RA.glob("*") if p.name not in tep) if RA.exists() else []
        if lech or thua:
            print(f"Bộ tệp lệch với seed_data.py — chạy lại tao_bo_du_lieu.py. Lệch: {lech}; thừa: {thua}")
            return 1
        print(f"Bộ tệp khớp seed_data.py ({len(muc_luc)} loại, {sum(m['so_dong'] for m in muc_luc)} dòng)")
        return 0
    RA.mkdir(exist_ok=True)
    for t, nd in tep.items():
        (RA / t).write_bytes(nd.encode("utf-8"))
    for m in muc_luc:
        print(f"{m['tep']:32} {m['so_dong']:>5} dòng")
    return 0


if __name__ == "__main__":
    sys.exit(main())
