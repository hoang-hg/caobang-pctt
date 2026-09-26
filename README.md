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

## Hướng dẫn chạy và xem trên trình duyệt

### Bước 1 – Cài phần mềm cần thiết

| Phần mềm | Bắt buộc? | Tải về | Ghi chú |
|---|---|---|---|
| **Docker Desktop** | Có | https://www.docker.com/products/docker-desktop/ | Windows cần bật WSL 2 (trình cài đặt tự hướng dẫn). Máy nên có ≥ 8 GB RAM, trống ≥ 6 GB ổ đĩa |
| **Git** | Có | https://git-scm.com/downloads | Để tải mã nguồn |
| **Node.js 20+** | Chỉ khi sửa giao diện | https://nodejs.org/ | Dùng cho chế độ phát triển (Cách B) |

Sau khi cài, **mở Docker Desktop và chờ biểu tượng cá voi báo “Engine running”** rồi mới chạy lệnh.
Kiểm tra nhanh trong terminal (PowerShell, Git Bash hoặc Terminal trên macOS/Linux):

```bash
docker --version
docker compose version
git --version
```

### Bước 2 – Tải mã nguồn

```bash
git clone https://github.com/hoang-hg/caobang-pctt.git
cd caobang-pctt
```

Tạo file cấu hình từ mẫu (có thể giữ nguyên giá trị mặc định):

```bash
cp .env.example .env            # PowerShell: Copy-Item .env.example .env
```

### Bước 3 – Chạy hệ thống

#### Cách A – Chạy toàn bộ bằng Docker (khuyên dùng để xem thử)

```bash
docker compose up -d --build
```

Lệnh này dựng 3 dịch vụ: `db` (PostgreSQL + PostGIS + TimescaleDB), `backend` (FastAPI – tự tạo bảng và nạp dữ liệu mẫu),
`frontend` (giao diện qua nginx). **Lần đầu mất khoảng 5–10 phút** vì phải tải image CSDL (~1 GB); các lần sau chỉ vài giây.

Kiểm tra các dịch vụ đã chạy:

```bash
docker compose ps                     # cả 3 dịch vụ ở trạng thái "Up" / "healthy"
docker compose logs -f backend        # thấy "[seed] Hoàn tất" và "Uvicorn running" là xong (Ctrl+C để thoát)
```

#### Cách B – Chế độ phát triển giao diện (sửa code thấy ngay)

```bash
docker compose up -d --build db backend    # chỉ chạy CSDL + backend bằng Docker
cd frontend
npm install                                # lần đầu
npm run dev                                # proxy /api & /ws → localhost:8000
```

### Bước 4 – Mở trình duyệt

| Địa chỉ | Nội dung |
|---|---|
| **http://localhost:8080** | Giao diện web điều hành (Cách A) |
| **http://localhost:5173** | Giao diện chế độ phát triển (Cách B) |
| http://localhost:8000/docs | Tài liệu API (Swagger) – thử gọi API trực tiếp |
| http://localhost:8000/health | Kiểm tra trạng thái hệ thống, CSDL |
| `localhost:5433` | PostgreSQL (user `pctt` / mật khẩu `pctt_dev_password`, db `caobang_pctt`) – mở bằng DBeaver, pgAdmin… |

Nên dùng Chrome / Edge / Firefox bản mới. Bản đồ nền, radar mưa và font chữ tải từ Internet nên máy cần có mạng.

### Bước 5 – Dùng thử các chức năng

1. Bấm **Đăng nhập** (góc phải trên) → chọn tài khoản demo:
   - **Nông Văn Trực** – Trực ban: soạn lệnh cảnh báo, điều động lực lượng, xuất kho.
   - **Hoàng Đức Chỉ** – Lãnh đạo: phê duyệt lệnh cảnh báo bằng **PIN 2468**.
