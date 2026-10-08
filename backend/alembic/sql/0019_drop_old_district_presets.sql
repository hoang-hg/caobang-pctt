-- Chỉ dùng 56 xã/phường sau sắp xếp 01/07/2025 (Nghị quyết 1657/NQ-UBTVQH15) trên giao diện: bỏ các nhóm lọc
-- "Địa bàn … (cũ)" hệ thống tự tạo theo huyện cũ (kind = 'dia_ban_cu'). Nhóm lọc nhanh theo thiên tai (kind = 'luu_vuc')
-- giữ nguyên. Cột administrative_units.old_district giữ lại — chỉ dùng nội bộ cho chuỗi phạm vi RBAC "<CUM>/<MA_XA>" đã
-- cấp cho tài khoản (đổi chuỗi này phải đổi phạm vi của mọi tài khoản), không trả ra API / giao diện.
DELETE FROM spatial_admin.presets WHERE kind = 'dia_ban_cu';

-- Mô tả nhóm "Vùng núi cao & đèo dốc phía Tây" bỏ tên huyện cũ — chỉ sửa khi vẫn là câu do hệ thống tạo (BCH đã sửa qua
-- Nhập dữ liệu thì giữ nguyên)
UPDATE spatial_admin.presets
   SET description = 'Các xã vùng núi cao phía Tây tỉnh — đèo Khau Cốc Chà, Mẻ Pia, Cao Bắc: trọng điểm sạt lở đất, lũ quét.'
 WHERE code = 'VUNG_NUI_CAO'
   AND description = 'Bảo Lâm, Bảo Lạc, Nguyên Bình — đèo Khau Cốc Chà, Mẻ Pia, Cao Bắc: trọng điểm sạt lở đất, lũ quét.';
