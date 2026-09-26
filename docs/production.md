# Vận hành thật (production)

## 1. Thành phần

| Service | Vai trò | Mở ra ngoài? |
|---|---|---|
| `frontend` (nginx) | Web tĩnh + reverse proxy `/api`, `/ws` | **Có** (qua HTTPS) |
| `backend` | API, `RUN_MODE=api`, gunicorn × `API_WORKERS` | Không (chỉ qua nginx) |
| `worker` | Tác vụ nền, `RUN_MODE=worker`: mô phỏng, đồng bộ Open-Meteo/OpenWeather, cầu nối MQTT | Không |
| `db` | PostgreSQL + PostGIS + TimescaleDB | Không |
| `redis` | Giới hạn tần suất, cache, pub/sub sự kiện & chính sách RBAC | Không |
| `minio` | Ảnh phản ánh | Không (console 9001 chỉ mở nội bộ) |
| `mqtt` | Broker IoT | Có, **bắt buộc bật xác thực + TLS** (xem integrations.md) |
| `mailpit` | Chỉ dùng dev — thay bằng SMTP thật | Không |

Chỉ chạy **một** `worker` (không scale) — bộ mô phỏng và runner không được chạy trùng. `backend` scale được
(tăng `API_WORKERS` hoặc thêm replica): sự kiện WebSocket và thay đổi phân quyền đồng bộ qua Redis.

## 2. Việc bắt buộc trước khi mở cho người dân

1. `.env`: đặt `JWT_SECRET`, `SECRET_KEY` dài, ngẫu nhiên (`openssl rand -hex 32`); đổi `POSTGRES_PASSWORD`, `MINIO_ROOT_PASSWORD`.
2. `DEMO_MODE=false` (ẩn tài khoản demo, không tạo lại tài khoản demo), `SIMULATOR=false` khi đã có dữ liệu thật.
3. Đăng nhập `admin` → **Đổi mật khẩu** ngay; tạo admin tỉnh, admin xã thật; khoá/xoá tài khoản demo.
4. `PUBLIC_BASE_URL=https://ten-mien-that` (link email, link chia sẻ). Cấu hình `SMTP_*` thật, `SMTP_STARTTLS=true`.
5. HTTPS: đặt nginx/Caddy/Cloudflare phía trước cổng 8080; chuyển tiếp `X-Forwarded-For` / `X-Forwarded-Proto`
   (để giới hạn tần suất tính đúng IP người dùng).
6. Bỏ ánh xạ cổng ra ngoài của `db`, `redis`, `minio`, `mailpit` trong `docker-compose.yml` (hoặc chặn bằng firewall).
7. Tuỳ chọn chống bot: `TURNSTILE_SECRET` (Cloudflare Turnstile).

## 3. Sao lưu

```bash
# CSDL (hằng ngày)
docker compose exec -T db pg_dump -U pctt -Fc caobang_pctt > backup/pctt_$(date +%F).dump
# Ảnh phản ánh
docker run --rm --network caobang-pctt_default -v "$PWD/backup:/b" minio/mc \
  sh -c "mc alias set s http://minio:9000 \$U \$P && mc mirror s/caobang-pctt /b/minio"
```

## 4. Triển khai phiên bản mới (GitOps)

1. Push lên `main` → CI (`.github/workflows/ci.yml`) phải xanh: ruff, pytest, build, 4 bộ kiểm thử API trên Docker Compose.
2. Tạo tag: `git tag v1.0.0 && git push origin v1.0.0` → `deploy.yml` build & đẩy
   `ghcr.io/<owner>/caobang-pctt-backend` và `-frontend`.
3. Trên máy chủ: đổi `build:` thành `image: ghcr.io/...:1.0.0` (hoặc dùng file compose override), rồi
   `docker compose pull && docker compose up -d`. Migration Alembic chạy tự động khi `backend` khởi động.

## 5. Giám sát

- `GET /health` → trạng thái CSDL, Redis, kho ảnh, `run_mode`. Docker healthcheck đã dùng endpoint này.
- Trang **Nguồn dữ liệu** hiển thị trạng thái đồng bộ Open-Meteo, MQTT, thiết bị mất tín hiệu.
- Log: `docker compose logs -f backend worker` (log truy cập gunicorn; httpx để mức WARNING để không lộ API key trong URL).
