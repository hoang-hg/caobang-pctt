"""Rà soát luồng vận hành lần 3: bắt đổi mật khẩu lần đầu, giờ "Chờ điều động" của phiếu SOS

Revision ID: 0018
Revises: 0017
"""

from pathlib import Path

from alembic import op

revision = "0018"
down_revision = "0017"
branch_labels = None
depends_on = None

SQL_FILE = Path(__file__).resolve().parents[1] / "sql" / "0018_first_login_dispatch_wait.sql"


def upgrade() -> None:
    op.execute(SQL_FILE.read_text(encoding="utf-8"))


def downgrade() -> None:
    op.execute(
        """ALTER TABLE operations.sos_tickets DROP COLUMN IF EXISTS status_changed_at;
           ALTER TABLE communications.users DROP COLUMN IF EXISTS must_change_password;"""
    )
