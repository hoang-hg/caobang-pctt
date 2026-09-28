-- Thời điểm có số liệu VẬN HÀNH hồ chứa gần nhất (mực nước, cửa xả đang mở, lưu lượng). NULL = chưa có: nhập danh mục
-- hồ chỉ có thông số tĩnh → cổng công khai hiện "Chưa có số liệu vận hành" thay vì "Chưa xả tràn".
ALTER TABLE iot_telemetry.reservoirs ADD COLUMN IF NOT EXISTS operating_at timestamptz;
-- Hồ đã có số liệu (dữ liệu mẫu / cập nhật trước đây) giữ nguyên hiển thị
UPDATE iot_telemetry.reservoirs SET operating_at = updated_at WHERE current_level IS NOT NULL AND operating_at IS NULL;
