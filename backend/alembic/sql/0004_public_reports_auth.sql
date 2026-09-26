-- =====================================================================
-- Quên / đổi mật khẩu, phản ánh của người dân (ảnh lưu MinIO)
-- =====================================================================

-- Email tài khoản (nhận link đặt lại mật khẩu)
ALTER TABLE communications.users ADD COLUMN IF NOT EXISTS email text;
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower ON communications.users (lower(email)) WHERE email IS NOT NULL;
ALTER TABLE communications.users ADD COLUMN IF NOT EXISTS password_changed_at timestamptz;

CREATE TABLE communications.password_reset_tokens (
  id           bigserial PRIMARY KEY,
  user_id      uuid NOT NULL REFERENCES communications.users(id) ON DELETE CASCADE,
  token_hash   text NOT NULL UNIQUE,       -- SHA-256 của token (token gốc chỉ nằm trong email)
  expires_at   timestamptz NOT NULL,
  used_at      timestamptz,
  requested_ip text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON communications.password_reset_tokens (user_id);

-- Phản ánh hiện trường của người dân
CREATE SCHEMA IF NOT EXISTS community;
CREATE SEQUENCE community.report_code_seq START 1001;

CREATE TABLE community.citizen_reports (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code            text UNIQUE NOT NULL DEFAULT ('PA-' || nextval('community.report_code_seq')),
  category        text NOT NULL CHECK (category IN ('ngap', 'sat_lo', 'lu_quet', 'cay_do', 'dut_dien',
                                                    'hu_hong_duong', 'sap_cau', 'mac_ket', 'khac')),
  description     text NOT NULL,
  location        geometry(Point, 4326) NOT NULL,
  address         text,
  admin_unit_id   uuid REFERENCES spatial_admin.administrative_units(id),
  reporter_name   text,                        -- RIÊNG TƯ: không bao giờ trả qua API công khai
  reporter_phone  text,                        -- RIÊNG TƯ
  photos          jsonb NOT NULL DEFAULT '[]', -- [{key, thumb_key, width, height}]
  status          text NOT NULL DEFAULT 'cho_duyet'
                  CHECK (status IN ('cho_duyet', 'da_duyet', 'tu_choi', 'da_xu_ly')),
  public_note     text,                        -- ghi chú công khai của cán bộ (VD “đã cử lực lượng”)
  reject_reason   text,
  moderated_by    uuid REFERENCES communications.users(id),
  moderated_at    timestamptz,
  sos_ticket_id   uuid REFERENCES operations.sos_tickets(id),
  client_ip_hash  text,                        -- băm IP (chống spam, không lưu IP gốc)
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON community.citizen_reports USING gist (location);
CREATE INDEX ON community.citizen_reports (status, created_at DESC);
