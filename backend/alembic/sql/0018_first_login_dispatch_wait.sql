-- Rà soát luồng vận hành lần 3 (10/2026).

-- 1. Bắt đổi mật khẩu lần đầu: tài khoản do cấp trên tạo, hoặc cấp trên đặt lại mật khẩu, dùng mật khẩu người khác biết
--    → lần đăng nhập tới phải đặt mật khẩu riêng rồi mới dùng được hệ thống (app/auth.py). Tự đổi mật khẩu / đặt lại qua
--    email thì bỏ cờ. Tài khoản cấp trên đã tạo mà chưa từng đổi mật khẩu: bật cờ luôn.
ALTER TABLE communications.users ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;
UPDATE communications.users SET must_change_password = true
 WHERE created_by IS NOT NULL AND password_changed_at IS NULL;

-- 2. Thời điểm phiếu SOS đổi trạng thái: phiếu "Đang điều phối" chưa có đội (trực ban kéo sang cột này, hoặc vừa huỷ lệnh
--    điều động) tính giờ "Chờ điều động" từ lúc này, quá SLA thì báo quá hạn như phiếu "Chờ xử lý". Trước đây kéo sang
--    "Đang điều phối" là dừng đồng hồ, phiếu không bao giờ quá hạn dù chưa có ai đi cứu.
ALTER TABLE operations.sos_tickets ADD COLUMN IF NOT EXISTS status_changed_at timestamptz NOT NULL DEFAULT now();
UPDATE operations.sos_tickets t
   SET status_changed_at = COALESCE(
         CASE t.status
           WHEN 'moi' THEN t.received_at
           WHEN 'hoan_thanh' THEN t.resolved_at
           WHEN 'thuc_thi' THEN (SELECT max(o.dispatched_at) FROM operations.dispatch_orders o WHERE o.ticket_id = t.id)
           ELSE GREATEST(t.acknowledged_at,
                         (SELECT max(o.cancelled_at) FROM operations.dispatch_orders o WHERE o.ticket_id = t.id))
         END,
         t.acknowledged_at, t.received_at);
