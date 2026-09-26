"""RBAC theo phạm vi địa bàn (Casbin rbac_with_domains)

Revision ID: 0002
Revises: 0001
"""

from pathlib import Path

from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None

SQL_FILE = Path(__file__).resolve().parents[1] / "sql" / "0002_rbac.sql"


def upgrade() -> None:
    op.execute(SQL_FILE.read_text(encoding="utf-8"))


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS communications.rbac_audit_log")
    op.execute("DROP TABLE IF EXISTS communications.rbac_role_metadata")
    op.execute("DROP TABLE IF EXISTS public.casbin_rule")
    op.execute("ALTER TABLE spatial_admin.administrative_units DROP COLUMN IF EXISTS rbac_domain")
    op.execute(
        "ALTER TABLE communications.users DROP COLUMN IF EXISTS token_version, DROP COLUMN IF EXISTS is_active, "
        "DROP COLUMN IF EXISTS created_by, DROP COLUMN IF EXISTS created_at, ADD COLUMN IF NOT EXISTS role text"
    )
