-- Tài khoản người dân của cổng công khai (kế hoạch làm mới giao diện, mục 11 — Đ5): người dân đăng ký mới gửi được phản
-- ánh / yêu cầu cứu hộ. TÁCH HẲN tài khoản cán bộ (communications.users): bảng riêng, phiên riêng (JWT aud "citizen").
-- Đăng nhập bằng số điện thoại (chưa xác minh — chưa có cổng SMS, quyết định 22/10/2026); email không bắt buộc, dùng để
-- tự lấy lại mật khẩu. Đồng ý cho cơ quan dùng thông tin để liên hệ xử lý (Nghị định 13/2023/NĐ-CP) — ghi thời điểm.

CREATE TABLE community.citizen_accounts (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone                 text NOT NULL,                       -- đã chuẩn hoá (chỉ chữ số, +84 → 0) — tên đăng nhập
  full_name             text NOT NULL CHECK (char_length(full_name) BETWEEN 2 AND 100),
  email                 text CHECK (email IS NULL OR char_length(email) <= 120),
  admin_unit_id         uuid REFERENCES spatial_admin.administrative_units (id) ON DELETE SET NULL, -- xã đang ở
  password_hash         text NOT NULL,
  token_version         integer NOT NULL DEFAULT 0,          -- tăng khi đổi / đặt lại mật khẩu, khoá → phiên cũ hết hiệu lực
  must_change_password  boolean NOT NULL DEFAULT false,      -- mật khẩu tạm do cán bộ đặt lại qua đường dây nóng
  is_active             boolean NOT NULL DEFAULT true,
  locked_reason         text,
  phone_verified_at     timestamptz,                         -- có cổng SMS (OTP) thì ghi; hiện để trống
  consent_at            timestamptz NOT NULL,                -- đồng ý dùng thông tin để liên hệ xử lý
  created_at            timestamptz NOT NULL DEFAULT now(),
  last_login_at         timestamptz
);
CREATE UNIQUE INDEX citizen_accounts_phone_key ON community.citizen_accounts (phone);
CREATE UNIQUE INDEX citizen_accounts_email_key ON community.citizen_accounts (lower(email)) WHERE email IS NOT NULL;

-- Phản ánh gửi khi đã đăng nhập → gắn tài khoản ("Phiếu của tôi"); tài khoản bị xoá thì phản ánh vẫn giữ
ALTER TABLE community.citizen_reports
  ADD COLUMN citizen_id uuid REFERENCES community.citizen_accounts (id) ON DELETE SET NULL;
CREATE INDEX citizen_reports_citizen_idx ON community.citizen_reports (citizen_id, created_at DESC) WHERE citizen_id IS NOT NULL;
