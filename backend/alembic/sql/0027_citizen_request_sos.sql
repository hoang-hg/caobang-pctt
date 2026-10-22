-- Một chức năng gửi yêu cầu của người dân (22/10/2026): người dân chọn "Cần cứu người" / "Cần tiếp tế" → hệ thống tạo phiếu
-- SOS ngay trong lần gửi, vào thẳng cột "Chờ xử lý" (thiết kế Part 2 mục J — "Phát tín hiệu SOS"), nối với phiếu yêu cầu
-- qua citizen_reports.sos_ticket_id. "Báo tin hiện trường" giữ luồng duyệt như cũ (cán bộ vẫn "Chuyển SOS" được).

-- Loại yêu cầu mới: cần tiếp tế (nước uống, lương thực, thuốc — phiếu SOS cấp 3 Vàng, thiết kế Part 1 mục D)
ALTER TABLE community.citizen_reports DROP CONSTRAINT IF EXISTS citizen_reports_category_check;
ALTER TABLE community.citizen_reports ADD CONSTRAINT citizen_reports_category_check
    CHECK (category IN ('ngap', 'sat_lo', 'lu_quet', 'cay_do', 'dut_dien', 'hu_hong_duong', 'sap_cau', 'mac_ket',
                        'tiep_te', 'khac'));

-- Đóng phiếu SOS KHÔNG CẦN CỨU (phiếu người dân gửi thẳng vào bảng → cán bộ xác minh tại bảng): trùng phiếu khác / không
-- xác minh được / người dân đã tự an toàn. NULL = đóng do cứu xong (hoặc phiếu chưa đóng). Phiếu đóng vẫn có status
-- 'hoan_thanh' → mọi truy vấn "phiếu đang mở" giữ nguyên; số người đã cứu không tính phiếu có close_reason.
ALTER TABLE operations.sos_tickets ADD COLUMN IF NOT EXISTS close_reason text
    CHECK (close_reason IN ('trung', 'khong_xac_minh', 'da_an_toan'));
DO $$ BEGIN
  ALTER TABLE operations.sos_tickets
    ADD CONSTRAINT sos_tickets_close_reason_done CHECK (close_reason IS NULL OR status = 'hoan_thanh');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Tìm phiếu yêu cầu của một phiếu SOS (bảng cứu hộ hiện mã + ảnh người dân gửi; đồng bộ trạng thái hai chiều)
CREATE INDEX IF NOT EXISTS citizen_reports_sos_idx ON community.citizen_reports (sos_ticket_id)
    WHERE sos_ticket_id IS NOT NULL;
