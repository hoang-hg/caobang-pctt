"""Bỏ nhóm lọc "Địa bàn … (cũ)" theo huyện cũ — giao diện chỉ dùng 56 xã/phường sau sắp xếp 01/07/2025

Revision ID: 0019
Revises: 0018
"""

from pathlib import Path

from alembic import op

revision = "0019"
down_revision = "0018"
branch_labels = None
depends_on = None

SQL_FILE = Path(__file__).resolve().parents[1] / "sql" / "0019_drop_old_district_presets.sql"


def upgrade() -> None:
    op.execute(SQL_FILE.read_text(encoding="utf-8"))


def downgrade() -> None:
    # Dựng lại các nhóm từ cột old_district (thứ tự mã DB_xx theo tên địa bàn, có thể khác lần tạo đầu)
    op.execute(
        """INSERT INTO spatial_admin.presets (code, name, description, hazard, kind, unit_codes)
           SELECT 'DB_' || lpad((row_number() OVER (ORDER BY old_district) - 1)::text, 2, '0'),
                  'Địa bàn ' || old_district || ' (cũ)',
                  count(*) || ' xã/phường thuộc địa bàn ' || old_district || ' trước 01/07/2025',
                  'tong_hop', 'dia_ban_cu', array_agg(code ORDER BY name)
             FROM spatial_admin.administrative_units
            WHERE level = 'xa' AND old_district IS NOT NULL
            GROUP BY old_district
           ON CONFLICT (code) DO NOTHING;
           UPDATE spatial_admin.presets
              SET description = 'Bảo Lâm, Bảo Lạc, Nguyên Bình — đèo Khau Cốc Chà, Mẻ Pia, Cao Bắc: trọng điểm sạt lở đất, lũ quét.'
            WHERE code = 'VUNG_NUI_CAO'
              AND description = 'Các xã vùng núi cao phía Tây tỉnh — đèo Khau Cốc Chà, Mẻ Pia, Cao Bắc: trọng điểm sạt lở đất, lũ quét.'"""
    )
