-- Link nhiệm vụ cho trưởng nhóm hiện trường (đặc tả "Trung tâm Điều hành Cứu hộ", 10/2026): dân quân / tổ cứu hộ thường
-- không có tài khoản → lệnh điều động sinh một mã bí mật, trực ban gửi kèm nội dung lệnh qua Zalo / SMS; trưởng nhóm mở
-- trên điện thoại (không đăng nhập) để xem điểm SOS và báo "đã đến" / "đã cứu an toàn" / "cần chi viện". KHÔNG lấy vị trí.
-- Chỉ lưu SHA-256 của mã; mã hết hiệu lực khi lệnh xong / huỷ, sau 72 giờ, hoặc khi trực ban cấp link mới.
ALTER TABLE operations.dispatch_orders ADD COLUMN IF NOT EXISTS mission_token_hash text;
ALTER TABLE operations.dispatch_orders ADD COLUMN IF NOT EXISTS mission_expires_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS dispatch_orders_mission_token_key
  ON operations.dispatch_orders (mission_token_hash) WHERE mission_token_hash IS NOT NULL;

-- Báo cáo từ hiện trường (qua link, hoặc trực ban ghi hộ khi đội báo qua bộ đàm). "Đã cứu an toàn" KHÔNG tự đóng phiếu:
-- trực ban xác nhận hoàn thành (link lộ ra ngoài cũng không đóng được phiếu đang cứu).
CREATE TABLE IF NOT EXISTS operations.dispatch_field_reports (
  id          bigserial PRIMARY KEY,
  order_id    uuid NOT NULL REFERENCES operations.dispatch_orders(id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('arrived', 'rescued', 'need_support')),
  people_safe int CHECK (people_safe >= 0),
  note        text,
  via         text NOT NULL DEFAULT 'link' CHECK (via IN ('link', 'staff')),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS dispatch_field_reports_order_idx
  ON operations.dispatch_field_reports (order_id, created_at DESC);
