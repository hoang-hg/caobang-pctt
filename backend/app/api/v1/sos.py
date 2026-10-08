"""Trung tâm Điều hành Cứu hộ & Điểm nóng khẩn cấp (Phân hệ D)."""

import hmac
import json
from datetime import UTC, datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field, model_validator

from app.area import area_clause, unit_clause
from app.auth import audit
from app.config import settings
from app.db import execute, fetch_all, fetch_one, transaction
from app.infra.cache import invalidate
from app.rbac import domains, scope_loaders
from app.rbac.authz import area_scope, can, forbidden, require_any, require_permission
from app.services import dispatch_matching, logistics, mission
from app.services.events import log_event
from app.services.reports import REPORT_SOS_DONE, REPORT_SOS_NOTES
from app.services.safe_routing import VEHICLE_SPEED, plan_route
from app.services.sos import SLA_MINUTES, TICKET_SELECT, create_ticket, get_ticket
from app.services.sos_nlp import extract
from app.ws.hub import hub

router = APIRouter(tags=["Cứu hộ"])

STATUS_LABEL = {
    "moi": "Chờ xử lý",
    "dieu_phoi": "Đang điều phối",
    "thuc_thi": "Đang thực thi",
    "hoan_thanh": "Hoàn thành",
}


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
    incident_type: str | None = Field(None, pattern="^(ngap_lut|sat_lo|lu_quet|sap_nha|cap_cuu|tiep_te)$")
    priority: int | None = Field(None, ge=1, le=3)
    trapped_count: int | None = Field(None, ge=0, le=10000)
    vulnerable: list[str] | None = None
    address: str | None = None
    # Mã tin gốc của hệ thống gửi (Zalo OA / app): gửi lại cùng mã → trả phiếu đã có, không tạo phiếu thứ hai
    external_id: str | None = Field(None, min_length=1, max_length=120)


@router.post("/sos")
async def create_sos(body: SosIn, user: dict = Depends(require_any("sos", "create"))):
    """Cán bộ tạo phiếu SOS — chỉ trong xã thuộc phạm vi được giao (kiểm tra sau khi xác định vị trí)."""

    def authorize(domain: str) -> None:
        if not can(user, "sos", "create", domain):
            # Cán bộ xã nhận tin ở xã khác: nói rõ vị trí thuộc đâu và phải làm gì (trước đây chỉ "không có quyền")
            raise HTTPException(
                403,
                f"Vị trí trong tin thuộc {domains.label(domain)} — ngoài phạm vi bạn được giao. Báo trực ban tỉnh "
                "(hoặc xã/phường đó) để tạo phiếu; nếu vị trí sai, sửa nội dung tin (tên thôn / xã) rồi tạo lại.",
            )

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
    # Gọi lại / đội báo thêm thông tin: sửa số người, nhóm yếu thế (gợi ý lực lượng, link nhiệm vụ cập nhật theo)
    trapped_count: int | None = Field(None, ge=0, le=10000)
    vulnerable: list[Literal["nguoi_gia", "tre_em", "thuong_nang", "thai_phu"]] | None = None


