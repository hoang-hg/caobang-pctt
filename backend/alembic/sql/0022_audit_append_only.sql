-- DB1 (docs/csdl-viec-con-lai.md): nhật ký pháp lý CHỈ GHI THÊM. Nhật ký thao tác (ai tạo / duyệt / phát lệnh cảnh báo, điều
-- động, sửa dữ liệu… — thiết kế E.4) và nhật ký phân quyền là căn cứ truy xuất sau thiên tai: không ai được sửa / xoá / làm
-- rỗng, kể cả lỗi lập trình hay tài khoản ứng dụng bị lộ — trigger chặn mọi tài khoản không chủ động tắt trigger (tắt được
-- chỉ là chủ sở hữu bảng). Lớp thứ hai: tài khoản ứng dụng riêng không có quyền UPDATE / DELETE / TRUNCATE (DB1, bước sau).
-- Lệnh "python -m app.seed --reset" (chỉ máy dev / trình diễn / CI, bị chặn ở production) tạm tắt trigger khi làm rỗng.
CREATE OR REPLACE FUNCTION communications.audit_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'Nhật ký pháp lý (%) chỉ được ghi thêm — không sửa, không xoá', TG_TABLE_NAME
        USING ERRCODE = 'insufficient_privilege';
END
$$;

DROP TRIGGER IF EXISTS audit_logs_append_only ON communications.audit_logs;
CREATE TRIGGER audit_logs_append_only BEFORE UPDATE OR DELETE ON communications.audit_logs
    FOR EACH ROW EXECUTE FUNCTION communications.audit_append_only();
DROP TRIGGER IF EXISTS audit_logs_no_truncate ON communications.audit_logs;
CREATE TRIGGER audit_logs_no_truncate BEFORE TRUNCATE ON communications.audit_logs
    FOR EACH STATEMENT EXECUTE FUNCTION communications.audit_append_only();

DROP TRIGGER IF EXISTS rbac_audit_log_append_only ON communications.rbac_audit_log;
CREATE TRIGGER rbac_audit_log_append_only BEFORE UPDATE OR DELETE ON communications.rbac_audit_log
    FOR EACH ROW EXECUTE FUNCTION communications.audit_append_only();
DROP TRIGGER IF EXISTS rbac_audit_log_no_truncate ON communications.rbac_audit_log;
CREATE TRIGGER rbac_audit_log_no_truncate BEFORE TRUNCATE ON communications.rbac_audit_log
    FOR EACH STATEMENT EXECUTE FUNCTION communications.audit_append_only();
