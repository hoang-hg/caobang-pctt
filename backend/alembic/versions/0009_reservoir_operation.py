"""Số liệu vận hành hồ chứa: thời điểm cập nhật (operating_at)

Revision ID: 0009
Revises: 0008
"""

from pathlib import Path

from alembic import op

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None

SQL_FILE = Path(__file__).resolve().parents[1] / "sql" / "0009_reservoir_operation.sql"


def upgrade() -> None:
    op.execute(SQL_FILE.read_text(encoding="utf-8"))


def downgrade() -> None:
    op.execute("ALTER TABLE iot_telemetry.reservoirs DROP COLUMN IF EXISTS operating_at")