@router.patch("/sos/{ticket_id}")
async def update_sos(
    ticket_id: str,
    body: SosPatch,
    user: dict = Depends(require_permission("sos", "update", scope_loaders.sos_ticket)),
):
    before = await get_ticket(ticket_id)
    if not before:
        raise HTTPException(404, "Không tìm thấy phiếu")
    # Kéo phiếu đang có đội thực hiện về "Chờ xử lý" / "Đang điều phối": phiếu hiện như chưa ai xử lý (quá hạn SLA) trong
    # khi đội vẫn đang đi, lực lượng bị giữ, không điều lại được → phải huỷ lệnh điều động trước
    if body.status in ("moi", "dieu_phoi") and await fetch_one(
        """SELECT 1 FROM operations.dispatch_orders
            WHERE ticket_id = CAST(:t AS uuid) AND status IN ('dang_di', 'da_den') LIMIT 1""",
        {"t": ticket_id},
    ):
        raise HTTPException(
            409,
            "Phiếu đang có lực lượng thực hiện — huỷ lệnh điều động trước (nút “Huỷ lệnh” trên thẻ phiếu) rồi mới "
            "chuyển về chờ xử lý / điều phối",
        )
    if body.status == "hoan_thanh" and not can(
        user, "sos", "resolve", await scope_loaders.sos_ticket(ticket_id)
    ):
        raise forbidden()
    await execute(
        """UPDATE operations.sos_tickets SET
                  status_changed_at = CASE WHEN CAST(:s AS text) <> status THEN now() ELSE status_changed_at END,
                  status = COALESCE(CAST(:s AS text), status), priority = COALESCE(CAST(:p AS smallint), priority),
                  notes = COALESCE(CAST(:n AS text), notes),
                  trapped_count = COALESCE(CAST(:tc AS int), trapped_count),
                  vulnerable = COALESCE(CAST(:vu AS text[]), vulnerable),
                  acknowledged_at = CASE WHEN COALESCE(CAST(:s AS text), 'moi') <> 'moi' THEN COALESCE(acknowledged_at, now())
                                         ELSE acknowledged_at END,
                  resolved_at = CASE WHEN CAST(:s AS text) = 'hoan_thanh' THEN now()
                                     WHEN CAST(:s AS text) IS NOT NULL THEN NULL ELSE resolved_at END
            WHERE id = CAST(:id AS uuid)""",
        {
            "s": body.status,
            "p": body.priority,
            "n": body.notes,
            "tc": body.trapped_count,
            "vu": body.vulnerable,
            "id": ticket_id,
        },
    )
    if body.status == "hoan_thanh":
        await release_dispatch(ticket_id)
        await close_linked_reports(ticket_id)
    ticket = await get_ticket(ticket_id)
    await audit(user, "sos.update", "sos_ticket", ticket["code"], body.model_dump(exclude_none=True))
    await hub.publish("sos.updated", ticket, "sos", ticket["admin_code"])
    changes = []
    if body.priority is not None and body.priority != before["priority"]:
        changes.append(f"ưu tiên Cấp {before['priority']} → Cấp {body.priority}")
    if body.trapped_count is not None and body.trapped_count != before["trapped_count"]:
        changes.append(f"số người {before['trapped_count']} → {body.trapped_count}")
    if changes:
        await log_event(
            f"{ticket['code']}: {', '.join(changes)} ({user['full_name']})",
            "cuu_ho",
            "warning" if body.priority == 1 else "info",
            lat=ticket["lat"],
            lon=ticket["lon"],
        )
    if body.status and body.status != before["status"]:
        await log_event(
            f"{ticket['code']} chuyển sang “{STATUS_LABEL[body.status]}” ({user['full_name']})",
            "cuu_ho",
            "info",
            lat=ticket["lat"],
            lon=ticket["lon"],
        )
    return ticket


async def _release_order(conn, ticket_id, order: dict) -> None:
    """Trả quân số & phương tiện của một lệnh về trạng thái sẵn sàng (hoàn thành / huỷ lệnh)."""
    await execute(
        """UPDATE resources.forces SET personnel_on_mission = GREATEST(0, personnel_on_mission - :p),
                  personnel_ready = personnel_ready + LEAST(:p, personnel_on_mission),
                  status = CASE WHEN personnel_on_mission - :p <= 0 THEN 'san_sang' ELSE status END, updated_at = now()
            WHERE id = :f""",
        {"p": order["personnel"], "f": order["force_id"]},
        conn,
    )
    await execute(
        """UPDATE resources.vehicles SET status = 'san_sang', mission_ticket_id = NULL, updated_at = now()
            WHERE id = ANY(:v) AND mission_ticket_id = CAST(:t AS uuid)""",  # xe đã nhận nhiệm vụ khác → giữ
        {"v": order["vehicle_ids"], "t": str(ticket_id)},
        conn,
    )


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
            await _release_order(conn, ticket_id, o)


