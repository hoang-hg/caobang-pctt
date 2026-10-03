"""Tệp mẫu để người dùng điền: CSV (có BOM để Excel hiện đúng tiếng Việt) hoặc GeoJSON cho dữ liệu dạng vùng."""

from __future__ import annotations

import csv
import io
import json

from app.services.data_import.specs import Dataset

# Ô vuông nhỏ trong TP. Cao Bằng — chỉ để minh hoạ cấu trúc GeoJSON
_EXAMPLE_POLYGON = {
    "type": "Polygon",
    "coordinates": [
        [[106.250, 22.660], [106.260, 22.660], [106.260, 22.670], [106.250, 22.670], [106.250, 22.660]]
    ],
}


def template(
    ds: Dataset,
    examples: dict[str, str] | None = None,
    center: tuple[float, float] | None = None,
    rows: list[dict[str, str]] | None = None,
) -> tuple[bytes, str, str]:
    """(nội dung, tên tệp, content-type). ``examples``: thay giá trị mẫu (VD mã xã của người gửi, cấp "xa");
    ``center`` (vĩ độ, kinh độ): đặt vị trí / vùng mẫu trong xã của người gửi để tệp mẫu hợp lệ ngay; ``rows``: dữ
    liệu hiện có điền sẵn thay dòng ví dụ (chỉ loại không có hình học — VD nhóm lọc nhanh)."""
    values = {f.name: f.example for f in ds.fields}
    values.update({k: v for k, v in (examples or {}).items() if k in values})
    polygon = _EXAMPLE_POLYGON
    if center:
        lat, lon = center
        if "vi_do" in values:
            values["vi_do"], values["kinh_do"] = f"{lat:.5f}", f"{lon:.5f}"
        d = 0.003  # ô vuông ~300 m quanh điểm giữa xã
        polygon = {
            "type": "Polygon",
            "coordinates": [
                [
                    [lon - d, lat - d],
                    [lon + d, lat - d],
                    [lon + d, lat + d],
                    [lon - d, lat + d],
                    [lon - d, lat - d],
                ]
            ],
        }
    if ds.geometry == "polygon":
        doc = {
            "type": "FeatureCollection",
            "features": [{"type": "Feature", "properties": values, "geometry": polygon}],
        }
        body = json.dumps(doc, ensure_ascii=False, indent=2).encode("utf-8")
        return body, f"mau_{ds.name}.geojson", "application/geo+json"
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([f.name for f in ds.fields])
    for row in rows or [values]:
        writer.writerow([row.get(f.name, "") for f in ds.fields])
    return buf.getvalue().encode("utf-8-sig"), f"mau_{ds.name}.csv", "text/csv; charset=utf-8"


def describe(ds: Dataset) -> dict:
    """Mô tả loại dữ liệu cho giao diện."""
    return {
        "name": ds.name,
        "label": ds.label,
        "description": ds.description,
        "geometry": ds.geometry,
        "formats": [".geojson"] if ds.geometry == "polygon" else [".csv", ".xlsx", ".geojson"],
        "replaceable": ds.replaceable,
        "update_only": ds.update_only,
        "public": ds.public,
        "fields": [
            {
                "name": f.name,
                "label": f.label,
                "kind": f.kind,
                "required": f.required,
                "choices": list(f.choices),
                "example": f.example,
            }
            for f in ds.fields
        ],
    }
