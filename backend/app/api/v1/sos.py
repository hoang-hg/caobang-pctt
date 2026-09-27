"""Trung tâm Điều hành Cứu hộ & Điểm nóng khẩn cấp (Phân hệ D)."""

import hmac
import json
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field

from app.area import area_clause, unit_clause
from app.auth import audit
from app.config import settings
from app.db import execute, fetch_all, fetch_one, transaction
from app.rbac import scope_loaders
from app.rbac.authz import area_scope, can, forbidden, require_any, require_permission
from app.services import dispatch_matching
from app.services.events import log_event
from app.services.safe_routing import VEHICLE_SPEED, plan_route
from app.services.sos import TICKET_SELECT, create_ticket, get_ticket
from app.services.sos_nlp import extract
from app.ws.hub import hub

router = APIRouter(tags=["Cứu hộ"])

STATUS_LABEL = {
    "moi": "Chờ xử lý",
    "dieu_phoi": "Đang điều phối",
    "thuc_thi": "Đang thực thi",
    "hoan_thanh": "Hoàn thành",
}
SLA_MINUTES = {1: 3, 2: 15, 3: 60}  # thời hạn phản hồi điều phối theo cấp ưu tiên


@router.get("/sos")
async def list_sos(
    codes: list[str] = Depends(area_scope("sos", "view")), status: str | None = None, hours: int = 48
):
    rows = await fetch_all(
        TICKET_SELECT
        + f""" WHERE {area_clause('t.location', codes)}
                 AND (CAST(:status AS text) IS NULL OR t.status = :status)
                 AND (t.status <> 'hoan_thanh' OR t.resolved_at > now() - make_interval(hours => :h))
               ORDER BY t.priority, t.received_at""",
        {"codes": codes, "status": status, "h": hours},
    )
    for r in rows:
        r["sla_minutes"] = SLA_MINUTES[r["priority"]]
    return rows


class SosIn(BaseModel):
    raw_message: str | None = None
    source: str = Field("HOTLINE", pattern="^(ZALO|APP|HOTLINE|SENSOR|CAN_BO)$")
    reporter_name: str | None = None
    reporter_phone: str | None = None
    lat: float | None = None
    lon: float | None = None
    incident_type: str | None = None
    priority: int | None = Field(None, ge=1, le=3)
    trapped_count: int | None = None
    vulnerable: list[str] | None = None
    address: str | None = None


@router.post("/sos")
async def create_sos(body: SosIn, user: dict = Depends(require_any("sos", "create"))):
    """Cán bộ tạo phiếu SOS — chỉ trong xã thuộc phạm vi được giao (kiểm tra sau khi xác định vị trí)."""

    def authorize(domain: str) -> None:
        if not can(user, "sos", "create", domain):
            raise forbidden()

    try:
        return await create_ticket(**body.model_dump(), authorize=authorize)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


def require_intake_key(x_intake_key: str | None = Header(None)) -> None:
    """Chỉ cổng tích hợp đã cấp khoá (INTAKE_API_KEY) mới được tạo phiếu SOS tự động — chống spam phiếu giả."""
    if not settings.intake_api_key:
        raise HTTPException(503, "Cổng tiếp nhận SOS tự động chưa được bật (INTAKE_API_KEY)")
    if not x_intake_key or not hmac.compare_digest(x_intake_key.encode(), settings.intake_api_key.encode()):
        raise HTTPException(401, "Khoá tích hợp không hợp lệ")


@router.post("/sos/intake", dependencies=[Depends(require_intake_key)])
async def intake_sos(body: SosIn):
    """Cổng tiếp nhận cho webhook Zalo OA / ứng dụng di động (header X-Intake-Key = INTAKE_API_KEY)."""
    try:
        return await create_ticket(**body.model_dump(exclude={"priority"}))
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


class ParseIn(BaseModel):
    text: str


@router.post("/sos/parse")
async def parse_sos(body: ParseIn, _: dict = Depends(require_any("sos", "create"))):
    return await extract(body.text)


class SosPatch(BaseModel):
    status: str | None = Field(None, pattern="^(moi|dieu_phoi|thuc_thi|hoan_thanh)$")
    priority: int | None = Field(None, ge=1, le=3)
    notes: str | None = None