async def close_linked_reports(ticket_id: str) -> None:
    """Phản ánh của người dân đã chuyển thành phiếu này → "đã xử lý": người dân tra cứu mã PA- thấy hoàn tất (trước đây
    "đang xử lý" mãi tới khi cán bộ tự đóng phản ánh). Ghi chú công khai do cán bộ viết riêng thì giữ nguyên."""
    rows = await fetch_all(
        """UPDATE community.citizen_reports
              SET status = 'da_xu_ly', moderated_at = now(),
                  public_note = CASE WHEN public_note IS NULL OR public_note = ANY(:auto) THEN :done ELSE public_note END
            WHERE sos_ticket_id = CAST(:t AS uuid) AND status = 'da_duyet'
        RETURNING id, code, admin_unit_id""",
        {"t": ticket_id, "auto": list(REPORT_SOS_NOTES), "done": REPORT_SOS_DONE},
    )
    for r in rows:
        await hub.publish(
            "report.updated",
            {"id": str(r["id"]), "code": r["code"], "status": "da_xu_ly"},
            "report",
            domains.code_of_unit_id(r["admin_unit_id"]),
        )
    if rows:
        await invalidate("public:")


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
    # Kho xuất vật tư mang theo (tuỳ chọn): trừ tồn kho trong cùng giao dịch với lệnh — kho không đủ thì không phát lệnh.
    # Không chọn: lệnh chỉ ghi nhu cầu vật tư (trực ban tự xuất kho riêng).
    warehouse_id: str | None = None


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
    supplies = {code: n for code, n in body.supplies.items() if n > 0}
    warehouse = None
    if body.warehouse_id and supplies:
        wh_domain = await scope_loaders.warehouse(body.warehouse_id)
        if wh_domain is None:
            raise HTTPException(404, "Không tìm thấy kho xuất vật tư")
        if not can(user, "inventory", "issue", wh_domain):
            raise forbidden()
        warehouse = await fetch_one(
            "SELECT id, name, admin_unit_id FROM resources.warehouses WHERE id = CAST(:w AS uuid)",
            {"w": body.warehouse_id},
        )
    # Tên mặt hàng cho thông báo thiếu hàng / nhật ký (kho chưa từng có mặt hàng thì không có dòng tồn kho để lấy tên)
    item_names = {
        r["code"]: r["name"]
        for r in await fetch_all(
            "SELECT code, name FROM resources.items WHERE code = ANY(:c)", {"c": list(supplies)}
        )
    }
    if force["personnel_ready"] < 1:
        raise HTTPException(409, f"{force['name']} không còn người sẵn sàng")
    vehicle_ids = list(dict.fromkeys(body.vehicle_ids))
    vtypes = await fetch_all(
        "SELECT vehicle_type FROM resources.vehicles WHERE id = ANY(CAST(:v AS uuid[]))",
        {"v": vehicle_ids},
    )
    if len(vtypes) != len(vehicle_ids):
        raise HTTPException(404, "Không tìm thấy phương tiện")
    speeds = [VEHICLE_SPEED.get(v["vehicle_type"], 40) for v in vtypes]
    speed_factor = (min(speeds) / 40) if speeds else 1.0
    route = await plan_route(force["lat"], force["lon"], ticket["lat"], ticket["lon"], speed_factor)
    personnel = min(body.personnel, force["personnel_ready"])
    eta = datetime.now(UTC) + timedelta(minutes=route["duration_min"])
    token, token_hash = mission.new_token()  # link nhiệm vụ cho trưởng nhóm (app/services/mission.py)

    async with transaction() as conn:
        # Khoá phiếu tới hết transaction, kiểm tra lại trạng thái TRONG khoá (bước tính lộ trình ở trên mất vài trăm
        # ms): người khác vừa xác nhận "Đã cứu" → không mở lại phiếu đã xong, không trừ quân số cho lệnh không bao giờ
        # được trả. "Đã cứu" (update_sos) ghi dòng phiếu nên chờ khoá này → lệnh vừa tạo cũng được giải phóng.
        locked = await fetch_one(
            "SELECT status FROM operations.sos_tickets WHERE id = CAST(:t AS uuid) FOR UPDATE",
            {"t": body.ticket_id},
            conn,
        )
        if locked["status"] == "hoan_thanh":
            raise HTTPException(
                409, f"Phiếu {ticket['code']} vừa được xác nhận hoàn thành — không điều động thêm"
            )
        # Hai trực ban cùng chọn một lực lượng / bấm đúp → không tạo 2 lệnh, không trừ quân số 2 lần
        if await fetch_one(
            """SELECT 1 FROM operations.dispatch_orders WHERE ticket_id = CAST(:t AS uuid) AND force_id = CAST(:f AS uuid)
                  AND status IN ('dang_di', 'da_den')""",
            {"t": body.ticket_id, "f": body.force_id},
            conn,
        ):
            raise HTTPException(
                409, f"{force['name']} đã được điều tới phiếu {ticket['code']} và đang làm nhiệm vụ"
            )
        # Trừ quân số / nhận phương tiện có điều kiện → hai lệnh đồng thời (hai điều phối viên, danh sách cũ trên màn
        # hình) không làm âm quân số hay gán một phương tiện cho hai nhiệm vụ. Lỗi → rollback cả lệnh.
        taken = await fetch_one(
            """UPDATE resources.forces SET personnel_ready = personnel_ready - :p, personnel_on_mission = personnel_on_mission + :p,
                      status = CASE WHEN personnel_ready - :p <= 0 THEN 'nhiem_vu' ELSE status END, updated_at = now()
                WHERE id = CAST(:f AS uuid) AND personnel_ready >= :p RETURNING id""",
            {"p": personnel, "f": body.force_id},
            conn,
        )
        if not taken:
            raise HTTPException(
                409, f"{force['name']} vừa được điều động — không đủ {personnel} người sẵn sàng"
            )
        busy = await fetch_all(
            """UPDATE resources.vehicles SET status = 'nhiem_vu', mission_ticket_id = CAST(:t AS uuid), updated_at = now()
                WHERE id = ANY(CAST(:v AS uuid[])) AND status = 'san_sang' RETURNING id""",
            {"t": body.ticket_id, "v": vehicle_ids},
            conn,
        )
        if len(busy) != len(vehicle_ids):
            raise HTTPException(
                409, "Có phương tiện không còn sẵn sàng (đang làm nhiệm vụ / bảo dưỡng) — chọn lại"
            )
        if warehouse:
            # Trừ có điều kiện từng mặt hàng: kho thiếu bất kỳ mặt hàng nào → huỷ cả lệnh (rollback), báo mặt hàng thiếu
            stock = await fetch_all(
                """SELECT item_code, quantity FROM resources.inventory
                    WHERE warehouse_id = CAST(:w AS uuid) AND item_code = ANY(:c) FOR UPDATE""",
                {"w": body.warehouse_id, "c": list(supplies)},
                conn,
            )
            short = logistics.supplies_shortage(supplies, {r["item_code"]: r["quantity"] for r in stock})
            if short:
                raise HTTPException(
                    409,
                    f"{warehouse['name']} không đủ: {', '.join(item_names.get(c, c) for c in short)} — chọn kho khác "
                    "hoặc điều động không kèm xuất kho",
                )
            await execute(
                """UPDATE resources.inventory i SET quantity = i.quantity - s.n, last_updated = now()
                     FROM unnest(CAST(:c AS text[]), CAST(:n AS int[])) AS s(code, n)
                    WHERE i.warehouse_id = CAST(:w AS uuid) AND i.item_code = s.code""",
                {"w": body.warehouse_id, "c": list(supplies), "n": list(supplies.values())},
                conn,
            )
        order = await fetch_one(
            """INSERT INTO operations.dispatch_orders (ticket_id, force_id, vehicle_ids, personnel, supplies, dispatched_by, eta,
                                                       route_geom, distance_km, route_safe, supplies_warehouse_id,
                                                       mission_token_hash, mission_expires_at)
               VALUES (CAST(:t AS uuid), CAST(:f AS uuid), CAST(:v AS uuid[]), :p, CAST(:s AS jsonb), :by, :eta,
                       ST_SetSRID(ST_GeomFromGeoJSON(:g), 4326), :km, :safe, CAST(:wh AS uuid),
                       :mh, now() + make_interval(hours => :ttl))
               RETURNING id, eta, distance_km, route_safe, mission_expires_at""",
            {
                "t": body.ticket_id,
                "f": body.force_id,
                "v": vehicle_ids,
                "p": personnel,
                "s": json.dumps(supplies),
                "wh": body.warehouse_id if warehouse else None,
                "by": user["full_name"],
                "eta": eta,
                "g": json.dumps(route["geometry"]),
                "km": route["distance_km"],
                "safe": route["safe"],
                "mh": token_hash,
                "ttl": mission.MISSION_TTL_HOURS,
            },
            conn,
        )
        await execute(
            """UPDATE operations.sos_tickets SET status = 'thuc_thi', acknowledged_at = COALESCE(acknowledged_at, now()),
                      status_changed_at = CASE WHEN status <> 'thuc_thi' THEN now() ELSE status_changed_at END
                WHERE id = CAST(:t AS uuid)""",
            {"t": body.ticket_id},
            conn,
        )
        await audit(
            user,
            "dispatch.create",
            "sos_ticket",
            ticket["code"],
            {
                "force": force["name"],
                "vehicles": len(vehicle_ids),
                "personnel": personnel,
                "route_km": route["distance_km"],
                "supplies": supplies,
                "warehouse": warehouse["name"] if warehouse else None,
            },
            conn,
        )

    updated = await get_ticket(body.ticket_id)
    await hub.publish("sos.updated", updated, "sos", updated["admin_code"])
    await hub.publish(
        "dispatch.updated", {"dispatch_id": order["id"], "ticket_id": body.ticket_id, "status": "dang_di"}
    )
    if warehouse:
        await hub.publish(
            "inventory.changed",
            {"warehouse_id": body.warehouse_id},
            "resource",
            domains.code_of_unit_id(warehouse["admin_unit_id"]),
        )
        await log_event(
            f"{warehouse['name']} xuất vật tư theo lệnh điều động {ticket['code']}: "
            + ", ".join(f"{n} {item_names.get(code, code)}" for code, n in supplies.items()),
            "van_hanh",
            "info",
            warehouse["admin_unit_id"],
        )
    await log_event(
        f"LỆNH ĐIỀU ĐỘNG: {force['name']} ({personnel} người, {len(vehicle_ids)} phương tiện) → {ticket['code']}, "
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
        # Nội dung lệnh cho trưởng nhóm. CHƯA tích hợp SMS / Push → hệ thống KHÔNG gửi (sent = False): giao diện yêu cầu
        # trực ban gọi / nhắn trực tiếp — không được để trực ban tưởng đội đã nhận lệnh. Kèm link nhiệm vụ: trưởng nhóm
        # mở trên điện thoại (không đăng nhập) để báo đã đến / đã cứu / cần chi viện. Mã chỉ trả MỘT lần ở đây (CSDL
        # lưu SHA-256) — mất thì trực ban cấp link mới.
        "notification": {
            "to": force["contact_phone"],
            "sent": False,
            "message": mission.order_message(ticket, mission.mission_url(token), route["duration_min"]),
            "mission_url": mission.mission_url(token),
            "mission_expires_at": order["mission_expires_at"],
        },
    }


