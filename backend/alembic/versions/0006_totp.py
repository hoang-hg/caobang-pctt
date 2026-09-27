"""Xác thực 2 lớp TOTP cho tài khoản cán bộ

Revision ID: 0006
Revises: 0005
"""

from pathlib import Path

from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None

SQL_FILE = Path(__file__).resolve().parents[1] / "sql" / "0006_totp.sql"
COLUMNS = ("totp_secret_enc", "totp_enabled_at", "totp_recovery_hashes", "totp_last_step")


def upgrade() -> None:
    op.execute(SQL_FILE.read_text(encoding="utf-8"))


def downgrade() -> None:
    for column in COLUMNS:
        op.execute(f"ALTER TABLE communications.users DROP COLUMN IF EXISTS {column}")
