-- DB2 (docs/csdl-viec-con-lai.md): mỗi trạm chỉ một số đo tại một thời điểm. Trước đây chống trùng bằng "hỏi trước rồi ghi"
-- (integrations/ingest.py) — hai bản tin đến cùng lúc (HTTP + MQTT, thiết bị gửi lại sau mất mạng) đều qua bước hỏi và cùng
-- ghi → mưa cộng dồn bị tính đôi. Nay ghi bằng INSERT … ON CONFLICT DO NOTHING trên chỉ mục duy nhất.
-- Xoá bản trùng có sẵn (giữ 1 bản). Đã thử với TimescaleDB 2.30: xoá, tạo chỉ mục duy nhất, ON CONFLICT đều chạy được cả
-- trên đoạn đã nén (đoạn giữ nguyên trạng thái nén).
DELETE FROM iot_telemetry.sensor_readings a
 USING iot_telemetry.sensor_readings b
 WHERE a.station_id = b.station_id AND a.time = b.time AND a.ctid > b.ctid;
CREATE UNIQUE INDEX IF NOT EXISTS sensor_readings_station_time_uq ON iot_telemetry.sensor_readings (station_id, time DESC);
DROP INDEX IF EXISTS iot_telemetry.sensor_readings_station_id_time_idx; -- chỉ mục thường cùng cột, chỉ mục duy nhất thay thế

-- DB3: chỉ mục cho truy vấn vận hành khi phiếu, lệnh, nhật ký lên hàng vạn dòng
-- Công thức quá hạn SLA (services/sos.py: no_team_sql) kiểm tra "phiếu đã có đội đang đi / đã đến chưa" cho TỪNG phiếu;
-- khoá ngoại ticket_id trước đây không có chỉ mục
CREATE INDEX IF NOT EXISTS dispatch_orders_ticket_status_idx ON operations.dispatch_orders (ticket_id, status);
-- Danh sách phiếu theo khoảng thời gian, tra cứu hồ sơ 7 / 30 ngày
CREATE INDEX IF NOT EXISTS sos_tickets_received_at_idx ON operations.sos_tickets (received_at DESC);
-- Phiếu đang mở (bảng điều phối, ô KPI, tình hình từng xã) — phần lớn bảng là phiếu đã xong
CREATE INDEX IF NOT EXISTS sos_tickets_open_idx ON operations.sos_tickets (priority, received_at) WHERE status <> 'hoan_thanh';
-- Lệnh cảnh báo theo xã (&&, = ANY — trang Cảnh báo, "Tôi đang ở đâu?", tình hình từng xã) và theo vùng vẽ tay
CREATE INDEX IF NOT EXISTS alert_broadcasts_codes_gin ON communications.alert_broadcasts USING gin (target_admin_codes);
CREATE INDEX IF NOT EXISTS alert_broadcasts_polygon_gist ON communications.alert_broadcasts USING gist (target_polygon);
-- Nhật ký sự kiện lọc theo xã (Tổng quan, Cấp xã)
CREATE INDEX IF NOT EXISTS event_logs_unit_time_idx ON operations.event_logs (admin_unit_id, time DESC);
