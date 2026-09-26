# CLAUDE.md — caobang-pctt

Hệ thống điều hành PCTT & TKCN tỉnh Cao Bằng. Monorepo: `backend/` (FastAPI), `frontend/` (React/Vite), `db/init` (extension).
Đọc [README.md](README.md) để nắm phân hệ A–G và cách chạy.

## Quy ước backend
- SQL thuần qua `app/db.py` (`fetch_all`, `fetch_one`, `execute`, `transaction`). Truy vấn PostGIS viết trực tiếp.
- **Không viết `:param::type`** trong `text()` — SQLAlchemy không nhận bind; dùng `CAST(:param AS type)`.
  Tham số có thể `None` trong biểu thức `IS NULL` cũng phải `CAST` để Postgres suy ra kiểu.
- Lọc địa phương: dùng `parse_codes` + `area_clause(geom_col, codes)` / `unit_clause(...)` trong `app/area.py`.
- Sự kiện realtime: `hub.publish(event, data)` (đi qua Redis `pctt:events` để mọi tiến trình API nhận); ghi nhật ký qua `services/events.log_event`.
- Hai chế độ tiến trình (`RUN_MODE`): `api` (gunicorn nhiều worker — **không** chạy tác vụ nền) và `worker` (`python -m app.worker`: simulator, runner, MQTT). Việc khởi động dùng chung đặt trong `app/lifecycle.py`; việc chỉ được chạy 1 lần đặt trong `advisory_lock`.
- Trạng thái dùng chung giữa tiến trình → DB hoặc Redis (`app/infra/`), không để trong biến module.
- Schema nằm trong `backend/alembic/sql/*.sql` (migration Alembic đọc file SQL). Thêm thay đổi bằng migration mới.
- Dữ liệu mẫu: `app/seed_data.py` (hằng số) + `app/seed.py`. Kịch bản khí tượng: `services/scenario.py` (chu kỳ 96h).
- Lint/test: `ruff format && ruff check`, `pytest` (chạy trong container: `docker compose exec backend …`). CI: `.github/workflows/ci.yml` (ruff, pytest, build, 4 script kiểm thử API trên Docker Compose).
  Git Bash trên Windows: đặt `MSYS_NO_PATHCONV=1` khi `docker run -w /src`.

## Phân quyền (RBAC) — bắt buộc
- Casbin `rbac_with_domains`, domain phân cấp `*` → `CUM/*` → `CUM/MA_XA` (cột `administrative_units.rbac_domain`). Xem [docs/rbac.md](docs/rbac.md).
- Endpoint mới: `require_permission(obj, act, scope_loader)` / `area_scope(obj, act)` / `require_any` từ `app.rbac.authz`.
  **Không** kiểm tra tên vai trò trong route. Quyền mới → `app/rbac/permissions.py` + `docs/rbac.md`.
- Sự kiện WebSocket gắn xã: `hub.publish(event, data, "sos", admin_code)` để lọc theo phạm vi người nhận.
- Frontend: `<Can I a scope>`, `usePermission`, `useAllowedCodes` (`src/rbac/`); API trả `admin_code` cho đối tượng cần gate theo xã.
- Seed gán lại `admin_unit_id` theo vị trí thực (ranh giới xã xấp xỉ) — phạm vi RBAC dựa trên ranh giới này.

## Cổng công khai & phản ánh
- `app/api/v1/public.py` không cần đăng nhập: **chỉ trả dữ liệu an toàn công khai** (không vị trí lực lượng/kho/phương tiện, không SOS chi tiết, không SĐT cán bộ, không họ tên/SĐT người phản ánh). Bọc bằng `infra.cache.cached("public:…")`; thay đổi dữ liệu liên quan thì `invalidate("public:")`. Test `scripts/public-test.mjs` kiểm tra rò rỉ trường nhạy cảm — thêm trường mới phải cập nhật.
- Giới hạn tần suất: thêm quy tắc vào `RULES` trong `app/infra/ratelimit.py` (khớp tiền tố đường dẫn, quy tắc cụ thể đặt trước).
- Ảnh: luôn qua `services/reports.process_image` (xoá EXIF, chống bomb, JPEG) rồi `infra.storage.put`; ảnh chưa duyệt chỉ phát qua URL có chữ ký (`signed_photo_url`).
- Mật khẩu mới phải qua `auth.password_problem`; đổi/đặt lại mật khẩu tăng `token_version`.

## Tích hợp dữ liệu (app/integrations)
- Nguồn kéo: adapter `adapters/<tên>.py` có `run(source, api_key)`, đăng ký trong `runner.ADAPTERS`; hàm phân tích dữ liệu viết thuần để unit test.
- Nguồn đẩy: mọi số đo đi qua `ingest.ingest_readings()` (kiểm tra → ghi → WebSocket → `simulator.check_triggers`).
- Trạm có `source` = simulator | iot | external; bộ mô phỏng chỉ sinh cho `simulator`.
- Bí mật: `crypto.encrypt/decrypt` (Fernet); không log URL chứa API key. Xem [docs/integrations.md](docs/integrations.md).

## Quy ước frontend
- Màu qua biến CSS (`src/index.css`) + Tailwind tokens (`bg-panel`, `text-ink-2`, `bg-danger`…); màu trạng thái cố định.
- Biểu đồ Recharts lấy màu từ `useChartTheme()`; không dùng 2 trục Y (tách biểu đồ).
- Truy vấn theo vùng lọc: `useAreaQuery(key, path)`; key trùng tên với sự kiện WebSocket trong `api/useSocket.js` để tự làm mới.
- `leaflet-draw` cần `components/map/leafletGlobal.js` import trước.
- Nền tối dùng Esri Dark Gray Canvas (CARTO yêu cầu API key).
