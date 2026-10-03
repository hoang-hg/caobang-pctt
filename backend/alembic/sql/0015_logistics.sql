-- Vật tư & lực lượng chạy thật (đối chiếu đặc tả "Quản lý Vật tư & Lực lượng cứu hộ", 10/2026).

-- 1. Nhiên liệu phương tiện: trước đây NOT NULL DEFAULT 100 mà không có cách cập nhật (tệp nhập, giao diện đều không có)
--    → khi chạy thật mọi phương tiện "100%", gợi ý điều động lọc theo số giả. Nay NULL = chưa cập nhật; fuel_updated_at =
--    lần báo gần nhất. Số 100 cũ không có nguồn ở bản chạy thật được seed xoá (seed.clear_unverified_fuel, DEMO_MODE=false).
ALTER TABLE resources.vehicles ALTER COLUMN fuel_level DROP NOT NULL;
ALTER TABLE resources.vehicles ALTER COLUMN fuel_level DROP DEFAULT;
ALTER TABLE resources.vehicles ADD COLUMN IF NOT EXISTS fuel_updated_at timestamptz;
ALTER TABLE resources.vehicles ADD COLUMN IF NOT EXISTS status_note text;  -- lý do bảo dưỡng / hỏng

-- 2. Lệnh điều động: thời điểm trực ban ghi "đội đã đến hiện trường" (chưa có GPS); kho xuất vật tư mang theo (nếu chọn
--    khi điều động — trừ tồn kho trong cùng giao dịch với lệnh).
ALTER TABLE operations.dispatch_orders ADD COLUMN IF NOT EXISTS arrived_at timestamptz;
ALTER TABLE operations.dispatch_orders
  ADD COLUMN IF NOT EXISTS supplies_warehouse_id uuid REFERENCES resources.warehouses(id) ON DELETE SET NULL;

-- 3. Điểm cấp nhiên liệu: thời điểm cập nhật số liệu xăng / dầu (trước đây chỉ có qua nhập tệp)
ALTER TABLE resources.fuel_depots ADD COLUMN IF NOT EXISTS updated_at timestamptz;
