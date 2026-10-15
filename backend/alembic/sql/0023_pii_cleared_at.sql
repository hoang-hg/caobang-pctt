-- DB4 (docs/csdl-viec-con-lai.md): thời hạn lưu dữ liệu cá nhân của người dân (Luật Bảo vệ dữ liệu cá nhân). Đánh dấu bản
-- ghi đã ẩn thông tin cá nhân — việc ẩn do services/retention.py làm theo PII_RETENTION_DAYS (0 = giữ mãi, mặc định).
ALTER TABLE operations.sos_tickets ADD COLUMN IF NOT EXISTS pii_cleared_at timestamptz;
ALTER TABLE community.citizen_reports ADD COLUMN IF NOT EXISTS pii_cleared_at timestamptz;
ALTER TABLE communications.call_logs ADD COLUMN IF NOT EXISTS pii_cleared_at timestamptz;
-- Tìm nhanh bản ghi đến hạn ẩn (chỉ bản chưa ẩn)
CREATE INDEX IF NOT EXISTS sos_tickets_pii_due_idx ON operations.sos_tickets (resolved_at)
    WHERE pii_cleared_at IS NULL AND status = 'hoan_thanh';
CREATE INDEX IF NOT EXISTS citizen_reports_pii_due_idx ON community.citizen_reports (created_at)
    WHERE pii_cleared_at IS NULL;
CREATE INDEX IF NOT EXISTS call_logs_pii_due_idx ON communications.call_logs (time) WHERE pii_cleared_at IS NULL;