@router.post("/dispatch/{order_id}/arrived")
async def dispatch_arrived(
    order_id: str, user: dict = Depends(require_permission("sos", "update", scope_loaders.dispatch_order))
):
    """Đội báo đã đến hiện trường (điện thoại / bộ đàm — chưa có GPS) → lệnh "đã đến", tiến độ 100%, ghi giờ đến. Trước
    đây khi chạy thật tiến độ đứng 0% tới lúc xác nhận "Đã cứu"."""
    async with transaction() as conn:
        row = await fetch_one(
            """UPDATE operations.dispatch_orders SET status = 'da_den', progress = 1, arrived_at = now()
                WHERE id = CAST(:id AS uuid) AND status = 'dang_di'
            RETURNING id, ticket_id, force_id, dispatched_at, arrived_at""",
            {"id": order_id},
            conn,
        )
        if not row:
            raise HTTPException(409, "Lệnh không còn ở trạng thái đang di chuyển (đã đến / đã xong / huỷ)")
        # Lịch sử trên link nhiệm vụ: đội thấy trực ban đã ghi nhận (báo qua bộ đàm / điện thoại)
        await execute(
            """INSERT INTO operations.dispatch_field_reports (order_id, kind, via) VALUES (:o, 'arrived', 'staff')""",
            {"o": row["id"]},
            conn,
        )
    ticket = await get_ticket(row["ticket_id"])
    force = await fetch_one("SELECT name FROM resources.forces WHERE id = :f", {"f": row["force_id"]})
    minutes = round((row["arrived_at"] - row["dispatched_at"]).total_seconds() / 60)
    await audit(
        user, "dispatch.arrived", "sos_ticket", ticket["code"], {"order": order_id, "minutes": minutes}
    )
    await hub.publish("sos.updated", ticket, "sos", ticket["admin_code"])
    await hub.publish(
        "dispatch.updated", {"dispatch_id": order_id, "ticket_id": str(row["ticket_id"]), "status": "da_den"}
    )
    await log_event(
        f"{force['name'] if force else 'Lực lượng'} đã đến hiện trường {ticket['code']} sau {minutes} phút"
        f" ({user['full_name']})",
        "cuu_ho",
        "info",
        lat=ticket["lat"],
        lon=ticket["lon"],
    )
    return ticket


