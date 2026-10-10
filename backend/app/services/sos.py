"""Nghiệp vụ phiếu SOS: tạo phiếu (từ tin nhắn thô hoặc dữ liệu có cấu trúc), đọc chi tiết."""

import random
from collections.abc import Callable

from app.db import fetch_all, fetch_one
from app.rbac import domains
from app.services.events import log_event
from app.services.sos_nlp import extract
from app.ws.hub import hub

# Thời hạn phản hồi điều phối (phút) theo cấp ưu tiên — trung tâm cứu hộ và KPI "quá hạn" của dashboard dùng chung
SLA_MINUTES = {1: 3, 2: 15, 3: 60}
_SLA_INTERVAL = (
    "make_interval(mins => CASE t.priority "
    + " ".join(f"WHEN {p} THEN {m}" for p, m in SLA_MINUTES.items())
    + " ELSE 15 END)"
)


def no_team_sql(interval: str) -> str:
    """Phiếu CHƯA CÓ LỰC LƯỢNG TIẾP NHẬN quá `interval` (biểu thức SQL): "Chờ xử lý" kể từ lúc nhận tin; hoặc "Đang điều
    phối" mà chưa có đội nào đang đi / ở hiện trường ("Chờ điều động") kể từ lúc chuyển sang cột này / lúc huỷ lệnh trước
    — kéo phiếu sang "Đang điều phối" không dừng được đồng hồ khi chưa ai đi cứu."""
    return (
        f"((t.status = 'moi' AND t.received_at < now() - {interval})"
        f" OR (t.status = 'dieu_phoi' AND t.status_changed_at < now() - {interval}"
        " AND NOT EXISTS (SELECT 1 FROM operations.dispatch_orders o"
        " WHERE o.ticket_id = t.id AND o.status IN ('dang_di', 'da_den'))))"
    )


# Quá hạn phản hồi theo cấp ưu tiên (SLA) — trung tâm cứu hộ, "Việc chờ quyết định" và KPI "quá hạn" dùng chung
OVERDUE_SQL = no_team_sql(_SLA_INTERVAL)
# Ô KPI SOS của Tổng quan nhấp nháy đỏ thêm khi có phiếu chờ quá 15 phút chưa có lực lượng tiếp nhận, mọi cấp ưu tiên
# (thiết kế A.2) — phiếu cấp 3 (hạn 60 phút) chờ 15–60 phút vẫn được báo ở ô KPI, hạn của trung tâm cứu hộ không đổi
NO_TEAM_15M_SQL = no_team_sql("interval '15 minutes'")

SOURCE_LABEL = {
    "ZALO": "Zalo OA",
    "APP": "ứng dụng",
    "HOTLINE": "tổng đài",
    "SENSOR": "cảm biến",
    "CAN_BO": "cán bộ",
}

INCIDENT_LABEL = {
    "ngap_lut": "Ngập lụt",
    "sat_lo": "Sạt lở",
    "lu_quet": "Lũ quét",
    "sap_nha": "Sập nhà",
    "cap_cuu": "Cấp cứu",
    "tiep_te": "Tiếp tế",
}

