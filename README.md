# Hệ thống Điều hành PCTT & TKCN tỉnh Cao Bằng

Ứng dụng web điều hành, ứng phó thiên tai cho **Ban Chỉ huy Phòng chống thiên tai & Tìm kiếm cứu nạn tỉnh Cao Bằng**
— màn hình trung tâm (video wall, Dark Mode) và máy tính bảng hiện trường (Light Mode).

> ⚠️ **Dữ liệu mô phỏng.** Trạm quan trắc, ngưỡng báo động, hồ chứa, lực lượng, kho, danh bạ và số điện thoại
> (đầu số `0999` không cấp phát) đều là **minh hoạ**. Ranh giới 56 xã/phường được **sinh xấp xỉ bằng Voronoi** từ toạ độ
> tâm và cắt theo ranh giới tỉnh (geoBoundaries). Khi triển khai thật cần thay bằng dữ liệu chính thức của
> Sở NN&MT, Đài KTTV, BCH PCTT & TKCN tỉnh.

## Phân hệ

| # | Phân hệ | Trang | Nội dung chính |
|---|---|---|---|
| A | Dashboard tổng quan | `/dashboard` | KPI thời gian thực (mưa lưu vực, mực nước vs BĐ I/II/III, sơ tán, SOS chờ >15′ nhấp nháy, lực lượng, phương tiện); Hydrograph thực đo + dự báo HEC-HMS; mưa giờ + tích lũy + nowcast QPF 3h; ngưỡng kích hoạt sạt lở; vật tư theo kho (cột chồng, phần thiếu hụt); nhật ký sự kiện; **xuất PDF báo cáo nhanh** |
| B | Bản đồ giám sát | `/ban-do` | 4 nhóm lớp (thủy văn, vùng nguy hiểm, lực lượng–vật tư, SOS), radar RainViewer, quỹ đạo bão, thanh thời gian −12h…+24h, popup có biểu đồ mini & nút hành động, CCTV, **kéo–thả đội cứu hộ vào điểm SOS**, khoanh vùng → đếm hộ dân → soạn cảnh báo, đo khoảng cách, **tìm đường an toàn A→B** |
| C | Vật tư & Lực lượng | `/nguon-luc` | 3 tab Lực lượng / Kho vật tư / Phương tiện; cảnh báo kho <20% định mức, sắp hết hạn; nhiên liệu; điều động nhanh; ra lệnh xuất kho; xuất Excel/PDF |
| D | Điều hành cứu hộ | `/cuu-ho` | Kanban 4 cột kéo–thả, SLA cấp 1/2/3 (3′/15′/60′), tiếp nhận đa kênh + bóc tách tin nhắn (NLP), khớp nối lực lượng gần nhất theo kỹ năng, ETA, giám sát sơ tán & sức chứa |
| E | Cảnh báo & Hotline | `/canh-bao` | Mẫu tin có tham số, phát theo xã/vùng vẽ, 5 kênh (SMS, Cell Broadcast, Zalo OA, Push, loa), **Maker–Checker + PIN**, Delivery Dashboard, danh bạ cây Tỉnh→Xã→Thôn, IVR phím 1/2/3, nhật ký pháp lý |
| F | Bộ lọc địa phương & Sáng/Tối | toàn cục | 56 xã/phường (sau 01/07/2025), preset lưu vực Bằng Giang–Hiến, vùng núi cao, biên giới, địa bàn huyện cũ; bản đồ zoom + mask; Omni-search (địa danh, toạ độ, mã SOS); theme theo `prefers-color-scheme` + lưu lựa chọn |
| G | CSDL | PostgreSQL 16 + PostGIS + TimescaleDB | 5 schema: `spatial_admin`, `resources`, `operations`, `iot_telemetry` (hypertable `sensor_readings`), `communications` — xem [backend/alembic/sql/0001_schema.sql](backend/alembic/sql/0001_schema.sql) |

Tự động hoá: cảm biến nghiêng / độ ẩm đất vượt BĐ II → tự khoanh vùng nguy cơ 1 km, tạo phiếu SOS nguồn `SENSOR`
và **bản nháp cảnh báo chờ Lãnh đạo duyệt**; dự báo mực nước 3 giờ tới vượt BĐ III → nháp "Chuẩn bị sơ tán".

