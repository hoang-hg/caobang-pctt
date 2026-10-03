"""Link nhiệm vụ cho trưởng nhóm hiện trường — không đăng nhập, mã trong header X-Mission-Token (app/services/mission.py).

Đường dẫn /api/v1/mission (KHÔNG dưới /api/v1/public/: nginx cache tiền tố đó theo URI, không theo header)."""

from fastapi import APIRouter, Depends, Header, HTTPException, Request

from app.auth import audit
from app.db import execute, fetch_all, fetch_one, transaction
from app.infra import ratelimit
from app.rbac import scope_loaders
from app.rbac.authz import require_permission
from app.services import mission
from app.services.events import log_event
from app.services.lite import province_hotlines
from app.services.safe_routing import route_hazards, route_warnings
from app.services.sos import INCIDENT_LABEL, get_ticket
from app.ws.hub import hub

router = APIRouter(tags=["Link nhiệm vụ"])

ORDER_SQL = """
SELECT o.id, o.ticket_id, o.status, o.personnel, o.supplies, o.vehicle_ids, o.eta, o.distance_km, o.route_safe,
       o.dispatched_at, o.dispatched_by, o.arrived_at, o.mission_expires_at, o.mission_expires_at > now() AS live,
       ST_AsGeoJSON(o.route_geom)::json AS route, t.code AS ticket_code, f.name AS force_name,
       w.name AS warehouse_name
  FROM operations.dispatch_orders o
  JOIN operations.sos_tickets t ON t.id = o.ticket_id
  LEFT JOIN resources.forces f ON f.id = o.force_id
  LEFT JOIN resources.warehouses w ON w.id = o.supplies_warehouse_id
 WHERE o.mission_token_hash = :h"""


async def load_order(token: str | None, conn=None, lock: bool = False) -> dict:
    """Lệnh của mã nhiệm vụ. Sai mã → 404; lệnh đã xong / huỷ / quá hạn → 410 không kèm chi tiết nào của phiếu."""
    if not mission.valid_format(token):
        raise HTTPException(404, mission.INVALID)
    order = await fetch_one(
        ORDER_SQL + (" FOR UPDATE OF o" if lock else ""), {"h": mission.hash_token(token)}, conn
    )
    if not order:
        raise HTTPException(404, mission.INVALID)
    if order["status"] not in mission.ACTIVE:
        raise HTTPException(410, mission.FINISHED)
    if not order["live"]:
        raise HTTPException(410, mission.EXPIRED)
    return order


async def mission_view(order: dict) -> dict:
    """Thông tin đội cần ở hiện trường. Chọn cột tường minh: ghi chú nội bộ của trực ban không gửi ra."""
    t = await fetch_one(
        """SELECT t.code, t.incident_type, t.priority, t.trapped_count, t.vulnerable, t.address, t.raw_message,
                  t.reporter_name, t.reporter_phone, t.received_at, ST_Y(t.location) AS lat, ST_X(t.location) AS lon,
                  u.name AS admin_name
             FROM operations.sos_tickets t
             LEFT JOIN spatial_admin.administrative_units u ON u.id = t.admin_unit_id
            WHERE t.id = :t""",
        {"t": order["ticket_id"]},
    )
    vehicles = await fetch_all(
        "SELECT code, name, vehicle_type FROM resources.vehicles WHERE id = ANY(:v) ORDER BY code",
        {"v": order["vehicle_ids"] or []},
    )
    supplies = order["supplies"] or {}
    names = {
        r["code"]: r
        for r in await fetch_all(
            "SELECT code, name, unit FROM resources.items WHERE code = ANY(:c)", {"c": list(supplies)}
        )
    }
    reports = await fetch_all(
        """SELECT kind, people_safe, note, via, created_at FROM operations.dispatch_field_reports
            WHERE order_id = :o ORDER BY created_at DESC LIMIT 30""",
        {"o": order["id"]},
    )
    route = order["route"]
    return {
        **t,
        "incident_label": INCIDENT_LABEL.get(t["incident_type"], t["incident_type"]),
        "status": order["status"],
        "force_name": order["force_name"],
        "personnel": order["personnel"],
        "vehicles": vehicles,
        "supplies": [
            {
                "name": names.get(code, {}).get("name", code),
                "unit": names.get(code, {}).get("unit"),
                "quantity": n,
            }
            for code, n in supplies.items()
        ],
        "warehouse_name": order["warehouse_name"],
        "dispatched_at": order["dispatched_at"],
        "dispatched_by": order["dispatched_by"],
        "eta": order["eta"],
        "arrived_at": order["arrived_at"],
        "distance_km": order["distance_km"],
        "route_safe": order["route_safe"],
        "expires_at": order["mission_expires_at"],
        # Tính lại theo tuyến đã lưu: vùng nguy hiểm / trạm vượt báo động mới phát sinh sau lúc phát lệnh cũng hiện ra
        "hazards": await route_hazards(route) if route else [],
        "warnings": await route_warnings(route) if route else [],
        "reports": reports,
        "hotlines": await province_hotlines(),
    }


