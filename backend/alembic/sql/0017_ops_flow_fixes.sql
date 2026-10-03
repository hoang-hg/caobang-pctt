-- Rà soát luồng vận hành người dân & cán bộ (10/2026).

-- 1. Cảnh báo có thời hạn hiệu lực và kết thúc được. Trước đây mọi lệnh đã duyệt hiện cố định 48 giờ trên cổng công khai,
--    "Tôi đang ở đâu?", bản nhẹ: lệnh sơ tán đã dỡ bỏ vẫn hiện; bão kéo dài quá 48 giờ thì cảnh báo tự biến mất.
--    valid_hours chọn khi soạn; valid_until đặt lúc duyệt (= lúc duyệt + valid_hours), gia hạn được; ended_* khi người
--    có quyền phê duyệt kết thúc (kèm PIN). Lệnh cũ: hiệu lực như trước (48 giờ từ lúc phát).
ALTER TABLE communications.alert_broadcasts
  ADD COLUMN IF NOT EXISTS valid_hours smallint NOT NULL DEFAULT 48 CHECK (valid_hours BETWEEN 1 AND 168);
ALTER TABLE communications.alert_broadcasts ADD COLUMN IF NOT EXISTS valid_until timestamptz;
ALTER TABLE communications.alert_broadcasts ADD COLUMN IF NOT EXISTS ended_at timestamptz;
ALTER TABLE communications.alert_broadcasts ADD COLUMN IF NOT EXISTS ended_by uuid REFERENCES communications.users(id);
ALTER TABLE communications.alert_broadcasts ADD COLUMN IF NOT EXISTS end_note text;
UPDATE communications.alert_broadcasts SET valid_until = COALESCE(sent_at, approved_at) + interval '48 hours'
 WHERE status IN ('sending', 'sent') AND valid_until IS NULL;

-- 2. Huỷ lệnh điều động (nhầm lực lượng, đội không tiếp cận được): trả quân số / phương tiện, ghi lý do. Trước đây
--    lực lượng bị giữ "đang làm nhiệm vụ" tới khi đóng cả phiếu SOS.
ALTER TABLE operations.dispatch_orders ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;
ALTER TABLE operations.dispatch_orders ADD COLUMN IF NOT EXISTS cancelled_by text;
ALTER TABLE operations.dispatch_orders ADD COLUMN IF NOT EXISTS cancel_reason text;

-- 3. Phản ánh đã chuyển SOS mà SOS đã cứu xong → "đã xử lý" (người dân tra cứu mã PA- trước đây thấy "đang xử lý" mãi).
--    Từ nay xác nhận hoàn thành SOS tự chuyển phản ánh liên quan (app/api/v1/sos.py).
UPDATE community.citizen_reports r SET status = 'da_xu_ly'
  FROM operations.sos_tickets t
 WHERE r.sos_ticket_id = t.id AND t.status = 'hoan_thanh' AND r.status = 'da_duyet';
