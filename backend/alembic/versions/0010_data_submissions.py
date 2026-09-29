"""Hồ sơ dữ liệu xã/phường gửi chờ cấp tỉnh phê duyệt

Revision ID: 0010
Revises: 0009
"""

from pathlib import Path

from alembic import op

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None

SQL_FILE = Path(__file__).resolve().parents[1] / "sql" / "0010_data_submissions.sql"


def upgrade() -> None:
    op.execute(SQL_FILE.read_text(encoding="utf-8"))


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS operations.data_submissions")
    op.execute("DROP SEQUENCE IF EXISTS operations.data_submission_code_seq")
