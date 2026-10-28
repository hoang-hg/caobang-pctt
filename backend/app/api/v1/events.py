"""Đợt thiên tai (DB5 — docs/csdl-viec-con-lai.md, migration 0025): mở / kết thúc đợt, báo cáo theo đợt.

Phiếu SOS, lệnh điều động, lệnh cảnh báo, vùng nguy hiểm, dòng sổ kho tạo trong lúc đợt đang mở ở xã thuộc vùng ảnh hưởng tự
gắn mã đợt (trigger). Mở đợt với giờ bắt đầu trong quá khứ / mở rộng vùng → gắn bù bản ghi đã có (backfill). Xem: mọi tài
khoản xem được Tổng quan (báo cáo chỉ gồm số liệu trong phạm vi được giao); mở / sửa / kết thúc: quyền event.manage.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator

from app.area import area_clause, unit_clause
from app.auth import audit
from app.db import fetch_all, fetch_one, transaction
from app.rbac import domains
from app.rbac.authz import area_scope, require_permission
from app.services.events import log_event
from app.services.sos import COUNTS_PEOPLE_SQL
from app.ws.hub import hub

router = APIRouter(prefix="/events", tags=["Đợt thiên tai"])
MON = area_scope("monitoring", "view")
MANAGE = require_permission("event", "manage")

HAZARDS = {
    "mua_lon": "Mưa lớn",
    "lu_lut": "Ngập lụt",
    "lu_quet": "Lũ quét",
    "sat_lo": "Sạt lở đất",
    "bao": "Bão, áp thấp nhiệt đới",
    "ret_hai": "Rét hại, sương muối",
    "khac": "Khác",
}
MAX_BACKDATE_DAYS = 30  # mở đợt "đã bắt đầu từ…" tối đa 30 ngày trước — gắn bù không quét cả năm dữ liệu
VN_DAY = "date_trunc('day', {col} AT TIME ZONE 'Asia/Ho_Chi_Minh')::date"
# Dòng sổ kho `m`: mã xã của kho; đợt của lệnh điều động kèm dòng (vật tư kèm lệnh / hoàn trả khi huỷ lệnh theo đợt của
# lệnh — cùng quy tắc với trigger operations.assign_event, migration 0025)
WH_CODE = """(SELECT u.code FROM resources.warehouses w JOIN spatial_admin.administrative_units u ON u.id = w.admin_unit_id
               WHERE w.id = m.warehouse_id)"""
ORDER_EVENT = "(SELECT o.event_id FROM operations.dispatch_orders o WHERE o.id = m.dispatch_order_id)"


def _in_window(col: str) -> str:
    """Thời điểm `col` trong khung giờ của đợt `e` (đợt chưa kết thúc: tới hiện tại)."""
    return f"{col} >= e.started_at AND (e.ended_at IS NULL OR {col} < e.ended_at)"


def _in_area(code_sql: str) -> str:
    """Mã xã `code_sql` thuộc vùng ảnh hưởng của đợt `e` (vùng rỗng = toàn tỉnh)."""
    return f"(e.admin_codes = '{{}}' OR {code_sql} = ANY(e.admin_codes))"


# Dòng sổ kho `m` thuộc đợt `e` theo quy tắc gắn (NULL khi không biết xã của kho — kho đã xoá)
MOVE_MATCHES = f"""(CASE WHEN m.dispatch_order_id IS NOT NULL THEN {ORDER_EVENT} IS NOT DISTINCT FROM e.id
                        ELSE {_in_window("m.time")} AND {_in_area(WH_CODE)} END)"""

EVENT_SELECT = """
SELECT e.id, e.code, e.name, e.hazard, e.started_at, e.ended_at, e.admin_codes, e.note, e.end_note, e.created_at,
       uc.full_name AS created_by_name, ue.full_name AS ended_by_name
  FROM operations.disaster_events e
  LEFT JOIN communications.users uc ON uc.id = e.created_by
  LEFT JOIN communications.users ue ON ue.id = e.ended_by
