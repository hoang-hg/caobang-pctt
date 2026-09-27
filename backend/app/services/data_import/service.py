"""Việc sau khi nhập thành công (dùng chung cho API và dòng lệnh): nhật ký pháp lý, nhật ký điều hành, sự kiện realtime
(màn hình điều hành tự tải lại, cache ``cached_view`` hết hiệu lực), xoá cache cổng công khai."""

from __future__ import annotations

from app.auth import audit
from app.infra.cache import invalidate
from app.services.data_import.engine import Report
from app.services.data_import.specs import DATASETS
from app.services.events import log_event
from app.ws.hub import hub


async def after_import(
    user: dict | None, name: str, filename: str, replace: bool, report: Report, result: dict
) -> None:
    ds = DATASETS[name]
    await audit(
        user,
        "data.import",
        "dataset",
        name,
        {"file": filename, "mode": "replace" if replace else "upsert", "rows": report.total, **result},
    )
    await hub.publish("data.imported", {"dataset": name, "label": ds.label, **result})
    if ds.public:
        await invalidate("public:")
    who = user["full_name"] if user else "Người vận hành (dòng lệnh)"
    await log_event(
        f"{who} nhập {ds.label}: {result['created']} mới, {result['updated']} cập nhật, {result['deleted']} xoá",
        "he_thong",
        "info",
    )
