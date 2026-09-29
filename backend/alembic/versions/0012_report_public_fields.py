"""Phản ánh: nội dung / vị trí / ảnh công khai do cán bộ duyệt; mã tra cứu cho phản ánh không để lại SĐT

Revision ID: 0012
Revises: 0011
"""

from pathlib import Path

from alembic import op

revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None

SQL_FILE = Path(__file__).resolve().parents[1] / "sql" / "0012_report_public_fields.sql"


def upgrade() -> None:
    op.execute(SQL_FILE.read_text(encoding="utf-8"))


def downgrade() -> None:
    op.execute(
        """ALTER TABLE community.citizen_reports DROP COLUMN IF EXISTS public_description,
               DROP COLUMN IF EXISTS public_location, DROP COLUMN IF EXISTS public_photos, DROP COLUMN IF EXISTS track_key"""
    )
