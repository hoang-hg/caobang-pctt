-- =====================================================================
-- CSDL Điều hành PCTT & TKCN tỉnh Cao Bằng
-- PostgreSQL 16 + PostGIS + TimescaleDB · SRID 4326 (WGS84)
-- 5 cụm: spatial_admin, resources, operations, iot_telemetry, communications
-- =====================================================================
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS timescaledb;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE SCHEMA IF NOT EXISTS spatial_admin;
CREATE SCHEMA IF NOT EXISTS resources;
CREATE SCHEMA IF NOT EXISTS operations;
CREATE SCHEMA IF NOT EXISTS iot_telemetry;
CREATE SCHEMA IF NOT EXISTS communications;

-- unaccent() không IMMUTABLE nên bọc lại để dùng trong index tìm kiếm
CREATE OR REPLACE FUNCTION spatial_admin.norm(t text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE AS
$fn$ SELECT lower(public.unaccent('public.unaccent'::regdictionary, replace(replace(t, 'đ', 'd'), 'Đ', 'D'))) $fn$;

-- ---------------------------------------------------------------------
-- 1. spatial_admin — Hành chính & không gian
-- ---------------------------------------------------------------------
CREATE TABLE spatial_admin.administrative_units (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code          text UNIQUE NOT NULL,
  name          text NOT NULL,
  level         text NOT NULL CHECK (level IN ('tinh', 'xa', 'thon')),
  unit_type     text NOT NULL,              -- tinh | phuong | xa | thon
  parent_id     uuid REFERENCES spatial_admin.administrative_units(id),
  old_district  text,                       -- địa bàn huyện cũ (trước 01/07/2025)
  geom          geometry(MultiPolygon, 4326),
  center        geometry(Point, 4326),
  population    int,
  households    int,
  tags          text[] NOT NULL DEFAULT '{}' -- vung_trung | vung_nui | bien_gioi
);
CREATE INDEX ON spatial_admin.administrative_units USING gist (geom);
CREATE INDEX ON spatial_admin.administrative_units (parent_id);

CREATE TABLE spatial_admin.presets (
  code        text PRIMARY KEY,
  name        text NOT NULL,
  description text,
  hazard      text,                            -- ngap_lut | sat_lo | tong_hop
  kind        text NOT NULL DEFAULT 'luu_vuc', -- luu_vuc | dia_ban_cu
  unit_codes  text[] NOT NULL
);

CREATE TABLE spatial_admin.place_names (
  id            serial PRIMARY KEY,
  name          text NOT NULL,
  kind          text NOT NULL,               -- dia_danh | thon | cong_trinh | deo
  admin_unit_id uuid REFERENCES spatial_admin.administrative_units(id),
  geom          geometry(Point, 4326) NOT NULL
);
CREATE INDEX ON spatial_admin.place_names USING gin (spatial_admin.norm(name) gin_trgm_ops);

-- ---------------------------------------------------------------------
-- 2. resources — Nguồn lực & vật tư
-- ---------------------------------------------------------------------
CREATE TABLE resources.forces (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code                 text UNIQUE NOT NULL,
  name                 text NOT NULL,
  org_type             text NOT NULL,        -- quan_su | cong_an | bien_phong | dan_quan | tinh_nguyen | y_te
  level                text NOT NULL,        -- tinh | xa
  admin_unit_id        uuid REFERENCES spatial_admin.administrative_units(id),
  base_name            text,
  commander            text,
  contact_phone        text,
  radio_freq           text,
  personnel_total      int NOT NULL DEFAULT 0,
  personnel_ready      int NOT NULL DEFAULT 0,
  personnel_on_mission int NOT NULL DEFAULT 0,
  skills               text[] NOT NULL DEFAULT '{}',
  status               text NOT NULL DEFAULT 'san_sang' CHECK (status IN ('san_sang', 'nhiem_vu', 'bao_duong')),
  home_location        geometry(Point, 4326),
  location             geometry(Point, 4326),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON resources.forces USING gist (location);

CREATE TABLE resources.warehouses (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code          text UNIQUE NOT NULL,
  name          text NOT NULL,
  level         text NOT NULL,               -- tinh | cum | xa | da_chien
  admin_unit_id uuid REFERENCES spatial_admin.administrative_units(id),
  manager       text,
  phone         text,
  location      geometry(Point, 4326) NOT NULL
);
CREATE INDEX ON resources.warehouses USING gist (location);

CREATE TABLE resources.items (
  code     text PRIMARY KEY,
  name     text NOT NULL,
  category text NOT NULL,                    -- luong_thuc | nuoc_uong | y_te | do_dung
  unit     text NOT NULL
);

CREATE TABLE resources.inventory (
  warehouse_id uuid REFERENCES resources.warehouses(id) ON DELETE CASCADE,
  item_code    text REFERENCES resources.items(code),
  quantity     int NOT NULL,
  safety_quota int NOT NULL,                 -- định mức an toàn
  expiry_date  date,
  last_updated timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (warehouse_id, item_code)
);

CREATE TABLE resources.vehicles (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code              text UNIQUE NOT NULL,     -- VD: CB-X05
  name              text NOT NULL,
  vehicle_type      text NOT NULL,            -- xuong | ca_no | ghe | xe_loi_nuoc | xe_boc_thep | xe_tai | may_xuc | may_ui | xe_cuu_thuong | may_phat_dien | may_cua | flycam | bts_luu_dong
  category          text NOT NULL,            -- duong_thuy | duong_bo | thiet_bi
  force_id          uuid REFERENCES resources.forces(id),
  status            text NOT NULL DEFAULT 'san_sang' CHECK (status IN ('san_sang', 'nhiem_vu', 'bao_duong')),
  fuel_level        int NOT NULL DEFAULT 100, -- %
  capacity          int,                      -- số người chở được
  current_location  geometry(Point, 4326),
  mission_ticket_id uuid,
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON resources.vehicles USING gist (current_location);

CREATE TABLE resources.fuel_depots (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  admin_unit_id uuid REFERENCES spatial_admin.administrative_units(id),
  gasoline_l    int NOT NULL,
  diesel_l      int NOT NULL,
  capacity_l    int NOT NULL,
  location      geometry(Point, 4326) NOT NULL
);

CREATE TABLE resources.evacuation_sites (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text NOT NULL,
  site_type         text NOT NULL,            -- truong_hoc | nha_van_hoa | tru_so | doanh_trai
  admin_unit_id     uuid REFERENCES spatial_admin.administrative_units(id),
  capacity          int NOT NULL,
  current_occupancy int NOT NULL DEFAULT 0,
  contact_phone     text,
  location          geometry(Point, 4326) NOT NULL
);
CREATE INDEX ON resources.evacuation_sites USING gist (location);

-- ---------------------------------------------------------------------
-- 3. operations — Điều hành khẩn cấp
-- ---------------------------------------------------------------------
CREATE SEQUENCE operations.sos_code_seq START 1001;

CREATE TABLE operations.sos_tickets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code            text UNIQUE NOT NULL DEFAULT ('SOS-' || nextval('operations.sos_code_seq')),
  reporter_name   text,
  reporter_phone  text,
  source          text NOT NULL DEFAULT 'HOTLINE' CHECK (source IN ('ZALO', 'APP', 'HOTLINE', 'SENSOR', 'CAN_BO')),
  raw_message     text,
  address         text,
  admin_unit_id   uuid REFERENCES spatial_admin.administrative_units(id),
  location        geometry(Point, 4326) NOT NULL,
  incident_type   text NOT NULL CHECK (incident_type IN ('ngap_lut', 'sat_lo', 'lu_quet', 'sap_nha', 'cap_cuu', 'tiep_te')),
  priority        smallint NOT NULL CHECK (priority BETWEEN 1 AND 3), -- 1 Đỏ · 2 Cam · 3 Vàng
  status          text NOT NULL DEFAULT 'moi' CHECK (status IN ('moi', 'dieu_phoi', 'thuc_thi', 'hoan_thanh')),
  trapped_count   int NOT NULL DEFAULT 0,
  vulnerable      text[] NOT NULL DEFAULT '{}', -- nguoi_gia | tre_em | thuong_nang | thai_phu
  received_at     timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,
  resolved_at     timestamptz,
  notes           text
);
CREATE INDEX ON operations.sos_tickets USING gist (location);
CREATE INDEX ON operations.sos_tickets (status, priority);

CREATE TABLE operations.dispatch_orders (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id     uuid NOT NULL REFERENCES operations.sos_tickets(id) ON DELETE CASCADE,
  force_id      uuid REFERENCES resources.forces(id),
  vehicle_ids   uuid[] NOT NULL DEFAULT '{}',
  personnel     int NOT NULL DEFAULT 0,
  supplies      jsonb NOT NULL DEFAULT '{}',
  dispatched_by text,
  dispatched_at timestamptz NOT NULL DEFAULT now(),
  eta           timestamptz,
  route_geom    geometry(LineString, 4326),
  distance_km   double precision,
  route_safe    boolean NOT NULL DEFAULT true,
  progress      double precision NOT NULL DEFAULT 0, -- 0..1 trên lộ trình
  status        text NOT NULL DEFAULT 'dang_di' CHECK (status IN ('dang_di', 'da_den', 'hoan_thanh', 'huy'))
);
CREATE INDEX ON operations.dispatch_orders (status);

CREATE TABLE operations.event_logs (
  id            bigserial PRIMARY KEY,
  time          timestamptz NOT NULL DEFAULT now(),
  category      text NOT NULL,                -- van_hanh | cuu_ho | canh_bao | nguoi_dan | he_thong
  severity      text NOT NULL DEFAULT 'info', -- info | warning | danger
  message       text NOT NULL,
  admin_unit_id uuid REFERENCES spatial_admin.administrative_units(id),
  location      geometry(Point, 4326)
);
CREATE INDEX ON operations.event_logs (time DESC);

CREATE TABLE operations.evacuation_progress (
  admin_unit_id        uuid PRIMARY KEY REFERENCES spatial_admin.administrative_units(id),
  planned_households   int NOT NULL,
  evacuated_households int NOT NULL DEFAULT 0,
  planned_persons      int NOT NULL,
  evacuated_persons    int NOT NULL DEFAULT 0,
  updated_at           timestamptz NOT NULL DEFAULT now()
);

-- Đồ thị giao thông (đơn giản hóa) phục vụ định tuyến an toàn
CREATE TABLE operations.road_nodes (
  id   int PRIMARY KEY,
  name text,
  geom geometry(Point, 4326) NOT NULL
);
CREATE TABLE operations.road_segments (
  id          serial PRIMARY KEY,
  road_name   text NOT NULL,
  source_node int NOT NULL REFERENCES operations.road_nodes(id),
  target_node int NOT NULL REFERENCES operations.road_nodes(id),
  length_km   double precision NOT NULL,
  speed_kmh   double precision NOT NULL DEFAULT 40,
  geom        geometry(LineString, 4326) NOT NULL
);
CREATE INDEX ON operations.road_segments USING gist (geom);

-- ---------------------------------------------------------------------
-- 4. iot_telemetry — Quan trắc IoT & cảnh báo sớm
-- ---------------------------------------------------------------------
CREATE TABLE iot_telemetry.monitoring_stations (
  id               text PRIMARY KEY,         -- VD: CB-WL-01
  name             text NOT NULL,
  type             text NOT NULL CHECK (type IN ('luong_mua', 'muc_nuoc', 'do_nghieng', 'do_am_dat')),
  river            text,
  unit             text NOT NULL,
  admin_unit_id    uuid REFERENCES spatial_admin.administrative_units(id),
  alarm_thresholds jsonb NOT NULL DEFAULT '{}', -- {"bd1":..,"bd2":..,"bd3":..}
  status           text NOT NULL DEFAULT 'online',
  location         geometry(Point, 4326) NOT NULL
);
CREATE INDEX ON iot_telemetry.monitoring_stations USING gist (location);

CREATE TABLE iot_telemetry.sensor_readings (
  time       timestamptz NOT NULL,
  station_id text NOT NULL REFERENCES iot_telemetry.monitoring_stations(id),
  value      double precision NOT NULL
);
SELECT create_hypertable('iot_telemetry.sensor_readings', 'time', chunk_time_interval => interval '1 day');
CREATE INDEX ON iot_telemetry.sensor_readings (station_id, time DESC);

CREATE TABLE iot_telemetry.forecasts (
  station_id text NOT NULL REFERENCES iot_telemetry.monitoring_stations(id),
  time       timestamptz NOT NULL,
  value      double precision NOT NULL,
  model      text NOT NULL,                  -- HEC-HMS | QPF-NOWCAST
  issued_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (station_id, model, time)
);

CREATE TABLE iot_telemetry.reservoirs (
  id               text PRIMARY KEY,
  name             text NOT NULL,
  river            text,
  admin_unit_id    uuid REFERENCES spatial_admin.administrative_units(id),
  capacity_mw      double precision,
  normal_level     double precision,         -- MNDBT (m)
  current_level    double precision,
  inflow_m3s       double precision,
  outflow_m3s      double precision,
  spill_gates_open int NOT NULL DEFAULT 0,
  spill_gates      int NOT NULL DEFAULT 0,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  location         geometry(Point, 4326) NOT NULL
);

CREATE TABLE iot_telemetry.hazard_zones (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type          text NOT NULL CHECK (type IN ('sat_lo', 'ngap', 'lu_quet')),
  level         text NOT NULL CHECK (level IN ('do', 'cam', 'vang')),
  name          text NOT NULL,
  depth_m       double precision,             -- độ sâu ngập (vùng ngập)
  source        text NOT NULL DEFAULT 'manual', -- manual | sensor | model
  station_id    text REFERENCES iot_telemetry.monitoring_stations(id),
  admin_unit_id uuid REFERENCES spatial_admin.administrative_units(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  valid_until   timestamptz NOT NULL,
  geom          geometry(MultiPolygon, 4326) NOT NULL
);
CREATE INDEX ON iot_telemetry.hazard_zones USING gist (geom);

CREATE TABLE iot_telemetry.hazard_points (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type          text NOT NULL,                -- sat_lo | giao_thong | ha_tang
  level         text NOT NULL,                -- do | cam | vang
  name          text NOT NULL,
  description   text,
  admin_unit_id uuid REFERENCES spatial_admin.administrative_units(id),
  reported_at   timestamptz NOT NULL DEFAULT now(),
  active        boolean NOT NULL DEFAULT true,
  location      geometry(Point, 4326) NOT NULL
);
CREATE INDEX ON iot_telemetry.hazard_points USING gist (location);

CREATE TABLE iot_telemetry.cameras (
  id            text PRIMARY KEY,
  name          text NOT NULL,
  admin_unit_id uuid REFERENCES spatial_admin.administrative_units(id),
  stream_url    text,
  location      geometry(Point, 4326) NOT NULL
);

-- ---------------------------------------------------------------------
-- 5. communications — Liên lạc, phát lệnh & lịch sử
-- ---------------------------------------------------------------------
CREATE TABLE communications.users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username      text UNIQUE NOT NULL,
  full_name     text NOT NULL,
  position      text,
  role          text NOT NULL CHECK (role IN ('admin', 'maker', 'checker', 'viewer')),
  password_hash text NOT NULL,
  pin_hash      text
);

CREATE TABLE communications.message_templates (
  code     text PRIMARY KEY,
  name     text NOT NULL,
  severity text NOT NULL DEFAULT 'cam',
  body     text NOT NULL,                     -- có tham số {thoi_gian}, {dia_diem}...
  params   text[] NOT NULL DEFAULT '{}'
);

CREATE SEQUENCE communications.broadcast_code_seq START 101;

CREATE TABLE communications.alert_broadcasts (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code               text UNIQUE NOT NULL DEFAULT ('CB-' || nextval('communications.broadcast_code_seq')),
  title              text NOT NULL,
  message_body       text NOT NULL,
  template_code      text REFERENCES communications.message_templates(code),
  severity           text NOT NULL DEFAULT 'cam',
  target_admin_codes text[] NOT NULL DEFAULT '{}',
  target_polygon     geometry(MultiPolygon, 4326),
  channels           text[] NOT NULL,         -- SMS | CELL_BROADCAST | ZALO_OA | PUSH | LOA
  status             text NOT NULL DEFAULT 'pending_approval'
                     CHECK (status IN ('draft', 'pending_approval', 'sending', 'sent', 'rejected')),
  auto_generated     boolean NOT NULL DEFAULT false,
  trigger_source     text,
  audience           jsonb NOT NULL DEFAULT '{}',
  metrics            jsonb NOT NULL DEFAULT '{}',
  created_by         uuid REFERENCES communications.users(id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  approved_by        uuid REFERENCES communications.users(id),
  approved_at        timestamptz,
  sent_at            timestamptz,
  rejected_reason    text
);

CREATE TABLE communications.contacts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id     uuid REFERENCES communications.contacts(id),
  admin_unit_id uuid REFERENCES spatial_admin.administrative_units(id),
  level         text NOT NULL,                -- tinh | xa | thon
  org           text NOT NULL,
  full_name     text NOT NULL,
  position      text NOT NULL,
  phone         text NOT NULL,
  radio_freq    text,
  status        text NOT NULL DEFAULT 'truc', -- truc | san_sang | vang
  sort          int NOT NULL DEFAULT 0
);

CREATE TABLE communications.call_logs (
  id         bigserial PRIMARY KEY,
  time       timestamptz NOT NULL DEFAULT now(),
  caller     text NOT NULL,
  ivr_key    text,
  category   text,
  routed_to  text,
  duration_s int,
  ticket_id  uuid REFERENCES operations.sos_tickets(id)
);

CREATE TABLE communications.audit_logs (
  id         bigserial PRIMARY KEY,
  time       timestamptz NOT NULL DEFAULT now(),
  actor_id   uuid,
  actor_name text,
  action     text NOT NULL,
  entity     text NOT NULL,
  entity_id  text,
  details    jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX ON communications.audit_logs (time DESC);

-- Tham số hệ thống (VD: mốc kịch bản mô phỏng)
CREATE TABLE operations.system_settings (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
