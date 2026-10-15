-- DB7, DB8, DB9 (docs/csdl-viec-con-lai.md): sổ xuất – nhập kho, lịch sử sơ tán, vá khoá ngoại.
-- Bảng tồn kho / tiến độ sơ tán chỉ giữ số MỚI NHẤT → không trả lời được "đã cấp bao nhiêu cho xã X", "sơ tán diễn biến ra
-- sao trong đợt". Ghi bằng trigger (như lịch sử vận hành hồ, migration 0020): mọi nơi đổi số liệu — API, nhập dữ liệu, bộ
-- mô phỏng, nơi viết sau này — đều được ghi, không phụ thuộc từng nơi gọi nhớ ghi. Lý do / người thao tác / lệnh điều động
-- do ứng dụng báo qua biến phiên của giao dịch (set_config(…, true) — services/ledger.py); không báo → ghi "khác".

-- ---------------------------------------------------------------- DB7: sổ xuất – nhập kho
CREATE TABLE IF NOT EXISTS resources.inventory_moves (
    id                bigserial PRIMARY KEY,
    time              timestamptz NOT NULL DEFAULT now(),
    -- Kho bị xoá (nhập lại danh sách kho, chế độ thay toàn bộ) → sổ vẫn giữ, nhận ra kho bằng mã / tên lưu kèm
    warehouse_id      uuid REFERENCES resources.warehouses(id) ON DELETE SET NULL,
    warehouse_code    text NOT NULL,
    warehouse_name    text NOT NULL,
    item_code         text NOT NULL,              -- không khoá ngoại: danh mục vật tư sửa / thay được, sổ vẫn giữ
    delta             integer NOT NULL CHECK (delta <> 0),   -- + nhập, − xuất
    quantity_after    integer NOT NULL,
    reason            text NOT NULL CHECK (reason IN (
                          'nhap',            -- nhập hàng (cứu trợ về, mua bổ sung)
                          'xuat',            -- xuất kho cấp phát
                          'xuat_dieu_dong',  -- vật tư kèm lệnh điều động
                          'hoan_tra',        -- huỷ lệnh điều động, trả vật tư về kho
                          'nhap_du_lieu',    -- nhập / thay tồn kho bằng tệp (kiểm kê)
                          'khoi_tao',        -- mặt hàng mới có trong kho (tồn đầu kỳ)
                          'mo_phong',        -- bộ mô phỏng (máy thử)
                          'khac')),
    -- Kiểm tra cuối giao dịch: điều động trừ vật tư TRƯỚC khi ghi lệnh (cùng giao dịch, mã lệnh tạo sẵn)
    dispatch_order_id uuid REFERENCES operations.dispatch_orders(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
    actor_id          uuid REFERENCES communications.users(id) ON DELETE SET NULL,
    note              text
);
CREATE INDEX IF NOT EXISTS inventory_moves_warehouse_time_idx ON resources.inventory_moves (warehouse_id, time DESC);
CREATE INDEX IF NOT EXISTS inventory_moves_time_idx ON resources.inventory_moves (time DESC);
CREATE INDEX IF NOT EXISTS inventory_moves_order_idx ON resources.inventory_moves (dispatch_order_id)
    WHERE dispatch_order_id IS NOT NULL;

CREATE OR REPLACE FUNCTION resources.log_inventory_move() RETURNS trigger AS $$
DECLARE
    v_wid    uuid;
    v_item   text;
    v_delta  integer;
    v_after  integer;
    v_reason text := nullif(current_setting('pctt.move_reason', true), '');
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_wid := OLD.warehouse_id; v_item := OLD.item_code; v_delta := -OLD.quantity; v_after := 0;
    ELSIF TG_OP = 'INSERT' THEN
        v_wid := NEW.warehouse_id; v_item := NEW.item_code; v_delta := NEW.quantity; v_after := NEW.quantity;
        v_reason := coalesce(v_reason, 'khoi_tao');
    ELSE
        v_wid := NEW.warehouse_id; v_item := NEW.item_code; v_delta := NEW.quantity - OLD.quantity; v_after := NEW.quantity;
    END IF;
    IF v_delta = 0 THEN
        RETURN NULL;
    END IF;
    -- Kho đang bị xoá cùng lúc (xoá tồn kho theo khoá ngoại) → không còn dòng kho: bỏ qua, không ghi sổ cho kho đã xoá
    INSERT INTO resources.inventory_moves
           (warehouse_id, warehouse_code, warehouse_name, item_code, delta, quantity_after, reason, dispatch_order_id,
            actor_id, note)
    SELECT w.id, w.code, w.name, v_item, v_delta, v_after, coalesce(v_reason, 'khac'),
           CAST(nullif(current_setting('pctt.move_order', true), '') AS uuid),
           CAST(nullif(current_setting('pctt.actor_id', true), '') AS uuid),
           nullif(current_setting('pctt.move_note', true), '')
      FROM resources.warehouses w WHERE w.id = v_wid;
    RETURN NULL;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS inventory_move_log ON resources.inventory;
CREATE TRIGGER inventory_move_log
    AFTER INSERT OR DELETE OR UPDATE OF quantity ON resources.inventory
    FOR EACH ROW EXECUTE FUNCTION resources.log_inventory_move();

-- ---------------------------------------------------------------- DB8: lịch sử sơ tán
CREATE TABLE IF NOT EXISTS operations.evacuation_history (
    admin_unit_id        uuid NOT NULL REFERENCES spatial_admin.administrative_units(id) ON DELETE CASCADE,
    time                 timestamptz NOT NULL,
    planned_households   integer NOT NULL,
    evacuated_households integer NOT NULL,
    planned_persons      integer NOT NULL,
    evacuated_persons    integer NOT NULL,
    actor_id             uuid REFERENCES communications.users(id) ON DELETE SET NULL,
    PRIMARY KEY (admin_unit_id, time)
);
CREATE INDEX IF NOT EXISTS evacuation_history_time_idx ON operations.evacuation_history (time DESC);

CREATE OR REPLACE FUNCTION operations.log_evacuation() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'INSERT'
       OR NEW.planned_households IS DISTINCT FROM OLD.planned_households
       OR NEW.evacuated_households IS DISTINCT FROM OLD.evacuated_households
       OR NEW.planned_persons IS DISTINCT FROM OLD.planned_persons
       OR NEW.evacuated_persons IS DISTINCT FROM OLD.evacuated_persons THEN
        INSERT INTO operations.evacuation_history
               (admin_unit_id, time, planned_households, evacuated_households, planned_persons, evacuated_persons, actor_id)
        VALUES (NEW.admin_unit_id, now(), NEW.planned_households, NEW.evacuated_households, NEW.planned_persons,
                NEW.evacuated_persons, CAST(nullif(current_setting('pctt.actor_id', true), '') AS uuid))
        ON CONFLICT (admin_unit_id, time) DO UPDATE   -- 2 lần sửa trong cùng giao dịch: giữ số sau cùng
           SET planned_households = EXCLUDED.planned_households, evacuated_households = EXCLUDED.evacuated_households,
               planned_persons = EXCLUDED.planned_persons, evacuated_persons = EXCLUDED.evacuated_persons,
               actor_id = EXCLUDED.actor_id;
    END IF;
    RETURN NULL;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS evacuation_history_log ON operations.evacuation_progress;
CREATE TRIGGER evacuation_history_log
    AFTER INSERT OR UPDATE ON operations.evacuation_progress
    FOR EACH ROW EXECUTE FUNCTION operations.log_evacuation();

-- Số liệu hiện có = điểm đầu của lịch sử
INSERT INTO operations.evacuation_history
       (admin_unit_id, time, planned_households, evacuated_households, planned_persons, evacuated_persons)
SELECT admin_unit_id, updated_at, planned_households, evacuated_households, planned_persons, evacuated_persons
  FROM operations.evacuation_progress
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------- DB9: toàn vẹn tham chiếu
-- Phương tiện đang làm nhiệm vụ cho phiếu nào
UPDATE resources.vehicles v SET mission_ticket_id = NULL
 WHERE mission_ticket_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM operations.sos_tickets t WHERE t.id = v.mission_ticket_id);
