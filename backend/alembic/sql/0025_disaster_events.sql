-- DB5 (docs/csdl-viec-con-lai.md): ĐỢT THIÊN TAI — gom phiếu SOS, lệnh điều động, lệnh cảnh báo, vùng nguy hiểm, dòng sổ kho
-- theo từng đợt (VD "Mưa lũ ngày 12–15/9/2026") để báo cáo, rút kinh nghiệm (thiết kế E.4), so sánh các đợt.
-- Gắn tự động bằng trigger: bản ghi tạo trong lúc có đợt đang mở ở xã thuộc vùng ảnh hưởng (vùng rỗng = toàn tỉnh) nhận mã
-- đợt — mọi nơi tạo (API, cổng nhận tin Zalo / ứng dụng, cảm biến tự động, nhập tệp) không phải tự gắn. Mở đợt có giờ bắt
-- đầu trong quá khứ → API gắn bù các bản ghi từ giờ đó; đổi vùng / kết thúc lùi giờ → API gỡ bản ghi ra ngoài (api/v1/events.py).
-- Trùng nhiều đợt → đợt bắt đầu muộn nhất.
CREATE SEQUENCE IF NOT EXISTS operations.disaster_event_seq;

CREATE TABLE IF NOT EXISTS operations.disaster_events (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code        text NOT NULL UNIQUE,                       -- DT-2026-001
    name        text NOT NULL CHECK (length(name) BETWEEN 3 AND 200),
    hazard      text NOT NULL CHECK (hazard IN ('mua_lon', 'lu_lut', 'lu_quet', 'sat_lo', 'bao', 'ret_hai', 'khac')),
    started_at  timestamptz NOT NULL,
    ended_at    timestamptz CHECK (ended_at IS NULL OR ended_at >= started_at),
    admin_codes text[] NOT NULL DEFAULT '{}',               -- vùng ảnh hưởng (mã xã); rỗng = toàn tỉnh
    note        text,
    end_note    text,
    created_by  uuid REFERENCES communications.users(id) ON DELETE SET NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),
    ended_by    uuid REFERENCES communications.users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS disaster_events_open_idx ON operations.disaster_events (started_at DESC) WHERE ended_at IS NULL;

ALTER TABLE operations.sos_tickets ADD COLUMN IF NOT EXISTS event_id uuid
    REFERENCES operations.disaster_events(id) ON DELETE SET NULL;
ALTER TABLE operations.dispatch_orders ADD COLUMN IF NOT EXISTS event_id uuid
    REFERENCES operations.disaster_events(id) ON DELETE SET NULL;
ALTER TABLE communications.alert_broadcasts ADD COLUMN IF NOT EXISTS event_id uuid
    REFERENCES operations.disaster_events(id) ON DELETE SET NULL;
ALTER TABLE iot_telemetry.hazard_zones ADD COLUMN IF NOT EXISTS event_id uuid
    REFERENCES operations.disaster_events(id) ON DELETE SET NULL;
