"""Xóm / tổ dân phố trong phản ánh của người dân

Revision ID: 0007
Revises: 0006
"""

from pathlib import Path

from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None

SQL_FILE = Path(__file__).resolve().parents[1] / "sql" / "0007_report_hamlet.sql"


def upgrade() -> None:
    op.execute(SQL_FILE.read_text(encoding="utf-8"))


def downgrade() -> None:
    op.execute("ALTER TABLE community.citizen_reports DROP COLUMN IF EXISTS hamlet_name")
