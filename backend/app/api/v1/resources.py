"""Quản lý Vật tư & Lực lượng cứu hộ (Phân hệ C)."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.area import area_clause
from app.auth import audit
from app.db import fetch_all, fetch_one, transaction
from app.infra.cache import cached_view
from app.rbac import scope_loaders
from app.rbac.authz import area_scope, require_permission
from app.services.events import log_event
from app.ws.hub import hub

router = APIRouter(prefix="/resources", tags=["Nguồn lực"])

RES = area_scope("resource", "view")


@router.get("/summary")
async def summary(codes: list[str] = Depends(RES)):
    return await cached_view("resources-summary", {"codes": codes}, lambda: _summary(codes))


async def _summary(codes: list[str]) -> dict:
    p = {"codes": codes}
    forces = await fetch_one(
        f"""SELECT COALESCE(sum(personnel_ready), 0) AS ready, COALESCE(sum(personnel_on_mission), 0) AS on_mission,
                   COALESCE(sum(personnel_total), 0) AS total
              FROM resources.forces WHERE {area_clause('location', codes)}""",
        p,
    )
    vehicles = await fetch_one(
        f"""SELECT count(*) FILTER (WHERE vehicle_type IN ('xuong', 'ca_no', 'ghe') AND status = 'san_sang') AS boats_free,
                   count(*) FILTER (WHERE vehicle_type IN ('xuong', 'ca_no', 'ghe')) AS boats_total,
                   count(*) FILTER (WHERE vehicle_type = 'xe_loi_nuoc' AND status = 'san_sang') AS amphibious_free,
                   count(*) FILTER (WHERE vehicle_type IN ('may_xuc', 'may_ui') AND status = 'san_sang') AS excavators_free
              FROM resources.vehicles WHERE {area_clause('current_location', codes)}""",
        p,
    )
    stock = await fetch_one(
        f"""SELECT round(100.0 * sum(inv.quantity) FILTER (WHERE i.category IN ('luong_thuc'))
                            / NULLIF(sum(inv.safety_quota) FILTER (WHERE i.category IN ('luong_thuc')), 0))::int AS food_pct,
                   round(100.0 * sum(inv.quantity) FILTER (WHERE i.category = 'nuoc_uong')
                            / NULLIF(sum(inv.safety_quota) FILTER (WHERE i.category = 'nuoc_uong'), 0))::int AS water_pct,
                   count(DISTINCT inv.warehouse_id) FILTER (WHERE inv.quantity < 0.2 * inv.safety_quota) AS critical_warehouses,
                   count(*) FILTER (WHERE inv.expiry_date < current_date + 30) AS expiring_items
              FROM resources.inventory inv JOIN resources.items i ON i.code = inv.item_code
              JOIN resources.warehouses w ON w.id = inv.warehouse_id
             WHERE {area_clause('w.location', codes)}""",
        p,
    )
    return {"forces": forces, "vehicles": vehicles, "stock": stock}


@router.get("/forces")
async def forces(codes: list[str] = Depends(RES), status: str | None = None, level: str | None = None):
    return await fetch_all(
        f"""SELECT f.id, f.code, f.name, f.org_type, f.level, f.base_name, f.commander, f.contact_phone, f.radio_freq,
                   f.personnel_total, f.personnel_ready, f.personnel_on_mission, f.skills, f.status, f.updated_at,
                   ST_Y(f.location) AS lat, ST_X(f.location) AS lon, u.name AS admin_name,
                   (SELECT count(*) FROM resources.vehicles v WHERE v.force_id = f.id) AS vehicle_count
              FROM resources.forces f LEFT JOIN spatial_admin.administrative_units u ON u.id = f.admin_unit_id
             WHERE {area_clause('f.location', codes)}
               AND (CAST(:status AS text) IS NULL OR f.status = :status)
               AND (CAST(:level AS text) IS NULL OR f.level = :level)
             ORDER BY (f.level = 'tinh') DESC, f.org_type, f.code""",
        {"codes": codes, "status": status, "level": level},
    )


@router.get("/warehouses")
async def warehouses(codes: list[str] = Depends(RES), level: str | None = None):
    rows = await fetch_all(
        f"""SELECT w.id, w.code, w.name, w.level, w.manager, w.phone, u.name AS admin_name, u.code AS admin_code,
                   ST_Y(w.location) AS lat, ST_X(w.location) AS lon,
                   json_agg(json_build_object('item_code', inv.item_code, 'name', i.name, 'category', i.category, 'unit', i.unit,
                            'quantity', inv.quantity, 'safety_quota', inv.safety_quota, 'expiry_date', inv.expiry_date,
                            'last_updated', inv.last_updated,
                            'pct', round(100.0 * inv.quantity / NULLIF(inv.safety_quota, 0)))
                            ORDER BY i.category, i.code) AS items
              FROM resources.warehouses w
              LEFT JOIN spatial_admin.administrative_units u ON u.id = w.admin_unit_id
              JOIN resources.inventory inv ON inv.warehouse_id = w.id JOIN resources.items i ON i.code = inv.item_code
             WHERE {area_clause('w.location', codes)} AND (CAST(:level AS text) IS NULL OR w.level = :level)
             GROUP BY w.id, u.name, u.code ORDER BY array_position(ARRAY['tinh', 'cum', 'xa', 'da_chien'], w.level), w.code""",
        {"codes": codes, "level": level},
    )
    from datetime import date, timedelta

    soon = (date.today() + timedelta(days=30)).isoformat()
    for w in rows:
        w["alerts"] = {
            "critical": [it["item_code"] for it in w["items"] if (it["pct"] or 0) < 20],
            "expiring": [
                it["item_code"] for it in w["items"] if it["expiry_date"] and it["expiry_date"] < soon
            ],
        }
    return rows


@router.get("/vehicles")
async def vehicles(codes: list[str] = Depends(RES), category: str | None = None, status: str | None = None):
    return await fetch_all(
        f"""SELECT v.id, v.code, v.name, v.vehicle_type, v.category, v.status, v.fuel_level, v.capacity, v.updated_at,
                   f.name AS force_name, f.contact_phone, ST_Y(v.current_location) AS lat, ST_X(v.current_location) AS lon,
                   t.code AS mission_code, d.progress AS mission_progress
              FROM resources.vehicles v
              LEFT JOIN resources.forces f ON f.id = v.force_id
              LEFT JOIN operations.sos_tickets t ON t.id = v.mission_ticket_id
              LEFT JOIN LATERAL (SELECT progress FROM operations.dispatch_orders o
                                  WHERE o.ticket_id = v.mission_ticket_id AND v.id = ANY(o.vehicle_ids)
                                  ORDER BY dispatched_at DESC LIMIT 1) d ON TRUE
             WHERE {area_clause('v.current_location', codes)}
               AND (CAST(:category AS text) IS NULL OR v.category = :category)
               AND (CAST(:status AS text) IS NULL OR v.status = :status)
             ORDER BY v.category, v.vehicle_type, v.code""",
        {"codes": codes, "category": category, "status": status},
    )


@router.get("/fuel-depots")
async def fuel_depots(codes: list[str] = Depends(RES)):
    return await fetch_all(
        f"""SELECT id, name, gasoline_l, diesel_l, capacity_l, ST_Y(location) AS lat, ST_X(location) AS lon
              FROM resources.fuel_depots WHERE {area_clause('location', codes)} ORDER BY name""",
        {"codes": codes},
    )


@router.get("/evacuation-sites")
async def evacuation_sites(codes: list[str] = Depends(RES)):
    return await fetch_all(
        f"""SELECT e.id, e.name, e.site_type, e.capacity, e.current_occupancy, e.contact_phone, u.name AS admin_name,
                   ST_Y(e.location) AS lat, ST_X(e.location) AS lon
              FROM resources.evacuation_sites e LEFT JOIN spatial_admin.administrative_units u ON u.id = e.admin_unit_id
             WHERE {area_clause('e.location', codes)}
             ORDER BY (e.current_occupancy::float / e.capacity) DESC""",
        {"codes": codes},
    )


class IssueIn(BaseModel):
    item_code: str
    quantity: int = Field(gt=0)
    destination: str | None = None


@router.post("/warehouses/{warehouse_id}/issue")
async def issue(
    warehouse_id: str,
    body: IssueIn,
    user: dict = Depends(require_permission("inventory", "issue", scope_loaders.warehouse)),
):
    """Ra lệnh xuất kho — số liệu trên mọi màn hình tự nhảy qua WebSocket."""
    async with transaction() as conn:
        row = await fetch_one(
            """UPDATE resources.inventory SET quantity = quantity - :q, last_updated = now()
                WHERE warehouse_id = CAST(:w AS uuid) AND item_code = :i AND quantity >= :q
            RETURNING warehouse_id, item_code, quantity, safety_quota""",
            {"q": body.quantity, "w": warehouse_id, "i": body.item_code},
            conn,
        )
        if not row:
            raise HTTPException(400, "Tồn kho không đủ để xuất")
        wh = await fetch_one(
            "SELECT name, admin_unit_id FROM resources.warehouses WHERE id = CAST(:w AS uuid)",
            {"w": warehouse_id},
            conn,
        )
        await audit(user, "inventory.issue", "warehouse", warehouse_id, body.model_dump(), conn)
    await hub.publish("inventory.changed", row)
    await log_event(
        f"{wh['name']} xuất {body.quantity} {body.item_code}"
        + (f" cho {body.destination}" if body.destination else ""),
        "van_hanh",
        "info",
        wh["admin_unit_id"],
    )
    return row


class VehicleStatusIn(BaseModel):
    status: str = Field(pattern="^(san_sang|nhiem_vu|bao_duong)$")


@router.patch("/vehicles/{vehicle_id}")
async def update_vehicle(
    vehicle_id: str,
    body: VehicleStatusIn,
    user: dict = Depends(require_permission("vehicle", "update", scope_loaders.vehicle)),
):
    row = await fetch_one(
        """UPDATE resources.vehicles SET status = :s, updated_at = now(),
                  mission_ticket_id = CASE WHEN :s = 'nhiem_vu' THEN mission_ticket_id ELSE NULL END
            WHERE id = CAST(:id AS uuid) RETURNING id, code, status""",
        {"s": body.status, "id": vehicle_id},
    )
    if not row:
        raise HTTPException(404, "Không tìm thấy phương tiện")
    await audit(user, "vehicle.status", "vehicle", row["code"], body.model_dump())
    await hub.publish("gps.update", [])
    return row
