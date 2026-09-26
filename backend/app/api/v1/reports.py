"""Duyệt phản ánh của người dân (cán bộ): /api/v1/reports/*

Quyền ``report.view`` / ``report.moderate`` theo phạm vi xã — Quản trị xã chỉ duyệt phản ánh trong xã mình.
"""

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field

from app.area import area_clause
from app.auth import audit
from app.db import execute, fetch_all, fetch_one
from app.infra import storage
from app.infra.cache import invalidate
from app.rbac import scope_loaders
from app.rbac.authz import area_scope, require_permission
from app.services.reports import CATEGORY, signed_photo_url, verify_photo_signature
from app.services.sos import create_ticket
from app.ws.hub import hub

router = APIRouter(prefix="/reports", tags=["Phản ánh người dân"])

REPORT_SELECT = """
SELECT r.id, r.code, r.category, r.description, r.address, r.reporter_name, r.reporter_phone, r.photos, r.status,
       r.public_note, r.reject_reason, r.moderated_at, r.created_at, r.sos_ticket_id,
       ST_Y(r.location) AS lat, ST_X(r.location) AS lon, u.code AS admin_code, u.name AS admin_name,
       m.full_name AS moderated_by_name, t.code AS sos_code
  FROM community.citizen_reports r
  LEFT JOIN spatial_admin.administrative_units u ON u.id = r.admin_unit_id
  LEFT JOIN communications.users m ON m.id = r.moderated_by
  LEFT JOIN operations.sos_tickets t ON t.id = r.sos_ticket_id
"""


def _with_urls(r: dict) -> dict:
    rid = str(r["id"])
    r["photo_urls"] = [
        {"full": signed_photo_url(rid, i), "thumb": signed_photo_url(rid, i, thumb=True)}
        for i in range(len(r.pop("photos") or []))
    ]
    r["category_label"] = CATEGORY.get(r["category"], r["category"])
    return r


@router.get("")
async def list_reports(
    status: str | None = None, limit: int = 200, codes: list[str] = Depends(area_scope("report", "view"))
):
    rows = await fetch_all(
        REPORT_SELECT
        + f""" WHERE {area_clause('r.location', codes)} AND (CAST(:s AS text) IS NULL OR r.status = :s)
               ORDER BY (r.status = 'cho_duyet') DESC, r.created_at DESC LIMIT :l""",
        {"codes": codes, "s": status, "l": min(limit, 500)},
    )
    counts = await fetch_all(
        f"""SELECT status, count(*) AS n FROM community.citizen_reports r
             WHERE {area_clause('r.location', codes)} GROUP BY status""",
        {"codes": codes},
    )
    return {"items": [_with_urls(r) for r in rows], "counts": {c["status"]: c["n"] for c in counts}}


@router.get("/{report_id}/photos/{idx}")
async def photo(report_id: str, idx: int, exp: int, sig: str, thumb: int = 0):
    """Ảnh riêng tư — chỉ phục vụ khi link có chữ ký hợp lệ (cấp cho cán bộ khi xem danh sách)."""
    if not verify_photo_signature(report_id, idx, bool(thumb), exp, sig):
        raise HTTPException(403, "Liên kết ảnh không hợp lệ hoặc đã hết hạn")
    return await _serve_photo(report_id, idx, bool(thumb), public=False)


async def _serve_photo(report_id: str, idx: int, thumb: bool, public: bool) -> Response:
    row = await fetch_one(
        "SELECT photos, status FROM community.citizen_reports WHERE id = CAST(:id AS uuid)", {"id": report_id}
    )
    if not row or idx < 0 or idx >= len(row["photos"]):
        raise HTTPException(404, "Không tìm thấy ảnh")
    if public and row["status"] not in ("da_duyet", "da_xu_ly"):
        raise HTTPException(404, "Không tìm thấy ảnh")
    item = row["photos"][idx]
    data = await storage.get(item["thumb_key"] if thumb else item["key"])
    cache = "public, max-age=3600" if public else "private, max-age=3600"
    return Response(content=data, media_type="image/jpeg", headers={"Cache-Control": cache})