ALTER TABLE resources.vehicles DROP CONSTRAINT IF EXISTS vehicles_mission_ticket_fk;
ALTER TABLE resources.vehicles ADD CONSTRAINT vehicles_mission_ticket_fk
    FOREIGN KEY (mission_ticket_id) REFERENCES operations.sos_tickets(id) ON DELETE SET NULL;

-- Người ra / huỷ lệnh điều động: trước đây chỉ lưu họ tên (trùng tên, đổi tên thì không truy được) — thêm mã tài khoản,
-- giữ họ tên để hiển thị. Lệnh cũ: gán theo họ tên khi họ tên đó chỉ thuộc đúng 1 tài khoản.
ALTER TABLE operations.dispatch_orders
    ADD COLUMN IF NOT EXISTS dispatched_by_id uuid REFERENCES communications.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS cancelled_by_id uuid REFERENCES communications.users(id) ON DELETE SET NULL;
UPDATE operations.dispatch_orders o SET dispatched_by_id = u.id
  FROM communications.users u
 WHERE o.dispatched_by_id IS NULL AND u.full_name = o.dispatched_by
   AND (SELECT count(*) FROM communications.users x WHERE x.full_name = o.dispatched_by) = 1;
UPDATE operations.dispatch_orders o SET cancelled_by_id = u.id
  FROM communications.users u
 WHERE o.cancelled_by_id IS NULL AND u.full_name = o.cancelled_by
   AND (SELECT count(*) FROM communications.users x WHERE x.full_name = o.cancelled_by) = 1;

-- Phương tiện của lệnh điều động (mảng vehicle_ids — không khoá ngoại được): lệnh mới / sửa phải trỏ tới phương tiện có thật
CREATE OR REPLACE FUNCTION operations.check_dispatch_vehicles() RETURNS trigger AS $$
DECLARE
    v_missing integer;
BEGIN
    SELECT count(*) INTO v_missing
      FROM unnest(NEW.vehicle_ids) AS x(id)
     WHERE NOT EXISTS (SELECT 1 FROM resources.vehicles v WHERE v.id = x.id);
    IF v_missing > 0 THEN
        RAISE EXCEPTION 'Lệnh điều động trỏ tới % phương tiện không có trong danh mục', v_missing
            USING ERRCODE = 'foreign_key_violation';
    END IF;
    RETURN NEW;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS dispatch_vehicles_check ON operations.dispatch_orders;
CREATE TRIGGER dispatch_vehicles_check
    BEFORE INSERT OR UPDATE OF vehicle_ids ON operations.dispatch_orders
    FOR EACH ROW EXECUTE FUNCTION operations.check_dispatch_vehicles();
