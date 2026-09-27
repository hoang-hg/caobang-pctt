-- ==============================================================================
-- DỌN DẸP DỮ LIỆU GIẢ LẬP — CHỈ DÙNG CHO CSDL CỦA MÁY PHÁT TRIỂN (docker-compose.yml)
--   node scripts/maintenance/clean-simulated-data.mjs --yes      (khuyên dùng: có kiểm tra môi trường)
-- XOÁ toàn bộ SOS, điều động, phản ánh, cảnh báo, cuộc gọi, số đo cảm biến; XOÁ mọi tài khoản ngoài danh sách bên
-- dưới và MỞ KHOÁ các tài khoản còn lại. Không bao giờ chạy trên production.
-- Chạy trực tiếp bằng psql phải xác nhận trước trong cùng phiên:  SET pctt.xac_nhan_don_dep = 'on';
-- ==============================================================================
DO $$
BEGIN
  IF current_setting('pctt.xac_nhan_don_dep', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Chưa xác nhận: chạy SET pctt.xac_nhan_don_dep = on; trước (chỉ CSDL máy phát triển)';
  END IF;
END $$;

-- 1. Xóa dữ liệu cứu nạn SOS & điều động lực lượng giả lập
TRUNCATE operations.dispatch_orders CASCADE;
TRUNCATE operations.sos_tickets CASCADE;
TRUNCATE operations.event_logs CASCADE;
ALTER SEQUENCE operations.sos_code_seq RESTART WITH 1001;

-- 2. Xóa dữ liệu phản ánh hiện trường giả lập của người dân
TRUNCATE community.citizen_reports CASCADE;

-- 3. Xóa tin cảnh báo và nhật ký cuộc gọi giả lập
TRUNCATE communications.alert_broadcasts CASCADE;
TRUNCATE communications.call_logs CASCADE;
ALTER SEQUENCE communications.broadcast_code_seq RESTART WITH 101;

-- 4. Xóa số liệu cảm biến giả lập sinh bởi simulator loop
TRUNCATE iot_telemetry.sensor_readings CASCADE;

-- 5. Thanh lọc tài khoản: Giữ lại tài khoản Admin Tổng và các Admin con chính quy
DELETE FROM communications.users WHERE username NOT IN (
    'admin', 'admin.tinh', 'chihuy', 'trucban',
    'admin.coba', 'admin.cathan', 'admin.thucphan',
    'chihuy.baolac', 'canbo.coba', 'thukho', 'xem'
);

DELETE FROM public.casbin_rule WHERE ptype = 'g' AND v0 NOT IN (
    'admin', 'admin.tinh', 'chihuy', 'trucban',
    'admin.coba', 'admin.cathan', 'admin.thucphan',
    'chihuy.baolac', 'canbo.coba', 'thukho', 'xem'
);

UPDATE communications.users SET is_active = TRUE;

-- 6. Kiểm tra lại số lượng bản ghi sau khi dọn dẹp
SELECT 
    (SELECT count(*) FROM operations.sos_tickets) AS sos_count,
    (SELECT count(*) FROM community.citizen_reports) AS reports_count,
    (SELECT count(*) FROM operations.dispatch_orders) AS dispatch_count,
    (SELECT count(*) FROM iot_telemetry.sensor_readings) AS readings_count,
    (SELECT count(*) FROM communications.alert_broadcasts) AS alerts_count,
    (SELECT count(*) FROM communications.users) AS users_count,
    (SELECT count(*) FROM spatial_admin.administrative_units WHERE level IN ('tinh', 'xa')) AS admin_units_count,
    (SELECT count(*) FROM iot_telemetry.reservoirs) AS reservoirs_count,
    (SELECT count(*) FROM iot_telemetry.monitoring_stations) AS stations_count;

SELECT u.username, u.full_name, u.email, u.position, g.v1 AS role, g.v2 AS domain
FROM communications.users u
LEFT JOIN public.casbin_rule g ON g.ptype = 'g' AND g.v0 = u.username
ORDER BY 
    CASE 
        WHEN g.v1 = 'super_admin' THEN 1
        WHEN g.v1 IN ('admin_tinh', 'truong_ban', 'truc_ban') THEN 2
        ELSE 3
    END, u.username;
