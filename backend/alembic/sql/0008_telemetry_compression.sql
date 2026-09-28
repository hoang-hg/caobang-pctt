-- Nén số đo quan trắc cũ hơn 7 ngày (columnstore TimescaleDB, thường giảm dung lượng ~10 lần; README 10.2).
-- Gom theo trạm, sắp theo thời gian giảm dần — khớp cách đọc (chuỗi số đo của 1 trạm). Vẫn ghi / sửa / xoá được vào
-- đoạn đã nén (thiết bị gửi bù số đo cũ). KHÔNG xoá dữ liệu: thời hạn lưu là quyết định của đơn vị chủ quản.
ALTER TABLE iot_telemetry.sensor_readings SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'station_id',
    timescaledb.compress_orderby = 'time DESC'
);
SELECT add_compression_policy('iot_telemetry.sensor_readings', INTERVAL '7 days', if_not_exists => true);