2. **Tổng quan**: xem KPI, biểu đồ thủy văn, mưa, sạt lở, vật tư; bấm **Xuất PDF báo cáo nhanh**.
3. **Bản đồ giám sát**: bật/tắt lớp dữ liệu bên trái; click trạm/hồ/kho để xem popup; **kéo biểu tượng đội cứu hộ
   (ô vuông xanh) thả lên điểm SOS đỏ** để điều động; dùng công cụ góc phải để đo khoảng cách, tìm đường an toàn A→B,
   khoanh vùng rồi bấm “Soạn cảnh báo sơ tán”; kéo thanh thời gian ở đáy để xem −12h…+24h.
4. **Điều hành cứu hộ**: kéo thả phiếu SOS giữa các cột; dán tin nhắn cầu cứu vào ô “Tiếp nhận đa kênh” → **Bóc tách thông tin**.
5. **Vật tư & Lực lượng**: lọc, tìm kiếm, **Điều động nhanh**, **Xuất kho**, xuất Excel/PDF.
6. **Cảnh báo & Hotline**: Trực ban soạn lệnh từ mẫu → đăng nhập Lãnh đạo → **Phê duyệt** → xem bảng tỷ lệ chuyển giao.
7. Dùng **bộ lọc địa phương** (nút “Toàn tỉnh Cao Bằng” trên đầu trang) và **ô tìm kiếm** (VD: `Bản Giốc`, `22.66, 106.25`, `SOS-1001`);
   nút mặt trời/mặt trăng để đổi **Sáng/Tối**.

Bộ mô phỏng tự sinh số đo cảm biến mỗi 4 giây, SOS mới khoảng 3 phút/lần, lực lượng di chuyển trên bản đồ sau khi điều động.

### Các lệnh thường dùng

```bash
docker compose ps                                    # xem trạng thái
docker compose logs -f backend                       # xem log backend
docker compose restart backend                       # khởi động lại backend
docker compose stop                                  # tạm dừng (giữ dữ liệu)
docker compose down                                  # tắt và xoá container (giữ dữ liệu CSDL)
docker compose down -v                               # tắt và XOÁ LUÔN dữ liệu CSDL
docker compose up -d --build                         # chạy lại sau khi sửa code backend / frontend

# Xoá dữ liệu nghiệp vụ và nạp lại dữ liệu mẫu từ đầu
docker compose exec backend python -m app.seed --reset
docker compose restart backend
```

### Xử lý lỗi thường gặp

| Hiện tượng | Nguyên nhân / Cách xử lý |
|---|---|
| `failed to connect to the docker API` / `Cannot connect to the Docker daemon` | Docker Desktop chưa mở → mở Docker Desktop, chờ “Engine running” rồi chạy lại |
| `port is already allocated` (8080, 8000, 5433) | Cổng đang bị chương trình khác dùng → tắt chương trình đó, hoặc đổi cổng: `POSTGRES_PORT` trong `.env`; cổng `8080:80` / `8000:8000` trong `docker-compose.yml` |
| Trang báo **502 Bad Gateway** ngay sau khi chạy | Backend còn đang tạo bảng / nạp dữ liệu → chờ 20–30 giây rồi tải lại trang (xem `docker compose logs -f backend`) |
| `pip install … did not complete successfully` khi build | Mạng chập chờn khi tải thư viện → chạy lại `docker compose up -d --build` |
| Góc phải hiện **“Mất kết nối”** | Backend dừng hoặc khởi động lại → `docker compose ps`, `docker compose restart backend` |
| Bản đồ trắng / không có nền | Máy không có Internet hoặc mạng chặn máy chủ bản đồ → đổi nền bản đồ (menu “Nền” trên bản đồ) hoặc kiểm tra mạng |
| Nút **Phát lệnh**, **Phê duyệt** bị mờ | Chưa đăng nhập, hoặc sai vai trò (phê duyệt cần tài khoản Lãnh đạo) |
| Không nghe âm báo SOS | Trình duyệt chặn âm thanh khi chưa tương tác → click vào trang một lần; kiểm tra nút loa trên thanh đầu trang |
| Muốn làm sạch hoàn toàn | `docker compose down -v` rồi `docker compose up -d --build` |

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
