"""Lịch sử sơ tán ghi kèm nguồn báo

Revision ID: 0030
Revises: 0029
"""

from pathlib import Path

from alembic import op

revision = "0030"
down_revision = "0029"
branch_labels = None
depends_on = None

SQL_FILE = Path(__file__).resolve().parents[1] / "sql" / "0030_evacuation_history_source.sql"
SQL_0024 = Path(__file__).resolve().parents[1] / "sql" / "0024_inventory_moves_evacuation_history.sql"


def upgrade() -> None:
    op.execute(SQL_FILE.read_text(encoding="utf-8"))


def downgrade() -> None:
    # Trả hàm trigger về bản 0024 (không ghi nguồn) rồi bỏ cột
    sql = SQL_0024.read_text(encoding="utf-8")
    start = sql.index("CREATE OR REPLACE FUNCTION operations.log_evacuation()")
    end = sql.index("$$ LANGUAGE plpgsql;", start) + len("$$ LANGUAGE plpgsql;")
    op.execute(sql[start:end])
    op.execute("ALTER TABLE operations.evacuation_history DROP COLUMN IF EXISTS source")
