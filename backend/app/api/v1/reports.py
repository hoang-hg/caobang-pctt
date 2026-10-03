"""Duyệt phản ánh của người dân (cán bộ): /api/v1/reports/*

Quyền ``report.view`` / ``report.moderate`` theo phạm vi xã — Quản trị xã chỉ duyệt phản ánh trong xã mình.

Duyệt = chọn PHẦN CÔNG KHAI: nội dung (mặc định mô tả gốc đã che SĐT / email / số giấy tờ — cán bộ bỏ tiếp tên người,
số nhà…), vị trí (mặc định làm tròn ~150 m; chính xác khi là điểm công cộng: đường, cầu, taluy), có công khai ảnh không.
Mô tả / vị trí gốc chỉ cán bộ xem. Chuyển SOS phản ánh CHƯA duyệt không phải bước duyệt nội dung: cổng chỉ hiện câu chung
theo loại, không ảnh, vị trí làm tròn (sos_public_text) — công khai thêm bằng "Sửa phần công khai".
"""

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field

from app.area import area_clause
from app.auth import audit
from app.db import execute, fetch_all, fetch_one, transaction
from app.infra import storage
from app.infra.cache import invalidate
from app.rbac import scope_loaders
from app.rbac.authz import area_scope, require_permission
from app.services.reports import (
    CATEGORY,
    REPORT_SOS_NOTE,
    redact_public_text,
    signed_photo_url,
    verify_photo_signature,
)
from app.services.sos import announce_ticket, create_ticket
from app.ws.hub import hub

router = APIRouter(prefix="/reports", tags=["Phản ánh người dân"])

