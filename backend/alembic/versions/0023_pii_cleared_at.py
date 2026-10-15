"""Thời hạn lưu dữ liệu cá nhân: cột đánh dấu đã ẩn (DB4 — docs/csdl-viec-con-lai.md)

Revision ID: 0023
Revises: 0022
"""

from pathlib import Path

from alembic import op

revision = "0023"
down_revision = "0022"
branch_labels = None
depends_on = None

SQL_FILE = Path(__file__).resolve().parents[1] / "sql" / "0023_pii_cleared_at.sql"


def upgrade() -> None:
    op.execute(SQL_FILE.read_text(encoding="utf-8"))


def downgrade() -> None:
    op.execute(
        """DROP INDEX IF EXISTS communications.call_logs_pii_due_idx;
           DROP INDEX IF EXISTS community.citizen_reports_pii_due_idx;
           DROP INDEX IF EXISTS operations.sos_tickets_pii_due_idx;
           ALTER TABLE communications.call_logs DROP COLUMN IF EXISTS pii_cleared_at;
           ALTER TABLE community.citizen_reports DROP COLUMN IF EXISTS pii_cleared_at;
           ALTER TABLE operations.sos_tickets DROP COLUMN IF EXISTS pii_cleared_at;"""
    )
