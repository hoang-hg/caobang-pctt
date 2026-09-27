-- Xác thực 2 lớp TOTP cho tài khoản cán bộ (app/mfa.py, README mục 11)
ALTER TABLE communications.users
    -- khoá TOTP, mã hoá Fernet bằng SECRET_KEY; có khoá mà totp_enabled_at NULL = đang cài đặt, chưa bật
    ADD COLUMN IF NOT EXISTS totp_secret_enc text,
    ADD COLUMN IF NOT EXISTS totp_enabled_at timestamptz,
    -- HMAC-SHA256 của mã khôi phục còn dùng được (mỗi mã dùng 1 lần)
    ADD COLUMN IF NOT EXISTS totp_recovery_hashes text[] NOT NULL DEFAULT '{}',
    -- bước thời gian (30 giây) của mã TOTP dùng gần nhất → không dùng lại được mã cũ
    ADD COLUMN IF NOT EXISTS totp_last_step bigint;
