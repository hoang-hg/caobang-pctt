"""Vật tư & lực lượng: nhiên liệu chưa cập nhật = NULL, đội đến hiện trường, kho xuất vật tư khi điều động

Revision ID: 0015
Revises: 0014
"""

from pathlib import Path

from alembic import op

revision = "0015"
down_revision = "0014"
branch_labels = None
depends_on = None

SQL_FILE = Path(__file__).resolve().parents[1] / "sql" / "0015_logistics.sql"


def upgrade() -> None:
    op.execute(SQL_FILE.read_text(encoding="utf-8"))


def downgrade() -> None:
    op.execute(
        """ALTER TABLE resources.fuel_depots DROP COLUMN IF EXISTS updated_at;
           ALTER TABLE operations.dispatch_orders DROP COLUMN IF EXISTS supplies_warehouse_id;
           ALTER TABLE operations.dispatch_orders DROP COLUMN IF EXISTS arrived_at;
           ALTER TABLE resources.vehicles DROP COLUMN IF EXISTS status_note;
           ALTER TABLE resources.vehicles DROP COLUMN IF EXISTS fuel_updated_at;
           UPDATE resources.vehicles SET fuel_level = 100 WHERE fuel_level IS NULL;
           ALTER TABLE resources.vehicles ALTER COLUMN fuel_level SET DEFAULT 100;
           ALTER TABLE resources.vehicles ALTER COLUMN fuel_level SET NOT NULL;"""
    )
