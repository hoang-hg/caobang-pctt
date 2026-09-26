"""Quên / đổi mật khẩu, phản ánh người dân

Revision ID: 0004
Revises: 0003
"""

from pathlib import Path

from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None

SQL_FILE = Path(__file__).resolve().parents[1] / "sql" / "0004_public_reports_auth.sql"


def upgrade() -> None:
    op.execute(SQL_FILE.read_text(encoding="utf-8"))


def downgrade() -> None:
    op.execute("DROP SCHEMA IF EXISTS community CASCADE")
    op.execute("DROP TABLE IF EXISTS communications.password_reset_tokens")
    op.execute("DROP INDEX IF EXISTS communications.users_email_lower")
    op.execute(
        "ALTER TABLE communications.users DROP COLUMN IF EXISTS email, DROP COLUMN IF EXISTS password_changed_at"
    )
