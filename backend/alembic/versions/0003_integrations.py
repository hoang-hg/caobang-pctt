"""Tích hợp dữ liệu ngoài: nguồn dự báo, thiết bị IoT, nhật ký tiếp nhận, dự báo theo xã

Revision ID: 0003
Revises: 0002
"""

from pathlib import Path

from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None

SQL_FILE = Path(__file__).resolve().parents[1] / "sql" / "0003_integrations.sql"


def upgrade() -> None:
    op.execute(SQL_FILE.read_text(encoding="utf-8"))


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS iot_telemetry.area_forecasts")
    op.execute("ALTER TABLE iot_telemetry.monitoring_stations DROP COLUMN IF EXISTS source")
    op.execute("DROP SCHEMA IF EXISTS integrations CASCADE")
