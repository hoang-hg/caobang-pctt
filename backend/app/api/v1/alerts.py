"""Cảnh báo khẩn cấp đa kênh & Hotline (Phân hệ E): Maker–Checker, Delivery Dashboard, Audit, Danh bạ, IVR."""

import json

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.auth import audit, verify_secret
from app.config import settings
from app.db import fetch_all, fetch_one
from app.infra import ratelimit
from app.infra.cache import invalidate
from app.rbac.authz import allowed_codes, can_all, forbidden, require_any, require_permission
from app.rbac.scope_loaders import broadcast_domains, targets_to_domains
from app.services.broadcast import (
    CHANNELS,
    active_alert_sql,
    estimate_audience,
    init_metrics,
    valid_until_sql,
)
from app.services.events import log_event
from app.services.sos import create_ticket
from app.ws.hub import hub

router = APIRouter(prefix="/alerts", tags=["Cảnh báo & Hotline"])

MAX_PIN_FAILS = 5  # sai PIN phê duyệt quá số lần này trong PIN_LOCK_S → tạm khoá phê duyệt
PIN_LOCK_S = 900

BROADCAST_SELECT = f"""
SELECT b.id, b.code, b.title, b.message_body, b.template_code, b.severity, b.target_admin_codes, b.channels, b.status,
       b.auto_generated, b.trigger_source, b.audience, b.metrics, b.created_at, b.approved_at, b.sent_at, b.rejected_reason,
       b.created_by, b.valid_hours, {valid_until_sql("b")} AS valid_until, b.ended_at, b.end_note,
       ({active_alert_sql("b")}) AS active,
       mk.full_name AS created_by_name, ck.full_name AS approved_by_name, en.full_name AS ended_by_name,
       ST_AsGeoJSON(ST_SimplifyPreserveTopology(b.target_polygon, 0.0005), 5)::json AS target_geom
  FROM communications.alert_broadcasts b
  LEFT JOIN communications.users mk ON mk.id = b.created_by
  LEFT JOIN communications.users ck ON ck.id = b.approved_by
  LEFT JOIN communications.users en ON en.id = b.ended_by
"""


@router.get("/channels")
async def channels(_: dict = Depends(require_any("alert", "view"))):
    return [{"code": k, "name": v} for k, v in CHANNELS.items()]


@router.get("/templates")
async def templates(_: dict = Depends(require_any("alert", "view"))):
    return await fetch_all(
        "SELECT code, name, severity, body, params FROM communications.message_templates ORDER BY code"
    )


@router.get("/broadcasts")
async def broadcasts(limit: int = 50, user: dict = Depends(require_any("alert", "view"))):
    allowed = allowed_codes(user, "alert", "view")
    rows = await fetch_all(
        BROADCAST_SELECT
        + """ WHERE CAST(:all AS boolean) OR b.target_admin_codes && CAST(:codes AS text[])
              ORDER BY b.created_at DESC LIMIT :l""",
        {"l": limit, "all": allowed is None, "codes": allowed or []},
    )
    for b in rows:  # frontend dùng để hiện/ẩn nút phê duyệt / gia hạn / kết thúc
        approver = can_all(user, "alert", "approve", targets_to_domains(b["target_admin_codes"]))
        b["can_approve"] = b["status"] == "pending_approval" and b["created_by"] != user["id"] and approver
        # Gia hạn / kết thúc lệnh đã công bố: người có quyền phê duyệt VÀ đã được cấp PIN ký (lãnh đạo) — tài khoản cấp
        # tỉnh chức vụ trực ban có quyền theo vai trò nhưng chưa cấp PIN thì không
        b["can_manage"] = bool(b["active"]) and approver and bool(user["pin_hash"])
    return rows


class AudienceIn(BaseModel):
    admin_codes: list[str] = []
    polygon: dict | None = None


