"""Link nhiệm vụ cho trưởng nhóm hiện trường + báo cáo từ hiện trường

Revision ID: 0016
Revises: 0015
"""

from pathlib import Path

from alembic import op

revision = "0016"
down_revision = "0015"
branch_labels = None
depends_on = None

SQL_FILE = Path(__file__).resolve().parents[1] / "sql" / "0016_mission_link.sql"


def upgrade() -> None:
    op.execute(SQL_FILE.read_text(encoding="utf-8"))


def downgrade() -> None:
    op.execute(
        """DROP TABLE IF EXISTS operations.dispatch_field_reports;
           DROP INDEX IF EXISTS operations.dispatch_orders_mission_token_key;
           ALTER TABLE operations.dispatch_orders DROP COLUMN IF EXISTS mission_expires_at;
           ALTER TABLE operations.dispatch_orders DROP COLUMN IF EXISTS mission_token_hash;"""
    )