"""


def _visible(codes: list[str]) -> str:
    """Đợt tài khoản xem được: đợt toàn tỉnh hoặc vùng ảnh hưởng có xã trong phạm vi (codes rỗng = toàn tỉnh)."""
    return "TRUE" if not codes else "(e.admin_codes = '{}' OR e.admin_codes && CAST(:codes AS text[]))"


async def _event_or_404(code: str, codes: list[str]) -> dict:
    row = await fetch_one(
        EVENT_SELECT + f" WHERE e.code = :c AND {_visible(codes)}", {"c": code, "codes": codes}
    )
    if not row:
        raise HTTPException(404, "Không tìm thấy đợt thiên tai")
    return row


def _check_units(admin_codes: list[str]) -> list[str]:
    known = {u.code for u in domains.units()}
    unknown = [c for c in admin_codes if c not in known]
    if unknown:
        raise HTTPException(422, f"Mã xã/phường không có: {', '.join(unknown[:5])}")
    return sorted(set(admin_codes))


class EventIn(BaseModel):
    name: str = Field(min_length=3, max_length=200, description='VD "Mưa lũ ngày 12–15/9/2026"')
    hazard: str = Field(description=f"Một trong: {', '.join(HAZARDS)}")
    started_at: datetime | None = Field(None, description="Trống = bây giờ; tối đa 30 ngày trước")
    admin_codes: list[str] = Field(
        default_factory=list, max_length=60, description="Vùng ảnh hưởng; rỗng = toàn tỉnh"
    )
    note: str | None = Field(None, max_length=1000)

    @field_validator("name", "note")
    @classmethod
    def _strip(cls, v: str | None) -> str | None:
        return v.strip() if isinstance(v, str) else v

    @field_validator("hazard")
    @classmethod
    def _hazard(cls, v: str) -> str:
        if v not in HAZARDS:
            raise ValueError(f"Loại thiên tai không hợp lệ (một trong: {', '.join(HAZARDS)})")
        return v


class EventPatch(BaseModel):
    name: str | None = Field(None, min_length=3, max_length=200)
    admin_codes: list[str] | None = Field(None, max_length=60)
    note: str | None = Field(None, max_length=1000)


class EventEnd(BaseModel):
    end_note: str | None = Field(
        None, max_length=1000, description="VD: Mưa đã ngớt, nước rút dưới báo động I"
    )
    ended_at: datetime | None = Field(None, description="Trống = bây giờ")


async def _backfill(conn, event_id: str) -> dict[str, int]:
    """Gắn đợt cho bản ghi đã có trong khoảng thời gian + vùng ảnh hưởng của đợt mà CHƯA thuộc đợt nào (không cướp bản ghi
    của đợt khác). Trả về số bản ghi gắn thêm theo loại."""
    p = {"id": event_id}
    out = {}
    rows = await fetch_all(
        f"""UPDATE operations.sos_tickets t SET event_id = e.id FROM operations.disaster_events e
             WHERE e.id = CAST(:id AS uuid) AND t.event_id IS NULL AND {_in_window("t.received_at")}
               AND {_in_area("operations.unit_code(t.admin_unit_id)")}
            RETURNING t.id""",
        p,
        conn,
    )
    out["sos"] = len(rows)
    rows = await fetch_all(
        """UPDATE operations.dispatch_orders o SET event_id = t.event_id FROM operations.sos_tickets t
            WHERE o.ticket_id = t.id AND t.event_id = CAST(:id AS uuid) AND o.event_id IS NULL RETURNING o.id""",
        p,
        conn,
    )
    out["dispatch"] = len(rows)
    rows = await fetch_all(
        f"""UPDATE communications.alert_broadcasts b SET event_id = e.id FROM operations.disaster_events e
             WHERE e.id = CAST(:id AS uuid) AND b.event_id IS NULL AND {_in_window("b.created_at")}
               AND (e.admin_codes = '{{}}' OR e.admin_codes && b.target_admin_codes)
            RETURNING b.id""",
        p,
        conn,
    )
    out["alerts"] = len(rows)
    rows = await fetch_all(
        f"""UPDATE iot_telemetry.hazard_zones z SET event_id = e.id FROM operations.disaster_events e
             WHERE e.id = CAST(:id AS uuid) AND z.event_id IS NULL AND {_in_window("z.created_at")}
               AND {_in_area("operations.unit_code(z.admin_unit_id)")}
            RETURNING z.id""",
        p,
        conn,
    )
    out["hazards"] = len(rows)
    rows = await fetch_all(
        # Vật tư kèm lệnh điều động theo đợt của lệnh (phiếu); vật tư khác theo xã của kho + thời gian
        f"""UPDATE resources.inventory_moves m SET event_id = e.id FROM operations.disaster_events e
             WHERE e.id = CAST(:id AS uuid) AND m.event_id IS NULL AND coalesce({MOVE_MATCHES}, false)
            RETURNING m.id""",
        p,
        conn,
    )
    out["supplies"] = len(rows)
    return out


async def _detach(conn, event_id: str) -> dict[str, int]:
    """Gỡ khỏi đợt bản ghi không còn khớp khung giờ / vùng ảnh hưởng (bỏ xã khỏi vùng, kết thúc lùi giờ) → gắn sang đợt khác
    nếu có đợt khớp (operations.event_for — như trigger), không thì để trống. Lệnh điều động theo phiếu, vật tư kèm lệnh theo
    lệnh. Báo cáo của đợt luôn đúng "vùng ảnh hưởng × từ lúc bắt đầu tới lúc kết thúc". Trả về số bản ghi gỡ theo loại."""
    p = {"id": event_id}
    out = {}
    rows = await fetch_all(
        f"""UPDATE operations.sos_tickets t
               SET event_id = operations.event_for(ARRAY[operations.unit_code(t.admin_unit_id)], t.received_at)
              FROM operations.disaster_events e
             WHERE e.id = CAST(:id AS uuid) AND t.event_id = e.id
               AND NOT coalesce({_in_window("t.received_at")} AND {_in_area("operations.unit_code(t.admin_unit_id)")}, true)
            RETURNING t.id""",
        p,
        conn,
    )
    out["sos"] = len(rows)
    rows = await fetch_all(
        """UPDATE operations.dispatch_orders o SET event_id = t.event_id FROM operations.sos_tickets t
            WHERE o.ticket_id = t.id AND o.event_id = CAST(:id AS uuid) AND t.event_id IS DISTINCT FROM o.event_id
            RETURNING o.id""",
        p,
        conn,
    )
    out["dispatch"] = len(rows)
    rows = await fetch_all(
        f"""UPDATE communications.alert_broadcasts b
               SET event_id = operations.event_for(b.target_admin_codes, b.created_at)
              FROM operations.disaster_events e
             WHERE e.id = CAST(:id AS uuid) AND b.event_id = e.id
               AND NOT ({_in_window("b.created_at")} AND (e.admin_codes = '{{}}' OR e.admin_codes && b.target_admin_codes))
            RETURNING b.id""",
        p,
        conn,
    )
    out["alerts"] = len(rows)
    rows = await fetch_all(
        f"""UPDATE iot_telemetry.hazard_zones z
               SET event_id = operations.event_for(ARRAY[operations.unit_code(z.admin_unit_id)], z.created_at)
              FROM operations.disaster_events e
             WHERE e.id = CAST(:id AS uuid) AND z.event_id = e.id
               AND NOT coalesce({_in_window("z.created_at")} AND {_in_area("operations.unit_code(z.admin_unit_id)")}, true)
            RETURNING z.id""",
        p,
        conn,
    )
    out["hazards"] = len(rows)
    rows = await fetch_all(
        f"""UPDATE resources.inventory_moves m
               SET event_id = CASE WHEN m.dispatch_order_id IS NOT NULL THEN {ORDER_EVENT}
                                   ELSE operations.event_for(ARRAY[{WH_CODE}], m.time) END
              FROM operations.disaster_events e
             WHERE e.id = CAST(:id AS uuid) AND m.event_id = e.id AND NOT coalesce({MOVE_MATCHES}, true)
            RETURNING m.id""",
        p,
        conn,
    )
    out["supplies"] = len(rows)
    return out


@router.get("")
async def list_events(codes: list[str] = Depends(MON)):
    """Các đợt (đang mở lên đầu), kèm số liệu chính trong phạm vi được giao."""
    return await fetch_all(
        EVENT_SELECT.replace(
            "SELECT e.id,",
            f"""SELECT (SELECT count(*) FROM operations.sos_tickets t WHERE t.event_id = e.id AND {area_clause("t.location", codes)})
                       AS sos,
                   (SELECT COALESCE(sum(t.trapped_count), 0) FROM operations.sos_tickets t
                     WHERE t.event_id = e.id AND t.status = 'hoan_thanh' AND t.close_reason IS NULL
                       AND {area_clause("t.location", codes)}) AS rescued,
                   (SELECT count(*) FROM communications.alert_broadcasts b
                     WHERE b.event_id = e.id AND b.status IN ('sending', 'sent')
                       AND (CAST(:all AS boolean) OR b.target_admin_codes && CAST(:codes AS text[]))) AS alerts,
                   e.id,""",
        )
        + f" WHERE {_visible(codes)} ORDER BY (e.ended_at IS NULL) DESC, e.started_at DESC LIMIT 200",
        {"codes": codes, "all": not codes},
    )


@router.post("", status_code=201)
async def create_event(body: EventIn, user: dict = Depends(MANAGE)):
    now = datetime.now(UTC)
    started = body.started_at or now
    if started.tzinfo is None:
        raise HTTPException(422, "Giờ bắt đầu phải kèm múi giờ (ISO 8601)")
    if started > now + timedelta(minutes=5):
        raise HTTPException(422, "Giờ bắt đầu không được ở tương lai")
    if started < now - timedelta(days=MAX_BACKDATE_DAYS):
        raise HTTPException(422, f"Giờ bắt đầu tối đa {MAX_BACKDATE_DAYS} ngày trước")
    admin_codes = _check_units(body.admin_codes)
    async with transaction() as conn:
        row = await fetch_one(
            """INSERT INTO operations.disaster_events (code, name, hazard, started_at, admin_codes, note, created_by)
               VALUES ('DT-' || to_char(CAST(:s AS timestamptz) AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY') || '-'
                         || lpad(nextval('operations.disaster_event_seq')::text, 3, '0'),
                       :n, :h, :s, CAST(:codes AS text[]), :note, CAST(:u AS uuid))
               RETURNING id, code""",
            {
                "n": body.name,
                "h": body.hazard,
                "s": started,
                "codes": admin_codes,
                "note": body.note,
                "u": user["id"],
            },
            conn,
        )
        attached = await _backfill(conn, str(row["id"]))
        await audit(
            user,
            "event.create",
            "disaster_event",
            row["code"],
            {**body.model_dump(mode="json"), "attached": attached},
            conn,
        )
    await log_event(
        f"Mở đợt thiên tai {row['code']}: {body.name} ({'toàn tỉnh' if not admin_codes else f'{len(admin_codes)} xã/phường'})",
        "canh_bao",
        "warning",
    )
    await hub.publish("events.changed", {"code": row["code"]})
    return {**(await _event_or_404(row["code"], [])), "attached": attached}


@router.patch("/{code}")
async def update_event(code: str, body: EventPatch, user: dict = Depends(MANAGE)):
    """Đổi tên / ghi chú / vùng ảnh hưởng. Đổi vùng → gỡ bản ghi của xã bỏ ra (gắn sang đợt khác nếu khớp), gắn bù bản ghi
    các xã mới — báo cáo luôn đúng vùng đang ghi."""
    event = await _event_or_404(code, [])
    changes = body.model_dump(exclude_unset=True)
    if "admin_codes" in changes:
        changes["admin_codes"] = _check_units(changes["admin_codes"] or [])
    if not changes:
        return event
    async with transaction() as conn:
        await fetch_one(
            """UPDATE operations.disaster_events
                  SET name = COALESCE(CAST(:n AS text), name), note = CASE WHEN :set_note THEN :note ELSE note END,
                      admin_codes = COALESCE(CAST(:codes AS text[]), admin_codes)
                WHERE id = CAST(:id AS uuid) RETURNING id""",
            {
                "id": str(event["id"]),
                "n": changes.get("name"),
                "set_note": "note" in changes,
                "note": changes.get("note"),
                "codes": changes.get("admin_codes"),
            },
            conn,
        )
        detached, attached = {}, {}
        if "admin_codes" in changes:
            detached = await _detach(conn, str(event["id"]))
            attached = await _backfill(conn, str(event["id"]))
        await audit(
            user,
            "event.update",
            "disaster_event",
            code,
            {**changes, "attached": attached, "detached": detached},
            conn,
        )
    await hub.publish("events.changed", {"code": code})
    return {**(await _event_or_404(code, [])), "attached": attached, "detached": detached}


@router.post("/{code}/end")
async def end_event(code: str, body: EventEnd, user: dict = Depends(MANAGE)):
    event = await _event_or_404(code, [])
    if event["ended_at"]:
        raise HTTPException(409, f"Đợt {code} đã kết thúc")
    now = datetime.now(UTC)
    ended = body.ended_at or now
    if ended.tzinfo is None:
        raise HTTPException(422, "Giờ kết thúc phải kèm múi giờ (ISO 8601)")
    if ended > now + timedelta(minutes=5) or ended < event["started_at"]:
        raise HTTPException(422, "Giờ kết thúc phải sau giờ bắt đầu và không ở tương lai")
    async with transaction() as conn:
        await fetch_one(
            """UPDATE operations.disaster_events SET ended_at = :e, end_note = :n, ended_by = CAST(:u AS uuid)
                WHERE id = CAST(:id AS uuid) AND ended_at IS NULL RETURNING id""",
            {"e": ended, "n": (body.end_note or "").strip() or None, "u": user["id"], "id": str(event["id"])},
            conn,
        )
        # Kết thúc lùi giờ (quên kết thúc đúng lúc): bản ghi đã tự gắn sau giờ kết thúc → gỡ ra
        detached = await _detach(conn, str(event["id"]))
        await audit(
            user,
            "event.end",
            "disaster_event",
            code,
            {**body.model_dump(mode="json"), "detached": detached},
            conn,
        )
    await log_event(f"Kết thúc đợt thiên tai {code}: {event['name']}", "canh_bao", "info")
    await hub.publish("events.changed", {"code": code})
    return {**(await _event_or_404(code, [])), "detached": detached}


@router.get("/{code}/summary")
async def event_summary(code: str, codes: list[str] = Depends(MON)):
    """Báo cáo theo đợt — chỉ số liệu trong phạm vi được giao (tài khoản xã: xã của mình)."""
    event = await _event_or_404(code, codes)
    p = {"id": str(event["id"]), "codes": codes, "all": not codes}
    in_area = area_clause("t.location", codes)
    sos = await fetch_one(
        f"""SELECT count(*) AS total, count(*) FILTER (WHERE status <> 'hoan_thanh') AS open,
                   count(*) FILTER (WHERE status = 'hoan_thanh') AS done,
                   COALESCE(sum(trapped_count) FILTER (WHERE {COUNTS_PEOPLE_SQL}), 0) AS trapped,
                   COALESCE(sum(trapped_count) FILTER (WHERE status = 'hoan_thanh' AND close_reason IS NULL), 0) AS rescued,
                   round((percentile_cont(0.5) WITHIN GROUP (
                       ORDER BY extract(epoch FROM acknowledged_at - received_at) / 60))::numeric, 1) AS median_ack_min
              FROM operations.sos_tickets t WHERE t.event_id = CAST(:id AS uuid) AND {in_area}""",
        p,
    )
    by_type = await fetch_all(
        f"""SELECT incident_type AS key, count(*) AS n FROM operations.sos_tickets t
             WHERE t.event_id = CAST(:id AS uuid) AND {in_area} GROUP BY 1 ORDER BY 2 DESC""",
        p,
    )
    per_day = await fetch_all(
        f"""SELECT {VN_DAY.format(col="received_at")} AS day,
                   count(*) FILTER (WHERE priority = 1) AS p1, count(*) FILTER (WHERE priority = 2) AS p2,
                   count(*) FILTER (WHERE priority = 3) AS p3
              FROM operations.sos_tickets t WHERE t.event_id = CAST(:id AS uuid) AND {in_area} GROUP BY 1 ORDER BY 1""",
        p,
    )
    by_commune = await fetch_all(
        f"""SELECT u.code, u.name, u.unit_type, count(*) AS sos,
                   COALESCE(sum(t.trapped_count) FILTER (WHERE {COUNTS_PEOPLE_SQL}), 0) AS trapped,
                   count(*) FILTER (WHERE t.status <> 'hoan_thanh') AS open
              FROM operations.sos_tickets t JOIN spatial_admin.administrative_units u ON u.id = t.admin_unit_id
             WHERE t.event_id = CAST(:id AS uuid) AND {in_area} GROUP BY u.code, u.name, u.unit_type ORDER BY 4 DESC, 2""",
        p,
    )
    dispatch = await fetch_one(
        f"""SELECT count(*) AS orders, count(*) FILTER (WHERE o.status = 'huy') AS cancelled,
                   count(DISTINCT o.force_id) AS forces, COALESCE(sum(o.personnel) FILTER (WHERE o.status <> 'huy'), 0) AS personnel
              FROM operations.dispatch_orders o JOIN operations.sos_tickets t ON t.id = o.ticket_id
             WHERE o.event_id = CAST(:id AS uuid) AND {in_area}""",
        p,
    )
    alerts = await fetch_all(
        """SELECT b.code, b.title, b.severity, b.status, COALESCE(b.sent_at, b.approved_at, b.created_at) AS time,
                  cardinality(b.target_admin_codes) AS communes
             FROM communications.alert_broadcasts b
            WHERE b.event_id = CAST(:id AS uuid) AND (CAST(:all AS boolean) OR b.target_admin_codes && CAST(:codes AS text[]))
            ORDER BY time DESC LIMIT 200""",
        p,
    )
    hazards = await fetch_all(
        f"""SELECT type AS key, level, count(*) AS n FROM iot_telemetry.hazard_zones z
             WHERE z.event_id = CAST(:id AS uuid) AND {unit_clause("z.admin_unit_id", codes)}
             GROUP BY 1, 2 ORDER BY 1, 2""",
        p,
    )
    supplies = await fetch_all(
        f"""SELECT m.item_code, i.name, i.unit,
                   COALESCE(-sum(m.delta) FILTER (WHERE m.reason IN ('xuat', 'xuat_dieu_dong')), 0) AS issued,
                   COALESCE(sum(m.delta) FILTER (WHERE m.reason = 'hoan_tra'), 0) AS returned,
                   COALESCE(sum(m.delta) FILTER (WHERE m.reason IN ('nhap', 'nhap_du_lieu') AND m.delta > 0), 0) AS received
              FROM resources.inventory_moves m
              LEFT JOIN resources.items i ON i.code = m.item_code
              LEFT JOIN resources.warehouses w ON w.id = m.warehouse_id
             WHERE m.event_id = CAST(:id AS uuid) AND {area_clause("w.location", codes)}
             GROUP BY m.item_code, i.name, i.unit
            -- chỉ mặt hàng có dòng được tính (bỏ mô phỏng, kiểm kê giảm tồn… — không thì thành dòng toàn số 0)
            HAVING count(*) FILTER (WHERE m.reason IN ('xuat', 'xuat_dieu_dong', 'hoan_tra')
                                       OR (m.reason IN ('nhap', 'nhap_du_lieu') AND m.delta > 0)) > 0
             ORDER BY 4 DESC, 2""",
        p,
    )
    # Sơ tán (lịch sử sơ tán, DB8) ở các xã thuộc vùng ảnh hưởng ∩ phạm vi. Lịch sử chỉ ghi khi số đổi → mỗi xã tính cả số
    # đang ghi lúc bắt đầu đợt (dòng cuối trước giờ bắt đầu): xã sơ tán từ trước khi mở đợt, trong đợt không sửa vẫn có tên
    evacuation = await fetch_all(
        f"""SELECT u.code, u.name, u.unit_type,
                   max(x.planned_households) AS planned_households, max(x.evacuated_households) AS peak_households,
                   max(x.planned_persons) AS planned_persons, max(x.evacuated_persons) AS peak_persons
              FROM operations.disaster_events e
              JOIN spatial_admin.administrative_units u ON e.admin_codes = '{{}}' OR u.code = ANY(e.admin_codes)
              CROSS JOIN LATERAL (
                  (SELECT h.planned_households, h.evacuated_households, h.planned_persons, h.evacuated_persons
                     FROM operations.evacuation_history h
                    WHERE h.admin_unit_id = u.id AND h.time < e.started_at ORDER BY h.time DESC LIMIT 1)
                  UNION ALL
                  SELECT h.planned_households, h.evacuated_households, h.planned_persons, h.evacuated_persons
                    FROM operations.evacuation_history h
                   WHERE h.admin_unit_id = u.id AND h.time >= e.started_at AND (e.ended_at IS NULL OR h.time < e.ended_at)
              ) x
             WHERE e.id = CAST(:id AS uuid) AND {unit_clause("u.id", codes)}
             GROUP BY u.code, u.name, u.unit_type HAVING max(x.evacuated_households) > 0 ORDER BY 5 DESC, 2""",
        p,
    )
    # Diễn biến sơ tán: tổng các xã theo mốc thời gian từ đầu đến cuối đợt (đợt đang mở: tới hiện tại), mỗi xã lấy số mới nhất
    # tính đến mốc. Mốc 1 giờ (đợt ≤ 3 ngày) / 6 giờ (≤ 15 ngày) / 1 ngày — tối đa ~75 điểm
    end = event["ended_at"] or datetime.now(UTC)
    hours = (end - event["started_at"]).total_seconds() / 3600
    step = "1 hour" if hours <= 72 else "6 hours" if hours <= 24 * 15 else "1 day"
    evacuation_timeline = await fetch_all(
        f"""WITH e AS (SELECT started_at, coalesce(ended_at, now()) AS ended_at, admin_codes
                         FROM operations.disaster_events WHERE id = CAST(:id AS uuid)),
                 u AS (SELECT a.id FROM spatial_admin.administrative_units a, e
                        WHERE (e.admin_codes = '{{}}' OR a.code = ANY(e.admin_codes)) AND {unit_clause("a.id", codes)}
                          AND EXISTS (SELECT 1 FROM operations.evacuation_history h
                                       WHERE h.admin_unit_id = a.id AND h.time <= e.ended_at)),
                 k AS (SELECT generate_series(e.started_at, e.ended_at, CAST(:step AS interval)) AS t FROM e
                       UNION SELECT ended_at FROM e)
            SELECT k.t AS time, COALESCE(sum(l.evacuated_households), 0) AS households,
                   COALESCE(sum(l.evacuated_persons), 0) AS persons, COALESCE(sum(l.planned_households), 0) AS planned_households
              FROM k CROSS JOIN u
              LEFT JOIN LATERAL (SELECT h.evacuated_households, h.evacuated_persons, h.planned_households
                                   FROM operations.evacuation_history h
                                  WHERE h.admin_unit_id = u.id AND h.time <= k.t ORDER BY h.time DESC LIMIT 1) l ON TRUE
             GROUP BY k.t ORDER BY k.t""",
        {**p, "step": step},
    )
    return {
        "event": event,
        "hazard_label": HAZARDS.get(event["hazard"], event["hazard"]),
        "scoped": bool(codes),
        "sos": {**sos, "by_type": by_type, "per_day": per_day, "by_commune": by_commune},
        "dispatch": dispatch,
        "alerts": alerts,
        "hazards": hazards,
        "supplies": supplies,
        "evacuation": evacuation,
        "evacuation_timeline": evacuation_timeline,
    }
