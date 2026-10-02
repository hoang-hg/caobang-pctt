"""Mạng đường: đánh dấu sơ đồ vẽ tay (seed trình diễn) để chạy thật không dùng cho chỉ đường người dân

Revision ID: 0013
Revises: 0012
"""

from pathlib import Path

from alembic import op

revision = "0013"
down_revision = "0012"
branch_labels = None
depends_on = None

SQL_FILE = Path(__file__).resolve().parents[1] / "sql" / "0013_road_source.sql"


def upgrade() -> None:
    op.execute(SQL_FILE.read_text(encoding="utf-8"))


def downgrade() -> None:
    op.execute("ALTER TABLE operations.road_segments DROP COLUMN IF EXISTS source")
