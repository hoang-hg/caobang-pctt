"""Khởi tạo 5 schema CSDL điều hành (spatial_admin, resources, operations, iot_telemetry, communications)

Revision ID: 0001
Revises:
"""

from pathlib import Path

from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None

SQL_FILE = Path(__file__).resolve().parents[1] / "sql" / "0001_schema.sql"


def upgrade() -> None:
    op.execute(SQL_FILE.read_text(encoding="utf-8"))


def downgrade() -> None:
    for schema in ("communications", "iot_telemetry", "operations", "resources", "spatial_admin"):
        op.execute(f"DROP SCHEMA IF EXISTS {schema} CASCADE")