ALTER TABLE resources.inventory_moves ADD COLUMN IF NOT EXISTS event_id uuid
    REFERENCES operations.disaster_events(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS sos_tickets_event_idx ON operations.sos_tickets (event_id) WHERE event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS dispatch_orders_event_idx ON operations.dispatch_orders (event_id) WHERE event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS alert_broadcasts_event_idx ON communications.alert_broadcasts (event_id) WHERE event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS hazard_zones_event_idx ON iot_telemetry.hazard_zones (event_id) WHERE event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS inventory_moves_event_idx ON resources.inventory_moves (event_id) WHERE event_id IS NOT NULL;

-- Đợt áp dụng cho các xã p_codes tại thời điểm p_at (đợt bắt đầu muộn nhất nếu trùng)
CREATE OR REPLACE FUNCTION operations.event_for(p_codes text[], p_at timestamptz) RETURNS uuid
LANGUAGE sql STABLE AS $$
    SELECT id FROM operations.disaster_events
     WHERE started_at <= p_at AND (ended_at IS NULL OR ended_at > p_at)
       AND (admin_codes = '{}' OR admin_codes && coalesce(p_codes, '{}'))
     ORDER BY started_at DESC LIMIT 1
$$;

CREATE OR REPLACE FUNCTION operations.unit_code(p_unit uuid) RETURNS text
LANGUAGE sql STABLE AS $$ SELECT code FROM spatial_admin.administrative_units WHERE id = p_unit $$;

CREATE OR REPLACE FUNCTION operations.assign_event() RETURNS trigger AS $$
BEGIN
    IF NEW.event_id IS NOT NULL THEN
        RETURN NEW;
    END IF;
    IF TG_TABLE_NAME = 'sos_tickets' THEN
        NEW.event_id := operations.event_for(ARRAY[operations.unit_code(NEW.admin_unit_id)], coalesce(NEW.received_at, now()));
    ELSIF TG_TABLE_NAME = 'dispatch_orders' THEN
        NEW.event_id := (SELECT event_id FROM operations.sos_tickets WHERE id = NEW.ticket_id);
    ELSIF TG_TABLE_NAME = 'alert_broadcasts' THEN
        NEW.event_id := operations.event_for(NEW.target_admin_codes, coalesce(NEW.created_at, now()));
    ELSIF TG_TABLE_NAME = 'hazard_zones' THEN
        NEW.event_id := operations.event_for(ARRAY[operations.unit_code(NEW.admin_unit_id)], coalesce(NEW.created_at, now()));
    ELSIF TG_TABLE_NAME = 'inventory_moves' THEN
        IF NEW.dispatch_order_id IS NOT NULL THEN
            -- Vật tư kèm lệnh điều động / hoàn trả khi huỷ lệnh: theo đợt của lệnh (phiếu SOS), không theo xã của kho —
            -- lệnh cho phiếu ngoài đợt thì dòng cũng ngoài đợt (xuất và hoàn trả luôn cùng đợt). Lúc điều động, dòng sổ ghi
            -- TRƯỚC lệnh (cùng giao dịch) → chưa thấy lệnh: để trống, trigger của lệnh (order_moves_event) gắn sau
            NEW.event_id := (SELECT event_id FROM operations.dispatch_orders WHERE id = NEW.dispatch_order_id);
        ELSE
            NEW.event_id := operations.event_for(
                ARRAY[(SELECT u.code FROM resources.warehouses w
                         JOIN spatial_admin.administrative_units u ON u.id = w.admin_unit_id WHERE w.id = NEW.warehouse_id)],
                coalesce(NEW.time, now()));
        END IF;
    END IF;
    RETURN NEW;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sos_tickets_event ON operations.sos_tickets;
CREATE TRIGGER sos_tickets_event BEFORE INSERT ON operations.sos_tickets
    FOR EACH ROW EXECUTE FUNCTION operations.assign_event();
DROP TRIGGER IF EXISTS dispatch_orders_event ON operations.dispatch_orders;
CREATE TRIGGER dispatch_orders_event BEFORE INSERT ON operations.dispatch_orders
    FOR EACH ROW EXECUTE FUNCTION operations.assign_event();
DROP TRIGGER IF EXISTS alert_broadcasts_event ON communications.alert_broadcasts;
CREATE TRIGGER alert_broadcasts_event BEFORE INSERT ON communications.alert_broadcasts
    FOR EACH ROW EXECUTE FUNCTION operations.assign_event();
DROP TRIGGER IF EXISTS hazard_zones_event ON iot_telemetry.hazard_zones;
CREATE TRIGGER hazard_zones_event BEFORE INSERT ON iot_telemetry.hazard_zones
    FOR EACH ROW EXECUTE FUNCTION operations.assign_event();
DROP TRIGGER IF EXISTS inventory_moves_event ON resources.inventory_moves;
CREATE TRIGGER inventory_moves_event BEFORE INSERT ON resources.inventory_moves
    FOR EACH ROW EXECUTE FUNCTION operations.assign_event();

-- Lệnh điều động vừa ghi → vật tư kèm lệnh (dòng sổ ghi trước trong cùng giao dịch) theo đợt của phiếu
CREATE OR REPLACE FUNCTION operations.order_moves_event() RETURNS trigger AS $$
BEGIN
    IF NEW.event_id IS NOT NULL THEN
        UPDATE resources.inventory_moves SET event_id = NEW.event_id
         WHERE dispatch_order_id = NEW.id AND event_id IS DISTINCT FROM NEW.event_id;
    END IF;
    RETURN NULL;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS dispatch_orders_moves_event ON operations.dispatch_orders;
CREATE TRIGGER dispatch_orders_moves_event AFTER INSERT ON operations.dispatch_orders
    FOR EACH ROW EXECUTE FUNCTION operations.order_moves_event();
