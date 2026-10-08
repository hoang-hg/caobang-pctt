"""Kiểm tra và nhập dữ liệu từ tệp theo khai báo ở ``specs.py``.

Hai bước: ``validate`` (không ghi gì — trả báo cáo lỗi theo dòng, số bản ghi thêm / cập nhật / xoá) rồi ``apply``
(kiểm tra lại, ghi trong MỘT transaction có khoá theo loại dữ liệu — lỗi giữa chừng thì không ghi gì).
Tên bảng / cột trong SQL chỉ lấy từ khai báo; mọi giá trị người dùng đi qua tham số bind.

``scope`` (danh sách mã xã, ``None`` = toàn tỉnh): hồ sơ do xã/phường gửi — mọi bản ghi phải thuộc các xã này, đúng
cấp (``SUBMITTABLE``), không ghi đè bản ghi của xã khác / cấp tỉnh; "thay toàn bộ" chỉ xoá trong các xã này.
"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import text

from app.area import IN_PROVINCE_SQL
from app.db import engine, fetch_all, fetch_one
from app.services.data_import.parsing import (
    CONVERTERS,
    ImportFileError,
    RawRow,
    read_file,
    strip_accents,
    to_enum,
)
from app.services.data_import.specs import DATASETS, SCOPED_REPLACE_EXTRA, SUBMITTABLE, Dataset, Field

log = logging.getLogger(__name__)

MAX_ISSUES = 300
PREVIEW_ROWS = 20
CHANGE_LIMIT = 300  # số dòng tối đa mỗi nhóm (thêm / sửa / xoá) trong bản xem trước cho người duyệt
POINT_EXPR = "ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)"
POLYGON_EXPR = "ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON(:geom), 4326)), 3))"


@dataclass
class Issue:
    row: int  # 0 = cả tệp
    field: str | None
    message: str


@dataclass
class Prepared:
    number: int
    values: dict[str, Any]  # tên trường trong tệp → giá trị đã chuẩn hoá
    lat: float | None = None
    lon: float | None = None
    geojson: str | None = None
    ma_xa: str | None = None  # xã ghi vào admin_unit_id (theo tệp, trống = theo vị trí)
    located_xa: str | None = None  # xã chứa vị trí / vùng (kiểm tra phạm vi hồ sơ của xã)


@dataclass
class Report:
    dataset: str
    total: int = 0
    errors: list[Issue] = field(default_factory=list)
    warnings: list[Issue] = field(default_factory=list)
    creates: int = 0
    updates: int = 0
    deletes: int = 0
    preview: list[dict] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.errors

    def error(self, row: int, fld: str | None, message: str) -> None:
        self.errors.append(Issue(row, fld, message))

    def warn(self, row: int, fld: str | None, message: str) -> None:
        self.warnings.append(Issue(row, fld, message))

    def to_dict(self) -> dict:
        def issues(items: list[Issue]) -> list[dict]:
            return [i.__dict__ for i in items[:MAX_ISSUES]]

        return {
            "dataset": self.dataset,
            "total": self.total,
            "valid": self.total - len({i.row for i in self.errors if i.row}),
            "ok": self.ok,
            "error_count": len(self.errors),
            "errors": issues(self.errors),
            "warning_count": len(self.warnings),
            "warnings": issues(self.warnings),
            "creates": self.creates,
            "updates": self.updates,
            "deletes": self.deletes,
            "preview": self.preview,
        }


def get_dataset(name: str) -> Dataset:
    if name not in DATASETS:
        raise ImportFileError(f"Không có loại dữ liệu “{name}”")
    return DATASETS[name]


# ------------------------------------------------------------------ bước 1: chuyển đổi từng dòng (thuần)


def _convert(fld: Field, raw: Any) -> Any:
    if fld.kind == "enum":
        return to_enum(raw, fld.choices)
    conv = CONVERTERS.get(fld.kind)
    return conv(raw) if conv else str(raw).strip()


def convert_rows(ds: Dataset, rows: list[RawRow], report: Report) -> list[Prepared]:
    known = {f.name for f in ds.fields}
    unused = sorted({k for r in rows for k in r.values if k not in known and r.geometry is None})
    if unused:
        report.warn(0, None, f"Bỏ qua cột không dùng: {', '.join(unused)}")
    prepared: list[Prepared] = []
    for raw in rows:
        values: dict[str, Any] = {}
        for fld in ds.fields:
            v = raw.values.get(fld.name)
            if v is None or (isinstance(v, str) and not v.strip()):
                if fld.required:
                    report.error(raw.number, fld.name, f"Thiếu {fld.label.lower()}")
                values[fld.name] = (
                    _convert(fld, fld.default) if fld.default not in (None, "") else fld.default
                )
                continue
            try:
                value = _convert(fld, v)
            except ValueError as exc:
                report.error(raw.number, fld.name, str(exc))
                continue
            if isinstance(value, int | float) and not isinstance(value, bool):
                if fld.min is not None and value < fld.min:
                    report.error(raw.number, fld.name, f"{value} nhỏ hơn {fld.min:g}")
                if fld.max is not None and value > fld.max:
                    report.error(raw.number, fld.name, f"{value} lớn hơn {fld.max:g}")
            values[fld.name] = value
        row = Prepared(raw.number, values)
        _geometry(ds, raw, row, report)
        _row_checks(ds, row, report)
        prepared.append(row)
    return prepared


def _geometry(ds: Dataset, raw: RawRow, row: Prepared, report: Report) -> None:
    geom = raw.geometry
    if ds.geometry == "point":
        lat, lon = row.values.get("vi_do"), row.values.get("kinh_do")
        if geom and geom.get("type") == "Point" and lat is None and lon is None:
            coords = geom.get("coordinates") or []
            if len(coords) >= 2 and all(isinstance(c, int | float) for c in coords[:2]):
                lon, lat = float(coords[0]), float(coords[1])
            else:
                report.error(raw.number, "geometry", "Toạ độ Point không hợp lệ")
                return
        if lat is None and lon is None:
            if ds.geometry_required:
                report.error(raw.number, "vi_do", "Thiếu vị trí (vi_do, kinh_do hoặc hình học Point)")
            return
        if lat is None or lon is None:
            report.error(raw.number, "vi_do" if lat is None else "kinh_do", "Phải có cả vĩ độ và kinh độ")
            return
        if not (20 <= lat <= 25 and 103 <= lon <= 108):
            report.error(
                raw.number,
                "vi_do",
                f"Toạ độ ({lat}, {lon}) không thuộc khu vực Cao Bằng — kiểm tra thứ tự vĩ độ / kinh độ",
            )
            return
        row.lat, row.lon = lat, lon
    elif ds.geometry == "polygon":
        if not geom:
            report.error(raw.number, "geometry", "Thiếu hình học vùng (Polygon / MultiPolygon)")
        elif geom.get("type") not in ("Polygon", "MultiPolygon") or not geom.get("coordinates"):
            report.error(
                raw.number,
                "geometry",
                f"Hình học {geom.get('type')} không hợp lệ — cần Polygon / MultiPolygon",
            )
        else:
            row.geojson = json.dumps(geom)


# Loại đứng trước tên, bỏ khi sinh mã. KHÔNG bỏ "Bản": là một phần tên riêng (Bản Ngắn, Bản Giốc)
XOM_PREFIX = re.compile(r"^(xom|thon|to dan pho|to|khu|khoi)\s+")


def xom_sort_key(ten: str) -> str:
    """Sắp xếp tên xóm: không dấu, bỏ "Xóm/Thôn/Tổ" đứng trước, số theo giá trị (Tổ 2 trước Tổ 10)."""
    name = XOM_PREFIX.sub("", " ".join(strip_accents(ten).lower().split()))
    return re.sub(r"\d+", lambda m: m.group().zfill(6), name)


def xom_code(ma_xa: str, ten: str) -> str:
    """Mã xóm tự sinh: <mã xã>-<tên không dấu, bỏ “Xóm/Thôn/Tổ dân phố” đứng trước> — “Xóm Nà Pò” = “Nà Pò”."""
    name = XOM_PREFIX.sub("", " ".join(strip_accents(ten).lower().split()))
    return f"{ma_xa}-{re.sub(r'[^A-Za-z0-9]', '', name).upper()[:40]}"


def _row_checks(ds: Dataset, row: Prepared, report: Report) -> None:
    v = row.values
    if ds.name == "xom" and not v.get("ma") and v.get("ma_xa") and v.get("ten"):
        v["ma"] = xom_code(v["ma_xa"], v["ten"])
    if ds.name == "diem_so_tan" and v.get("dang_o") is not None and v.get("suc_chua") is not None:
        if v["dang_o"] > v["suc_chua"]:
            report.error(row.number, "dang_o", "Số người đang ở lớn hơn sức chứa")
    if ds.name == "luc_luong" and v.get("quan_so") is not None:
        if v.get("san_sang") is None:
            v["san_sang"] = v["quan_so"]
        elif v["san_sang"] > v["quan_so"]:
            report.error(row.number, "san_sang", "Quân số sẵn sàng lớn hơn quân số")
    if ds.name == "tram_quan_trac":
        levels = [v.get(k) for k in ("bao_dong_1", "bao_dong_2", "bao_dong_3")]
        given = [x for x in levels if x is not None]
        if v.get("loai") == "muc_nuoc":
            # Cấp báo động cho người dân tính từ các ngưỡng này (alarm_level lấy cấp CAO NHẤT bị vượt): đảo thứ tự / gõ
            # nhầm (18.1 thay 181) là báo sai cấp cho cả lưu vực → không nhập
            if any(a >= b for a, b in zip(given, given[1:], strict=False)):
                report.error(
                    row.number,
                    "bao_dong_1",
                    "Ngưỡng báo động trạm mực nước phải tăng dần I < II < III — kiểm tra lại với văn bản gốc",
                )
        elif given != sorted(given):
            report.warn(
                row.number, "bao_dong_1", "Ngưỡng báo động không tăng dần I ≤ II ≤ III — kiểm tra lại"
            )
    if ds.name == "ngap_kich_ban" and (v.get("cap_bao_dong") is None) == (v.get("muc_nuoc_m") is None):
        report.error(
            row.number,
            "cap_bao_dong",
            "Ghi đúng một ngưỡng kích hoạt: cấp báo động (1–3) HOẶC mực nước (m) — không để trống cả hai, không ghi cả hai",
        )
    if ds.name == "nhom_loc_nhanh" and v.get("danh_sach_xa") == []:  # ô chỉ có dấu phân cách
        report.error(row.number, "danh_sach_xa", "Nhóm phải có ít nhất 1 xã/phường")
    if ds.name == "cay_xang" and None not in (v.get("xang_l"), v.get("dau_l"), v.get("suc_chua_l")):
        if v["xang_l"] + v["dau_l"] > v["suc_chua_l"]:
            report.warn(row.number, "suc_chua_l", "Tổng xăng + dầu lớn hơn sức chứa")


def key_of(ds: Dataset, row: Prepared) -> tuple:
    """Khoá so trùng trong tệp: theo mã trong tệp (VD inventory = (ma_kho, ma_vat_tu))."""
    if ds.refs and any(r.column in ds.key for r in ds.refs):
        return tuple(row.values.get(r.field) for r in ds.refs if r.column in ds.key)
    return tuple(row.values.get(f.name) for f in ds.fields if f.column in ds.key)


def check_duplicates(ds: Dataset, rows: list[Prepared], report: Report) -> None:
    seen: dict[tuple, int] = {}
    for row in rows:
        key = key_of(ds, row)
        if None in key:
            continue
        if key in seen:
            report.error(row.number, None, f"Trùng mã {' / '.join(map(str, key))} với dòng {seen[key]}")
        else:
            seen[key] = row.number


# ------------------------------------------------------------------ bước 2: kiểm tra với CSDL


async def check_database(
    ds: Dataset, rows: list[Prepared], report: Report, replace: bool, scope: list[str] | None = None
) -> None:
    await _check_communes(ds, rows, report)
    if ds.name == "xom":
        await _check_xom_codes(rows, report)
    if ds.geometry == "point":
        await _check_points(ds, rows, report)
    elif ds.geometry == "polygon":
        await _check_polygons(ds, rows, report)
    elif ds.admin_unit:  # không có vị trí (danh bạ): xã lấy theo cột ma_xa
        for row in rows:
            row.ma_xa = row.values.get("ma_xa")
    await _check_refs(ds, rows, report, replace, scope)
    if ds.name == "ngap_kich_ban":
        await _check_flood_triggers(rows, report)
    if ds.name == "nhom_loc_nhanh":
        await _check_preset_units(rows, report)
    if scope is not None:
        await _check_scope(ds, rows, report, scope)
    await _count_changes(ds, rows, report, replace, scope)


async def _check_flood_triggers(rows: list[Prepared], report: Report) -> None:
    """Vùng ngập theo cấp báo động: trạm phải có ngưỡng cấp đó (không có → vùng không bao giờ bật được)."""
    codes = {r.values["ma_tram"] for r in rows if r.values.get("ma_tram") and r.values.get("cap_bao_dong")}
    if not codes:
        return
    found = await fetch_all(
        "SELECT id, alarm_thresholds AS thr FROM iot_telemetry.monitoring_stations WHERE id = ANY(:c)",
        {"c": list(codes)},
    )
    thresholds = {r["id"]: r["thr"] or {} for r in found}
    for row in rows:
        code, level = row.values.get("ma_tram"), row.values.get("cap_bao_dong")
        if code in thresholds and level and thresholds[code].get(f"bd{level}") is None:
            report.error(
                row.number,
                "cap_bao_dong",
                f"Trạm {code} chưa có ngưỡng báo động cấp {level} — nhập ngưỡng cho trạm trước, hoặc ghi mực nước (m)",
            )


def plain_unit_name(name: str) -> str:
    """'Xã Cô Ba' / 'co  ba' → 'co ba': so khớp tên xã/phường không dấu, bỏ chữ "xã" / "phường" / "thị trấn" ở đầu."""
    s = re.sub(r"\s+", " ", strip_accents(name).lower()).strip()
    return re.sub(r"^(xa|phuong|thi tran) ", "", s)


async def _xa_units() -> tuple[list[dict], dict[str, list[str]]]:
    """(56 xã/phường: mã, tên; tên không dấu → các mã — tên trùng nhau thì có nhiều mã)."""
    units = await fetch_all("SELECT code, name FROM spatial_admin.administrative_units WHERE level = 'xa'")
    by_name: dict[str, list[str]] = {}
    for u in units:
        by_name.setdefault(plain_unit_name(u["name"]), []).append(u["code"])
    return units, by_name


async def _check_preset_units(rows: list[Prepared], report: Report) -> None:
    """Nhóm lọc nhanh: mỗi mục là mã hoặc tên xã/phường đang có → ghi mã. Tên trùng nhiều xã → yêu cầu ghi mã. Mã
    nhóm không được trùng nhóm hệ thống (kind khác 'luu_vuc' — bị ``conflict_where`` bỏ qua → tưởng đã nhập)."""
    units, by_name = await _xa_units()
    by_code = {u["code"].upper(): u["code"] for u in units}
    reserved = {
        r["code"] for r in await fetch_all("SELECT code FROM spatial_admin.presets WHERE kind <> 'luu_vuc'")
    }
    for row in rows:
        if row.values.get("ma") in reserved:
            report.error(
                row.number,
                "ma",
                f"Mã {row.values['ma']} trùng mã nhóm hệ thống — chọn mã khác",
            )
        codes: list[str] = []
        unknown: list[str] = []
        ambiguous: list[str] = []
        for item in row.values.get("danh_sach_xa") or []:
            code = by_code.get(item.upper())
            if code is None:
                found = by_name.get(plain_unit_name(item), [])
                if len(found) == 1:
                    code = found[0]
                else:
                    (ambiguous if found else unknown).append(item)
            if code and code not in codes:
                codes.append(code)
        if unknown:
            report.error(row.number, "danh_sach_xa", f"Không có xã/phường: {', '.join(unknown)}")
        if ambiguous:
            report.error(
                row.number,
                "danh_sach_xa",
                f"Tên trùng nhiều xã/phường — ghi mã thay tên: {', '.join(ambiguous)}",
            )
        if row.values.get("danh_sach_xa") is not None:
            row.values["danh_sach_xa"] = codes


async def template_rows(ds: Dataset) -> list[dict[str, str]] | None:
    """Dòng điền sẵn cho tệp mẫu (``None`` = một dòng ví dụ). Nhóm lọc nhanh: các nhóm đang dùng — BCH sửa trên danh
    sách hiện có thay vì gõ lại; xã ghi theo tên (dễ đọc), tên trùng nhiều xã thì ghi mã."""
    if ds.name != "nhom_loc_nhanh":
        return None
    units, by_name = await _xa_units()
    label = {
        u["code"]: u["name"] if len(by_name[plain_unit_name(u["name"])]) == 1 else u["code"] for u in units
    }
    presets = await fetch_all(
        """SELECT code, name, description, hazard, unit_codes FROM spatial_admin.presets
            WHERE kind = 'luu_vuc' ORDER BY code"""
    )
    return [
        {
            "ma": p["code"],
            "ten": p["name"],
            "mo_ta": p["description"] or "",
            "loai_thien_tai": p["hazard"] or "tong_hop",
            "danh_sach_xa": "; ".join(label.get(c, c) for c in p["unit_codes"]),
        }
        for p in presets
    ] or None


async def _check_communes(ds: Dataset, rows: list[Prepared], report: Report) -> None:
    if not ds.admin_unit:
        return
    given = {r.values["ma_xa"] for r in rows if r.values.get("ma_xa")}
    if not given:
        return
    found = await fetch_all(
        "SELECT code FROM spatial_admin.administrative_units WHERE level = 'xa' AND code = ANY(:c)",
        {"c": list(given)},
    )
    known = {r["code"] for r in found}
    for row in rows:
        code = row.values.get("ma_xa")
        if code and code not in known:
            report.error(row.number, "ma_xa", f"Không có xã/phường mã {code}")


async def _check_xom_codes(rows: list[Prepared], report: Report) -> None:
    """Mã xóm trùng mã tỉnh / xã (cùng bảng) → ghi đè đơn vị hành chính khác → chặn."""
    codes = [r.values["ma"] for r in rows if r.values.get("ma")]
    taken = await fetch_all(
        """SELECT code, level FROM spatial_admin.administrative_units
            WHERE code = ANY(:c) AND level <> 'thon'""",
        {"c": codes},
    )
    clash = {r["code"]: r["level"] for r in taken}
    for row in rows:
        code = row.values.get("ma")
        if code in clash:
            report.error(
                row.number, "ma", f"Mã {code} đang là mã {'tỉnh' if clash[code] == 'tinh' else 'xã/phường'}"
            )


async def _check_points(ds: Dataset, rows: list[Prepared], report: Report) -> None:
    located = [r for r in rows if r.lat is not None]
    if not located:
        return
    inside = IN_PROVINCE_SQL.replace(":lon", "t.lon").replace(":lat", "t.lat")  # áp cho từng dòng của unnest
    result = await fetch_all(
        f"""SELECT t.i, {inside} AS inside,
                   (SELECT u.code FROM spatial_admin.administrative_units u WHERE u.level = 'xa'
                     ORDER BY u.geom <-> ST_SetSRID(ST_MakePoint(t.lon, t.lat), 4326) LIMIT 1) AS nearest
              FROM unnest(CAST(:i AS int[]), CAST(:la AS float8[]), CAST(:lo AS float8[])) AS t(i, lat, lon)
              JOIN spatial_admin.administrative_units p ON p.code = 'CB'""",
        {"i": list(range(len(located))), "la": [r.lat for r in located], "lo": [r.lon for r in located]},
    )
    for res in result:
        row = located[res["i"]]
        if not res["inside"]:
            report.error(row.number, "vi_do", f"Vị trí ({row.lat}, {row.lon}) nằm ngoài tỉnh Cao Bằng")
            continue
        _assign_commune(ds, row, res["nearest"], report)


async def _check_polygons(ds: Dataset, rows: list[Prepared], report: Report) -> None:
    for row in rows:
        if not row.geojson:
            continue
        try:
            res = await fetch_one(
                """WITH g AS (SELECT ST_SetSRID(ST_GeomFromGeoJSON(:geom), 4326) AS raw),
                        f AS (SELECT raw, ST_Multi(ST_CollectionExtract(ST_MakeValid(raw), 3)) AS fixed FROM g)
                    SELECT ST_IsValid(raw) AS valid, ST_IsValidReason(raw) AS reason, ST_IsEmpty(fixed) AS empty,
                           ST_Intersects(fixed, (SELECT geom FROM spatial_admin.administrative_units WHERE code = 'CB'))
                             AS inside,
                           (SELECT u.code FROM spatial_admin.administrative_units u WHERE u.level = 'xa'
                             ORDER BY u.geom <-> ST_PointOnSurface(fixed) LIMIT 1) AS nearest
                      FROM f""",
                {"geom": row.geojson},
            )
        except Exception:  # GeoJSON hình học hỏng → PostGIS báo lỗi
            report.error(row.number, "geometry", "Hình học không đọc được")
            continue
        if res["empty"]:
            report.error(row.number, "geometry", "Hình học rỗng sau khi sửa lỗi")
            continue
        if not res["valid"]:
            report.warn(
                row.number, "geometry", f"Hình học lỗi ({res['reason']}) — hệ thống sẽ tự sửa (ST_MakeValid)"
            )
        if not res["inside"]:
            report.error(row.number, "geometry", "Vùng nằm ngoài tỉnh Cao Bằng")
            continue
        _assign_commune(ds, row, res["nearest"], report)


def _assign_commune(ds: Dataset, row: Prepared, nearest: str | None, report: Report) -> None:
    row.located_xa = nearest
    if not ds.admin_unit:
        return
    given = row.values.get("ma_xa")
    if given and nearest and given != nearest:
        report.warn(row.number, "ma_xa", f"Vị trí thuộc {nearest} nhưng tệp ghi {given} — dùng {given}")
    row.ma_xa = given or nearest


async def _check_refs(
    ds: Dataset, rows: list[Prepared], report: Report, replace: bool, scope: list[str] | None = None
) -> None:
    for ref in ds.refs:
        codes = {r.values[ref.field] for r in rows if r.values.get(ref.field)}
        if not codes:
            continue
        found = await fetch_all(
            f"SELECT {ref.key} AS k FROM {ref.table} WHERE {ref.key} = ANY(:c) AND ({ref.where})",
            {"c": list(codes)},
        )
        known = {r["k"] for r in found}
        for row in rows:
            code = row.values.get(ref.field)
            if code and code not in known:
                report.error(row.number, ref.field, f"Không có mã {code} ({ref.table.split('.')[-1]})")
    if ds.name == "danh_ba":
        in_file = {r.values.get("ma") for r in rows}
        parents = {r.values["ma_cap_tren"] for r in rows if r.values.get("ma_cap_tren")}
        in_db = set()
        if parents - in_file:
            found = await fetch_all(
                """SELECT c.code, c.level, u.code AS xa FROM communications.contacts c
                     LEFT JOIN spatial_admin.administrative_units u ON u.id = c.admin_unit_id
                    WHERE c.code = ANY(:c)""",
                {"c": list(parents - in_file)},
            )
            # Thay toàn bộ: dòng cấp trên không có trong tệp sẽ bị xoá — trừ khi nằm ngoài phần bị thay (hồ sơ của
            # xã chỉ thay danh bạ cấp xã / thôn của xã mình → cấp trên là dòng cấp tỉnh / xã khác vẫn còn)
            in_db = {
                r["code"]
                for r in found
                if not replace or (scope is not None and (r["level"] == "tinh" or r["xa"] not in scope))
            }
        for row in rows:
            parent = row.values.get("ma_cap_tren")
            if parent and parent == row.values.get("ma"):
                report.error(row.number, "ma_cap_tren", "Dòng không thể là cấp trên của chính nó")
            elif parent and parent not in in_file and parent not in in_db:
                hint = " (chế độ thay toàn bộ: cấp trên phải có trong tệp)" if replace else ""
                report.error(row.number, "ma_cap_tren", f"Không có dòng cấp trên mã {parent}{hint}")


# Chủ sở hữu (xã, cấp) của bản ghi đã có cùng mã — hồ sơ của xã không được ghi đè bản ghi xã khác / cấp tỉnh
_OWNER_SQL = {
    "xom": """SELECT c.code AS k, p.code AS xa, 'xa' AS level FROM spatial_admin.administrative_units c
                LEFT JOIN spatial_admin.administrative_units p ON p.id = c.parent_id WHERE c.code = ANY(:k)""",
    "phuong_tien": """SELECT v.code AS k, u.code AS xa, f.level FROM resources.vehicles v
                        LEFT JOIN resources.forces f ON f.id = v.force_id
                        LEFT JOIN spatial_admin.administrative_units u ON u.id = f.admin_unit_id
                       WHERE v.code = ANY(:k)""",
}


def _owner_sql(ds: Dataset) -> str | None:
    if ds.name in _OWNER_SQL:
        return _OWNER_SQL[ds.name]
    if not ds.admin_unit:
        return None
    cap = ds.get_field("cap")
    level = f"t.{cap.column}" if cap else "NULL"
    return f"""SELECT t.{ds.key[0]} AS k, u.code AS xa, {level} AS level FROM {ds.table} t
                 LEFT JOIN spatial_admin.administrative_units u ON u.id = t.admin_unit_id
                WHERE t.{ds.key[0]} = ANY(:k)"""


async def _check_scope(ds: Dataset, rows: list[Prepared], report: Report, scope: list[str]) -> None:
    """Hồ sơ của xã/phường: loại dữ liệu được gửi, đúng cấp, mọi bản ghi (vị trí + mã xã) thuộc phạm vi người gửi,
    tham chiếu (kho, lực lượng) là của xã mình, không ghi đè bản ghi đã có của xã khác / cấp tỉnh."""
    rules = SUBMITTABLE.get(ds.name)
    if rules is None:
        report.error(0, None, f"{ds.label} do cấp tỉnh nhập — xã/phường không gửi được")
        return
    allowed = set(scope)
    bad = {i.row for i in report.errors}
    for row in rows:
        if row.number in bad:
            continue
        v = row.values
        for fld, ok in rules.items():
            if v.get(fld) is not None and v[fld] not in ok:
                report.error(row.number, fld, f"Xã/phường chỉ gửi {ds.label.lower()} cấp: {', '.join(ok)}")
        own = v.get("ma_xa") if ds.name == "xom" else row.ma_xa
        if ds.admin_unit or ds.name == "xom":
            if not own:
                report.error(row.number, "ma_xa", "Thiếu mã xã/phường — ghi mã xã bạn phụ trách")
            elif own not in allowed:
                report.error(row.number, "ma_xa", f"Xã {own} ngoài phạm vi bạn phụ trách")
        if row.located_xa and row.located_xa not in allowed:
            report.error(
                row.number,
                "geometry" if ds.geometry == "polygon" else "vi_do",
                f"Vị trí thuộc {row.located_xa} — ngoài phạm vi bạn phụ trách",
            )
    # Tham chiếu phải là của xã mình, cấp xã: tồn kho → kho, phương tiện → lực lượng quản lý
    for ref_field, table, label in (
        ("ma_kho", "resources.warehouses", "Kho"),
        ("ma_luc_luong", "resources.forces", "Lực lượng"),
    ):
        if not ds.get_field(ref_field):
            continue
        codes = {r.values[ref_field] for r in rows if r.values.get(ref_field)}
        found = await fetch_all(
            f"""SELECT t.code, t.level, u.code AS xa FROM {table} t
                  LEFT JOIN spatial_admin.administrative_units u ON u.id = t.admin_unit_id
                 WHERE t.code = ANY(:c)""",
            {"c": list(codes)},
        )
        owner = {r["code"]: r for r in found}
        for row in rows:
            code = row.values.get(ref_field)
            if not code:
                report.error(row.number, ref_field, f"Ghi mã {label.lower()} cấp xã của xã bạn phụ trách")
            elif code in owner and (owner[code]["level"] != "xa" or owner[code]["xa"] not in allowed):
                report.error(
                    row.number,
                    ref_field,
                    f"{label} {code} không phải {label.lower()} cấp xã thuộc phạm vi bạn phụ trách",
                )
    sql = _owner_sql(ds)
    if sql:
        keys = [key_of(ds, r)[0] for r in rows if key_of(ds, r)[0] is not None]
        existing = {r["k"]: r for r in await fetch_all(sql, {"k": keys})}
        for row in rows:
            old = existing.get(key_of(ds, row)[0])
            if old is None:
                continue
            level_ok = not rules.get("cap") or old["level"] in rules["cap"]
            if ds.name == "phuong_tien":
                level_ok = old["level"] == "xa"
            if old["xa"] not in allowed or not level_ok:
                report.error(
                    row.number,
                    ds.fields[0].name,
                    f"Mã {key_of(ds, row)[0]} đã có và thuộc {old['xa'] or 'cấp tỉnh'} — không sửa được, dùng mã khác",
                )


async def _existing_keys(ds: Dataset, rows: list[Prepared]) -> set[tuple]:
    if ds.table == "resources.inventory":
        found = await fetch_all(
            """SELECT w.code AS a, i.item_code AS b FROM resources.inventory i
                 JOIN resources.warehouses w ON w.id = i.warehouse_id
                WHERE (w.code, i.item_code) IN (SELECT * FROM unnest(CAST(:a AS text[]), CAST(:b AS text[])))""",
            {"a": [r.values.get("ma_kho") for r in rows], "b": [r.values.get("ma_vat_tu") for r in rows]},
        )
        return {(r["a"], r["b"]) for r in found}
    col = ds.key[0]
    keys = [key_of(ds, r)[0] for r in rows if key_of(ds, r)[0] is not None]
    found = await fetch_all(f"SELECT {col} AS k FROM {ds.table} WHERE {col} = ANY(:k)", {"k": keys})
    return {(r["k"],) for r in found}


def _replace_filter(ds: Dataset, rows: list[Prepared], scope: list[str] | None = None) -> tuple[str, dict]:
    """Điều kiện chọn bản ghi bị xoá khi thay toàn bộ: không có trong tệp + replace_scope (+ replace_within)
    (+ hồ sơ của xã: chỉ bản ghi thuộc các xã trong ``scope``)."""
    cond = f"({ds.key[0]} IS NULL OR NOT ({ds.key[0]} = ANY(:k))) AND {ds.replace_scope}"
    params: dict[str, Any] = {"k": [key_of(ds, r)[0] for r in rows]}
    if ds.replace_within:
        fld, sql = ds.replace_within
        cond += f" AND {sql}"
        params["within"] = sorted({r.values[fld] for r in rows if r.values.get(fld)})
    if scope is not None:
        owner = "admin_unit_id" if ds.admin_unit else "parent_id" if ds.name == "xom" else None
        if owner is None:  # không biết bản ghi thuộc xã nào → không cho xã xoá gì
            cond += " AND FALSE"
        else:
            cond += f" AND {owner} IN (SELECT id FROM spatial_admin.administrative_units WHERE code = ANY(:scope))"
            params["scope"] = list(scope)
        if ds.name in SCOPED_REPLACE_EXTRA:
            cond += f" AND {SCOPED_REPLACE_EXTRA[ds.name]}"
    return cond, params


async def _count_changes(
    ds: Dataset, rows: list[Prepared], report: Report, replace: bool, scope: list[str] | None = None
) -> None:
    existing = await _existing_keys(ds, rows)
    bad = {i.row for i in report.errors}
    for row in rows:
        key = key_of(ds, row)
        if None in key or row.number in bad:
            continue
        if key in existing:
            report.updates += 1
        elif ds.update_only:
            report.error(row.number, ds.fields[0].name, f"Không có bản ghi mã {key[0]} để cập nhật")
        else:
            report.creates += 1
    if replace:
        cond, params = _replace_filter(ds, rows, scope)
        res = await fetch_one(f"SELECT count(*) AS n FROM {ds.table} WHERE {cond}", params)
        report.deletes = res["n"]


# ------------------------------------------------------------------ bước 3: ghi


def _preview(ds: Dataset, rows: list[Prepared]) -> list[dict]:
    out = []
    for row in rows[:PREVIEW_ROWS]:
        item = {
            "dong": row.number,
            **{k: (v.isoformat() if hasattr(v, "isoformat") else v) for k, v in row.values.items()},
        }
        if ds.admin_unit:
            item["ma_xa"] = row.ma_xa
        out.append(item)
    return out


def _columns(ds: Dataset, row: Prepared) -> tuple[list[str], list[str], dict[str, Any]]:
    """(cột, biểu thức SQL, tham số) cho một dòng."""
    cols, exprs, params = [], [], {}
    for fld in ds.fields:
        if not fld.column:
            continue
        value = row.values.get(fld.name)
        name = f"c_{fld.column}"
        cols.append(fld.column)
        if fld.kind in ("list", "code_list"):
            exprs.append(f"CAST(:{name} AS text[])")
            value = value or []
        elif fld.kind == "date":
            exprs.append(f"CAST(:{name} AS date)")
        else:
            exprs.append(f":{name}")
        params[name] = value
    if ds.name == "tram_quan_trac":
        thresholds = {
            k: row.values.get(f)
            for k, f in (("bd1", "bao_dong_1"), ("bd2", "bao_dong_2"), ("bd3", "bao_dong_3"))
            if row.values.get(f) is not None
        }
        cols.append("alarm_thresholds")
        exprs.append("CAST(:c_thresholds AS jsonb)")
        params["c_thresholds"] = json.dumps(thresholds)
    if ds.name == "phuong_tien":
        # Mức nhiên liệu có trong tệp → ghi thời điểm báo (chỉ khi thêm mới, như fuel_level — xem insert_only)
        cols.append("fuel_updated_at")
        exprs.append("CASE WHEN CAST(:c_fuel_level AS int) IS NULL THEN NULL ELSE now() END")
    for ref in ds.refs:
        name = f"r_{ref.column}"
        cols.append(ref.column)
        exprs.append(f"(SELECT {ref.value} FROM {ref.table} WHERE {ref.key} = :{name} AND ({ref.where}))")
        params[name] = row.values.get(ref.field)
    if ds.admin_unit:
        cols.append("admin_unit_id")
        exprs.append("(SELECT id FROM spatial_admin.administrative_units WHERE code = :ma_xa)")
        params["ma_xa"] = row.ma_xa
    for gcol in ds.geometry_columns:
        cols.append(gcol)
        if ds.geometry == "point":
            exprs.append(POINT_EXPR if row.lat is not None else "NULL")
        else:
            exprs.append(POLYGON_EXPR)
    if ds.geometry == "point":
        params.update(lat=row.lat, lon=row.lon)
    elif ds.geometry == "polygon":
        params["geom"] = row.geojson
    for i, (col, value) in enumerate({**ds.fixed, **ds.fixed_insert}.items()):
        cols.append(col)
        exprs.append(f":f{i}")
        params[f"f{i}"] = value
    for col in ds.touch:
        cols.append(col)
        exprs.append("now()")
    return cols, exprs, params


async def _upsert(conn, ds: Dataset, row: Prepared) -> bool:
    cols, exprs, params = _columns(ds, row)
    no_update = set(ds.key) | set(ds.insert_only) | set(ds.fixed_insert)
    sets = ", ".join(f"{c} = EXCLUDED.{c}" for c in cols if c not in no_update)
    guard = f" WHERE {ds.conflict_where}" if ds.conflict_where else ""
    sql = (
        f"INSERT INTO {ds.table} ({', '.join(cols)}) VALUES ({', '.join(exprs)}) "
        f"ON CONFLICT ({', '.join(ds.key)}) DO UPDATE SET {sets}{guard} RETURNING (xmax = 0) AS inserted"
    )
    res = await conn.execute(text(sql), params)
    return bool(res.scalar())


async def _update_commune(conn, row: Prepared) -> None:
    await conn.execute(
        text(
            f"""UPDATE spatial_admin.administrative_units
                   SET geom = {POLYGON_EXPR}, center = ST_PointOnSurface({POLYGON_EXPR}),
                       name = COALESCE(:ten, name), population = COALESCE(:dan_so, population),
                       households = COALESCE(:so_ho, households)
                 WHERE code = :ma AND level = 'xa'"""
        ),
        {
            "geom": row.geojson,
            "ma": row.values["ma"],
            "ten": row.values.get("ten"),
            "dan_so": row.values.get("dan_so"),
            "so_ho": row.values.get("so_ho"),
        },
    )


async def apply_rows(
    ds: Dataset, rows: list[Prepared], replace: bool, scope: list[str] | None = None, conn=None
) -> dict:
    """Ghi trong MỘT transaction. ``conn``: transaction của nơi gọi (phê duyệt hồ sơ: ghi dữ liệu + đổi trạng thái hồ
    sơ cùng lúc); không truyền → tự mở."""
    if conn is None:
        async with engine.begin() as own:
            return await _apply_rows(own, ds, rows, replace, scope)
    return await _apply_rows(conn, ds, rows, replace, scope)


async def _apply_rows(
    conn, ds: Dataset, rows: list[Prepared], replace: bool, scope: list[str] | None
) -> dict:
    created = updated = deleted = 0
    # Hai lần nhập cùng loại dữ liệu cùng lúc → lần sau chờ lần trước xong
    await conn.execute(text("SELECT pg_advisory_xact_lock(hashtext(:k))"), {"k": f"data_import:{ds.name}"})
    # Tệp lớn (20.000 dòng, ranh giới xã + gán lại xã cho mọi đối tượng) có thể quá giới hạn 30 s của tiến trình API
    await conn.execute(text("SET LOCAL statement_timeout = '10min'"))
    for row in rows:
        if ds.update_only:
            await _update_commune(conn, row)
            updated += 1
        elif await _upsert(conn, ds, row):
            created += 1
        else:
            updated += 1
    if ds.name == "danh_ba":
        await conn.execute(
            text(
                """UPDATE communications.contacts c SET parent_id = p.id
                     FROM unnest(CAST(:codes AS text[]), CAST(:parents AS text[])) AS t(code, parent)
                     LEFT JOIN communications.contacts p ON p.code = t.parent
                    WHERE c.code = t.code"""
            ),
            {
                "codes": [r.values["ma"] for r in rows],
                "parents": [r.values.get("ma_cap_tren") for r in rows],
            },
        )
    if replace:
        cond, params = _replace_filter(ds, rows, scope)
        res = await conn.execute(text(f"DELETE FROM {ds.table} WHERE {cond}"), params)
        deleted = res.rowcount
    if ds.name == "ranh_gioi_xa":
        from app.seed import (
            reconcile_admin_units,
        )  # ranh giới đổi → gán lại xã cho mọi đối tượng theo vị trí

        await reconcile_admin_units(conn)
    return {"created": created, "updated": updated, "deleted": deleted}


# ------------------------------------------------------------------ xem trước thay đổi (người duyệt hồ sơ)


def _plain(value: Any) -> Any:
    if isinstance(value, datetime | date):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    return value


def _same(old: Any, new: Any) -> bool:
    if isinstance(old, int | float) and isinstance(new, int | float) and not isinstance(old, bool):
        return abs(float(old) - float(new)) < 1e-9
    if isinstance(old, list | tuple) or isinstance(new, list | tuple):
        return list(old or []) == list(new or [])
    return old == new


async def _existing_values(ds: Dataset, rows: list[Prepared]) -> dict[tuple, dict]:
    """Giá trị hiện có của các bản ghi cùng mã, theo tên trường trong tệp (+ _lat/_lon của vị trí)."""
    if ds.table == "resources.inventory":
        found = await fetch_all(
            """SELECT w.code AS _a, i.item_code AS _b, i.quantity AS so_luong, i.safety_quota AS dinh_muc,
                      i.expiry_date AS han_su_dung
                 FROM resources.inventory i JOIN resources.warehouses w ON w.id = i.warehouse_id
                WHERE (w.code, i.item_code) IN (SELECT * FROM unnest(CAST(:a AS text[]), CAST(:b AS text[])))""",
            {"a": [r.values.get("ma_kho") for r in rows], "b": [r.values.get("ma_vat_tu") for r in rows]},
        )
        return {(r.pop("_a"), r.pop("_b")): r for r in found}
    skip = set(ds.insert_only) | set(ds.fixed_insert) | set(ds.key)
    cols = [f"t.{f.column} AS {f.name}" for f in ds.fields if f.column and f.column not in skip]
    for ref in ds.refs:  # mã tham chiếu (xã của xóm, lực lượng của phương tiện)
        cols.append(
            f"(SELECT r.{ref.key} FROM {ref.table} r WHERE r.{ref.value} = t.{ref.column}) AS {ref.field}"
        )
    if ds.admin_unit:
        cols.append(
            "(SELECT u.code FROM spatial_admin.administrative_units u WHERE u.id = t.admin_unit_id) AS ma_xa"
        )
    if ds.name == "danh_ba":
        cols.append("(SELECT p.code FROM communications.contacts p WHERE p.id = t.parent_id) AS ma_cap_tren")
    if ds.geometry == "point" and ds.geometry_columns[0] not in ds.insert_only:
        g = ds.geometry_columns[0]
        cols += [f"ST_Y(t.{g}) AS _lat", f"ST_X(t.{g}) AS _lon"]
    key = ds.key[0]
    keys = [key_of(ds, r)[0] for r in rows if key_of(ds, r)[0] is not None]
    found = await fetch_all(
        f"SELECT t.{key} AS _k, {', '.join(cols)} FROM {ds.table} t WHERE t.{key} = ANY(:k)", {"k": keys}
    )
    return {(r.pop("_k"),): r for r in found}


async def describe_changes(
    ds: Dataset, rows: list[Prepared], replace: bool = False, scope: list[str] | None = None
) -> dict:
    """Những gì sẽ ghi, để người duyệt xem trước: thêm mới, sửa (giá trị cũ → mới), xoá — kèm vị trí / vùng."""
    existing = await _existing_values(ds, rows)
    labels = {f.name: f.label for f in ds.fields}
    dates = {f.name for f in ds.fields if f.kind == "date"}  # tệp ghi ngày, CSDL có thể lưu timestamptz
    creates, updates = [], []
    for row in rows:
        key = key_of(ds, row)
        item: dict[str, Any] = {
            "dong": row.number,
            "ma": " / ".join(str(k) for k in key),
            "ten": row.values.get("ten") or row.values.get("ho_ten") or row.values.get("ma_vat_tu"),
            "ma_xa": row.ma_xa or row.values.get("ma_xa"),
            "lat": row.lat,
            "lon": row.lon,
        }
        if row.geojson:
            item["geometry"] = json.loads(row.geojson)
        old = existing.get(key)
        if old is None:
            creates.append(item)
            continue
        changes = []
        for name, prev in old.items():
            if name.startswith("_"):
                continue
            new = _plain(row.values.get(name) if name != "ma_xa" else item["ma_xa"])
            prev = _plain(prev)
            if name in dates:
                new, prev = (str(v)[:10] if v is not None else None for v in (new, prev))
            if not _same(prev, new):
                changes.append({"field": name, "label": labels.get(name, name), "old": prev, "new": new})
        if old.get("_lat") is not None and row.lat is not None:
            if abs(old["_lat"] - row.lat) > 1e-5 or abs(old["_lon"] - row.lon) > 1e-5:
                changes.append(
                    {
                        "field": "vi_tri",
                        "label": "Vị trí",
                        "old": f"{old['_lat']:.5f}, {old['_lon']:.5f}",
                        "new": f"{row.lat:.5f}, {row.lon:.5f}",
                    }
                )
        if ds.geometry == "polygon":
            changes.append(
                {"field": "geometry", "label": "Hình học vùng", "old": "(vùng cũ)", "new": "(vùng mới)"}
            )
        item["changes"] = changes
        updates.append(item)
    deletes: list[dict] = []
    if replace:
        cond, params = _replace_filter(ds, rows, scope)
        name_fld = ds.get_field("ten") or ds.get_field("ho_ten")
        name_col = name_fld.column if name_fld else ds.key[0]
        deletes = await fetch_all(
            f"SELECT {ds.key[0]} AS ma, {name_col} AS ten FROM {ds.table} WHERE {cond} ORDER BY 1 LIMIT {CHANGE_LIMIT}",
            params,
        )
    return {
        "creates": creates[:CHANGE_LIMIT],
        "updates": updates[:CHANGE_LIMIT],
        "deletes": deletes,
        "unchanged": sum(1 for u in updates if not u["changes"]),
        "truncated": len(creates) > CHANGE_LIMIT or len(updates) > CHANGE_LIMIT,
    }


# ------------------------------------------------------------------ điểm vào


async def validate(
    name: str, filename: str, data: bytes, replace: bool = False, scope: list[str] | None = None
) -> tuple[Report, list[Prepared]]:
    ds = get_dataset(name)
    if scope is not None and ds.name not in SUBMITTABLE:
        raise ImportFileError(f"{ds.label} do cấp tỉnh nhập — xã/phường không gửi được")
    if replace and not ds.replaceable:
        raise ImportFileError(f"{ds.label} không hỗ trợ chế độ thay toàn bộ")
    if ds.geometry == "polygon" and not filename.lower().endswith((".geojson", ".json")):
        raise ImportFileError(f"{ds.label} chỉ nhận tệp GeoJSON (có hình học vùng)")
    rows = read_file(filename, data)
    report = Report(ds.name, total=len(rows))
    prepared = convert_rows(ds, rows, report)
    check_duplicates(ds, prepared, report)
    await check_database(ds, prepared, report, replace, scope)
    report.preview = _preview(ds, prepared)
    return report, prepared


async def apply(name: str, filename: str, data: bytes, replace: bool = False) -> tuple[Report, dict | None]:
    """Kiểm tra lại rồi ghi. Có lỗi → không ghi gì, trả (báo cáo, None)."""
    report, prepared = await validate(name, filename, data, replace)
    if not report.ok:
        return report, None
    result = await apply_rows(get_dataset(name), prepared, replace)
    log.info("[nhập dữ liệu] %s: %s", name, result)
    return report, result