class ModerateIn(BaseModel):
    action: Literal["approve", "reject", "resolve", "reopen"]
    public_note: str | None = Field(None, max_length=500)
    reject_reason: str | None = Field(None, max_length=500)
    category: str | None = None


STATUS_BY_ACTION = {"approve": "da_duyet", "reject": "tu_choi", "resolve": "da_xu_ly", "reopen": "cho_duyet"}


@router.post("/{report_id}/moderate")
async def moderate(
    report_id: str,
    body: ModerateIn,
    user: dict = Depends(require_permission("report", "moderate", scope_loaders.citizen_report)),
):
    if body.action == "reject" and not body.reject_reason:
        raise HTTPException(422, "Cần nêu lý do từ chối")
    if body.category and body.category not in CATEGORY:
        raise HTTPException(422, "Loại phản ánh không hợp lệ")
    status = STATUS_BY_ACTION[body.action]
    await execute(
        """UPDATE community.citizen_reports SET status = :s, public_note = COALESCE(CAST(:n AS text), public_note),
                  reject_reason = CASE WHEN :s = 'tu_choi' THEN :rr ELSE NULL END,
                  category = COALESCE(CAST(:c AS text), category),
                  moderated_by = :u, moderated_at = now()
            WHERE id = CAST(:id AS uuid)""",
        {
            "s": status,
            "n": body.public_note,
            "rr": body.reject_reason,
            "c": body.category,
            "u": user["id"],
            "id": report_id,
        },
    )
    row = _with_urls(await fetch_one(REPORT_SELECT + " WHERE r.id = CAST(:id AS uuid)", {"id": report_id}))
    await audit(
        user, f"report.{body.action}", "citizen_report", row["code"], body.model_dump(exclude_none=True)
    )
    await invalidate("public:")  # cổng công khai hiển thị ngay
    await hub.publish(
        "report.updated",
        {"id": report_id, "code": row["code"], "status": status},
        "report",
        row["admin_code"],
    )
    return row


class ToSosIn(BaseModel):
    incident_type: Literal["ngap_lut", "sat_lo", "lu_quet", "sap_nha", "cap_cuu", "tiep_te"] = "ngap_lut"
    priority: int = Field(2, ge=1, le=3)
    trapped_count: int = Field(0, ge=0, le=10000)


CATEGORY_TO_INCIDENT = {"ngap": "ngap_lut", "sat_lo": "sat_lo", "lu_quet": "lu_quet", "mac_ket": "ngap_lut"}


@router.post("/{report_id}/to-sos")
async def to_sos(
    report_id: str,
    body: ToSosIn,
    user: dict = Depends(require_permission("report", "moderate", scope_loaders.citizen_report)),
):
    r = await fetch_one(REPORT_SELECT + " WHERE r.id = CAST(:id AS uuid)", {"id": report_id})
    if r["sos_ticket_id"]:
        raise HTTPException(409, f"Đã chuyển thành phiếu {r['sos_code']}")
    ticket = await create_ticket(
        raw_message=None,
        source="APP",
        reporter_name=r["reporter_name"],
        reporter_phone=r["reporter_phone"],
        lat=r["lat"],
        lon=r["lon"],
        incident_type=body.incident_type,
        priority=body.priority,
        trapped_count=body.trapped_count,
        address=r["address"] or r["admin_name"],
        notes=f"Từ phản ánh người dân {r['code']}: {r['description'][:300]}",
    )
    await execute(
        """UPDATE community.citizen_reports SET sos_ticket_id = CAST(:t AS uuid), moderated_by = :u, moderated_at = now(),
                  status = CASE WHEN status = 'cho_duyet' THEN 'da_duyet' ELSE status END,
                  public_note = COALESCE(public_note, 'Đã chuyển lực lượng cứu hộ xử lý')
            WHERE id = CAST(:id AS uuid)""",
        {"t": str(ticket["id"]), "u": user["id"], "id": report_id},
    )
    await audit(user, "report.to_sos", "citizen_report", r["code"], {"sos": ticket["code"]})
    await invalidate("public:")
    return {"sos_code": ticket["code"], "sos_id": ticket["id"]}
