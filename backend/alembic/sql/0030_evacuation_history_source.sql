-- Lịch sử sơ tán ghi kèm nguồn báo ("Báo cáo UBND xã lúc 14h") — trước đây chỉ có trong nhật ký sự kiện, bảng diễn biến sơ
-- tán của xã không biết số liệu từ đâu. Nguồn truyền qua biến phiên pctt.move_note (services/ledger.ledger_context, note=)
ALTER TABLE operations.evacuation_history ADD COLUMN IF NOT EXISTS source text;

CREATE OR REPLACE FUNCTION operations.log_evacuation() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'INSERT'
       OR NEW.planned_households IS DISTINCT FROM OLD.planned_households
       OR NEW.evacuated_households IS DISTINCT FROM OLD.evacuated_households
       OR NEW.planned_persons IS DISTINCT FROM OLD.planned_persons
       OR NEW.evacuated_persons IS DISTINCT FROM OLD.evacuated_persons THEN
        INSERT INTO operations.evacuation_history
               (admin_unit_id, time, planned_households, evacuated_households, planned_persons, evacuated_persons, actor_id,
                source)
        VALUES (NEW.admin_unit_id, now(), NEW.planned_households, NEW.evacuated_households, NEW.planned_persons,
                NEW.evacuated_persons, CAST(nullif(current_setting('pctt.actor_id', true), '') AS uuid),
                nullif(current_setting('pctt.move_note', true), ''))
        ON CONFLICT (admin_unit_id, time) DO UPDATE   -- 2 lần sửa trong cùng giao dịch: giữ số sau cùng
           SET planned_households = EXCLUDED.planned_households, evacuated_households = EXCLUDED.evacuated_households,
               planned_persons = EXCLUDED.planned_persons, evacuated_persons = EXCLUDED.evacuated_persons,
               actor_id = EXCLUDED.actor_id, source = EXCLUDED.source;
    END IF;
    RETURN NULL;
END
$$ LANGUAGE plpgsql;