## Kiến trúc

```
frontend (React 18 + Vite + Tailwind, react-leaflet, Recharts, TanStack Query, Zustand)
   │  REST /api/v1 (JSON, GeoJSON)      WebSocket /ws (sos.new, gps.update, reading.new, …)
backend (FastAPI async, SQLAlchemy 2 + psycopg3, Alembic)
   ├── simulator: số đo IoT, GPS lực lượng, SOS, vận hành hồ, giao nhận tin (thay cho nguồn thật)
   ├── services: safe_routing (Dijkstra né vùng nguy hiểm), dispatch_matching (ST_DWithin + kỹ năng),
   │             sos_nlp (bộ luật + hook LLM tuỳ chọn), broadcast (ước tính đối tượng theo diện tích giao cắt)
db (timescale/timescaledb-ha:pg16 — PostGIS + TimescaleDB)
```

Bộ lọc địa phương: frontend chỉ gửi `admin_codes`, backend hợp nhất ranh giới và lọc bằng `ST_Intersects`.

## Chạy nhanh

Yêu cầu: Docker Desktop, Node ≥ 20 (chỉ khi chạy frontend dev).

```bash
cp .env.example .env
docker compose up -d --build        # db + backend (tự migrate + seed) + frontend nginx
```

- Giao diện: http://localhost:8080 · API docs: http://localhost:8000/docs · Health: http://localhost:8000/health
- Postgres: `localhost:5433` (user `pctt`, db `caobang_pctt`)

Frontend dev (hot reload, proxy `/api` & `/ws` → `localhost:8000`):

```bash
cd frontend && npm install && npm run dev   # http://localhost:5173
```

Nạp lại dữ liệu mẫu (xoá dữ liệu nghiệp vụ):

```bash
docker compose exec backend python -m app.seed --reset && docker compose restart backend
```

### Tài khoản demo (nút **Đăng nhập** góc phải, khi `DEMO_MODE=true`)

| Tài khoản | Vai trò | Mật khẩu | PIN |
|---|---|---|---|
| `trucban` | Trực ban – soạn lệnh (Maker) | `trucban123` | – |
| `chihuy` | Lãnh đạo – phê duyệt (Checker) | `chihuy123` | `2468` |
| `admin` | Quản trị | `admin123` | `0000` |
| `xem` | Chỉ xem | `xem123` | – |

Người soạn không được tự duyệt lệnh của mình (nguyên tắc 4 mắt); mọi thao tác ghi vào `communications.audit_logs`.

## Kiểm thử

```bash
docker compose exec backend pytest -q        # kiểm thử đơn vị thuật toán (NLP, định tuyến, khớp nối, ngưỡng…)
node scripts/smoke.mjs                        # kiểm thử end-to-end qua API (cần stack đang chạy)
cd frontend && npm run build                  # build production
```

## Tích hợp thật (thay mô phỏng)

| Mô phỏng | Thay bằng |
|---|---|
| `services/simulator.py` – số đo | Ingest MQTT/HTTP từ trạm NB-IoT/LoRaWAN → `iot_telemetry.sensor_readings` |
| Dự báo HEC-HMS, QPF | Job đọc kết quả mô hình (R/Python) → `iot_telemetry.forecasts` |
| `services/broadcast.py` – adapter | SMS Brandname / Cell Broadcast nhà mạng, Zalo OA API, FCM/APNs Critical Alerts, loa IP |
| SOS mô phỏng | Webhook Zalo OA / app di động gọi `POST /api/v1/sos` |
| `sos_nlp` bộ luật | Đặt `LLM_API_URL`, `LLM_API_KEY`, `LLM_MODEL` (API tương thích OpenAI) |
| Camera canvas | HLS/WebRTC từ media server (RTSP) |
| Nút gọi `tel:` | Tổng đài WebRTC/SIP có ghi âm |
| Ranh giới Voronoi | Shapefile ranh giới xã chính thức (Sở NN&MT) |

Nguồn danh sách 56 xã/phường: Nghị quyết 1657/NQ-UBTVQH15 (hiệu lực 01/07/2025).
