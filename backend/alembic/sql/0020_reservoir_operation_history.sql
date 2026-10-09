-- Lịch sử vận hành hồ chứa (mực nước, cửa xả, lưu lượng theo thời gian) → biểu đồ "Vận hành hồ chứa" cạnh biểu đồ thủy văn
-- (thiết kế A.3). Bảng reservoirs chỉ giữ trạng thái MỚI NHẤT (mỗi lần cập nhật ghi đè) nên trước đây không vẽ được diễn biến.
CREATE TABLE IF NOT EXISTS iot_telemetry.reservoir_operations (
    reservoir_id     text NOT NULL REFERENCES iot_telemetry.reservoirs(id) ON DELETE CASCADE,
    time             timestamptz NOT NULL,          -- thời điểm của SỐ LIỆU (đơn vị vận hành báo), không phải lúc nhập
    current_level    double precision,
    spill_gates_open integer,
    inflow_m3s       double precision,
    outflow_m3s      double precision,
    PRIMARY KEY (reservoir_id, time)
);
SELECT create_hypertable('iot_telemetry.reservoir_operations', 'time', if_not_exists => TRUE, migrate_data => TRUE);

-- Mọi nguồn cập nhật số liệu vận hành (trực ban nhập, bộ mô phỏng, nguồn tự động sau này) đều ghi một dòng lịch sử —
-- không phụ thuộc từng nơi gọi nhớ ghi. Nhập danh mục hồ (thông số tĩnh, operating_at rỗng) không tạo lịch sử.
CREATE OR REPLACE FUNCTION iot_telemetry.log_reservoir_operation() RETURNS trigger AS $$
BEGIN
    IF NEW.operating_at IS NOT NULL AND (
        TG_OP = 'INSERT'
        OR NEW.operating_at IS DISTINCT FROM OLD.operating_at
        OR NEW.current_level IS DISTINCT FROM OLD.current_level
        OR NEW.spill_gates_open IS DISTINCT FROM OLD.spill_gates_open
        OR NEW.inflow_m3s IS DISTINCT FROM OLD.inflow_m3s
        OR NEW.outflow_m3s IS DISTINCT FROM OLD.outflow_m3s
    ) THEN
        INSERT INTO iot_telemetry.reservoir_operations
               (reservoir_id, time, current_level, spill_gates_open, inflow_m3s, outflow_m3s)
        VALUES (NEW.id, NEW.operating_at, NEW.current_level, NEW.spill_gates_open, NEW.inflow_m3s, NEW.outflow_m3s)
        ON CONFLICT (reservoir_id, time) DO UPDATE
           SET current_level = EXCLUDED.current_level, spill_gates_open = EXCLUDED.spill_gates_open,
               inflow_m3s = EXCLUDED.inflow_m3s, outflow_m3s = EXCLUDED.outflow_m3s;
    END IF;
    RETURN NEW;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS reservoir_operation_log ON iot_telemetry.reservoirs;
CREATE TRIGGER reservoir_operation_log
    AFTER INSERT OR UPDATE ON iot_telemetry.reservoirs
    FOR EACH ROW EXECUTE FUNCTION iot_telemetry.log_reservoir_operation();

-- Số liệu vận hành đang có → dòng đầu tiên của lịch sử
INSERT INTO iot_telemetry.reservoir_operations (reservoir_id, time, current_level, spill_gates_open, inflow_m3s, outflow_m3s)
SELECT id, operating_at, current_level, spill_gates_open, inflow_m3s, outflow_m3s
  FROM iot_telemetry.reservoirs WHERE operating_at IS NOT NULL
ON CONFLICT DO NOTHING;