class CancelIn(BaseModel):
    reason: str = Field(min_length=3, max_length=300, description="VD: Đường bị sạt, đội không tiếp cận được")
    # Vật tư mang theo (đã trừ kho khi phát lệnh) chưa dùng, đã nhập lại kho xuất → cộng lại tồn kho
    return_supplies: bool = False


@router.post("/dispatch/{order_id}/cancel")
async def cancel_dispatch(
    order_id: str,
    body: CancelIn,
    user: dict = Depends(require_permission("dispatch", "create", scope_loaders.dispatch_order)),
):
    """Huỷ lệnh điều động (nhầm lực lượng, đội không tiếp cận được…): trả quân số / phương tiện về sẵn sàng, link nhiệm
    vụ đóng ngay. Phiếu không còn lệnh nào đang thực hiện → về "Đang điều phối" để điều lực lượng khác."""
    reason = body.reason.strip()
    async with transaction() as conn:
        order = await fetch_one(
            """UPDATE operations.dispatch_orders
                  SET status = 'huy', cancelled_at = now(), cancelled_by = :by, cancel_reason = :r
                WHERE id = CAST(:id AS uuid) AND status IN ('dang_di', 'da_den')
            RETURNING id, ticket_id, force_id, vehicle_ids, personnel, supplies, supplies_warehouse_id""",
            {"id": order_id, "by": user["full_name"], "r": reason},
            conn,
        )
        if not order:
            raise HTTPException(409, "Lệnh không còn đang thực hiện (đã xong hoặc đã huỷ)")
        await _release_order(conn, order["ticket_id"], order)
        supplies = order["supplies"] or {}
        returned = bool(body.return_supplies and order["supplies_warehouse_id"] and supplies)
        if returned:
            await execute(
                """UPDATE resources.inventory i SET quantity = i.quantity + s.n, last_updated = now()
                     FROM unnest(CAST(:c AS text[]), CAST(:n AS int[])) AS s(code, n)
                    WHERE i.warehouse_id = :w AND i.item_code = s.code""",
                {"w": order["supplies_warehouse_id"], "c": list(supplies), "n": list(supplies.values())},
                conn,
            )
        await execute(
            """UPDATE operations.sos_tickets SET status = 'dieu_phoi', status_changed_at = now()
                WHERE id = :t AND status = 'thuc_thi'
                  AND NOT EXISTS (SELECT 1 FROM operations.dispatch_orders o
                                   WHERE o.ticket_id = :t AND o.status IN ('dang_di', 'da_den'))""",
            {"t": order["ticket_id"]},
            conn,
        )
        ticket = await get_ticket(order["ticket_id"], conn)
        await audit(
            user,
            "dispatch.cancel",
            "sos_ticket",
            ticket["code"],
            {"order": order_id, "reason": reason, "supplies_returned": returned},
            conn,
        )
    force = await fetch_one("SELECT name FROM resources.forces WHERE id = :f", {"f": order["force_id"]})
    await hub.publish("sos.updated", ticket, "sos", ticket["admin_code"])
    await hub.publish(
        "dispatch.updated", {"dispatch_id": order_id, "ticket_id": str(order["ticket_id"]), "status": "huy"}
    )
    if returned:
        wh = await fetch_one(
            "SELECT admin_unit_id FROM resources.warehouses WHERE id = :w",
            {"w": order["supplies_warehouse_id"]},
        )
        await hub.publish(
            "inventory.changed",
            {"warehouse_id": str(order["supplies_warehouse_id"])},
            "resource",
            domains.code_of_unit_id(wh["admin_unit_id"]) if wh else None,
        )
    await log_event(
        f"HUỶ LỆNH ĐIỀU ĐỘNG: {force['name'] if force else 'Lực lượng'} → {ticket['code']} — {reason}"
        + (" — vật tư nhập lại kho" if returned else "")
        + f" ({user['full_name']})",
        "cuu_ho",
        "warning",
        lat=ticket["lat"],
        lon=ticket["lon"],
    )
    return ticket


