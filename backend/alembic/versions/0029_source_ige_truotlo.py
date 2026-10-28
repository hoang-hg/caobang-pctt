"""Nguồn dữ liệu ige_truotlo: trạm đo mưa của Viện Địa công nghệ và Môi trường

Revision ID: 0029
Revises: 0028
"""

from pathlib import Path

from alembic import op

revision = "0029"
down_revision = "0028"
branch_labels = None
depends_on = None

SQL_FILE = Path(__file__).resolve().parents[1] / "sql" / "0029_source_ige_truotlo.sql"


def upgrade() -> None:
    op.execute(SQL_FILE.read_text(encoding="utf-8"))


def downgrade() -> None:
    op.execute("DELETE FROM integrations.data_sources WHERE type = 'ige_truotlo'")
    op.execute("ALTER TABLE integrations.data_sources DROP CONSTRAINT IF EXISTS data_sources_type_check")
    op.execute(
        """ALTER TABLE integrations.data_sources ADD CONSTRAINT data_sources_type_check
           CHECK (type IN ('open_meteo', 'openweather', 'http_ingest', 'mqtt', 'chirpstack'))"""
    )
