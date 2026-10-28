-- Nguồn kéo mới: trạm đo mưa của hệ thống Cảnh báo đa thiên tai — Viện Địa công nghệ và Môi trường
-- (integrations/adapters/ige_truotlo.py)
ALTER TABLE integrations.data_sources DROP CONSTRAINT IF EXISTS data_sources_type_check;
ALTER TABLE integrations.data_sources ADD CONSTRAINT data_sources_type_check
  CHECK (type IN ('open_meteo', 'openweather', 'http_ingest', 'mqtt', 'chirpstack', 'ige_truotlo'));