@router.get("/evacuation")
async def evacuation(codes: list[str] = Depends(area_scope("monitoring", "view"))):
    progress = await fetch_all(
        f"""SELECT u.code, u.name, e.planned_households, e.evacuated_households, e.planned_persons,
                   e.evacuated_persons, e.updated_at
              FROM operations.evacuation_progress e JOIN spatial_admin.administrative_units u ON u.id = e.admin_unit_id
             WHERE {unit_clause('e.admin_unit_id', codes)}
             ORDER BY (e.evacuated_households::float / NULLIF(e.planned_households, 0))""",
        {"codes": codes},
    )
    sites = await fetch_all(
        f"""SELECT e.id, e.name, e.site_type, e.capacity, e.current_occupancy, u.name AS admin_name, u.code AS admin_code
              FROM resources.evacuation_sites e JOIN spatial_admin.administrative_units u ON u.id = e.admin_unit_id
             WHERE {area_clause('e.location', codes)}
             ORDER BY (e.current_occupancy::float / NULLIF(e.capacity, 0)) DESC NULLS LAST""",
        {"codes": codes},
    )
    return {"progress": progress, "sites": sites}


class EvacuationIn(BaseModel):
    planned_households: int = Field(ge=0, le=200_000, description="Số hộ phải sơ tán theo kế hoạch")
    evacuated_households: int = Field(ge=0, le=200_000, description="Số hộ đã sơ tán an toàn")
    planned_persons: int = Field(ge=0, le=1_000_000)
    evacuated_persons: int = Field(ge=0, le=1_000_000)
    source: str | None = Field(None, max_length=200, description="VD: Báo cáo UBND xã lúc 14h")

    @model_validator(mode="after")
    def _persons_cover_households(self) -> "EvacuationIn":
        # Mỗi hộ ít nhất 1 người — số nhân khẩu ít hơn số hộ là gõ nhầm cột
        if (
            self.planned_persons < self.planned_households
            or self.evacuated_persons < self.evacuated_households
        ):
            raise ValueError("Số nhân khẩu không thể ít hơn số hộ — kiểm tra lại hai cột")
        return self


