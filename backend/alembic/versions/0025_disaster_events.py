"""Đợt thiên tai: gắn phiếu SOS, lệnh điều động, cảnh báo, vùng nguy hiểm, sổ kho theo đợt (DB5 — docs/csdl-viec-con-lai.md)

Revision ID: 0025
Revises: 0024
"""

from pathlib import Path

from alembic import op

revision = "0025"
down_revision = "0024"
branch_labels = None
depends_on = None

SQL_FILE = Path(__file__).resolve().parents[1] / "sql" / "0025_disaster_events.sql"
TABLES = (
    ("operations.sos_tickets", "sos_tickets"),
    ("operations.dispatch_orders", "dispatch_orders"),
    ("communications.alert_broadcasts", "alert_broadcasts"),
    ("iot_telemetry.hazard_zones", "hazard_zones"),
    ("resources.inventory_moves", "inventory_moves"),
)


def upgrade() -> None:
    op.execute(SQL_FILE.read_text(encoding="utf-8"))


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS dispatch_orders_moves_event ON operations.dispatch_orders")
    op.execute("DROP FUNCTION IF EXISTS operations.order_moves_event()")
    for table, short in TABLES:
        op.execute(f"DROP TRIGGER IF EXISTS {short}_event ON {table}")
        op.execute(f"ALTER TABLE {table} DROP COLUMN IF EXISTS event_id")
    op.execute(
        """DROP FUNCTION IF EXISTS operations.assign_event();
           DROP FUNCTION IF EXISTS operations.unit_code(uuid);
           DROP FUNCTION IF EXISTS operations.event_for(text[], timestamptz);
           DROP TABLE IF EXISTS operations.disaster_events;
           DROP SEQUENCE IF EXISTS operations.disaster_event_seq;"""
    )
