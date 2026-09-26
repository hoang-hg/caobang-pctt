"""Nghiệp vụ phiếu SOS: tạo phiếu (từ tin nhắn thô hoặc dữ liệu có cấu trúc), đọc chi tiết."""

import random

from app.db import fetch_one
from app.services.events import log_event
from app.services.sos_nlp import extract
from app.ws.hub import hub

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
       t.resolved_at, t.notes, ST_Y(t.location) AS lat, ST_X(t.location) AS lon,
       u.code AS admin_code, u.name AS admin_name,
       d.id AS dispatch_id, d.status AS dispatch_status, d.eta, d.progress, d.distance_km, d.route_safe,
       f.name AS force_name, f.contact_phone AS force_phone, f.id AS force_id
  FROM operations.sos_tickets t
  LEFT JOIN spatial_admin.administrative_units u ON u.id = t.admin_unit_id
  LEFT JOIN LATERAL (SELECT * FROM operations.dispatch_orders o WHERE o.ticket_id = t.id AND o.status <> 'huy'
                      ORDER BY o.dispatched_at DESC LIMIT 1) d ON TRUE
  LEFT JOIN resources.forces f ON f.id = d.force_id
"""


async def get_ticket(ticket_id) -> dict | None:
    return await fetch_one(TICKET_SELECT + " WHERE t.id = CAST(:id AS uuid)", {"id": str(ticket_id)})


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
) -> dict:
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

    row = await fetch_one(
        """
        INSERT INTO operations.sos_tickets (reporter_name, reporter_phone, source, raw_message, address, admin_unit_id, location,
                                            incident_type, priority, trapped_count, vulnerable, notes)
        VALUES (:rn, :rp, :src, :msg, :addr,
                (SELECT id FROM spatial_admin.administrative_units WHERE level = 'xa'
                  ORDER BY geom <-> ST_SetSRID(ST_MakePoint(:lon, :lat), 4326) LIMIT 1),
                ST_SetSRID(ST_MakePoint(:lon, :lat), 4326), :it, :pr, :tc, :vu, :notes)
        RETURNING id
        """,
        {
            "rn": reporter_name,
            "rp": reporter_phone,
            "src": source,
            "msg": raw_message,
            "addr": address or (place["name"] if place else None),
            "lat": lat,
            "lon": lon,
            "it": incident_type or parsed.get("incident_type", "ngap_lut"),
            "pr": priority or parsed.get("priority", 2),
            "tc": trapped_count if trapped_count is not None else parsed.get("trapped_count", 0),
            "vu": vulnerable if vulnerable is not None else parsed.get("vulnerable", []),
            "notes": notes,
        },
    )
    ticket = await get_ticket(row["id"])
    ticket["parsed"] = parsed or None
    await hub.publish("sos.new", ticket)
    await log_event(
        f"{ticket['code']} – {INCIDENT_LABEL[ticket['incident_type']]} tại {ticket['address'] or ticket['admin_name']}"
        f" ({ticket['trapped_count']} người) qua {source}",
        "nguoi_dan",
        "danger" if ticket["priority"] == 1 else "warning",
        lat=lat,
        lon=lon,
    )
    return ticket