def evacuation_problem(body: EvacuationIn, households: int | None, population: int | None) -> str | None:
    """Gõ thừa chữ số (1200 thay vì 120) → KPI toàn tỉnh sai lệch. Chặn khi vượt số hộ / dân số của xã (nếu đã có)."""
    if households:
        for value, what in ((body.planned_households, "Kế hoạch"), (body.evacuated_households, "Đã sơ tán")):
            if value > households:
                return f"{what} {value} hộ vượt tổng số hộ của xã ({households}) — kiểm tra lại số liệu"
    if population:
        for value, what in ((body.planned_persons, "Kế hoạch"), (body.evacuated_persons, "Đã sơ tán")):
            if value > population:
                return f"{what} {value} nhân khẩu vượt dân số của xã ({population}) — kiểm tra lại số liệu"
    return None


@router.put("/evacuation/{code}")
async def update_evacuation(
    code: str,
    body: EvacuationIn,
    user: dict = Depends(require_permission("evacuation", "update", scope_loaders.commune)),
):
    """Xã (hoặc trực ban tỉnh) cập nhật kế hoạch và số hộ / nhân khẩu đã sơ tán → KPI "Sơ tán an toàn" của Dashboard và
    bảng tiến độ ở Trung tâm điều hành cập nhật ngay. Kết thúc đợt: nhập lại số đã sơ tán = 0."""
    unit = await fetch_one(
        """SELECT id, name, households, population FROM spatial_admin.administrative_units
            WHERE code = :c AND level = 'xa'""",
        {"c": code},
    )
    if not unit:
        raise HTTPException(404, "Không tìm thấy xã/phường")
    if problem := evacuation_problem(body, unit["households"], unit["population"]):
        raise HTTPException(422, problem)
    row = await fetch_one(
        """INSERT INTO operations.evacuation_progress
                  (admin_unit_id, planned_households, evacuated_households, planned_persons, evacuated_persons)
           VALUES (:u, :ph, :eh, :pp, :ep)
           ON CONFLICT (admin_unit_id) DO UPDATE SET
                  planned_households = EXCLUDED.planned_households, evacuated_households = EXCLUDED.evacuated_households,
                  planned_persons = EXCLUDED.planned_persons, evacuated_persons = EXCLUDED.evacuated_persons,
                  updated_at = now()
           RETURNING planned_households, evacuated_households, planned_persons, evacuated_persons, updated_at""",
        {
            "u": unit["id"],
            "ph": body.planned_households,
            "eh": body.evacuated_households,
            "pp": body.planned_persons,
            "ep": body.evacuated_persons,
        },
    )
    await audit(user, "evacuation.update", "admin_unit", code, body.model_dump())
    await hub.publish("evacuation.updated", {"code": code})
    await log_event(
        f"{unit['name']}: đã sơ tán {body.evacuated_households}/{body.planned_households} hộ "
        f"({body.evacuated_persons}/{body.planned_persons} nhân khẩu)"
        + (f" — nguồn: {body.source}" if body.source else "")
        + f" ({user['full_name']})",
        "cuu_ho",
        "info",
        admin_unit_id=unit["id"],
    )
    return {"code": code, "name": unit["name"], **row}
