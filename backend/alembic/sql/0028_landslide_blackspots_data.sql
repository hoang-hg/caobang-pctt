-- 12 điểm đen ban đầu (trước nằm trong mã). Chạy ở migration 0028 và ở `python -m app.seed` (lệnh --reset làm rỗng bảng
-- xã/phường kèm CASCADE → bảng này rỗng theo). Đã có mã thì giữ nguyên bản ghi — không ghi đè dữ liệu cán bộ đã sửa.
-- Xã: xã gần nhất theo vị trí; CSDL mới chưa có xã → để trống, `app.seed` gán lại (reconcile_admin_units).
INSERT INTO iot_telemetry.landslide_blackspots
       (code, name, road_name, category, note, tilt_sensor_id, rain_station_id, soil_moisture_id, location, admin_unit_id)
SELECT v.code, v.name, v.road, v.cat, v.note, v.tilt, v.rain, v.soil, p.g,
       (SELECT u.id FROM spatial_admin.administrative_units u
         WHERE u.level = 'xa' AND u.geom IS NOT NULL
         ORDER BY u.geom <-> p.g LIMIT 1)
  FROM (VALUES
    ('DD-KCC', 'Đèo Khau Cốc Chà', 'QL34 (Bảo Lạc – Xuân Trường)', 'deo_doc',
     'Đèo nhiều tầng cua gấp, taluy dương cao, đất đá phong hoá dễ sạt khi mưa kéo dài.',
     22.806, 105.720, 'CB-TL-01', 'CB-RN-04', 'CB-SM-01'),
    ('DD-MEPIA', 'Đèo Mẻ Pia', 'ĐT Cô Ba – Thanh Long', 'deo_doc',
     'Đèo dốc nhiều khúc cua tay áo, thường có đá lăn sau mưa lớn.',
     22.872, 105.842, 'CB-TL-02', 'CB-RN-04', 'CB-SM-01'),
    ('DD-CATHANH', 'Khu vực Ca Thành', 'ĐT Ca Thành', 'khu_dan_cu',
     'Khu dân cư sườn đồi đất, có tiền sử sạt lở và lũ bùn đá.',
     22.685, 105.820, 'CB-TL-03', 'CB-RN-10', 'CB-SM-02'),
    ('DD-MAPHUC', 'Đèo Mã Phục', 'QL3 (Hòa An – Quảng Hòa)', 'deo_doc',
     'Taluy đá vôi đã gia cố lưới thép; đường trơn, sương mù dày khi mưa.',
     22.768, 106.287, 'CB-TL-04', 'CB-RN-01', NULL),
    ('DD-QL34-PHANTHANH', 'Taluy QL34 đoạn Phan Thanh', 'QL34 (Phan Thanh – Tĩnh Túc)', 'deo_doc',
     'Đoạn taluy dương cao sát mép đường, tuyến huyết mạch đi Bảo Lạc.',
     22.728, 105.768, 'CB-TL-03', 'CB-RN-02', 'CB-SM-02'),
    ('DD-NAPONG', 'Cụm dân cư chân đồi Nà Pồng', 'Đường liên xã Pác Miầu – Yên Thổ', 'khu_dan_cu',
     'Khu dân cư sát chân đồi đất, nguy cơ trượt sườn khi đất bão hoà nước.',
     22.872, 105.482, NULL, 'CB-RN-05', 'CB-SM-01'),
    ('DD-PHJADEN', 'Sườn núi Phja Oắc – Phja Đén', 'ĐT Thành Công – Phan Thanh', 'deo_doc',
     'Vùng núi cao rừng đầu nguồn, suối dốc dễ lũ ống, lũ quét.',
     22.596, 105.848, 'CB-TL-03', 'CB-RN-03', 'CB-SM-02'),
    ('DD-NAMQUANG', 'Khe suối Nậm Quang', 'ĐT Bảo Lâm – Nam Quang', 'ngam_tran',
     'Khe núi hẹp tụ thuỷ, nguy cơ lũ quét qua ngầm tràn.',
     22.790, 105.540, NULL, 'CB-RN-05', 'CB-SM-01'),
    ('DD-BANNGAN', 'Ngầm tràn Bản Ngắn (sông Hiến)', 'Đường liên xã Hòa An', 'ngam_tran',
     'Ngầm tràn thấp, nước sông lên nhanh khi mưa lớn thượng nguồn.',
     22.735, 106.170, NULL, 'CB-RN-01', NULL),
    ('DD-KHAULIEU', 'Đèo Khau Liêu', 'QL3 (Quảng Uyên – Tà Lùng)', 'deo_doc',
     'Cung đèo nhiều khúc cua gấp, sát vực; xe tải cửa khẩu lưu thông nhiều.',
     22.685, 106.460, NULL, 'CB-RN-09', NULL),
    ('DD-TINHTUC', 'Bãi thải mỏ Tĩnh Túc', 'QL34 (đoạn qua Tĩnh Túc)', 'khu_dan_cu',
     'Bãi thải trên sườn dốc, nguy cơ dòng bùn khi ngậm nước lâu ngày.',
     22.645, 105.880, 'CB-TL-03', 'CB-RN-03', 'CB-SM-02'),
    ('DD-DONGKHE', 'Đèo Đông Khê', 'QL4A (Thạch An – Lạng Sơn)', 'deo_doc',
     'Taluy đất đỏ, mặt đường dễ trơn trượt khi mưa.',
     22.434, 106.436, NULL, 'CB-RN-08', NULL)
  ) AS v(code, name, road, cat, note, lat, lon, tilt, rain, soil)
  CROSS JOIN LATERAL (SELECT ST_SetSRID(ST_MakePoint(v.lon, v.lat), 4326) AS g) p
ON CONFLICT (code) DO NOTHING;