@router.patch("/sos/{ticket_id}")
async def update_sos(
    ticket_id: str,
    body: SosPatch,
    user: dict = Depends(require_permission("sos", "update", scope_loaders.sos_ticket)),
):
    before = await get_ticket(ticket_id)
    if not before:
        raise HTTPException(404, "Không tìm thấy phiếu")
    if body.status == "hoan_thanh" and not can(
        user, "sos", "resolve", await scope_loaders.sos_ticket(ticket_id)
    ):
        raise forbidden()
    await execute(
        """UPDATE operations.sos_tickets SET
                  status = COALESCE(CAST(:s AS text), status), priority = COALESCE(CAST(:p AS smallint), priority),
                  notes = COALESCE(CAST(:n AS text), notes),
                  acknowledged_at = CASE WHEN COALESCE(CAST(:s AS text), 'moi') <> 'moi' THEN COALESCE(acknowledged_at, now())
                                         ELSE acknowledged_at END,
                  resolved_at = CASE WHEN CAST(:s AS text) = 'hoan_thanh' THEN now()
                                     WHEN CAST(:s AS text) IS NOT NULL THEN NULL ELSE resolved_at END
            WHERE id = CAST(:id AS uuid)""",
        {"s": body.status, "p": body.priority, "n": body.notes, "id": ticket_id},
    )
    if body.status == "hoan_thanh":
        await release_dispatch(ticket_id)
    ticket = await get_ticket(ticket_id)
    await audit(user, "sos.update", "sos_ticket", ticket["code"], body.model_dump(exclude_none=True))
    await hub.publish("sos.updated", ticket, "sos", ticket["admin_code"])
    if body.status and body.status != before["status"]:
        await log_event(
            f"{ticket['code']} chuyển sang “{STATUS_LABEL[body.status]}” ({user['full_name']})",
            "cuu_ho",
            "info",
            lat=ticket["lat"],
            lon=ticket["lon"],
        )
    return ticket


async def release_dispatch(ticket_id: str) -> None:
    """Hoàn thành nhiệm vụ: trả lực lượng & phương tiện về trạng thái sẵn sàng."""
    async with transaction() as conn:
        orders = await fetch_all(
            """UPDATE operations.dispatch_orders SET status = 'hoan_thanh', progress = 1
                WHERE ticket_id = CAST(:t AS uuid) AND status IN ('dang_di', 'da_den')
            RETURNING force_id, vehicle_ids, personnel""",
            {"t": ticket_id},
            conn,
        )
        for o in orders:
            await execute(
                """UPDATE resources.forces SET personnel_on_mission = GREATEST(0, personnel_on_mission - :p),
                          personnel_ready = personnel_ready + LEAST(:p, personnel_on_mission),
                          status = CASE WHEN personnel_on_mission - :p <= 0 THEN 'san_sang' ELSE status END, updated_at = now()
                    WHERE id = :f""",
                {"p": o["personnel"], "f": o["force_id"]},
                conn,
            )
            await execute(
                "UPDATE resources.vehicles SET status = 'san_sang', mission_ticket_id = NULL, updated_at = now() WHERE id = ANY(:v)",
                {"v": o["vehicle_ids"]},
                conn,
            )


@router.post("/sos/{ticket_id}/resolve")
async def resolve(
    ticket_id: str, user: dict = Depends(require_permission("sos", "resolve", scope_loaders.sos_ticket))
):
    """Cán bộ hiện trường xác nhận “Đã cứu an toàn”."""
    return await update_sos(
        ticket_id, SosPatch(status="hoan_thanh", notes="Đã cứu an toàn – xác nhận từ hiện trường"), user
    )


@router.get("/sos/{ticket_id}/match")
async def match(
    ticket_id: str, _: dict = Depends(require_permission("dispatch", "create", scope_loaders.sos_ticket))
):
    ticket = await get_ticket(ticket_id)
    if not ticket:
        raise HTTPException(404, "Không tìm thấy phiếu")
    return await dispatch_matching.match(ticket)


class DispatchIn(BaseModel):
    ticket_id: str
    force_id: str
    vehicle_ids: list[str] = []
    personnel: int = Field(3, ge=1)
    supplies: dict[str, int] = {}


