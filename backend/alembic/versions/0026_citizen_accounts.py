"""Tài khoản người dân của cổng công khai (Đ5 — docs/ke-hoach-lam-moi-giao-dien.md mục 11)

Revision ID: 0026
Revises: 0025
"""

from pathlib import Path

from alembic import op

revision = "0026"
down_revision = "0025"
branch_labels = None
depends_on = None

SQL_FILE = Path(__file__).resolve().parents[1] / "sql" / "0026_citizen_accounts.sql"


def upgrade() -> None:
    op.execute(SQL_FILE.read_text(encoding="utf-8"))


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS community.citizen_reports_citizen_idx")
    op.execute("ALTER TABLE community.citizen_reports DROP COLUMN IF EXISTS citizen_id")
    op.execute("DROP TABLE IF EXISTS community.citizen_accounts")
