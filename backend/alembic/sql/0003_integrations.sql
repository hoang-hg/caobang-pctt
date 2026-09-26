-- =====================================================================
-- Tích hợp dữ liệu ngoài: nguồn dự báo quốc tế, cổng IoT (HTTP / MQTT / LoRaWAN), giám sát kết nối
-- =====================================================================
CREATE SCHEMA IF NOT EXISTS integrations;

-- Nguồn dữ liệu (connector)
CREATE TABLE integrations.data_sources (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code            text UNIQUE NOT NULL,
  name            text NOT NULL,
  type            text NOT NULL CHECK (type IN ('open_meteo', 'openweather', 'http_ingest', 'mqtt', 'chirpstack')),
  enabled         boolean NOT NULL DEFAULT false,
  config          jsonb NOT NULL DEFAULT '{}',   -- tham số riêng từng loại (models, chu kỳ, topic...)
  secret_enc      text,                          -- API key / token đã mã hoá (Fernet)
  poll_interval_s int,                           -- chu kỳ lấy dữ liệu (nguồn kéo); NULL = nguồn đẩy
  status          text NOT NULL DEFAULT 'chua_chay', -- chua_chay | ok | loi | tat
  last_run_at     timestamptz,
  last_success_at timestamptz,
  last_error      text,
  stats           jsonb NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Thiết bị IoT hiện trường, gắn với trạm quan trắc
CREATE TABLE integrations.devices (
  id               text PRIMARY KEY,             -- mã thiết bị / DevEUI
  name             text NOT NULL,
  vendor           text,
  protocol         text NOT NULL CHECK (protocol IN ('http', 'mqtt', 'lorawan')),
  station_id       text NOT NULL REFERENCES iot_telemetry.monitoring_stations(id),
  api_key_hash     text,                         -- HTTP: băm khoá thiết bị
  value_field      text NOT NULL DEFAULT 'value',-- trường giá trị trong payload giải mã (LoRaWAN)
  scale            double precision NOT NULL DEFAULT 1,
  offset_value     double precision NOT NULL DEFAULT 0,
  expected_interval_s int NOT NULL DEFAULT 600,  -- quá 3 lần mà không có dữ liệu → mất tín hiệu
  enabled          boolean NOT NULL DEFAULT true,
  status           text NOT NULL DEFAULT 'chua_ket_noi', -- chua_ket_noi | truc_tuyen | mat_tin_hieu
  last_seen_at     timestamptz,
  last_value       double precision,
  meta             jsonb NOT NULL DEFAULT '{}',
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON integrations.devices (station_id);

-- Nhật ký tiếp nhận / đồng bộ (cho màn hình Giám sát kết nối)
CREATE TABLE integrations.ingest_log (
  id        bigserial PRIMARY KEY,
  time      timestamptz NOT NULL DEFAULT now(),
  source    text NOT NULL,                       -- mã nguồn hoặc 'device:<id>'
  level     text NOT NULL DEFAULT 'info',        -- info | warning | error
  message   text NOT NULL,
  accepted  int NOT NULL DEFAULT 0,
  rejected  int NOT NULL DEFAULT 0
);
CREATE INDEX ON integrations.ingest_log (time DESC);

-- Trạm lấy dữ liệu từ đâu: bộ mô phỏng hay thiết bị thật
ALTER TABLE iot_telemetry.monitoring_stations ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'simulator'
  CHECK (source IN ('simulator', 'iot', 'external'));

-- Dự báo theo xã (tổ hợp ECMWF / GFS): phân vị lượng mưa + nhiệt độ, gió giật
CREATE TABLE iot_telemetry.area_forecasts (
  admin_unit_id uuid NOT NULL REFERENCES spatial_admin.administrative_units(id) ON DELETE CASCADE,
  model         text NOT NULL,                   -- ECMWF_ENS | GFS_ENS | BLEND | OPENWEATHER
  time          timestamptz NOT NULL,
  precip_p10    double precision,
  precip_p50    double precision,
  precip_p90    double precision,
  precip_mean   double precision,
  prob_heavy    double precision,                -- xác suất mưa ≥ 5 mm/h (0..1)
  temp_c        double precision,
  gust_kmh      double precision,
  members       int,
  issued_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (admin_unit_id, model, time)
);
CREATE INDEX ON iot_telemetry.area_forecasts (time);
