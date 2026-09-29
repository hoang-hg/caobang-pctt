"""Phiếu SOS: mã tin gốc của hệ thống gửi (chống tạo trùng khi webhook gửi lại)

Revision ID: 0011
Revises: 0010
"""

from pathlib import Path

from alembic import op

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None

SQL_FILE = Path(__file__).resolve().parents[1] / "sql" / "0011_sos_external_id.sql"


def upgrade() -> None:
    op.execute(SQL_FILE.read_text(encoding="utf-8"))


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS operations.sos_tickets_source_external_uq")
    op.execute("ALTER TABLE operations.sos_tickets DROP COLUMN IF EXISTS external_id")
