"""Danh mục điểm đen sạt lở, đèo dốc vào CSDL (trước nằm cứng trong mã)

Revision ID: 0028
Revises: 0027
"""

from pathlib import Path

from alembic import op

revision = "0028"
down_revision = "0027"
branch_labels = None
depends_on = None

SQL_DIR = Path(__file__).resolve().parents[1] / "sql"


def upgrade() -> None:
    op.execute((SQL_DIR / "0028_landslide_blackspots.sql").read_text(encoding="utf-8"))
    op.execute((SQL_DIR / "0028_landslide_blackspots_data.sql").read_text(encoding="utf-8"))


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS iot_telemetry.landslide_blackspots")
