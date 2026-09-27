"""Kiểm tra và nhập dữ liệu từ tệp theo khai báo ở ``specs.py``.

Hai bước: ``validate`` (không ghi gì — trả báo cáo lỗi theo dòng, số bản ghi thêm / cập nhật / xoá) rồi ``apply``
(kiểm tra lại, ghi trong MỘT transaction có khoá theo loại dữ liệu — lỗi giữa chừng thì không ghi gì).
Tên bảng / cột trong SQL chỉ lấy từ khai báo; mọi giá trị người dùng đi qua tham số bind.
"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass, field
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
from app.services.data_import.specs import DATASETS, Dataset, Field

log = logging.getLogger(__name__)

MAX_ISSUES = 300
PREVIEW_ROWS = 20
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
    ma_xa: str | None = None


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
        if given != sorted(given):
            report.warn(
                row.number, "bao_dong_1", "Ngưỡng báo động không tăng dần I ≤ II ≤ III — kiểm tra lại"
            )
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


async def check_database(ds: Dataset, rows: list[Prepared], report: Report, replace: bool) -> None:
    await _check_communes(ds, rows, report)
    if ds.name == "xom":
        await _check_xom_codes(rows, report)
    if ds.geometry == "point":
        await _check_points(ds, rows, report)
    elif ds.geometry == "polygon":
        await _check_polygons(ds, rows, report)
    await _check_refs(ds, rows, report, replace)
    await _count_changes(ds, rows, report, replace)


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
        if ds.name == "xom" and res["nearest"] and res["nearest"] != row.values.get("ma_xa"):
            report.warn(
                row.number,
                "vi_do",
                f"Toạ độ nằm trong {res['nearest']}, tệp ghi {row.values.get('ma_xa')} — kiểm tra lại toạ độ "
                "(ranh giới xã hiện là xấp xỉ nếu chưa nhập ranh giới chính thức)",
            )
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
    if not ds.admin_unit:
        return
    given = row.values.get("ma_xa")
    if given and nearest and given != nearest:
        report.warn(row.number, "ma_xa", f"Vị trí thuộc {nearest} nhưng tệp ghi {given} — dùng {given}")
    row.ma_xa = given or nearest


async def _check_refs(ds: Dataset, rows: list[Prepared], report: Report, replace: bool) -> None:
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
        if parents - in_file and not replace:
            found = await fetch_all(
                "SELECT code FROM communications.contacts WHERE code = ANY(:c)",
                {"c": list(parents - in_file)},
            )
            in_db = {r["code"] for r in found}
        for row in rows:
            parent = row.values.get("ma_cap_tren")
            if parent and parent == row.values.get("ma"):
                report.error(row.number, "ma_cap_tren", "Dòng không thể là cấp trên của chính nó")
            elif parent and parent not in in_file and parent not in in_db:
                hint = " (chế độ thay toàn bộ: cấp trên phải có trong tệp)" if replace else ""
                report.error(row.number, "ma_cap_tren", f"Không có dòng cấp trên mã {parent}{hint}")


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


def _replace_filter(ds: Dataset, rows: list[Prepared]) -> tuple[str, dict]:
    """Điều kiện chọn bản ghi bị xoá khi thay toàn bộ: không có trong tệp + replace_scope (+ replace_within)."""
    cond = f"({ds.key[0]} IS NULL OR NOT ({ds.key[0]} = ANY(:k))) AND {ds.replace_scope}"
    params: dict[str, Any] = {"k": [key_of(ds, r)[0] for r in rows]}
    if ds.replace_within:
        fld, sql = ds.replace_within
        cond += f" AND {sql}"
        params["within"] = sorted({r.values[fld] for r in rows if r.values.get(fld)})
    return cond, params


async def _count_changes(ds: Dataset, rows: list[Prepared], report: Report, replace: bool) -> None:
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
        cond, params = _replace_filter(ds, rows)
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
        if fld.kind == "list":
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


async def apply_rows(ds: Dataset, rows: list[Prepared], replace: bool) -> dict:
    created = updated = deleted = 0
    async with engine.begin() as conn:
        # Hai lần nhập cùng loại dữ liệu cùng lúc → lần sau chờ lần trước xong
        await conn.execute(
            text("SELECT pg_advisory_xact_lock(hashtext(:k))"), {"k": f"data_import:{ds.name}"}
        )
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
            cond, params = _replace_filter(ds, rows)
            res = await conn.execute(text(f"DELETE FROM {ds.table} WHERE {cond}"), params)
            deleted = res.rowcount
        if ds.name == "ranh_gioi_xa":
            from app.seed import (
                reconcile_admin_units,
            )  # ranh giới đổi → gán lại xã cho mọi đối tượng theo vị trí

            await reconcile_admin_units(conn)
    return {"created": created, "updated": updated, "deleted": deleted}


# ------------------------------------------------------------------ điểm vào


async def validate(
    name: str, filename: str, data: bytes, replace: bool = False
) -> tuple[Report, list[Prepared]]:
    ds = get_dataset(name)
    if replace and not ds.replaceable:
        raise ImportFileError(f"{ds.label} không hỗ trợ chế độ thay toàn bộ")
    if ds.geometry == "polygon" and not filename.lower().endswith((".geojson", ".json")):
        raise ImportFileError(f"{ds.label} chỉ nhận tệp GeoJSON (có hình học vùng)")
    rows = read_file(filename, data)
    report = Report(ds.name, total=len(rows))
    prepared = convert_rows(ds, rows, report)
    check_duplicates(ds, prepared, report)
    await check_database(ds, prepared, report, replace)
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