TICKET_SELECT = """
SELECT t.id, t.code, t.reporter_name, t.reporter_phone, t.source, t.raw_message, t.address,
       t.incident_type, t.priority, t.status, t.trapped_count, t.vulnerable, t.received_at, t.acknowledged_at,
       t.resolved_at, t.status_changed_at, t.notes, ST_Y(t.location) AS lat, ST_X(t.location) AS lon,
       u.code AS admin_code, u.name AS admin_name,
       d.id AS dispatch_id, d.status AS dispatch_status, d.eta, d.progress, d.distance_km, d.route_safe,
       d.dispatched_at, d.arrived_at,
       f.name AS force_name, f.contact_phone AS force_phone, f.id AS force_id,
       d.supplies AS dispatch_supplies, wh.name AS supplies_warehouse,
       fr.kind AS field_kind, fr.people_safe AS field_people_safe, fr.note AS field_note, fr.via AS field_via,
       fr.created_at AS field_at
  FROM operations.sos_tickets t
  LEFT JOIN spatial_admin.administrative_units u ON u.id = t.admin_unit_id
  LEFT JOIN LATERAL (SELECT * FROM operations.dispatch_orders o WHERE o.ticket_id = t.id AND o.status <> 'huy'
                      ORDER BY o.dispatched_at DESC LIMIT 1) d ON TRUE
  LEFT JOIN resources.forces f ON f.id = d.force_id
  LEFT JOIN resources.warehouses wh ON wh.id = d.supplies_warehouse_id
  LEFT JOIN LATERAL (SELECT r.kind, r.people_safe, r.note, r.via, r.created_at
                       FROM operations.dispatch_field_reports r JOIN operations.dispatch_orders o2 ON o2.id = r.order_id
                      WHERE o2.ticket_id = t.id AND o2.status <> 'huy'
                      ORDER BY r.created_at DESC LIMIT 1) fr ON TRUE
"""


async def get_ticket(ticket_id, conn=None) -> dict | None:
    return await fetch_one(TICKET_SELECT + " WHERE t.id = CAST(:id AS uuid)", {"id": str(ticket_id)}, conn)


# Phiếu "có thể trùng": cùng SĐT (9 số cuối) hoặc cách nhau dưới DUPLICATE_RADIUS_M, trong DUPLICATE_WINDOW_MIN, chưa
# hoàn thành — một người gọi hotline 2 lần / nhiều người báo cùng một chỗ → trực ban gộp, không điều 2 đội
DUPLICATE_WINDOW_MIN = 30
DUPLICATE_RADIUS_M = 200


async def possible_duplicates(ticket_id, conn=None) -> list[str]:
    rows = await fetch_all(
        r"""SELECT o.code FROM operations.sos_tickets t
              JOIN operations.sos_tickets o ON o.id <> t.id
             WHERE t.id = CAST(:id AS uuid) AND o.status <> 'hoan_thanh'
               AND o.received_at > t.received_at - make_interval(mins => :w)
               AND ((length(regexp_replace(coalesce(t.reporter_phone, ''), '\D', '', 'g')) >= 6
                     AND right(regexp_replace(coalesce(o.reporter_phone, ''), '\D', '', 'g'), 9)
                       = right(regexp_replace(t.reporter_phone, '\D', '', 'g'), 9))
                    OR ST_DWithin(o.location::geography, t.location::geography, :r))
             ORDER BY o.received_at DESC LIMIT 5""",
        {"id": str(ticket_id), "w": DUPLICATE_WINDOW_MIN, "r": DUPLICATE_RADIUS_M},
        conn,
    )
    return [r["code"] for r in rows]


async def announce_ticket(ticket: dict, source: str) -> None:
    """Sự kiện realtime + nhật ký cho phiếu mới. Phiếu tạo trong transaction của nơi gọi (``create_ticket(conn=…)``) →
    nơi gọi gọi hàm này SAU khi commit (không báo một phiếu có thể còn bị rollback)."""
    await hub.publish("sos.new", ticket, "sos", ticket["admin_code"])
    dups = ticket.get("possible_duplicates") or []
    trapped = ticket["trapped_count"]
    await log_event(
        f"{ticket['code']} – {INCIDENT_LABEL[ticket['incident_type']]} tại {ticket['address'] or ticket['admin_name']}"
        + (f" ({trapped} người)" if trapped else "")
        + f" qua {SOURCE_LABEL.get(source, source)}"
        + (f" — có thể trùng {', '.join(dups)}" if dups else ""),
        "nguoi_dan",
        "danger" if ticket["priority"] == 1 else "warning",
        lat=ticket["lat"],
        lon=ticket["lon"],
    )


