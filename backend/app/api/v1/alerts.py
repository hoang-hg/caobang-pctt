"""Cảnh báo khẩn cấp đa kênh & Hotline (Phân hệ E): Maker–Checker, Delivery Dashboard, Audit, Danh bạ, IVR."""

import json

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.auth import audit, current_user, require_role, verify_secret
from app.db import fetch_all, fetch_one
from app.services.broadcast import CHANNELS, estimate_audience, init_metrics
from app.services.events import log_event
from app.services.sos import create_ticket
from app.ws.hub import hub

router = APIRouter(prefix="/alerts", tags=["Cảnh báo & Hotline"])

BROADCAST_SELECT = """
SELECT b.id, b.code, b.title, b.message_body, b.template_code, b.severity, b.target_admin_codes, b.channels, b.status,
       b.auto_generated, b.trigger_source, b.audience, b.metrics, b.created_at, b.approved_at, b.sent_at, b.rejected_reason,
       mk.full_name AS created_by_name, ck.full_name AS approved_by_name,
       ST_AsGeoJSON(ST_SimplifyPreserveTopology(b.target_polygon, 0.0005), 5)::json AS target_geom
  FROM communications.alert_broadcasts b
  LEFT JOIN communications.users mk ON mk.id = b.created_by
  LEFT JOIN communications.users ck ON ck.id = b.approved_by
"""


@router.get("/channels")
async def channels():
    return [{"code": k, "name": v} for k, v in CHANNELS.items()]


@router.get("/templates")
async def templates():
    return await fetch_all(
        "SELECT code, name, severity, body, params FROM communications.message_templates ORDER BY code"
    )


@router.get("/broadcasts")
async def broadcasts(limit: int = 50):
    return await fetch_all(BROADCAST_SELECT + " ORDER BY b.created_at DESC LIMIT :l", {"l": limit})


class AudienceIn(BaseModel):
    admin_codes: list[str] = []
    polygon: dict | None = None


@router.post("/audience")
async def audience(body: AudienceIn):
    if not body.admin_codes and not body.polygon:
        raise HTTPException(422, "Chọn xã/phường hoặc vẽ vùng cảnh báo")
    return await estimate_audience(body.admin_codes, body.polygon)


class BroadcastIn(BaseModel):
    title: str = Field(min_length=3)
    message_body: str = Field(min_length=10, max_length=1000)
    template_code: str | None = None
    severity: str = Field("cam", pattern="^(do|cam|vang)$")
    admin_codes: list[str] = []
    polygon: dict | None = None
    channels: list[str] = Field(min_length=1)


@router.post("/broadcasts")
async def create_broadcast(body: BroadcastIn, user: dict = Depends(require_role("maker", "checker"))):
    """MAKER: soạn lệnh cảnh báo → chuyển sang chờ Lãnh đạo phê duyệt."""
    bad = set(body.channels) - set(CHANNELS)
    if bad:
        raise HTTPException(422, f"Kênh không hợp lệ: {', '.join(bad)}")
    aud = await estimate_audience(body.admin_codes, body.polygon)
    codes = body.admin_codes or aud["admin_codes"]
    row = await fetch_one(
        """INSERT INTO communications.alert_broadcasts (title, message_body, template_code, severity, target_admin_codes, target_polygon,
                 channels, status, audience, created_by)
           VALUES (:t, :b, :tpl, :s, :codes,
                   CASE WHEN CAST(:poly AS text) IS NULL THEN
                        (SELECT ST_Multi(ST_Union(geom)) FROM spatial_admin.administrative_units WHERE code = ANY(:codes))
                   ELSE ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(CAST(:poly AS text)), 4326)) END,
                   :ch, 'pending_approval', CAST(:aud AS jsonb), :u)
           RETURNING id, code""",
        {
            "t": body.title,
            "b": body.message_body,
            "tpl": body.template_code,
            "s": body.severity,
            "codes": codes,
            "poly": json.dumps(body.polygon) if body.polygon else None,
            "ch": body.channels,
            "aud": json.dumps(aud),
            "u": user["id"],
        },
    )
    await audit(
        user,
        "broadcast.create",
        "alert_broadcast",
        row["code"],
        {"title": body.title, "channels": body.channels, "households": aud["households"]},
    )
    await hub.publish(
        "broadcast.updated", {"id": row["id"], "code": row["code"], "status": "pending_approval"}
    )
    await log_event(
        f"{user['full_name']} soạn lệnh cảnh báo {row['code']} “{body.title}” – chờ phê duyệt",
        "canh_bao",
        "warning",
    )
    return await fetch_one(BROADCAST_SELECT + " WHERE b.id = :id", {"id": row["id"]})


class ApproveIn(BaseModel):
    pin: str


