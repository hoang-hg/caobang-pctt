"""Mã định danh cho dữ liệu nhập từ tệp (điểm sơ tán, cây xăng, vùng / điểm nguy hiểm, danh bạ)

Revision ID: 0005
Revises: 0004
"""

from pathlib import Path

from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None

SQL_FILE = Path(__file__).resolve().parents[1] / "sql" / "0005_data_import.sql"
TABLES = (
    "resources.evacuation_sites",
    "resources.fuel_depots",
    "iot_telemetry.hazard_zones",
    "iot_telemetry.hazard_points",
    "communications.contacts",
)


def upgrade() -> None:
    op.execute(SQL_FILE.read_text(encoding="utf-8"))


def downgrade() -> None:
    for table in TABLES:
        op.execute(f"ALTER TABLE {table} DROP COLUMN IF EXISTS code")