@router.get("/mission")
async def get_mission(x_mission_token: str | None = Header(None)):
    return await mission_view(await load_order(x_mission_token))


@router.post("/mission/report")
async def report(body: mission.MissionReportIn, request: Request, x_mission_token: str | None = Header(None)):
    """Trưởng nhóm báo từ hiện trường. "Đã đến" lặp lại không ghi thêm; "Đã cứu an toàn" chỉ đánh dấu chờ trực ban
    xác nhận — không tự đóng phiếu."""
    if problem := mission.report_problem(body):
        raise HTTPException(422, problem)
    if not mission.valid_format(x_mission_token):
        raise HTTPException(404, mission.INVALID)
    limit_key = mission.hash_token(x_mission_token)[:32]
    await ratelimit.check_limit("mission_report", limit_key, mission.MAX_REPORTS_PER_HOUR, 3600)
    note = (body.note or "").strip() or None
    async with transaction() as conn:
        order = await load_order(x_mission_token, conn, lock=True)
        arrived_now = body.kind in ("arrived", "rescued") and order["status"] == "dang_di"
        if arrived_now:
            await execute(
                """UPDATE operations.dispatch_orders SET status = 'da_den', progress = 1, arrived_at = now()
                    WHERE id = :o""",
                {"o": order["id"]},
                conn,
            )
        repeated = body.kind == "arrived" and not arrived_now  # bấm lại / mạng chập chờn gửi lại
        if not repeated:
            await execute(
                """INSERT INTO operations.dispatch_field_reports (order_id, kind, people_safe, note)
                   VALUES (:o, :k, :n, :note)""",
                {"o": order["id"], "k": body.kind, "n": body.people_safe, "note": note},
                conn,
            )
            await audit(
                {"id": None, "full_name": f"{order['force_name'] or 'Đội hiện trường'} (link nhiệm vụ)"},
                "mission.report",
                "sos_ticket",
                order["ticket_code"],
                {
                    "order": str(order["id"]),
                    "kind": body.kind,
                    "people_safe": body.people_safe,
                    "note": note,
                    "ip": request.client.host if request.client else None,
                },
                conn,
            )
    if repeated:
        return await mission_view(await load_order(x_mission_token))
    await ratelimit.count_hit("mission_report", limit_key, 3600)

    ticket = await get_ticket(order["ticket_id"])
    force = order["force_name"] or "Đội hiện trường"
    await hub.publish("sos.updated", ticket, "sos", ticket["admin_code"])
    if arrived_now:
        await hub.publish(
            "dispatch.updated",
            {"dispatch_id": str(order["id"]), "ticket_id": str(order["ticket_id"]), "status": "da_den"},
        )
    await hub.publish(
        "field.report",
        {
            "ticket_id": str(order["ticket_id"]),
            "code": ticket["code"],
            "kind": body.kind,
            "force_name": force,
            "people_safe": body.people_safe,
            "trapped_count": ticket["trapped_count"],
            "note": note,
        },
        "sos",
        ticket["admin_code"],
    )
    message, severity = mission.report_log(
        body.kind, ticket["code"], force, note, body.people_safe, ticket["trapped_count"]
    )
    await log_event(message, "cuu_ho", severity, lat=ticket["lat"], lon=ticket["lon"])
    return await mission_view(await load_order(x_mission_token))


@router.post("/dispatch/{order_id}/mission-link")
async def reissue_link(
    order_id: str,
    user: dict = Depends(require_permission("dispatch", "create", scope_loaders.dispatch_order)),
):
    """Cấp link nhiệm vụ mới cho lệnh đang thực hiện (trực ban lỡ đóng cửa sổ chưa sao chép, link cũ lộ ra ngoài, đội
    đổi trưởng nhóm). Link cũ hết hiệu lực ngay."""
    token, digest = mission.new_token()
    row = await fetch_one(
        """UPDATE operations.dispatch_orders
              SET mission_token_hash = :h, mission_expires_at = now() + make_interval(hours => :ttl)
            WHERE id = CAST(:id AS uuid) AND status IN ('dang_di', 'da_den')
        RETURNING ticket_id, force_id, mission_expires_at""",
        {"h": digest, "ttl": mission.MISSION_TTL_HOURS, "id": order_id},
    )
    if not row:
        raise HTTPException(409, "Lệnh đã kết thúc (hoàn thành / huỷ) — không cấp link nhiệm vụ")
    ticket = await get_ticket(row["ticket_id"])
    force = await fetch_one(
        "SELECT contact_phone FROM resources.forces WHERE id = :f", {"f": row["force_id"]}
    )
    await audit(user, "dispatch.mission_link", "sos_ticket", ticket["code"], {"order": order_id})
    url = mission.mission_url(token)
    return {
        "mission_url": url,
        "expires_at": row["mission_expires_at"],
        "message": mission.order_message(ticket, url),
        "to": force["contact_phone"] if force else None,
    }
