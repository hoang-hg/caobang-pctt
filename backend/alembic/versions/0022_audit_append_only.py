"""Nhật ký pháp lý chỉ ghi thêm: trigger chặn sửa / xoá / làm rỗng audit_logs, rbac_audit_log (DB1 — docs/csdl-viec-con-lai.md)

Revision ID: 0022
Revises: 0021
"""

from pathlib import Path

from alembic import op

revision = "0022"
down_revision = "0021"
branch_labels = None
depends_on = None

SQL_FILE = Path(__file__).resolve().parents[1] / "sql" / "0022_audit_append_only.sql"


def upgrade() -> None:
    op.execute(SQL_FILE.read_text(encoding="utf-8"))


def downgrade() -> None:
    op.execute(
        """DROP TRIGGER IF EXISTS rbac_audit_log_no_truncate ON communications.rbac_audit_log;
           DROP TRIGGER IF EXISTS rbac_audit_log_append_only ON communications.rbac_audit_log;
           DROP TRIGGER IF EXISTS audit_logs_no_truncate ON communications.audit_logs;
           DROP TRIGGER IF EXISTS audit_logs_append_only ON communications.audit_logs;
           DROP FUNCTION IF EXISTS communications.audit_append_only();"""
    )
