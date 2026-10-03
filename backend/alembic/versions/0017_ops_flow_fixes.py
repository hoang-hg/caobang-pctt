"""Rà soát luồng vận hành: cảnh báo có thời hạn / kết thúc được, huỷ lệnh điều động, phản ánh theo tiến độ SOS

Revision ID: 0017
Revises: 0016
"""

from pathlib import Path

from alembic import op

revision = "0017"
down_revision = "0016"
branch_labels = None
depends_on = None

SQL_FILE = Path(__file__).resolve().parents[1] / "sql" / "0017_ops_flow_fixes.sql"


def upgrade() -> None:
    op.execute(SQL_FILE.read_text(encoding="utf-8"))


def downgrade() -> None:
    # Phản ánh đã chuyển "đã xử lý" giữ nguyên (đúng thực tế: SOS đã cứu xong)
    op.execute(
        """ALTER TABLE operations.dispatch_orders DROP COLUMN IF EXISTS cancel_reason;
           ALTER TABLE operations.dispatch_orders DROP COLUMN IF EXISTS cancelled_by;
           ALTER TABLE operations.dispatch_orders DROP COLUMN IF EXISTS cancelled_at;
           ALTER TABLE communications.alert_broadcasts DROP COLUMN IF EXISTS end_note;
           ALTER TABLE communications.alert_broadcasts DROP COLUMN IF EXISTS ended_by;
           ALTER TABLE communications.alert_broadcasts DROP COLUMN IF EXISTS ended_at;
           ALTER TABLE communications.alert_broadcasts DROP COLUMN IF EXISTS valid_until;
           ALTER TABLE communications.alert_broadcasts DROP COLUMN IF EXISTS valid_hours;"""
    )