@router.post("/dispatch")
async def dispatch(body: DispatchIn, user: dict = Depends(require_any("dispatch", "create"))):
    """Phát lệnh điều động: tính lộ trình an toàn, cập nhật trạng thái, đẩy thông báo tới trưởng nhóm.
    Quyền kiểm tra theo xã của điểm SOS (được điều lực lượng ngoài xã — chi viện)."""
    domain = await scope_loaders.sos_ticket(body.ticket_id)
    if domain is None:
        raise HTTPException(404, "Không tìm thấy phiếu SOS")
    if not can(user, "dispatch", "create", domain):
        raise forbidden()
    ticket = await get_ticket(body.ticket_id)
    force = await fetch_one(
        "SELECT id, name, contact_phone, personnel_ready, ST_Y(location) AS lat, ST_X(location) AS lon FROM resources.forces WHERE id = CAST(:id AS uuid)",
        {"id": body.force_id},
    )
    if not ticket or not force:
        raise HTTPException(404, "Không tìm thấy phiếu SOS hoặc lực lượng")
    if ticket["status"] == "hoan_thanh":
        raise HTTPException(400, "Phiếu đã hoàn thành")
    vtypes = await fetch_all(
        "SELECT vehicle_type FROM resources.vehicles WHERE id = ANY(CAST(:v AS uuid[]))",
        {"v": body.vehicle_ids},
    )
    speeds = [VEHICLE_SPEED.get(v["vehicle_type"], 40) for v in vtypes]
    speed_factor = (min(speeds) / 40) if speeds else 1.0
    route = await plan_route(force["lat"], force["lon"], ticket["lat"], ticket["lon"], speed_factor)
    personnel = min(body.personnel, max(force["personnel_ready"], 1))
    eta = datetime.now(UTC) + timedelta(minutes=route["duration_min"])

    async with transaction() as conn:
        order = await fetch_one(
            """INSERT INTO operations.dispatch_orders (ticket_id, force_id, vehicle_ids, personnel, supplies, dispatched_by, eta,
                                                       route_geom, distance_km, route_safe)
               VALUES (CAST(:t AS uuid), CAST(:f AS uuid), CAST(:v AS uuid[]), :p, CAST(:s AS jsonb), :by, :eta,
                       ST_SetSRID(ST_GeomFromGeoJSON(:g), 4326), :km, :safe)
               RETURNING id, eta, distance_km, route_safe""",
            {
                "t": body.ticket_id,
                "f": body.force_id,
                "v": body.vehicle_ids,
                "p": personnel,
                "s": json.dumps(body.supplies),
                "by": user["full_name"],
                "eta": eta,
                "g": json.dumps(route["geometry"]),
                "km": route["distance_km"],
                "safe": route["safe"],
            },
            conn,
        )
        await execute(
            """UPDATE operations.sos_tickets SET status = 'thuc_thi', acknowledged_at = COALESCE(acknowledged_at, now())
                WHERE id = CAST(:t AS uuid)""",
            {"t": body.ticket_id},
            conn,
        )
        await execute(
            """UPDATE resources.forces SET personnel_ready = personnel_ready - :p, personnel_on_mission = personnel_on_mission + :p,
                      status = CASE WHEN personnel_ready - :p <= 0 THEN 'nhiem_vu' ELSE status END, updated_at = now()
                WHERE id = CAST(:f AS uuid)""",
            {"p": personnel, "f": body.force_id},
            conn,
        )
        await execute(
            """UPDATE resources.vehicles SET status = 'nhiem_vu', mission_ticket_id = CAST(:t AS uuid), updated_at = now()
                WHERE id = ANY(CAST(:v AS uuid[]))""",
            {"t": body.ticket_id, "v": body.vehicle_ids},
            conn,
        )
        await audit(
            user,
            "dispatch.create",
            "sos_ticket",
            ticket["code"],
            {
                "force": force["name"],
                "vehicles": len(body.vehicle_ids),
                "personnel": personnel,
                "route_km": route["distance_km"],
            },
            conn,
        )

    updated = await get_ticket(body.ticket_id)
    await hub.publish("sos.updated", updated, "sos", updated["admin_code"])
    await hub.publish(
        "dispatch.updated", {"dispatch_id": order["id"], "ticket_id": body.ticket_id, "status": "dang_di"}
    )
    await log_event(
        f"LỆNH ĐIỀU ĐỘNG: {force['name']} ({personnel} người, {len(body.vehicle_ids)} phương tiện) → {ticket['code']}, "
        f"{route['distance_km']} km, ETA {route['duration_min']} phút"
        + ("" if route["safe"] else " – ⚠ lộ trình qua vùng nguy hiểm"),
        "cuu_ho",
        "info" if route["safe"] else "warning",
        lat=ticket["lat"],
        lon=ticket["lon"],
    )
    return {
        "order": order,
        "route": route,
        "ticket": updated,
        # Mô phỏng Push Notification tới điện thoại trưởng nhóm
        "notification": {
            "to": force["contact_phone"],
            "channel": "PUSH+SMS",
            "message": f"[LỆNH KHẨN] {ticket['code']}: {ticket['address'] or ticket['admin_name']} – "
            f"toạ độ {ticket['lat']:.5f},{ticket['lon']:.5f}. ETA {route['duration_min']} phút.",
        },
    }


@router.get("/evacuation")
async def evacuation(codes: list[str] = Depends(area_scope("monitoring", "view"))):
    progress = await fetch_all(
        f"""SELECT u.code, u.name, u.old_district, e.planned_households, e.evacuated_households, e.planned_persons,
                   e.evacuated_persons, e.updated_at
              FROM operations.evacuation_progress e JOIN spatial_admin.administrative_units u ON u.id = e.admin_unit_id
             WHERE {unit_clause('e.admin_unit_id', codes)}
             ORDER BY (e.evacuated_households::float / NULLIF(e.planned_households, 0))""",
        {"codes": codes},
    )
    sites = await fetch_all(
        f"""SELECT e.id, e.name, e.site_type, e.capacity, e.current_occupancy, u.name AS admin_name
              FROM resources.evacuation_sites e JOIN spatial_admin.administrative_units u ON u.id = e.admin_unit_id
             WHERE {area_clause('e.location', codes)}
             ORDER BY (e.current_occupancy::float / e.capacity) DESC""",
        {"codes": codes},
    )
    return {"progress": progress, "sites": sites}
