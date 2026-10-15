"""Ngữ cảnh ghi sổ (DB7, DB8 — docs/csdl-viec-con-lai.md, migration 0024).

Sổ xuất – nhập kho (resources.inventory_moves) và lịch sử sơ tán (operations.evacuation_history) do trigger ghi mỗi khi số
liệu đổi — kể cả từ nơi không gọi hàm này (ghi "khác"). Hàm này báo cho trigger biết lý do, người thao tác, lệnh điều động,
ghi chú qua biến phiên CHỈ TRONG GIAO DỊCH hiện tại (set_config(…, is_local = true)): gọi trong cùng `transaction()` với câu
lệnh đổi số liệu, trước câu lệnh đó.
"""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncConnection

from app.db import execute

# Lý do hợp lệ — khớp CHECK của resources.inventory_moves.reason
MOVE_REASONS = ("nhap", "xuat", "xuat_dieu_dong", "hoan_tra", "nhap_du_lieu", "khoi_tao", "mo_phong", "khac")


async def ledger_context(
    conn: AsyncConnection,
    *,
    reason: str | None = None,
    actor_id: str | None = None,
    order_id: str | None = None,
    note: str | None = None,
) -> None:
    if reason is not None and reason not in MOVE_REASONS:
        raise ValueError(f"lý do ghi sổ không hợp lệ: {reason}")
    await execute(
        """SELECT set_config('pctt.move_reason', :r, true), set_config('pctt.actor_id', :a, true),
                  set_config('pctt.move_order', :o, true), set_config('pctt.move_note', :n, true)""",
        {
            "r": reason or "",
            "a": str(actor_id) if actor_id else "",
            "o": str(order_id) if order_id else "",
            "n": (note or "")[:500],
        },
        conn,
    )
