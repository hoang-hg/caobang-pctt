"""Lịch sử vận hành hồ chứa (bảng reservoir_operations + trigger ghi mỗi lần có số liệu vận hành mới)

Revision ID: 0020
Revises: 0019
"""

from pathlib import Path

from alembic import op

revision = "0020"
down_revision = "0019"
branch_labels = None
depends_on = None

SQL_FILE = Path(__file__).resolve().parents[1] / "sql" / "0020_reservoir_operation_history.sql"


def upgrade() -> None:
    op.execute(SQL_FILE.read_text(encoding="utf-8"))


def downgrade() -> None:
    op.execute(
        """DROP TRIGGER IF EXISTS reservoir_operation_log ON iot_telemetry.reservoirs;
           DROP FUNCTION IF EXISTS iot_telemetry.log_reservoir_operation();
           DROP TABLE IF EXISTS iot_telemetry.reservoir_operations;"""
    )