async def create_ticket(
    *,
    raw_message: str | None,
    source: str,
    reporter_name: str | None = None,
    reporter_phone: str | None = None,
    lat: float | None = None,
    lon: float | None = None,
    incident_type: str | None = None,
    priority: int | None = None,
    trapped_count: int | None = None,
    vulnerable: list[str] | None = None,
    address: str | None = None,
    notes: str | None = None,
    authorize: Callable[[str], None] | None = None,
    external_id: str | None = None,
    conn=None,
) -> dict:
    """Tạo phiếu SOS. ``external_id``: mã tin gốc của hệ thống gửi — gửi lại cùng (nguồn, mã) trả phiếu đã có
    (``duplicate: True``), không tạo / báo lại. ``conn``: tạo trong transaction của nơi gọi — khi đó KHÔNG phát sự
    kiện / ghi nhật ký; nơi gọi gọi ``announce_ticket`` sau khi commit. Kết quả kèm ``possible_duplicates``."""
    parsed = await extract(raw_message) if raw_message else {}
    place = parsed.get("place")
    if lat is None or lon is None:
        if parsed.get("coords"):
            lat, lon = parsed["coords"]
        elif place:
            # rải nhẹ quanh tâm địa danh để các phiếu không chồng lên nhau
            lat = place["lat"] + random.uniform(-0.004, 0.004)
            lon = place["lon"] + random.uniform(-0.004, 0.004)
        else:
            raise ValueError("Không xác định được vị trí — hãy nhập toạ độ hoặc tên thôn/xã")

    unit = await fetch_one(
        """SELECT id FROM spatial_admin.administrative_units WHERE level = 'xa'
            ORDER BY geom <-> ST_SetSRID(ST_MakePoint(:lon, :lat), 4326) LIMIT 1""",
        {"lat": lat, "lon": lon},
    )
    if authorize:  # kiểm tra quyền theo xã của vị trí TRƯỚC khi ghi
        authorize(domains.domain_of_unit_id(unit["id"] if unit else None))

    row = await fetch_one(
        """
        INSERT INTO operations.sos_tickets (reporter_name, reporter_phone, source, raw_message, address, admin_unit_id, location,
                                            incident_type, priority, trapped_count, vulnerable, notes, external_id)
        VALUES (:rn, :rp, :src, :msg, :addr, :unit,
                ST_SetSRID(ST_MakePoint(:lon, :lat), 4326), :it, :pr, :tc, :vu, :notes, :ext)
        ON CONFLICT (source, external_id) WHERE external_id IS NOT NULL DO NOTHING
        RETURNING id
        """,
        {
            "ext": external_id,
            "rn": reporter_name,
            "rp": reporter_phone,
            "src": source,
            "msg": raw_message,
            "addr": address or (place["name"] if place else None),
            "unit": unit["id"] if unit else None,
            "lat": lat,
            "lon": lon,
            "it": incident_type or parsed.get("incident_type", "ngap_lut"),
            "pr": priority or parsed.get("priority", 2),
            "tc": trapped_count if trapped_count is not None else parsed.get("trapped_count", 0),
            "vu": vulnerable if vulnerable is not None else parsed.get("vulnerable", []),
            "notes": notes,
        },
        conn,
    )
    if row is None:  # webhook gửi lại cùng mã tin → phiếu đã có, không tạo mới, không báo lại
        existing = await fetch_one(
            "SELECT id FROM operations.sos_tickets WHERE source = :s AND external_id = :e",
            {"s": source, "e": external_id},
            conn,
        )
        ticket = await get_ticket(existing["id"], conn)
        ticket["duplicate"] = True
        return ticket
    ticket = await get_ticket(row["id"], conn)
    ticket["parsed"] = parsed or None
    ticket["possible_duplicates"] = await possible_duplicates(row["id"], conn)
    if conn is None:
        await announce_ticket(ticket, source)
    return ticket
