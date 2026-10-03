"""Bản đồ điều hành: vùng ngập theo kịch bản, bản tin bão, điểm sự cố có hạn hiệu lực

Revision ID: 0014
Revises: 0013
"""

from pathlib import Path

from alembic import op

revision = "0014"
down_revision = "0013"
branch_labels = None
depends_on = None

SQL_FILE = Path(__file__).resolve().parents[1] / "sql" / "0014_map_operations.sql"


def upgrade() -> None:
    op.execute(SQL_FILE.read_text(encoding="utf-8"))


def downgrade() -> None:
    op.execute(
        """ALTER TABLE iot_telemetry.hazard_points DROP CONSTRAINT IF EXISTS hazard_points_source_check;
           ALTER TABLE iot_telemetry.hazard_points
             DROP COLUMN IF EXISTS created_by, DROP COLUMN IF EXISTS report_id,
             DROP COLUMN IF EXISTS expires_at, DROP COLUMN IF EXISTS source;
           DROP TABLE IF EXISTS iot_telemetry.storm_bulletins;
           DROP TABLE IF EXISTS iot_telemetry.flood_scenarios;"""
    )
