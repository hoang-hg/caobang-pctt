"""Sổ xuất – nhập kho, lịch sử sơ tán, vá khoá ngoại (DB7, DB8, DB9 — docs/csdl-viec-con-lai.md)

Revision ID: 0024
Revises: 0023
"""

from pathlib import Path

from alembic import op

revision = "0024"
down_revision = "0023"
branch_labels = None
depends_on = None

SQL_FILE = Path(__file__).resolve().parents[1] / "sql" / "0024_inventory_moves_evacuation_history.sql"


def upgrade() -> None:
    op.execute(SQL_FILE.read_text(encoding="utf-8"))


def downgrade() -> None:
    op.execute(
        """DROP TRIGGER IF EXISTS dispatch_vehicles_check ON operations.dispatch_orders;
           DROP FUNCTION IF EXISTS operations.check_dispatch_vehicles();
           ALTER TABLE operations.dispatch_orders DROP COLUMN IF EXISTS cancelled_by_id,
                                                  DROP COLUMN IF EXISTS dispatched_by_id;
           ALTER TABLE resources.vehicles DROP CONSTRAINT IF EXISTS vehicles_mission_ticket_fk;
           DROP TRIGGER IF EXISTS evacuation_history_log ON operations.evacuation_progress;
           DROP FUNCTION IF EXISTS operations.log_evacuation();
           DROP TABLE IF EXISTS operations.evacuation_history;
           DROP TRIGGER IF EXISTS inventory_move_log ON resources.inventory;
           DROP FUNCTION IF EXISTS resources.log_inventory_move();
           DROP TABLE IF EXISTS resources.inventory_moves;"""
    )
