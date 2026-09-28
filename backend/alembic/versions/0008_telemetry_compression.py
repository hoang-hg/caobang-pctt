"""Nén số đo quan trắc cũ hơn 7 ngày (TimescaleDB)

Revision ID: 0008
Revises: 0007
"""

from pathlib import Path

from alembic import op

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None

SQL_FILE = Path(__file__).resolve().parents[1] / "sql" / "0008_telemetry_compression.sql"


def upgrade() -> None:
    op.execute(SQL_FILE.read_text(encoding="utf-8"))


def downgrade() -> None:
    op.execute("SELECT remove_compression_policy('iot_telemetry.sensor_readings', if_exists => true)")
    op.execute(
        "SELECT decompress_chunk(c, if_compressed => true) FROM show_chunks('iot_telemetry.sensor_readings') c"
    )
    op.execute("ALTER TABLE iot_telemetry.sensor_readings SET (timescaledb.compress = false)")
