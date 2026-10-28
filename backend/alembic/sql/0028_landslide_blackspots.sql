-- Danh mục điểm đen sạt lở, đèo dốc, ngầm tràn: trước nằm cứng trong mã (services/landslides.py KNOWN_BLACKSPOTS) →
-- bảng riêng, cán bộ thêm / sửa bằng trang Nhập dữ liệu (loại "diem_den_sat_lo"). Chỉ là dữ liệu tham chiếu lâu dài
-- (vị trí, tuyến đường, đặc điểm, cảm biến gắn kèm); trạng thái nguy cơ vẫn tính lúc đọc từ vùng nguy hiểm, cảm biến.
CREATE TABLE IF NOT EXISTS iot_telemetry.landslide_blackspots (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code             text NOT NULL UNIQUE,
  name             text NOT NULL,
  road_name        text NOT NULL,                 -- "QL34 (Bảo Lạc – Xuân Trường)": phần trước "(" là tuyến
  category         text NOT NULL CHECK (category IN ('deo_doc', 'khu_dan_cu', 'ngam_tran')),
  note             text,                          -- đặc điểm lâu dài, không mô tả sự cố cụ thể
  bypass_route     text,                          -- tuyến tránh chính thức (nếu có) — hiện công khai
  -- Mã trạm gắn kèm: KHÔNG khoá ngoại — trạm có thể chưa lắp / nhập sau; không có số đo → "Chưa có dữ liệu giám sát"
  tilt_sensor_id   text,
  rain_station_id  text,
  soil_moisture_id text,
  admin_unit_id    uuid REFERENCES spatial_admin.administrative_units(id) ON DELETE SET NULL,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  location         geometry(Point, 4326) NOT NULL
);
CREATE INDEX IF NOT EXISTS landslide_blackspots_location_idx ON iot_telemetry.landslide_blackspots USING gist (location);