@router.post("/audience")
async def audience(body: AudienceIn, _: dict = Depends(require_any("alert", "create"))):
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
    # Thời hạn hiệu lực tính từ lúc phê duyệt (giờ): hết hạn → thôi hiện trên cổng công khai, "Tôi đang ở đâu?", bản nhẹ.
    # Còn nguy hiểm thì gia hạn; hết nguy hiểm sớm thì kết thúc (người có quyền phê duyệt)
    valid_hours: int = Field(48, ge=1, le=168)


@router.post("/broadcasts")
async def create_broadcast(body: BroadcastIn, user: dict = Depends(require_any("alert", "create"))):
    """MAKER: soạn lệnh cảnh báo → chuyển sang chờ Lãnh đạo phê duyệt. Mọi xã nhận tin phải thuộc phạm vi được giao."""
    bad = set(body.channels) - set(CHANNELS)
    if bad:
        raise HTTPException(422, f"Kênh không hợp lệ: {', '.join(bad)}")
    aud = await estimate_audience(body.admin_codes, body.polygon)
    # Có vùng vẽ → tin phát theo VÙNG VẼ (target_polygon, số người nhận): quyền phải bao trùm cả các xã vùng vẽ đi qua,
    # không chỉ các xã tự chọn — nếu không, cán bộ 1 xã chọn xã mình + vẽ vùng rộng là phát được ra ngoài phạm vi
    codes = sorted(set(body.admin_codes) | set(aud["admin_codes"])) if body.polygon else body.admin_codes
    if not can_all(user, "alert", "create", targets_to_domains(codes)):
        raise HTTPException(403, "Vùng cảnh báo có xã/phường nằm ngoài phạm vi bạn được giao")
    row = await fetch_one(
        """INSERT INTO communications.alert_broadcasts (title, message_body, template_code, severity, target_admin_codes, target_polygon,
                 channels, status, audience, created_by, valid_hours)
           VALUES (:t, :b, :tpl, :s, :codes,
                   CASE WHEN CAST(:poly AS text) IS NULL THEN
                        (SELECT ST_Multi(ST_Union(geom)) FROM spatial_admin.administrative_units WHERE code = ANY(:codes))
                   ELSE ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(CAST(:poly AS text)), 4326)) END,
                   :ch, 'pending_approval', CAST(:aud AS jsonb), :u, :vh)
           RETURNING id, code""",
        {
            "vh": body.valid_hours,
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


async def verify_pin(user: dict, pin: str, broadcast_id: str, failed_action: str) -> None:
    """Mã PIN ký của lãnh đạo (phê duyệt / kết thúc cảnh báo). PIN 6 số: không giới hạn thì phiên bị lộ dò được PIN →
    khoá thử PIN 15 phút sau 5 lần sai."""
    if not user["pin_hash"]:
        raise HTTPException(403, "Tài khoản chưa được cấp mã PIN phê duyệt — đề nghị Quản trị hệ thống cấp")
    pin_key = f"pinfail:{user['username'].lower()}"
    if await ratelimit.peek(pin_key) >= MAX_PIN_FAILS:
        raise HTTPException(429, "Nhập sai mã PIN quá nhiều lần — tạm khoá phê duyệt 15 phút")
    if not verify_secret(pin, user["pin_hash"]):
        await ratelimit.hit(pin_key, PIN_LOCK_S)
        await audit(user, failed_action, "alert_broadcast", broadcast_id, {"reason": "sai PIN"})
        raise HTTPException(403, "Mã PIN không đúng")
    await ratelimit.clear(pin_key)


@router.post("/broadcasts/{broadcast_id}/approve")
async def approve(broadcast_id: str, body: ApproveIn, user: dict = Depends(require_any("alert", "approve"))):
    """CHECKER: tài khoản cấp tỉnh (không phải người soạn) xác nhận bằng mã PIN → hệ thống bắt đầu phát trên các kênh.
    Phải có quyền phê duyệt trên TẤT CẢ xã nhận tin."""
    doms = await broadcast_domains(broadcast_id)
    if doms is None:
        raise HTTPException(404, "Không tìm thấy lệnh")
    if not can_all(user, "alert", "approve", doms):
        raise forbidden()
    await verify_pin(user, body.pin, broadcast_id, "broadcast.approve_failed")
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
    # Các kênh SMS / Cell Broadcast / Zalo / Push / loa CHƯA nối cổng gửi tin thật — chỉ bộ mô phỏng tiến triển giao nhận.
    # Vận hành thật: lệnh đã duyệt được công bố ngay trên cổng công khai & bản nhẹ → chốt "sent" (không treo mãi ở
    # "Đang phát" với 0 tin), từng kênh gắn "integrated": False để giao diện ghi rõ chưa gửi tới điện thoại người dân
    simulated = settings.simulator
    status = "sending" if simulated else "sent"
    metrics = init_metrics(b["channels"], b["audience"], integrated=simulated)
    # Điều kiện trạng thái trong cùng câu lệnh → hai lãnh đạo bấm duyệt cùng lúc (hoặc bấm đúp) chỉ phát 1 lần
    if not await fetch_one(
        """UPDATE communications.alert_broadcasts SET status = :st, approved_by = :u, approved_at = now(),
                  sent_at = CASE WHEN :done THEN now() END, metrics = CAST(:m AS jsonb),
                  valid_until = now() + make_interval(hours => valid_hours)
            WHERE id = CAST(:id AS uuid) AND status = 'pending_approval' RETURNING id""",
        {"st": status, "done": not simulated, "u": user["id"], "m": json.dumps(metrics), "id": broadcast_id},
    ):
        raise HTTPException(400, "Lệnh không ở trạng thái chờ duyệt")
    await audit(
        user,
        "broadcast.approve",
        "alert_broadcast",
        b["code"],
        {"title": b["title"], "channels": b["channels"]},
    )
    await hub.publish(
        "broadcast.updated", {"id": b["id"], "code": b["code"], "status": status, "metrics": metrics}
    )
    await invalidate("public:")  # cổng công khai + bản nhẹ hiện cảnh báo ngay (còn cache nginx ≤ 10 giây)
    await log_event(
        f"{user['full_name']} PHÊ DUYỆT phát lệnh {b['code']} “{b['title']}” trên {len(b['channels'])} kênh"
        if simulated
        else f"{user['full_name']} PHÊ DUYỆT lệnh {b['code']} “{b['title']}” — đã công bố trên cổng công khai "
        "(kênh SMS / Zalo / Cell Broadcast chưa tích hợp)",
        "canh_bao",
        "danger",
    )
    return await fetch_one(BROADCAST_SELECT + " WHERE b.id = CAST(:id AS uuid)", {"id": broadcast_id})


class RejectIn(BaseModel):
    reason: str = Field(min_length=3)


async def _manage_check(broadcast_id: str, user: dict) -> None:
    doms = await broadcast_domains(broadcast_id)
    if doms is None:
        raise HTTPException(404, "Không tìm thấy lệnh")
    if not can_all(user, "alert", "approve", doms):
        raise forbidden()


class EndIn(BaseModel):
    pin: str
    note: str = Field(min_length=3, max_length=300, description="VD: Nước đã rút, dỡ bỏ lệnh sơ tán")


@router.post("/broadcasts/{broadcast_id}/end")
async def end_broadcast(
    broadcast_id: str, body: EndIn, user: dict = Depends(require_any("alert", "approve"))
):
    """Kết thúc cảnh báo khi đã hết nguy hiểm (người có quyền phê duyệt, ký PIN): thôi hiện ngay trên cổng công khai,
    "Tôi đang ở đâu?", bản nhẹ; danh sách cảnh báo của người dân ghi "đã kết thúc"."""
    await _manage_check(broadcast_id, user)
    await verify_pin(user, body.pin, broadcast_id, "broadcast.end_failed")
    row = await fetch_one(
        f"""UPDATE communications.alert_broadcasts SET ended_at = now(), ended_by = :u, end_note = :n
             WHERE id = CAST(:id AS uuid) AND {active_alert_sql()} RETURNING id, code, title""",
        {"u": user["id"], "n": body.note.strip(), "id": broadcast_id},
    )
    if not row:
        raise HTTPException(409, "Lệnh không còn hiệu lực (đã kết thúc hoặc hết hạn)")
    await audit(
        user, "broadcast.end", "alert_broadcast", row["code"], {"title": row["title"], "note": body.note}
    )
    await hub.publish("broadcast.updated", {"id": row["id"], "code": row["code"], "status": "ended"})
    await invalidate("public:")
    await log_event(
        f"{user['full_name']} KẾT THÚC cảnh báo {row['code']} “{row['title']}” — {body.note.strip()}",
        "canh_bao",
        "info",
    )
    return await fetch_one(BROADCAST_SELECT + " WHERE b.id = CAST(:id AS uuid)", {"id": broadcast_id})


class ExtendIn(BaseModel):
    pin: str
    hours: int = Field(ge=1, le=72)


@router.post("/broadcasts/{broadcast_id}/extend")
async def extend_broadcast(
    broadcast_id: str, body: ExtendIn, user: dict = Depends(require_any("alert", "approve"))
):
    """Gia hạn cảnh báo đang hiệu lực (thiên tai kéo dài), ký PIN như phê duyệt: cộng thêm từ hạn hiện tại. Lệnh đã hết
    hạn / kết thúc không gia hạn được — soạn lệnh mới để duyệt lại."""
    await _manage_check(broadcast_id, user)
    await verify_pin(user, body.pin, broadcast_id, "broadcast.extend_failed")
    row = await fetch_one(
        f"""UPDATE communications.alert_broadcasts
               SET valid_until = GREATEST({valid_until_sql()}, now()) + make_interval(hours => :h)
             WHERE id = CAST(:id AS uuid) AND {active_alert_sql()} RETURNING id, code, title, valid_until""",
        {"h": body.hours, "id": broadcast_id},
    )
    if not row:
        raise HTTPException(409, "Lệnh không còn hiệu lực — soạn lệnh mới để phê duyệt lại")
    await audit(user, "broadcast.extend", "alert_broadcast", row["code"], {"hours": body.hours})
    await hub.publish("broadcast.updated", {"id": row["id"], "code": row["code"], "status": "sent"})
    await invalidate("public:")
    await log_event(
        f"{user['full_name']} gia hạn cảnh báo {row['code']} “{row['title']}” thêm {body.hours} giờ",
        "canh_bao",
        "info",
    )
    return await fetch_one(BROADCAST_SELECT + " WHERE b.id = CAST(:id AS uuid)", {"id": broadcast_id})


@router.post("/broadcasts/{broadcast_id}/reject")
async def reject(broadcast_id: str, body: RejectIn, user: dict = Depends(require_any("alert", "approve"))):
    doms = await broadcast_domains(broadcast_id)
    if doms is None:
        raise HTTPException(404, "Không tìm thấy lệnh")
    if not can_all(user, "alert", "approve", doms):
        raise forbidden()
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
async def audit_log(limit: int = 100, _: dict = Depends(require_permission("audit", "view"))):
    return await fetch_all(
        "SELECT id, time, actor_name, action, entity, entity_id, details FROM communications.audit_logs ORDER BY time DESC LIMIT :l",
        {"l": limit},
    )


@router.get("/contacts")
async def contacts(user: dict = Depends(require_any("contact", "view"))):
    allowed = allowed_codes(user, "contact", "view")
    rows = await fetch_all(
        """SELECT c.id, c.parent_id, c.level, c.org, c.full_name, c.position, c.phone, c.radio_freq, c.status, c.sort,
                  u.code AS admin_code, u.name AS admin_name, u.old_district
             FROM communications.contacts c LEFT JOIN spatial_admin.administrative_units u ON u.id = c.admin_unit_id
            ORDER BY c.sort, c.full_name"""
    )
    if allowed is not None:  # danh bạ cấp tỉnh luôn hiển thị; cấp xã/thôn theo phạm vi
        rows = [r for r in rows if r["level"] == "tinh" or r["admin_code"] in set(allowed)]
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
async def hotline(_: dict = Depends(require_permission("hotline", "operate"))):
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
async def ivr(body: IvrIn, _: dict = Depends(require_permission("hotline", "operate"))):
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
