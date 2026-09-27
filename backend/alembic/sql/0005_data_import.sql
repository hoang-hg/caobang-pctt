-- Nhập dữ liệu chính thức (CSV / Excel / GeoJSON — app/services/data_import): mã định danh ổn định cho các bảng
-- chưa có, để nhập lại tệp đã sửa thì CẬP NHẬT đúng bản ghi thay vì thêm trùng.
-- Bản ghi cũ (dữ liệu mẫu) để trống mã; chế độ "thay toàn bộ" xoá cả chúng.

ALTER TABLE resources.evacuation_sites ADD COLUMN IF NOT EXISTS code text;
CREATE UNIQUE INDEX IF NOT EXISTS evacuation_sites_code_key ON resources.evacuation_sites (code);

ALTER TABLE resources.fuel_depots ADD COLUMN IF NOT EXISTS code text;
CREATE UNIQUE INDEX IF NOT EXISTS fuel_depots_code_key ON resources.fuel_depots (code);

ALTER TABLE iot_telemetry.hazard_zones ADD COLUMN IF NOT EXISTS code text;
CREATE UNIQUE INDEX IF NOT EXISTS hazard_zones_code_key ON iot_telemetry.hazard_zones (code);

ALTER TABLE iot_telemetry.hazard_points ADD COLUMN IF NOT EXISTS code text;
CREATE UNIQUE INDEX IF NOT EXISTS hazard_points_code_key ON iot_telemetry.hazard_points (code);

ALTER TABLE communications.contacts ADD COLUMN IF NOT EXISTS code text;
CREATE UNIQUE INDEX IF NOT EXISTS contacts_code_key ON communications.contacts (code);
