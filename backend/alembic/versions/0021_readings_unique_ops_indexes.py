"""Số đo duy nhất theo (trạm, thời điểm) + chỉ mục cho truy vấn vận hành (DB2, DB3 — docs/csdl-viec-con-lai.md)

Revision ID: 0021
Revises: 0020
"""

from pathlib import Path

from alembic import op

revision = "0021"
down_revision = "0020"
branch_labels = None
depends_on = None

SQL_FILE = Path(__file__).resolve().parents[1] / "sql" / "0021_readings_unique_ops_indexes.sql"


def upgrade() -> None:
    op.execute(SQL_FILE.read_text(encoding="utf-8"))


def downgrade() -> None:
    op.execute(
        """DROP INDEX IF EXISTS operations.event_logs_unit_time_idx;
           DROP INDEX IF EXISTS communications.alert_broadcasts_polygon_gist;
           DROP INDEX IF EXISTS communications.alert_broadcasts_codes_gin;
           DROP INDEX IF EXISTS operations.sos_tickets_open_idx;
           DROP INDEX IF EXISTS operations.sos_tickets_received_at_idx;
           DROP INDEX IF EXISTS operations.dispatch_orders_ticket_status_idx;
           CREATE INDEX IF NOT EXISTS sensor_readings_station_id_time_idx
               ON iot_telemetry.sensor_readings (station_id, time DESC);
           DROP INDEX IF EXISTS iot_telemetry.sensor_readings_station_time_uq;"""
    )
