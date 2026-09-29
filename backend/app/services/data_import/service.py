"""Việc sau khi nhập thành công (dùng chung cho API và dòng lệnh): nhật ký pháp lý, nhật ký điều hành, sự kiện realtime
(màn hình điều hành tự tải lại, cache ``cached_view`` hết hiệu lực), xoá cache cổng công khai."""

from __future__ import annotations

from app.auth import audit
from app.infra.cache import invalidate
from app.services.data_import.engine import Report
from app.services.data_import.specs import DATASETS
from app.services.events import log_event
from app.services.sos_nlp import invalidate_gazetteer
from app.ws.hub import hub


async def after_import(
    user: dict | None,
    name: str,
    filename: str,
    replace: bool,
    report: Report,
    result: dict,
    submission: dict | None = None,
) -> None:
    """``submission``: hồ sơ xã gửi vừa được ``user`` phê duyệt (mã hồ sơ, người gửi) — ghi vào nhật ký."""
    ds = DATASETS[name]
    meta = {"file": filename, "mode": "replace" if replace else "upsert", "rows": report.total, **result}
    if submission:
        meta.update(submission=submission["code"], submitted_by=submission["submitted_by_name"])
    await audit(user, "data.import", "dataset", name, meta)
    await hub.publish("data.imported", {"dataset": name, "label": ds.label, **result})
    if ds.public:
        await invalidate("public:")
    if name in ("xom", "ranh_gioi_xa"):
        await invalidate_gazetteer()  # bộ tách tin SOS nhận ra xóm / tên xã mới ngay
    who = user["full_name"] if user else "Người vận hành (dòng lệnh)"
    what = f"{ds.label}: {result['created']} mới, {result['updated']} cập nhật, {result['deleted']} xoá"
    await log_event(
        f"{who} duyệt hồ sơ {submission['code']} của {submission['submitted_by_name']} — {what}"
        if submission
        else f"{who} nhập {what}",
        "he_thong",
        "info",
    )
