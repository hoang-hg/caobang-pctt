-- Mã tin gốc của hệ thống gửi phiếu SOS tự động (Zalo OA / ứng dụng — POST /sos/intake). Webhook hay gửi lại khi mất
-- mạng / hết thời gian chờ → cùng (nguồn, mã tin) chỉ tạo 1 phiếu, lần sau trả lại phiếu đã có (không điều 2 đội).
ALTER TABLE operations.sos_tickets ADD COLUMN IF NOT EXISTS external_id text;
CREATE UNIQUE INDEX IF NOT EXISTS sos_tickets_source_external_uq
    ON operations.sos_tickets (source, external_id) WHERE external_id IS NOT NULL;
