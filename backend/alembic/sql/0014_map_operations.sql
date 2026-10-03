-- Bản đồ điều hành (đối chiếu đặc tả "Bản đồ giám sát tương tác", 10/2026): dữ liệu thật cho các lớp trước đây chỉ có ở
-- bộ mô phỏng / dữ liệu mẫu.

-- 1. Vùng ngập theo kịch bản: bản đồ ngập ứng với mực nước tại một trạm (thường là các cấp BĐ I / II / III). Bảng RIÊNG,
--    không trộn vào hazard_zones: vùng kịch bản chỉ "đang ngập" khi mực nước trạm (hiện tại, hoặc thời điểm trên thanh
--    thời gian) đạt ngưỡng — để trong hazard_zones thì chỉ đường, "Tôi đang ở đâu", cổng công khai sẽ coi cả vùng ngập
--    BĐ III là đang ngập. Ngưỡng: theo cấp báo động của trạm (alarm_level, đọc ngưỡng hiện hành của trạm lúc hiển thị)
--    HOẶC theo mực nước cụ thể (trigger_level, m) — đúng một trong hai.
CREATE TABLE IF NOT EXISTS iot_telemetry.flood_scenarios (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code          text NOT NULL UNIQUE,
  name          text NOT NULL,
  station_id    text NOT NULL REFERENCES iot_telemetry.monitoring_stations(id) ON DELETE CASCADE,
  alarm_level   smallint CHECK (alarm_level BETWEEN 1 AND 3),
  trigger_level double precision,
  depth_m       double precision,
  admin_unit_id uuid REFERENCES spatial_admin.administrative_units(id),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  geom          geometry(MultiPolygon, 4326) NOT NULL,
  CONSTRAINT flood_scenarios_one_trigger CHECK ((alarm_level IS NULL) <> (trigger_level IS NULL))
);
CREATE INDEX IF NOT EXISTS flood_scenarios_geom_idx ON iot_telemetry.flood_scenarios USING gist (geom);
CREATE INDEX IF NOT EXISTS flood_scenarios_station_idx ON iot_telemetry.flood_scenarios (station_id);

-- 2. Bản tin bão / áp thấp nhiệt đới do trực ban nhập theo bản tin của Trung tâm Dự báo KTTV quốc gia (chưa có kết nối
--    tự động). points: [{time, lat, lon, wind_level, gust_level, radius_km}] — cấp gió Beaufort, bán kính gió mạnh cấp 6.
--    Bản tin mới cùng tên thay bản cũ; trực ban kết thúc theo dõi khi bão tan (active = false).
CREATE TABLE IF NOT EXISTS iot_telemetry.storm_bulletins (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  issued_at  timestamptz NOT NULL,
  source     text,
  points     jsonb NOT NULL,
  active     boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES communications.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS storm_bulletins_active_idx ON iot_telemetry.storm_bulletins (issued_at DESC) WHERE active;

-- 3. Điểm sự cố cán bộ đánh dấu nhanh trên bản đồ (cây đổ, đứt điện, sập cầu…) hoặc chuyển từ phản ánh của người dân:
--    có hạn hiệu lực, ghi người tạo. Điểm nhập từ tệp (bản đồ điểm nguy hiểm chính thức) giữ source 'import', không hạn.
ALTER TABLE iot_telemetry.hazard_points
  ADD COLUMN IF NOT EXISTS source     text NOT NULL DEFAULT 'import',
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS report_id  uuid REFERENCES community.citizen_reports(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES communications.users(id);
DO $$ BEGIN
  ALTER TABLE iot_telemetry.hazard_points
    ADD CONSTRAINT hazard_points_source_check CHECK (source IN ('import', 'officer', 'report'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
