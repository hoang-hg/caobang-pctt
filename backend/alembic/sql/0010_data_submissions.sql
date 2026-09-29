-- Hồ sơ dữ liệu do xã/phường gửi (quyền data.submit) chờ cấp tỉnh (data.import) phê duyệt.
-- Dữ liệu trong hồ sơ CHƯA ghi vào bảng nghiệp vụ → không hiện ở đâu (cổng công khai, màn hình điều hành) cho tới khi
-- được duyệt; lúc duyệt hệ thống kiểm tra lại tệp với dữ liệu hiện tại rồi ghi trong cùng transaction đổi trạng thái.
CREATE SEQUENCE IF NOT EXISTS operations.data_submission_code_seq START 1001;

CREATE TABLE IF NOT EXISTS operations.data_submissions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code         text UNIQUE NOT NULL DEFAULT ('HS-' || nextval('operations.data_submission_code_seq')),
  dataset      text NOT NULL,                     -- tên loại dữ liệu (app/services/data_import/specs.py)
  mode         text NOT NULL DEFAULT 'upsert' CHECK (mode IN ('upsert', 'replace')),
  filename     text NOT NULL,
  content      bytea NOT NULL,                    -- tệp gốc (CSV / Excel / GeoJSON; form nhập trên web sinh CSV/GeoJSON)
  scope_codes  text[],                            -- mã xã người gửi phụ trách lúc gửi; NULL = toàn tỉnh
  admin_codes  text[] NOT NULL DEFAULT '{}',      -- xã có bản ghi trong hồ sơ (hiển thị, lọc)
  note         text,                              -- ghi chú của người gửi
  summary      jsonb NOT NULL,                    -- báo cáo kiểm tra lúc gửi: số thêm / sửa / xoá, cảnh báo, xem trước
  status       text NOT NULL DEFAULT 'cho_duyet' CHECK (status IN ('cho_duyet', 'da_duyet', 'tu_choi', 'da_rut')),
  submitted_by uuid NOT NULL REFERENCES communications.users(id),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by  uuid REFERENCES communications.users(id),
  reviewed_at  timestamptz,
  review_note  text,                              -- lý do từ chối / ghi chú khi duyệt
  result       jsonb                              -- số bản ghi đã thêm / sửa / xoá khi duyệt
);
CREATE INDEX IF NOT EXISTS data_submissions_status_idx ON operations.data_submissions (status, submitted_at DESC);
CREATE INDEX IF NOT EXISTS data_submissions_submitter_idx ON operations.data_submissions (submitted_by, submitted_at DESC);
