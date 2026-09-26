"""Scope loader: đọc tham số đường dẫn → domain RBAC của tài nguyên (xã chứa nó).

Trả ``None`` khi không tìm thấy (route trả 404 trước khi kiểm quyền, tránh lộ "có nhưng cấm").
"""

from app.db import fetch_one
from app.rbac import domains


def _uuid_or_none(value: str) -> str | None:
    import uuid

    try:
        return str(uuid.UUID(value))
    except ValueError:
        return None


async def sos_ticket(ticket_id: str) -> str | None:
    tid = _uuid_or_none(ticket_id)
    if not tid:
        return None
    row = await fetch_one(
        "SELECT admin_unit_id FROM operations.sos_tickets WHERE id = CAST(:id AS uuid)", {"id": tid}
    )
    return domains.domain_of_unit_id(row["admin_unit_id"]) if row else None


async def warehouse(warehouse_id: str) -> str | None:
    wid = _uuid_or_none(warehouse_id)
    if not wid:
        return None
    row = await fetch_one(
        "SELECT admin_unit_id FROM resources.warehouses WHERE id = CAST(:id AS uuid)", {"id": wid}
    )
    return domains.domain_of_unit_id(row["admin_unit_id"]) if row else None


async def vehicle(vehicle_id: str) -> str | None:
    """Phương tiện thuộc phạm vi đơn vị quản lý (lực lượng) của nó."""
    vid = _uuid_or_none(vehicle_id)
    if not vid:
        return None
    row = await fetch_one(
        """SELECT f.admin_unit_id FROM resources.vehicles v LEFT JOIN resources.forces f ON f.id = v.force_id
            WHERE v.id = CAST(:id AS uuid)""",
        {"id": vid},
    )
    return domains.domain_of_unit_id(row["admin_unit_id"]) if row else None


async def broadcast_domains(broadcast_id: str) -> list[str] | None:
    """Lệnh cảnh báo có thể nhắm nhiều xã → trả danh sách domain (phải có quyền trên TẤT CẢ)."""
    bid = _uuid_or_none(broadcast_id)
    if not bid:
        return None
    row = await fetch_one(
        "SELECT target_admin_codes FROM communications.alert_broadcasts WHERE id = CAST(:id AS uuid)",
        {"id": bid},
    )
    if not row:
        return None
    return targets_to_domains(row["target_admin_codes"])


def targets_to_domains(codes: list[str]) -> list[str]:
    ds = [domains.domain_of_code(c) for c in codes or []]
    ds = [d for d in ds if d]
    return ds or ["*"]


async def citizen_report(report_id: str) -> str | None:
    rid = _uuid_or_none(report_id)
    if not rid:
        return None
    row = await fetch_one(
        "SELECT admin_unit_id FROM community.citizen_reports WHERE id = CAST(:id AS uuid)", {"id": rid}
    )
    return domains.domain_of_unit_id(row["admin_unit_id"]) if row else None
