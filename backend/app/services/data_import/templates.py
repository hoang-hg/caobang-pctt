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


def template(ds: Dataset) -> tuple[bytes, str, str]:
    """(nội dung, tên tệp, content-type)."""
    if ds.geometry == "polygon":
        props = {f.name: f.example for f in ds.fields}
        doc = {
            "type": "FeatureCollection",
            "features": [{"type": "Feature", "properties": props, "geometry": _EXAMPLE_POLYGON}],
        }
        body = json.dumps(doc, ensure_ascii=False, indent=2).encode("utf-8")
        return body, f"mau_{ds.name}.geojson", "application/geo+json"
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([f.name for f in ds.fields])
    writer.writerow([f.example for f in ds.fields])
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
