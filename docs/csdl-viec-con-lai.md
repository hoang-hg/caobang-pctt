# Mục G – Cơ sở dữ liệu điều hành: đối chiếu thiết kế và đề xuất bổ sung

Đối chiếu với mục **G. Thiết kế Cơ sở dữ liệu lưu các thông tin điều hành** (tài liệu thiết kế Part 1): PostgreSQL + PostGIS +
TimescaleDB, 5 cụm (schema) `spatial_admin`, `resources`, `operations`, `iot_telemetry`, `communications`.

- Rà ngày 15/10/2026 trên CSDL dựng từ `main` (20 migration Alembic `0001` → `0020`), ảnh `timescale/timescaledb-ha:pg16`:
  PostGIS 3.6, TimescaleDB 2.30, `pg_trgm`, `unaccent`. Số liệu trong tài liệu đo trên stack thử (dữ liệu mẫu).
- **Cập nhật 16/10/2026** sau khi làm DB1 – DB5, DB7 – DB9 (PR #85 → #90, migration `0021` → `0025`): mục 1, 2 ghi trạng
  thái hiện tại; mục 4 giữ phần phác thảo ban đầu để tra cứu.
- Máy chủ thử vẫn chạy **v1.0.3** — xem V1 trong `docs/trang-a-viec-con-lai.md`.
- Việc về **dữ liệu** (không phải cấu trúc bảng) đã ghi ở tài liệu từng trang — tóm tắt ở mục 5.

**Kết luận:**

- **Đủ 11 / 11 bảng của mục G, đủ mọi cột thiết kế nêu.** Khác biệt có chủ đích:
  - kiểu liệt kê (Enum) làm bằng `text` + ràng buộc `CHECK` — thêm giá trị chỉ cần một migration nhỏ;
  - `Polygon` làm bằng `MultiPolygon` (vùng gồm nhiều mảnh);
  - `alert_broadcasts.sent_by` tách thành người soạn (`created_by`) và người ký duyệt (`approved_by`) theo quy trình
    Maker – Checker.
- Hệ thống có thêm **35 bảng ngoài thiết kế** (46 bảng, 7 schema): hồ chứa, dự báo, kịch bản ngập, phản ánh của người dân,
  nhập dữ liệu, tích hợp thiết bị, tài khoản – phân quyền – nhật ký, sổ xuất – nhập kho, lịch sử sơ tán, đợt thiên tai…
- **Đề xuất bổ sung** (mục 3):
  - **đã làm** 8 việc: DB1 – DB5, DB7 – DB9 (PR #85 → #90) — vai trò CSDL + nhật ký chỉ ghi thêm, khoá số đo, chỉ mục, cơ
    chế ẩn dữ liệu cá nhân, đợt thiên tai, sổ kho, lịch sử sơ tán, khoá ngoại;
  - **còn**: DB4 chờ chủ dự án chốt thời hạn lưu (cơ chế có sẵn, đang tắt); DB6 chờ BCH xác nhận mẫu thống kê thiệt hại;
    DB10, DB11 khi có số liệu / mạng đường thật; DB12 tuỳ chọn.

## 1. Hiện trạng tổng quan

| Schema | Bảng theo thiết kế G | Bảng bổ sung (ngoài G) |
|---|---|---|
| `spatial_admin` | `administrative_units` | `place_names` (địa danh cho tìm kiếm), `presets` (nhóm lọc nhanh) |
| `resources` | `forces`, `warehouses`, `inventory`, `vehicles` | `items` (danh mục vật tư), `evacuation_sites`, `fuel_depots`, `inventory_moves` (sổ xuất – nhập kho, DB7) |
| `operations` | `sos_tickets`, `dispatch_orders` | `dispatch_field_reports` (trưởng nhóm báo qua link nhiệm vụ), `evacuation_progress`, `event_logs`, `road_nodes`, `road_segments`, `data_submissions` (xã gửi dữ liệu chờ duyệt), `system_settings`, `evacuation_history` (lịch sử sơ tán, DB8), `disaster_events` (đợt thiên tai, DB5) |
| `iot_telemetry` | `monitoring_stations`, `sensor_readings`, `hazard_zones` | `hazard_points`, `reservoirs`, `reservoir_operations`, `forecasts`, `area_forecasts`, `flood_scenarios`, `storm_bulletins`, `cameras` |
| `communications` | `alert_broadcasts` | `message_templates`, `contacts`, `call_logs`, `audit_logs`, `users`, `password_reset_tokens`, `rbac_audit_log`, `rbac_role_metadata` |
| `community` (ngoài 5 cụm) | — | `citizen_reports` |
| `integrations` (ngoài 5 cụm) | — | `data_sources`, `devices`, `ingest_log` |

Kỹ thuật:

- 22 cột hình học, đều SRID 4326, đúng kiểu (điểm / đường / vùng); 12 chỉ mục không gian (GiST).
- 2 hypertable TimescaleDB:
  - `sensor_readings`: khúc 1 ngày, **nén sau 7 ngày**;
  - `reservoir_operations`: khúc 7 ngày, chưa nén, ghi bằng trigger mỗi lần hồ cập nhật.
- Chưa có bảng tổng hợp liên tục (continuous aggregate).
- Giữ nhật ký có thời hạn (`services/retention.py`): nhật ký tiếp nhận IoT 30 ngày, dòng sự kiện vận hành 730 ngày. Không
  xoá nhật ký thao tác, phiếu SOS, phản ánh, lệnh cảnh báo, số đo. Họ tên, SĐT, tin nhắn, ảnh của người dân ẩn sau
  `PII_RETENTION_DAYS` ngày (DB4 — mặc định tắt).
- Nhật ký pháp lý (`audit_logs`, `rbac_audit_log`) chỉ ghi thêm — trigger chặn sửa / xoá / làm rỗng; bản chạy thật kết nối
  bằng tài khoản `pctt_app` (không superuser, không quyền sửa / xoá nhật ký) — DB1.
- Có sẵn trong ảnh CSDL nhưng chưa bật: **pgRouting 4.0**, **pgAudit**, `pg_cron`, `postgis_raster`.

## 2. Đối chiếu từng bảng của mục G (trạng thái 16/10/2026)

| Bảng thiết kế | Cột thiết kế | Hiện trạng |
|---|---|---|
| G.1 `administrative_units` | id UUID, name, level (Tỉnh / Xã), parent_id, geom MultiPolygon, population | Đạt — `level` có thêm `thon`; thêm `code`, `unit_type` (xã / phường), `center`, `households` (**ước tính** = dân số / 4), `tags`, `rbac_domain`. Có 56 xã/phường sau sắp xếp + tỉnh + 8 xóm mẫu |
| G.2 `forces` | id, name, contact_phone, personnel_ready, skills[], location | Đạt — thêm loại / cấp lực lượng, chỉ huy, tần số bộ đàm, quân số tổng / đang nhiệm vụ, trạng thái, vị trí đóng quân. `location` cập nhật khi điều động / đến nơi / cán bộ sửa — **không** theo dõi GPS thời gian thực theo quyết định ngày 29/09/2026 (CD7 trang D) |
| G.2 `warehouses` | id, name, admin_unit_id, location | Đạt — thêm mã, cấp kho, thủ kho, SĐT |
| G.2 `inventory` | warehouse_id, item_code, quantity, last_updated | Đạt — thêm định mức an toàn (`safety_quota`), hạn dùng; khoá ngoại tới danh mục `items`. Mọi lần tồn kho đổi có dòng sổ `inventory_moves` (ghi bằng trigger — DB7, PR #88) |
| G.2 `vehicles` | id, vehicle_type, force_id, status, current_location | Đạt — thêm nhiên liệu, sức chở, phiếu đang làm, lý do hỏng. `vehicle_type` chưa có `CHECK` (đã kiểm khi nhập). `current_location`: như `forces.location` |
| G.3 `sos_tickets` | id, reporter_name / phone, location, incident_type, priority 1–3, status, trapped_count | Đạt — thêm nguồn + mã ngoài (chống trùng tin Zalo / ứng dụng), tin gốc, địa chỉ, nhóm yếu thế, các mốc thời gian tính SLA, đợt thiên tai `event_id` (DB5). Họ tên, SĐT, tin nhắn ẩn sau `PII_RETENTION_DAYS` ngày (DB4 — mặc định tắt, chờ chốt thời hạn) |
| G.3 `dispatch_orders` | id, ticket_id, force_id, dispatched_at, eta, route_geom LineString | Đạt — thêm phương tiện, quân số, vật tư kèm, tuyến có an toàn không, tiến độ, link nhiệm vụ, huỷ lệnh. `route_geom` sinh từ định tuyến né vùng nguy hiểm (`services/safe_routing.py`). Người ra / huỷ lệnh có khoá ngoại tài khoản, phương tiện kiểm bằng trigger (DB9) |
| G.4 `monitoring_stations` | id varchar, name, type, location, alarm_thresholds JSONB (BĐ1–3) | Đạt — thêm sông, đơn vị đo, trạng thái, nguồn (mô phỏng / IoT / nhập tệp); `type` thêm độ ẩm đất |
| G.4 `sensor_readings` | time (khoá phân vùng), station_id, value — hypertable | Đạt — hypertable đúng thiết kế, nén sau 7 ngày; khoá duy nhất (trạm, thời điểm) + `ON CONFLICT DO NOTHING`: bản tin gửi lại / 2 bản tin cùng đến không ghi trùng (DB2, PR #85) |
| G.4 `hazard_zones` | id, type, geom Polygon, valid_until | Đạt — thêm mức Đỏ / Cam / Vàng, nguồn, trạm gây ra, độ sâu ngập, đợt thiên tai (DB5) |
| G.5 `alert_broadcasts` | id, message_body, target_polygon, channels[], sent_by, metrics JSONB | Đạt — `sent_by` → `created_by` + `approved_by` (Maker – Checker); `metrics` theo từng kênh; thêm hiệu lực, kết thúc lệnh, mẫu tin, số người nhận, đợt thiên tai (DB5) |
| Hệ quản trị | PostgreSQL + PostGIS + TimescaleDB | Đạt |

## 3. Bảng tổng hợp đề xuất bổ sung

| # | Việc | Vì sao | Thay đổi CSDL | Ưu tiên |
|---|---|---|---|---|
| DB1 | **Tách vai trò CSDL; nhật ký pháp lý chỉ ghi thêm** | Ứng dụng kết nối bằng tài khoản quản trị CSDL (superuser), có quyền sửa / xoá / làm rỗng `audit_logs` → nhật ký pháp lý (thiết kế E.4) sửa được; hồ sơ an toàn thông tin cấp độ 3 cần phân quyền tối thiểu | Vai trò ứng dụng riêng (không superuser); thu hồi UPDATE / DELETE / TRUNCATE trên 2 bảng nhật ký; trigger chặn sửa / xoá | **Đã làm** — trigger (PR #86, migration 0022); tài khoản ứng dụng riêng `pctt_app` (PR #90, `app/db_roles.py`) |
| DB2 | **Khoá duy nhất số đo (trạm, thời điểm)** | Thiết bị gửi lại khi mất mạng, MQTT giao lại tin: 2 bản tin đến cùng lúc vẫn ghi trùng → mưa cộng dồn bị tính đôi | Chỉ mục duy nhất + `ON CONFLICT DO NOTHING` khi ghi | **Đã làm** (PR #85, migration 0021) |
| DB3 | **Chỉ mục cho truy vấn vận hành** | Đủ nhanh với dữ liệu mẫu; khi phiếu, lệnh, nhật ký lên hàng vạn thì các truy vấn SLA, danh sách phiếu, vùng cảnh báo phải quét cả bảng | 6 chỉ mục (mục 4) | **Đã làm** (PR #85, migration 0021); đo lại bằng EXPLAIN khi thử tải (CF4 trang F, V2 trang A) |
| DB4 | **Thời hạn lưu dữ liệu cá nhân** | Luật Bảo vệ dữ liệu cá nhân (hiệu lực 01/01/2026): họ tên, SĐT, tin nhắn, ảnh của người dân đang lưu vô thời hạn | Cột đánh dấu đã ẩn danh + việc định kỳ trong `retention.py` | **Đã làm cơ chế** (PR #87, migration 0023) — mặc định tắt, **chờ chủ dự án chốt thời hạn** |
| DB5 | **Đợt thiên tai** | Báo cáo, rút kinh nghiệm theo từng đợt (thiết kế E.4); so sánh các đợt | Bảng `disaster_events` + cột `event_id` ở phiếu, lệnh, cảnh báo, vùng nguy hiểm | **Đã làm** (PR #89, migration 0025) — trang **Đợt thiên tai** (`/dot-thien-tai`), báo cáo Excel / PDF |
| DB6 | **Thống kê thiệt hại** | Báo cáo thiệt hại theo mẫu nhà nước — hiện chưa có chỗ lưu | Bảng chỉ tiêu + bảng số liệu theo đợt × xã × chỉ tiêu | Trung bình — chờ BCH xác nhận mẫu |
| DB7 | **Sổ xuất – nhập kho** | Chỉ có tồn hiện tại + nhật ký thao tác dạng JSON → không tổng hợp được "đã cấp bao nhiêu cho xã X trong đợt Y" | Bảng `inventory_moves` | **Đã làm** (PR #88, migration 0024); gắn đợt thiên tai (PR #89) |
| DB8 | **Lịch sử sơ tán** | `evacuation_progress` chỉ giữ số mới nhất → không vẽ được diễn biến sơ tán trong đợt | Bảng lịch sử, ghi bằng trigger (như vận hành hồ) | **Đã làm** (PR #88); biểu đồ diễn biến trong báo cáo đợt (PR #89) |
| DB9 | **Toàn vẹn tham chiếu** | Phương tiện của lệnh điều động lưu dạng mảng (không khoá ngoại); người ra / huỷ lệnh lưu bằng họ tên (trùng tên, đổi tên) | Bảng nối; thêm khoá ngoại, mã người thao tác | **Đã làm** (PR #88) — trigger kiểm tra thay bảng nối |
| DB10 | **Tổng hợp số đo theo giờ / ngày** | Biểu đồ dài ngày, báo cáo mưa ngày / mực nước cao nhất ngày đang tính lại từ số đo gốc (cả khúc đã nén) | Continuous aggregate giờ + ngày | Trung bình — khi có số liệu thật |
| DB11 | **Định tuyến với mạng đường thật** | Thuật toán viết bằng Python, tải cả đồ thị mỗi lần — ổn với 74 đoạn mẫu, chậm khi nhập mạng đường cả tỉnh | Bật pgRouting (có sẵn trong ảnh) | Trung bình — khi có mạng đường (D3 trang A) |
| DB12 | Tuỳ chọn | Theo dõi khi dữ liệu lớn dần | Mục 4 | Thấp |

## 4. Chi tiết đề xuất

Các đoạn SQL dưới đây là **phác thảo** để thống nhất hướng làm — viết thành migration Alembic, chạy thử trên bản sao CSDL thật
trước khi áp dụng.

### DB1 — Tách vai trò CSDL, nhật ký pháp lý chỉ ghi thêm — đã làm (PR #86, #90)

- **PR #86:** migration `0022` — trigger chặn sửa / xoá / làm rỗng `audit_logs`, `rbac_audit_log`, chặn cả tài khoản chủ
  sở hữu (chỉ chủ sở hữu bảng tắt được trigger). `seed --reset` (chỉ máy dev / trình diễn / CI) tạm tắt trigger trong giao
  dịch. Kiểm tra Go / No-Go báo LỖI khi thiếu / tắt trigger.
- **PR #90 — tài khoản CSDL riêng cho ứng dụng:**
  - `app/db_roles.py` (service migrate, sau alembic + seed, **mỗi lần triển khai**): tạo / cập nhật `pctt_app` — không
    superuser, không tạo CSDL / tài khoản; mật khẩu gửi dạng băm SCRAM-SHA-256 (không nằm trong câu lệnh, nhật ký, thông
    báo lỗi). Cấp đọc / ghi 7 schema nghiệp vụ + bảng phân quyền casbin (bảng, chuỗi số mới của migration được cấp ngay lần
    triển khai đó); thu hồi sửa / xoá / làm rỗng 2 bảng nhật ký pháp lý. Không cấp `alembic_version`.
  - `docker-compose.prod.yml`: backend / worker kết nối bằng `APP_DB_USER` / `APP_DB_PASSWORD` (bắt buộc); migrate, sao
    lưu giữ tài khoản chủ sở hữu. `deploy/update.sh` tự tạo `APP_DB_PASSWORD` cho máy cài từ trước.
  - Khôi phục sao lưu: `pg_restore --no-privileges` (máy mới chưa có `pctt_app`; quyền do migrate cấp lại) — README 10.5,
    `deploy/restore-drill.sh`.
  - Kiểm tra Go / No-Go báo LỖI nếu ứng dụng chạy bằng superuser / sửa được nhật ký; CI job Production kiểm tra trực tiếp
    trên CSDL (`pctt_app` đang kết nối, không superuser, không quyền sửa / xoá nhật ký, xoá nhật ký bị trigger chặn).
  - Máy dev / CI E2E: `APP_DB_PASSWORD` trống → bỏ qua, ứng dụng dùng tài khoản chủ sở hữu như trước.

Phần dưới giữ lại để tra cứu.


- **Hiện trạng:**
  - backend, worker kết nối bằng `POSTGRES_USER`. Trên ảnh `timescaledb-ha` đây là **superuser** (đo trên stack thử: `rolsuper
    = t`). `docker-compose.prod.yml` dùng cùng tài khoản này cho cả ứng dụng;
  - tài khoản này có đủ quyền `UPDATE, DELETE, TRUNCATE` trên `communications.audit_logs`, `rbac_audit_log`.
- **Đề xuất:**

```sql
-- Migration (chạy bằng vai trò chủ sở hữu — vẫn là POSTGRES_USER, chỉ dùng cho migrate / sao lưu)
CREATE ROLE pctt_app LOGIN PASSWORD '…' NOSUPERUSER NOCREATEDB NOCREATEROLE;  -- mật khẩu lấy từ biến môi trường
GRANT USAGE ON SCHEMA spatial_admin, resources, operations, iot_telemetry, communications, community, integrations TO pctt_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA spatial_admin, resources, operations, iot_telemetry,
      communications, community, integrations TO pctt_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA … TO pctt_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA … GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO pctt_app;  -- bảng tạo sau
-- Nhật ký pháp lý: chỉ đọc và ghi thêm
REVOKE UPDATE, DELETE, TRUNCATE ON communications.audit_logs, communications.rbac_audit_log FROM pctt_app;
CREATE FUNCTION communications.append_only() RETURNS trigger LANGUAGE plpgsql AS
  $$ BEGIN RAISE EXCEPTION 'Nhật ký pháp lý chỉ được ghi thêm'; END $$;
CREATE TRIGGER audit_logs_append_only BEFORE UPDATE OR DELETE ON communications.audit_logs
  FOR EACH ROW EXECUTE FUNCTION communications.append_only();
CREATE TRIGGER audit_logs_no_truncate BEFORE TRUNCATE ON communications.audit_logs
  FOR EACH STATEMENT EXECUTE FUNCTION communications.append_only();
-- (tương tự cho rbac_audit_log)
```

- **Triển khai:**
  - `DATABASE_URL` của backend / worker dùng `pctt_app`;
  - dịch vụ `migrate` và `backup` giữ tài khoản chủ sở hữu;
  - thêm biến `APP_DB_PASSWORD` vào `.env.production`, kiểm tra trong `golive.py`.
- **Lưu ý:**
  - `retention.py` vẫn xoá được nhật ký tiếp nhận IoT, dòng sự kiện (không thuộc nhật ký pháp lý);
  - `python -m app.seed --reset` (chỉ dùng ở máy dev / trình diễn / CI, bị chặn khi `APP_ENV=production`) làm rỗng cả nhật
    ký → chạy bằng tài khoản chủ sở hữu, tạm tắt trigger trong lệnh reset.
- **Kiểm thử:**
  - pytest: ghi nhật ký được, sửa / xoá báo lỗi;
  - chạy `prod-flow.mjs` với vai trò mới (job Production của CI).

### DB2 — Khoá duy nhất số đo (trạm, thời điểm) — đã làm (PR #85)

Migration `0021`; `integrations/ingest.py`, bộ mô phỏng, dữ liệu mẫu ghi bằng `ON CONFLICT DO NOTHING`. Đã thử trên
TimescaleDB 2.30 (cùng phiên bản ảnh bản chạy thật): xoá bản trùng, tạo chỉ mục duy nhất, `ON CONFLICT` đều chạy được cả trên
đoạn đã nén. Phần dưới giữ lại để tra cứu.


- **Hiện trạng:**
  - `integrations/ingest.py` hỏi "đã có số đo này chưa" rồi mới ghi — 2 yêu cầu đến cùng lúc (HTTP + MQTT, gửi lại sau mất
    mạng) đều qua bước hỏi và cùng ghi;
  - bảng chỉ có chỉ mục thường `(station_id, time DESC)`. Stack thử hiện 0 bản trùng.
- **Đề xuất:**

```sql
-- (xoá bản trùng nếu có, giữ 1 bản)
CREATE UNIQUE INDEX sensor_readings_station_time_uq ON iot_telemetry.sensor_readings (station_id, time DESC);
DROP INDEX iot_telemetry.sensor_readings_station_id_time_idx;   -- chỉ mục thường cũ, trùng vai trò
```

```sql
-- integrations/ingest.py: một câu, không cần hỏi trước
INSERT INTO iot_telemetry.sensor_readings (time, station_id, value) VALUES (:t, :s, :v)
ON CONFLICT (station_id, time) DO NOTHING RETURNING time;   -- không trả dòng = trùng
```

- **Lưu ý:**
  - hypertable có khúc đã nén: tạo chỉ mục duy nhất cần thử trên bản sao (có thể phải giải nén các khúc cũ, hoặc tạo trước
    khi có nhiều dữ liệu thật);
  - bộ mô phỏng cũng đổi sang `ON CONFLICT DO NOTHING`.

### DB3 — Chỉ mục cho truy vấn vận hành — đã làm (PR #85, migration 0021)

| Chỉ mục | Truy vấn dùng |
|---|---|
| `dispatch_orders (ticket_id, status)` | Công thức quá hạn SLA (`services/sos.py`) kiểm tra "phiếu đã có đội đang đi chưa" **cho từng phiếu**; khoá ngoại `ticket_id` hiện không có chỉ mục |
| `sos_tickets (received_at DESC)` | Danh sách phiếu theo khoảng thời gian, tra cứu hồ sơ 7 / 30 ngày |
| `sos_tickets (priority, received_at) WHERE status <> 'hoan_thanh'` | Phiếu đang mở (bảng điều phối, ô KPI, tình hình từng xã) — bỏ qua phiếu đã xong, phần lớn bảng theo thời gian |
| `alert_broadcasts USING gin (target_admin_codes)` | Lọc lệnh theo xã (`&&`, `= ANY`) — trang Cảnh báo, "Tôi đang ở đâu?", tình hình từng xã |
| `alert_broadcasts USING gist (target_polygon)` | "Tôi đang ở đâu?" kiểm tra điểm nằm trong vùng vẽ tay |
| `event_logs (admin_unit_id, time DESC)` | Nhật ký sự kiện lọc theo xã (Tổng quan, Cấp xã) |

Bảng lớn tạo bằng `CREATE INDEX CONCURRENTLY` (migration chạy ngoài giao dịch). Đo trước / sau bằng `EXPLAIN ANALYZE` trong
đợt thử tải.

### DB4 — Thời hạn lưu dữ liệu cá nhân — đã làm cơ chế (PR #87), chờ chốt thời hạn

- Migration `0023`: cột `pii_cleared_at` cho `sos_tickets`, `citizen_reports`, `call_logs` + chỉ mục bản ghi đến hạn.
- `services/retention.py: clear_old_pii` — worker chạy mỗi giờ cùng việc dọn nhật ký, theo `PII_RETENTION_DAYS`
  (**mặc định 0 = giữ mãi**):
  - phiếu SOS đã xong: ẩn họ tên, SĐT, tin gốc, địa chỉ;
  - phản ánh đã qua duyệt (đã duyệt / từ chối / đã xử lý): ẩn họ tên, SĐT, nội dung gốc (thay bằng dòng "đã ẩn"), địa chỉ,
    mã băm IP; xoá ảnh khỏi kho; giữ nội dung đã duyệt công khai;
  - cuộc gọi tổng đài: SĐT chỉ còn 3 số cuối;
  - vị trí làm tròn ~100 m; giữ xã, loại sự cố, mốc thời gian, số người — thống kê, điểm nóng không đổi.
- Phiếu đang mở, phản ánh chờ duyệt không bị đụng; chạy lại nhiều lần vẫn đúng. Kiểm tra Go / No-Go báo CẢNH BÁO khi chưa
  đặt thời hạn.
- **Còn lại:** chủ dự án / bộ phận pháp chế chốt N (cùng hồ sơ đánh giá tác động xử lý dữ liệu cá nhân), đặt
  `PII_RETENTION_DAYS=N` trong `.env.production`. Phần dưới giữ lại để tra cứu.


- **Hiện trạng:**
  - `sos_tickets` (`reporter_name`, `reporter_phone`, `raw_message`, `address`) và `community.citizen_reports` (họ tên, SĐT,
    ảnh trên MinIO) lưu vô thời hạn;
  - README mục 11 đã nêu cần "thời hạn lưu trữ" theo Luật Bảo vệ dữ liệu cá nhân.
- **Đề xuất:**
  - thêm cột `pii_cleared_at timestamptz` cho 2 bảng;
  - `retention.py` chạy mỗi ngày: phiếu đã xong / phản ánh đã xử lý quá **N ngày** → xoá họ tên, SĐT, tin gốc, ảnh, giữ xã,
    loại sự cố, mốc thời gian, số người (thống kê không đổi), ghi `pii_cleared_at`;
  - biến cấu hình `PII_RETENTION_DAYS` (0 = giữ mãi, như các thời hạn khác).
- **Cần quyết định:** N do chủ dự án / bộ phận pháp chế chốt (cùng hồ sơ đánh giá tác động xử lý dữ liệu cá nhân).

### DB5 — Đợt thiên tai — đã làm (PR #89)

- Migration `0025`: bảng `operations.disaster_events` (mã `DT-<năm>-<số thứ tự>`, tên, loại thiên tai, giờ bắt đầu /
  kết thúc, vùng ảnh hưởng `admin_codes` — rỗng = toàn tỉnh, ghi chú mở / kết thúc, người mở / kết thúc); cột `event_id`
  (khoá ngoại, chỉ mục riêng phần có giá trị) ở **5 bảng**: phiếu SOS, lệnh điều động, lệnh cảnh báo, vùng nguy hiểm và dòng
  sổ kho (DB7).
- **Gắn tự động bằng trigger** (`operations.assign_event`, trước khi ghi): bản ghi tạo trong lúc có đợt đang mở ở xã thuộc
  vùng ảnh hưởng nhận mã đợt — mọi nơi tạo (API, cổng nhận tin Zalo / ứng dụng, cảm biến tự động, nhập tệp, bộ mô phỏng)
  không phải tự gắn. Phiếu theo xã của phiếu; lệnh điều động theo đợt của phiếu; lệnh cảnh báo theo các xã nhận tin; vùng
  nguy hiểm theo xã; dòng sổ kho kèm lệnh điều động / hoàn trả khi huỷ lệnh theo đợt của lệnh (kho ở xã khác vẫn tính; lệnh
  ngoài đợt → dòng ngoài đợt, xuất và hoàn trả luôn cùng đợt), dòng khác theo xã của kho. Trùng nhiều đợt → đợt bắt đầu muộn
  nhất.
- **Gắn bù**: mở đợt "đã bắt đầu từ…" (lùi tối đa 30 ngày) hoặc thêm xã vào vùng → API gắn các bản ghi đã có từ giờ bắt đầu
  (không lấy bản ghi đã thuộc đợt khác). **Gỡ ra**: bỏ xã khỏi vùng hoặc kết thúc lùi giờ (quên kết thúc đúng lúc) → bản ghi
  ngoài vùng / sau giờ kết thúc gỡ khỏi đợt (sang đợt khác nếu khớp) — báo cáo luôn đúng "vùng ảnh hưởng × từ lúc bắt đầu tới
  lúc kết thúc". Kết thúc đợt → bản ghi mới không gắn nữa.
- API `/api/v1/events`: danh sách (đang diễn ra lên đầu, kèm số phiếu / người được cứu / cảnh báo), mở, sửa tên – vùng –
  ghi chú, kết thúc, **báo cáo** `GET /events/{mã}/summary`: phiếu SOS (tổng, còn mở, mắc kẹt, đã cứu, tiếp nhận trung vị,
  theo loại / ngày / xã), lệnh điều động, lệnh cảnh báo, vùng nguy hiểm, vật tư (đã xuất · hoàn trả · nhập thêm — từ sổ kho),
  sơ tán cao nhất theo xã và **diễn biến sơ tán** theo mốc giờ (từ lịch sử sơ tán, DB8). Số liệu theo phạm vi được giao + bộ
  lọc địa bàn; đợt chỉ ở xã khác → không thấy (404).
- Quyền: xem — `monitoring.view` (mọi tài khoản); mở / sửa / kết thúc — quyền mới `event.manage` (cấp tỉnh). Mọi thao tác
  ghi nhật ký pháp lý (`event.create` / `update` / `end`) và Diễn biến.
- Giao diện: trang **Đợt thiên tai** (`/dot-thien-tai`, menu trái) — máy tính: danh sách bên trái, báo cáo bên phải; dưới
  1024 px: danh sách → chạm mở báo cáo. Báo cáo: 6 ô chỉ số, phiếu SOS theo ngày (theo cấp, thang màu chung), diễn biến sơ
  tán, 5 bảng; Excel nhiều trang tính, PDF. Form mở đợt 2 bước (lỗi ngay dưới ô), kết thúc đợt bằng chip lý do.
- Khác phác thảo: thêm `inventory_moves.event_id` (DB7), `end_note` / `ended_by`; **chưa** gắn / gỡ tay từng phiếu (chưa
  cần — giờ bắt đầu + vùng ảnh hưởng đủ dùng; khi cần thì thêm thao tác "chuyển sang đợt khác" trên phiếu). Thiệt hại theo đợt:
  DB6. Phần dưới giữ lại để tra cứu.


```sql
CREATE TABLE operations.disaster_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,                 -- VD DT-2026-03
  name text NOT NULL,                        -- VD "Mưa lũ ngày 12–15/9/2026"
  hazard text NOT NULL,                      -- loại thiên tai chính (mưa lớn, lũ quét, sạt lở, bão…)
  started_at timestamptz NOT NULL,
  ended_at timestamptz,
  admin_codes text[] NOT NULL DEFAULT '{}',  -- vùng ảnh hưởng
  note text,
  created_by uuid REFERENCES communications.users(id)
);
ALTER TABLE operations.sos_tickets ADD COLUMN event_id uuid REFERENCES operations.disaster_events(id);
-- tương tự: operations.dispatch_orders, communications.alert_broadcasts, iot_telemetry.hazard_zones
```

- Gán tự động: phiếu / lệnh / cảnh báo tạo trong lúc có đợt đang mở (chưa `ended_at`) ở xã thuộc vùng ảnh hưởng → nhận
  `event_id`; trực ban sửa được.
- Giao diện: mở / đóng đợt, lọc báo cáo, Excel / PDF theo đợt.

### DB6 — Thống kê thiệt hại

```sql
CREATE TABLE operations.damage_indicators (       -- danh mục chỉ tiêu theo mẫu thống kê đang áp dụng
  code text PRIMARY KEY, name text NOT NULL, unit text NOT NULL, grp text NOT NULL, sort integer NOT NULL
);
CREATE TABLE operations.damage_reports (
  id bigserial PRIMARY KEY,
  event_id uuid NOT NULL REFERENCES operations.disaster_events(id),
  admin_unit_id uuid NOT NULL REFERENCES spatial_admin.administrative_units(id),
  indicator text NOT NULL REFERENCES operations.damage_indicators(code),
  quantity numeric NOT NULL CHECK (quantity >= 0),
  value_vnd bigint,                                -- ước tính giá trị, nếu mẫu yêu cầu
  reported_by uuid REFERENCES communications.users(id), reported_at timestamptz NOT NULL DEFAULT now(),
  verified_by uuid REFERENCES communications.users(id), verified_at timestamptz,
  UNIQUE (event_id, admin_unit_id, indicator)
);
```

- Danh mục chỉ tiêu (người chết, mất tích, bị thương, nhà sập / hư hỏng, diện tích lúa – hoa màu, đường – cầu…) lấy đúng
  theo mẫu thống kê, đánh giá thiệt hại do thiên tai **đang áp dụng** — BCH xác nhận văn bản (Thông tư liên tịch
  43/2015/TTLT-BNNPTNT-BKHĐT hoặc văn bản thay thế).
- Xã nhập qua luồng "Gửi dữ liệu chờ duyệt" đã có, tỉnh duyệt (`reported_by` / `verified_by`).

### DB7 — Sổ xuất – nhập kho — đã làm (PR #88)

- Migration `0024`: bảng `resources.inventory_moves`, ghi bằng **trigger trên `resources.inventory`** — mọi nơi đổi tồn kho
  (xuất / nhập kho, vật tư kèm lệnh điều động, hoàn trả khi huỷ lệnh, nhập tệp, bộ mô phỏng, nơi viết sau này) đều có dòng
  sổ, không phụ thuộc từng nơi gọi nhớ ghi. Lý do / người thao tác / lệnh điều động / ghi chú do ứng dụng báo qua biến
  phiên của giao dịch (`services/ledger.py`); không báo → "khác".
- Lưu kèm mã / tên kho (kho bị xoá khi nhập lại danh sách thì sổ vẫn còn); mã mặt hàng không khoá ngoại (danh mục sửa
  được). Khoá ngoại tới lệnh điều động kiểm tra cuối giao dịch (vật tư trừ trước khi ghi lệnh — mã lệnh tạo sẵn).
- API `GET /resources/inventory-moves` (theo phạm vi được giao, tối đa 5.000 dòng); giao diện: khối **Sổ xuất – nhập kho**
  ở thẻ Kho vật tư (7 / 30 / 90 ngày, lọc kho / lý do / mặt hàng, tìm không dấu, phân trang, Excel / PDF; nút trên thẻ
  kho mở sẵn đúng kho).
- Khác phác thảo: `to_admin_unit_id` (xã nhận) chưa có — nơi nhận khi xuất kho đang là chữ tự do (ghi chú). `event_id` đã
  thêm (DB5, PR #89): dòng kèm lệnh điều động / hoàn trả theo đợt của lệnh, dòng khác theo xã của kho. Phần dưới giữ lại để
  tra cứu.


```sql
CREATE TABLE resources.inventory_moves (
  id bigserial PRIMARY KEY,
  time timestamptz NOT NULL DEFAULT now(),
  warehouse_id uuid NOT NULL REFERENCES resources.warehouses(id),
  item_code text NOT NULL REFERENCES resources.items(code),
  delta integer NOT NULL CHECK (delta <> 0),        -- + nhập, − xuất
  reason text NOT NULL CHECK (reason IN ('nhap', 'xuat_cap_phat', 'xuat_dieu_dong', 'hoan_tra', 'kiem_ke', 'huy_het_han')),
  dispatch_order_id uuid REFERENCES operations.dispatch_orders(id),
  to_admin_unit_id uuid REFERENCES spatial_admin.administrative_units(id),  -- nơi nhận
  event_id uuid REFERENCES operations.disaster_events(id),
  actor_id uuid REFERENCES communications.users(id),
  note text
);
CREATE INDEX ON resources.inventory_moves (warehouse_id, time DESC);
```

- Ghi **trong cùng giao dịch** với các câu `UPDATE resources.inventory` hiện có: xuất kho, nhập kho
  (`api/v1/resources.py`), vật tư kèm lệnh điều động và hoàn trả khi huỷ lệnh (`api/v1/sos.py`).
- Dữ liệu cũ: dựng lại từ nhật ký thao tác `inventory.issue` / `inventory.receive` nếu cần.

### DB8 — Lịch sử sơ tán — đã làm (PR #88)

- Bảng `operations.evacuation_history` + trigger trên `evacuation_progress` (chỉ ghi khi số liệu đổi, kèm người cập nhật);
  số hiện có làm điểm đầu. API `GET /evacuation/{code}/history?hours=` (theo phạm vi; xã ngoài phạm vi → 404).
- Biểu đồ diễn biến sơ tán: trong báo cáo đợt (DB5, PR #89) — tổng số hộ đã sơ tán của các xã theo mốc giờ so với kế hoạch;
  xã không cập nhật trong đợt tính số đang ghi lúc bắt đầu đợt. Phần dưới giữ lại để tra cứu.


```sql
CREATE TABLE operations.evacuation_history (
  admin_unit_id uuid NOT NULL REFERENCES spatial_admin.administrative_units(id),
  time timestamptz NOT NULL,
  planned_households integer, evacuated_households integer, planned_persons integer, evacuated_persons integer,
  PRIMARY KEY (admin_unit_id, time)
);
-- Trigger AFTER INSERT OR UPDATE trên operations.evacuation_progress ghi một dòng — cùng cách với lịch sử vận hành hồ
-- (iot_telemetry.log_reservoir_operation, migration 0020)
```

Dùng cho biểu đồ "diễn biến sơ tán" trong đợt (DB5) và báo cáo.

### DB9 — Toàn vẹn tham chiếu — đã làm (PR #88)

- `vehicles.mission_ticket_id` → khoá ngoại tới phiếu SOS (xoá phiếu → về trống); bản ghi mồ côi được dọn trước.
- `dispatch_orders.dispatched_by_id`, `cancelled_by_id` (khoá ngoại tới tài khoản), giữ họ tên để hiển thị; lệnh cũ gán
  theo họ tên khi họ tên đó chỉ thuộc đúng 1 tài khoản.
- Phương tiện của lệnh (`vehicle_ids`): **trigger kiểm tra** mọi mã có thật khi tạo / sửa lệnh, thay cho bảng nối — đổi
  sang bảng nối phải sửa ~10 truy vấn (điều động, nhiệm vụ, mô phỏng, giải phóng phương tiện) mà lợi ích như nhau khi ghi.
  Xoá phương tiện (nhập lại danh sách) vẫn để lại mã cũ trong lệnh đã xong — danh sách lệnh bỏ qua mã không còn.
  Phần dưới giữ lại để tra cứu.


- `dispatch_orders.vehicle_ids uuid[]` → bảng nối `operations.dispatch_order_vehicles (order_id, vehicle_id)` có khoá ngoại.
- `vehicles.mission_ticket_id` → thêm khoá ngoại tới `sos_tickets`.
- `dispatch_orders.dispatched_by`, `cancelled_by` đang lưu **họ tên** (`user["full_name"]`) → thêm `dispatched_by_id`,
  `cancelled_by_id` (khoá ngoại tới `users`), giữ họ tên để hiển thị.

### DB10 — Tổng hợp số đo theo giờ / ngày

```sql
CREATE MATERIALIZED VIEW iot_telemetry.readings_hourly WITH (timescaledb.continuous) AS
SELECT station_id, time_bucket('1 hour', time) AS bucket,
       avg(value) AS avg, min(value) AS min, max(value) AS max, count(*) AS n
  FROM iot_telemetry.sensor_readings GROUP BY station_id, bucket WITH NO DATA;
SELECT add_continuous_aggregate_policy('iot_telemetry.readings_hourly',
       start_offset => INTERVAL '3 days', end_offset => INTERVAL '1 hour', schedule_interval => INTERVAL '15 minutes');
-- readings_daily: tổng hợp tiếp từ readings_hourly (continuous aggregate nhiều tầng)
```

- Cách tính mưa giờ hiện nay (trung bình số đo trong giờ, `api/v1/dashboard.py`) giữ nguyên — đổi nguồn đọc sang
  `readings_hourly` cho khoảng thời gian dài.
- Số đo đến muộn trong 3 ngày được tính lại; quá 3 ngày thì làm mới tay.

### DB11 — Định tuyến bằng pgRouting

- **Hiện trạng:** `services/safe_routing.py` tải toàn bộ `road_segments` mỗi lần tìm đường rồi chạy Dijkstra bằng Python —
  phù hợp sơ đồ 74 đoạn mẫu.
- **Đề xuất:**
  - khi nhập mạng đường cả tỉnh (D3 trang A), `CREATE EXTENSION pgrouting` (có sẵn trong ảnh CSDL);
  - dùng `pgr_dijkstra` trên `road_segments` (đã có `source_node`, `target_node`, chiều dài, tốc độ), chi phí âm (loại) cho
    đoạn giao vùng nguy hiểm đang hiệu lực;
  - giữ các kiểm tra "an toàn" và cảnh báo kèm tuyến hiện có.

### DB12 — Tuỳ chọn

- `event_logs` (và về lâu dài `audit_logs`) thành hypertable có nén khi lớn — nhật ký pháp lý không áp thời hạn xoá.
- Lưu lịch sử bản tin dự báo (`area_forecasts` hiện ghi đè theo xã × mô hình × giờ) để đánh giá độ đúng của dự báo sau mỗi đợt.
- pgAudit (nhật ký truy cập ở mức CSDL) nếu hồ sơ an toàn thông tin yêu cầu.
- `postgis_raster` cho bản đồ ngập / mô hình số độ cao (điểm 7 trang A) khi có dữ liệu.
- Tài khoản, mật khẩu, phân quyền đang ở schema `communications` — có thể tách schema `auth` riêng (đổi tên thuần tuý, nhiều
  chỗ phải sửa, lợi ích nhỏ).
- `vehicles.vehicle_type`: thêm `CHECK` theo danh mục loại phương tiện.

## 5. Việc về dữ liệu (đã theo dõi ở tài liệu từng trang)

| Dữ liệu | Hiện trạng | Theo dõi ở |
|---|---|---|
| Số hộ từng xã | Ước tính = dân số / 4 | D1 trang A |
| Ranh giới 56 xã/phường | Dữ liệu công khai sau sắp xếp; có tệp chính thức của Sở NN&MT thì nhập đè (`ranh_gioi_xa`) | README 2.2, trang F |
| Xóm / tổ dân phố | 8 xóm mẫu, không ranh giới | CF1 trang F |
| Xếp xã vào nhóm lọc nhanh | 3 nhóm đề xuất, chờ BCH | CF2 trang F |
| Địa danh cho tìm kiếm | Mẫu | CF3 trang F |
| Mạng đường | Sơ đồ trục chính vẽ tay | D3 trang A |
| Lực lượng, kho, điểm sơ tán, trạm, hồ | Mẫu / chưa đủ | D1 trang A, CD1 trang D, BC1 trang C |

## 6. Trình tự đề nghị

1. **DB2 + DB3** — một migration nhỏ, không đổi hành vi; đo lại bằng `EXPLAIN ANALYZE`.
2. **DB1** — sửa cả cấu hình triển khai (`docker-compose.prod.yml`, `.env.production`, `golive.py`); thử trên stack giống bản
   chạy thật (job Production của CI). **Xong** (PR #86, #90).
3. **DB4** — sau khi chủ dự án chốt thời hạn lưu.
4. **DB5 + DB7 + DB8** — cùng một đợt (cùng dùng `event_id`), kèm giao diện mở / đóng đợt và báo cáo theo đợt. **Xong**
   (PR #88, #89).
5. **DB6** — khi BCH xác nhận mẫu thống kê thiệt hại.
6. **DB9** — gộp vào đợt 4 (cùng sửa luồng điều động).
7. **DB10, DB11** — khi có số liệu / mạng đường thật (cùng đợt thử tải).

## 7. Rà lại cấu trúc CSDL

Danh sách bảng, cột, hypertable, chỉ mục, khoá ngoại, quyền: chạy trên stack bất kỳ —

```bash
docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "\dt+ *.*"'          # bảng theo schema
docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c \
  "SELECT hypertable_schema, hypertable_name, compression_enabled FROM timescaledb_information.hypertables"'
```

Mỗi thay đổi cấu trúc là một migration Alembic mới (`backend/alembic/versions/0021_…`), không sửa migration cũ.
