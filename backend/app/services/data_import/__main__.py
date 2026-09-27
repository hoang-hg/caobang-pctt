"""Nhập dữ liệu từ dòng lệnh (người vận hành máy chủ, tệp lớn):

    python -m app.services.data_import --list
    python -m app.services.data_import <loại> <tệp>                  # chỉ kiểm tra
    python -m app.services.data_import <loại> <tệp> --apply [--replace]

Trong container: docker compose cp diem_so_tan.csv backend:/tmp/ rồi
docker compose exec backend python -m app.services.data_import diem_so_tan /tmp/diem_so_tan.csv --apply
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

from app.db import engine
from app.services.data_import import engine as importer
from app.services.data_import.parsing import ImportFileError
from app.services.data_import.service import after_import
from app.services.data_import.specs import DATASETS


def _print_report(report: importer.Report) -> None:
    d = report.to_dict()
    print(
        f"Tổng {d['total']} dòng · hợp lệ {d['valid']} · thêm {d['creates']} · cập nhật {d['updates']} · xoá {d['deletes']}"
    )
    for label, items in (("LỖI", d["errors"]), ("Cảnh báo", d["warnings"])):
        for i in items:
            where = f"dòng {i['row']}" if i["row"] else "tệp"
            print(f"  {label} {where}{' · ' + i['field'] if i['field'] else ''}: {i['message']}")
    if d["error_count"] > len(d["errors"]):
        print(f"  … và {d['error_count'] - len(d['errors'])} lỗi khác")


async def main(argv: list[str]) -> int:
    if not argv or argv[0] in ("-h", "--help"):
        print(__doc__)
        return 0
    if argv[0] == "--list":
        for ds in DATASETS.values():
            print(f"{ds.name:16} {ds.label}")
        return 0
    if len(argv) < 2:
        print(__doc__)
        return 2
    name, path = argv[0], Path(argv[1])
    do_apply, replace = "--apply" in argv, "--replace" in argv
    try:
        data = path.read_bytes()
        if do_apply:
            report, result = await importer.apply(name, path.name, data, replace)
        else:
            report, _ = await importer.validate(name, path.name, data, replace)
            result = None
    except (ImportFileError, OSError) as exc:
        print(f"Lỗi: {exc}")
        return 1
    _print_report(report)
    if not report.ok:
        print("Có lỗi — không ghi gì." if do_apply else "Có lỗi — sửa tệp rồi kiểm tra lại.")
        return 1
    if result is not None:
        await after_import(None, name, path.name, replace, report, result)
        print(f"Đã nhập: {result}")
    else:
        print("Tệp hợp lệ. Thêm --apply để ghi vào hệ thống.")
    await engine.dispose()
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main(sys.argv[1:])))