REPORT_SELECT = """
SELECT r.id, r.code, r.category, r.description, r.address, r.hamlet_name, r.reporter_name, r.reporter_phone, r.photos, r.status,
       r.public_note, r.reject_reason, r.moderated_at, r.created_at, r.sos_ticket_id,
       r.public_description, r.public_photos, r.public_exact AS exact_location,
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
    # Gợi ý nội dung công khai cho màn hình duyệt (cán bộ sửa tiếp: bỏ tên người, số nhà…)
    r["public_description_suggested"] = redact_public_text(r["description"])
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
        "SELECT photos, status, public_photos FROM community.citizen_reports WHERE id = CAST(:id AS uuid)",
        {"id": report_id},
    )
    if not row or idx < 0 or idx >= len(row["photos"]):
        raise HTTPException(404, "Không tìm thấy ảnh")
    if public and (row["status"] not in ("da_duyet", "da_xu_ly") or not row["public_photos"]):
        raise HTTPException(404, "Không tìm thấy ảnh")
    item = row["photos"][idx]
    data = await storage.get(item["thumb_key"] if thumb else item["key"])
    cache = "public, max-age=3600" if public else "private, max-age=3600"
    return Response(content=data, media_type="image/jpeg", headers={"Cache-Control": cache})


class ModerateIn(BaseModel):
    # edit_public: sửa phần công khai của phản ánh đã duyệt, giữ nguyên trạng thái
    action: Literal["approve", "reject", "resolve", "reopen", "edit_public"]
    public_note: str | None = Field(None, max_length=500)
    reject_reason: str | None = Field(None, max_length=500)
    category: str | None = None
    public_description: str | None = Field(None, min_length=10, max_length=1000)
    exact_location: bool | None = None  # true: công khai đúng điểm người dân chấm (điểm công cộng)
    public_photos: bool | None = None


STATUS_BY_ACTION = {"approve": "da_duyet", "reject": "tu_choi", "resolve": "da_xu_ly", "reopen": "cho_duyet"}
# Ghi phần công khai (tham số :pd, :auto, :exact, :pp). Không chọn gì → giữ lựa chọn trước; lần đầu → nội dung gốc đã
# che (:auto), vị trí làm tròn (public_exact mặc định false)
PUBLIC_FIELDS_SQL = """
    public_description = COALESCE(CAST(:pd AS text), public_description, CAST(:auto AS text)),
    public_exact = COALESCE(CAST(:exact AS boolean), public_exact),
    public_photos = COALESCE(CAST(:pp AS boolean), public_photos),"""


def _public_params(
    public_description: str | None, auto: str, exact: bool | None = None, photos: bool | None = None
) -> dict:
    """auto: nội dung công khai lần đầu khi cán bộ không nhập (đã che thông tin cá nhân)."""
    return {
        "pd": public_description.strip() if public_description else None,
        "auto": auto,
        "exact": exact,
        "pp": photos,
    }


def sos_public_text(category: str) -> str:
    """Phần công khai khi chuyển SOS phản ánh chưa duyệt: thao tác khẩn cấp, cán bộ chưa đọc lại nội dung → không lấy mô
    tả gốc (tên người, số nhà không che tự động được), chỉ nêu loại sự cố."""
    return f"{CATEGORY.get(category, 'Phản ánh hiện trường')} — cán bộ đã tiếp nhận; nội dung chi tiết chưa công khai."


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
    current = await fetch_one(
        "SELECT status, description FROM community.citizen_reports WHERE id = CAST(:id AS uuid)",
        {"id": report_id},
    )
    if not current:
        raise HTTPException(404, "Không tìm thấy phản ánh")
    if body.action == "edit_public" and current["status"] not in ("da_duyet", "da_xu_ly"):
        raise HTTPException(409, "Chỉ sửa phần công khai của phản ánh đã duyệt")
    status = STATUS_BY_ACTION.get(body.action, current["status"])
    publish = status in ("da_duyet", "da_xu_ly")  # công khai → ghi phần công khai (lần đầu: mặc định an toàn)
    await execute(
        f"""UPDATE community.citizen_reports SET status = :s, public_note = COALESCE(CAST(:n AS text), public_note),
                  reject_reason = CASE WHEN :s = 'tu_choi' THEN :rr ELSE NULL END,
                  category = COALESCE(CAST(:c AS text), category), {PUBLIC_FIELDS_SQL if publish else ""}
                  moderated_by = :u, moderated_at = now()
            WHERE id = CAST(:id AS uuid)""",
        {
            "s": status,
            **(
                _public_params(
                    body.public_description,
                    redact_public_text(current["description"]),
                    body.exact_location,
                    body.public_photos,
                )
                if publish
                else {}
            ),
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
    # Trống = bóc tách từ nội dung người dân gửi ("3 người già mắc kẹt" → 3); trước đây mặc định 0 → phiếu "0 người",
    # gợi ý lực lượng theo 0 người
    trapped_count: int | None = Field(None, ge=0, le=10000)


CATEGORY_TO_INCIDENT = {"ngap": "ngap_lut", "sat_lo": "sat_lo", "lu_quet": "lu_quet", "mac_ket": "ngap_lut"}


@router.post("/{report_id}/to-sos")
async def to_sos(
    report_id: str,
    body: ToSosIn,
    user: dict = Depends(require_permission("report", "moderate", scope_loaders.citizen_report)),
):
    # Khoá dòng phản ánh tới khi gắn xong phiếu → bấm đúp / hai cán bộ cùng chuyển chỉ tạo 1 phiếu SOS
    # (yêu cầu sau chờ khoá, rồi thấy phản ánh đã có phiếu → 409)
    async with transaction() as conn:
        await fetch_one(
            "SELECT 1 FROM community.citizen_reports WHERE id = CAST(:id AS uuid) FOR UPDATE",
            {"id": report_id},
            conn,
        )
        r = await fetch_one(REPORT_SELECT + " WHERE r.id = CAST(:id AS uuid)", {"id": report_id}, conn)
        if r["sos_ticket_id"]:
            raise HTTPException(409, f"Đã chuyển thành phiếu {r['sos_code']}")
        # Nội dung người dân gửi là tin gốc của phiếu: thẻ phiếu, link nhiệm vụ của đội hiện trường đều thấy (trước đây chỉ
        # nằm trong ghi chú nội bộ — đội không biết tình hình); bóc tách thêm số người, nhóm yếu thế
        ticket = await create_ticket(
            raw_message=r["description"],
            source="APP",
            reporter_name=r["reporter_name"],
            reporter_phone=r["reporter_phone"],
            lat=r["lat"],
            lon=r["lon"],
            incident_type=body.incident_type,
            priority=body.priority,
            trapped_count=body.trapped_count,
            address=r["address"] or r["admin_name"],
            notes=f"Từ phản ánh người dân {r['code']}",
            conn=conn,  # cùng transaction với việc gắn phiếu vào phản ánh → lỗi giữa chừng không để lại phiếu mồ côi
        )
        # Chuyển SOS cũng công khai phản ánh (người dân thấy đã có lực lượng xử lý). Phản ánh CHƯA duyệt: chỉ câu chung theo
        # loại, KHÔNG ảnh (mặc định cột là công khai ảnh), vị trí làm tròn — cán bộ đọc lại rồi mới "Sửa phần công khai".
        # Đã duyệt trước đó: giữ nguyên phần công khai cán bộ đã chọn.
        reviewed = r["status"] in ("da_duyet", "da_xu_ly")
        await execute(
            f"""UPDATE community.citizen_reports SET sos_ticket_id = CAST(:t AS uuid), moderated_by = :u, moderated_at = now(),
                      status = CASE WHEN status = 'cho_duyet' THEN 'da_duyet' ELSE status END, {PUBLIC_FIELDS_SQL}
                      public_note = COALESCE(public_note, :sos_note)
                WHERE id = CAST(:id AS uuid)""",
            {
                "t": str(ticket["id"]),
                "u": user["id"],
                "id": report_id,
                "sos_note": REPORT_SOS_NOTE,
                **_public_params(None, sos_public_text(r["category"]), photos=None if reviewed else False),
            },
            conn,
        )
    await announce_ticket(ticket, f"phản ánh người dân {r['code']}")  # sau khi commit
    await audit(user, "report.to_sos", "citizen_report", r["code"], {"sos": ticket["code"]})
    await invalidate("public:")
    return {
        "sos_code": ticket["code"],
        "sos_id": ticket["id"],
        "possible_duplicates": ticket.get("possible_duplicates") or [],
    }