@router.post("/broadcasts/{broadcast_id}/approve")
async def approve(broadcast_id: str, body: ApproveIn, user: dict = Depends(require_role("checker"))):
    """CHECKER: Lãnh đạo xác nhận bằng mã PIN → hệ thống bắt đầu phát trên các kênh."""
    if not verify_secret(body.pin, user["pin_hash"]):
        await audit(user, "broadcast.approve_failed", "alert_broadcast", broadcast_id, {"reason": "sai PIN"})
        raise HTTPException(403, "Mã PIN không đúng")
    b = await fetch_one(
        "SELECT id, code, title, status, channels, audience, created_by FROM communications.alert_broadcasts WHERE id = CAST(:id AS uuid)",
        {"id": broadcast_id},
    )
    if not b:
        raise HTTPException(404, "Không tìm thấy lệnh")
    if b["status"] != "pending_approval":
        raise HTTPException(400, "Lệnh không ở trạng thái chờ duyệt")
    if b["created_by"] == user["id"]:
        raise HTTPException(403, "Người soạn không được tự phê duyệt (nguyên tắc 4 mắt)")
    metrics = init_metrics(b["channels"], b["audience"])
    await fetch_one(
        """UPDATE communications.alert_broadcasts SET status = 'sending', approved_by = :u, approved_at = now(), metrics = CAST(:m AS jsonb)
            WHERE id = CAST(:id AS uuid) RETURNING id""",
        {"u": user["id"], "m": json.dumps(metrics), "id": broadcast_id},
    )
    await audit(
        user,
        "broadcast.approve",
        "alert_broadcast",
        b["code"],
        {"title": b["title"], "channels": b["channels"]},
    )
    await hub.publish(
        "broadcast.updated", {"id": b["id"], "code": b["code"], "status": "sending", "metrics": metrics}
    )
    await log_event(
        f"{user['full_name']} PHÊ DUYỆT phát lệnh {b['code']} “{b['title']}” trên {len(b['channels'])} kênh",
        "canh_bao",
        "danger",
    )
    return await fetch_one(BROADCAST_SELECT + " WHERE b.id = CAST(:id AS uuid)", {"id": broadcast_id})


class RejectIn(BaseModel):
    reason: str = Field(min_length=3)


@router.post("/broadcasts/{broadcast_id}/reject")
async def reject(broadcast_id: str, body: RejectIn, user: dict = Depends(require_role("checker"))):
    row = await fetch_one(
        """UPDATE communications.alert_broadcasts SET status = 'rejected', rejected_reason = :r, approved_by = :u, approved_at = now()
            WHERE id = CAST(:id AS uuid) AND status = 'pending_approval' RETURNING id, code, title""",
        {"r": body.reason, "u": user["id"], "id": broadcast_id},
    )
    if not row:
        raise HTTPException(400, "Lệnh không ở trạng thái chờ duyệt")
    await audit(user, "broadcast.reject", "alert_broadcast", row["code"], {"reason": body.reason})
    await hub.publish("broadcast.updated", {"id": row["id"], "code": row["code"], "status": "rejected"})
    return row


@router.get("/audit")
async def audit_log(limit: int = 100, user: dict = Depends(current_user)):
    return await fetch_all(
        "SELECT id, time, actor_name, action, entity, entity_id, details FROM communications.audit_logs ORDER BY time DESC LIMIT :l",
        {"l": limit},
    )


@router.get("/contacts")
async def contacts():
    rows = await fetch_all(
        """SELECT c.id, c.parent_id, c.level, c.org, c.full_name, c.position, c.phone, c.radio_freq, c.status, c.sort,
                  u.code AS admin_code, u.name AS admin_name, u.old_district
             FROM communications.contacts c LEFT JOIN spatial_admin.administrative_units u ON u.id = c.admin_unit_id
            ORDER BY c.sort, c.full_name"""
    )
    nodes = {r["id"]: {**r, "children": []} for r in rows}
    roots = []
    for n in nodes.values():
        (nodes[n["parent_id"]]["children"] if n["parent_id"] in nodes else roots).append(n)
    return roots


HOTLINES = [
    {"number": "112", "name": "Tìm kiếm cứu nạn toàn quốc"},
    {"number": "114", "name": "Cứu nạn cứu hộ – PCCC"},
    {"number": "115", "name": "Cấp cứu y tế"},
    {"number": "113", "name": "Công an"},
]

IVR_ROUTES = {
    "1": ("Báo ngập lụt", "Ca trực Bộ CHQS tỉnh", "ngap_lut"),
    "2": ("Báo sạt lở", "Ca trực Công an tỉnh (CNCH)", "sat_lo"),
    "3": ("Cần hỗ trợ y tế", "Trung tâm Cấp cứu 115", "cap_cuu"),
    "0": ("Gặp điều hành viên", "Trực ban Văn phòng BCH", None),
}


@router.get("/hotline")
async def hotline():
    calls = await fetch_all(
        "SELECT id, time, caller, ivr_key, category, routed_to, duration_s, ticket_id FROM communications.call_logs ORDER BY time DESC LIMIT 30"
    )
    return {
        "hotlines": HOTLINES,
        "ivr": [{"key": k, "label": v[0], "route": v[1]} for k, v in IVR_ROUTES.items()],
        "calls": calls,
    }


class IvrIn(BaseModel):
    caller: str
    key: str = Field(pattern="^[0-3]$")
    message: str | None = None


@router.post("/ivr")
async def ivr(body: IvrIn):
    """Mô phỏng tổng đài phân luồng phím bấm: ghi cuộc gọi, chuyển ca trực; nếu có lời nhắn → tạo phiếu SOS."""
    label, route, incident = IVR_ROUTES[body.key]
    ticket = None
    if body.message and incident:
        try:
            ticket = await create_ticket(
                raw_message=body.message, source="HOTLINE", reporter_phone=body.caller, incident_type=incident
            )
        except ValueError:
            ticket = None
    row = await fetch_one(
        """INSERT INTO communications.call_logs (caller, ivr_key, category, routed_to, duration_s, ticket_id)
           VALUES (:c, :k, :cat, :r, 0, :t) RETURNING id, time, caller, ivr_key, category, routed_to, ticket_id""",
        {"c": body.caller, "k": body.key, "cat": label, "r": route, "t": ticket["id"] if ticket else None},
    )
    await hub.publish("call.new", row)
    return {"call": row, "ticket": ticket}
