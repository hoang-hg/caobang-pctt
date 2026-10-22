"""Một chức năng gửi yêu cầu của người dân: tự tạo phiếu SOS, đóng phiếu không cần cứu

Revision ID: 0027
Revises: 0026
"""

from pathlib import Path

from alembic import op

revision = "0027"
down_revision = "0026"
branch_labels = None
depends_on = None

SQL_FILE = Path(__file__).resolve().parents[1] / "sql" / "0027_citizen_request_sos.sql"


def upgrade() -> None:
    op.execute(SQL_FILE.read_text(encoding="utf-8"))


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS community.citizen_reports_sos_idx")
    op.execute("ALTER TABLE operations.sos_tickets DROP CONSTRAINT IF EXISTS sos_tickets_close_reason_done")
    op.execute("ALTER TABLE operations.sos_tickets DROP COLUMN IF EXISTS close_reason")
    op.execute("UPDATE community.citizen_reports SET category = 'khac' WHERE category = 'tiep_te'")
    op.execute(
        "ALTER TABLE community.citizen_reports DROP CONSTRAINT IF EXISTS citizen_reports_category_check"
    )
    op.execute(
        """ALTER TABLE community.citizen_reports ADD CONSTRAINT citizen_reports_category_check
           CHECK (category IN ('ngap', 'sat_lo', 'lu_quet', 'cay_do', 'dut_dien', 'hu_hong_duong', 'sap_cau',
                               'mac_ket', 'khac'))"""
    )
