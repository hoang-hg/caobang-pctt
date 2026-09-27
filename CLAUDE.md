# CLAUDE.md — caobang-pctt

Hướng dẫn cho trợ lý AI và lập trình viên làm việc trong kho mã này. Đọc hết trước khi sửa code.

## 1. Dự án

Hệ thống điều hành **Phòng chống thiên tai & Tìm kiếm cứu nạn tỉnh Cao Bằng** (~0,55 triệu dân, 56 xã/phường sau
01/07/2025). Người dùng: Ban Chỉ huy tỉnh, chỉ huy cụm (địa bàn huyện cũ), cán bộ xã, và **người dân** qua cổng công khai
không cần đăng nhập. Sai sót ở đây có thể khiến người dân đi tới điểm sơ tán không có thật hoặc không nhận được cảnh báo —
ưu tiên đúng và an toàn hơn nhanh.

- **Tài liệu duy nhất: [README.md](README.md)** (13 mục, có anchor). Không tạo thêm tệp tài liệu; thay đổi chức năng /
  cấu hình / quy trình → cập nhật đúng mục README. Bản đồ mục hay dùng: §2 Hiện trạng · §5 Biến cấu hình · §6 Kết nối
  dữ liệu thật · §8 RBAC · §9 Cổng công khai & giới hạn tần suất · §10 Triển khai · §11 Bảo mật · §12 Kiểm thử.
- **Hiện trạng (README §2)**: cảnh báo SMS / Cell Broadcast / Zalo **chưa gửi tin thật** (`services/broadcast.py` chỉ mô
  phỏng tiến độ); trạm, lực lượng, kho, điểm sơ tán, danh bạ là dữ liệu mẫu; ranh giới xã là Voronoi xấp xỉ. Đổi trạng
  thái một chức năng (mô phỏng → thật) phải cập nhật README §2. **Không bao giờ hiển thị dữ liệu mẫu / mô phỏng cho
  người dân như dữ liệu thật.**
- Ngôn ngữ: giao diện, thông báo lỗi API, docstring, comment, commit message đều **tiếng Việt có dấu**. Tên biến, hàm,
  bảng, cột, route API bằng tiếng Anh / không dấu; slug trang frontend tiếng Việt không dấu (`/cuu-ho`, `/canh-bao`).

## 2. Bản đồ mã nguồn

```
.env.example / .env.production.example   mẫu cấu hình dev / chạy thật (.env, .env.production không lên git)
docker-compose.yml        dev + trình diễn + CI: db redis minio mailpit mqtt backend worker frontend (container_name cố định)
docker-compose.prod.yml   chạy thật (project caobang-pctt-prod): caddy? frontend backend worker migrate db redis minio backup mqtt?
deploy/Caddyfile, deploy/backup.sh       HTTPS; sao lưu pg_dump + ảnh hằng ngày
deploy/fetch-basemap.sh    tải bản đồ nền tự lưu trữ → data/tiles/caobang.pmtiles (không lên git; nginx phục vụ /tiles/)
mqtt/mosquitto.conf (dev, ẩn danh) · mosquitto.prod.conf + acl.example (thật)
db/init/01_extensions.sql  postgis, timescaledb, pg_trgm, unaccent
tests/e2e/*.mjs            kiểm thử API qua HTTP (Node 20+, cần stack dev chạy với DEMO_MODE=true)
tests/load/                load.js (k6) + make_photo.py — kiểm thử tải (README §12.2)
scripts/maintenance/       script bảo trì CSDL máy dev (clean-simulated-data: chặn nếu APP_ENV≠development, cần --yes)
.github/workflows/ci.yml · deploy.yml

backend/                   Python 3.12, FastAPI, SQLAlchemy async (psycopg3), Casbin, gunicorn + UvicornWorker
  app/main.py              tạo app, middleware, router, /health, /ws, bộ lọc log DropQueryString
  app/config.py            Settings (pydantic-settings) — MỌI biến môi trường
  app/preflight.py         kiểm tra cấu hình staging/production → dừng khởi động nếu yếu
  app/lifecycle.py         startup/shutdown theo RUN_MODE; advisory_lock; bootstrap RBAC, nguồn dữ liệu, bucket
  app/worker.py            tiến trình nền (RUN_MODE=worker)
  app/db.py                engine + fetch_all / fetch_one / execute / transaction
  app/auth.py              JWT, băm mật khẩu/PIN (PBKDF2), current_user, audit(), password_problem, bump_token_version
  app/mfa.py               xác thực 2 lớp TOTP: mã, mã khôi phục, phiếu đăng nhập, required() theo TOTP_REQUIRED_ROLES
  app/area.py              parse_codes, area_clause, unit_clause (bộ lọc địa phương)
  app/api/v1/*.py          router: admin_units alerts auth mfa dashboard forecast ingest integrations map_layers public
                           rbac reports resources search sos
  app/rbac/                permissions.py (SSOT quyền + vai trò hệ thống) · authz.py (dependency cho route) ·
                           scope_loaders.py (tài nguyên → domain) · domains.py · enforcer.py · management.py (uỷ quyền,
                           chống leo thang) · seed.py (đồng bộ vai trò, tạo Superadmin / tài khoản demo)
  app/services/            sos, sos_nlp, dispatch_matching, safe_routing, broadcast, reports, tracking, reservoirs,
                           landslides, events (log_event), simulator, scenario, lite (trang bản nhẹ /ban-nhe, HTML < 50 KB)
  app/services/data_import/  nhập dữ liệu chính thức từ tệp: specs.py (khai báo 12 loại) · parsing.py (CSV/xlsx/GeoJSON,
                           chuẩn hoá — thuần) · engine.py (validate / apply 1 transaction) · templates.py · service.py
                           (nhật ký, sự kiện, xoá cache) · __main__.py (dòng lệnh). API: app/api/v1/data_import.py
  app/integrations/        runner.py (lập lịch nguồn kéo, DEFAULT_SOURCES, ADAPTERS, env_source_keys) · adapters/
                           (open_meteo, openweather) · ingest.py (lõi nhận số đo) · mqtt_bridge.py · crypto.py (Fernet)
  app/infra/               redis.py · cache.py (cached, cached_view, invalidate, bump_data_version) · ratelimit.py
                           (RULES, limit()) · storage.py (MinIO / thư mục) · mailer.py · heartbeat.py (nhịp worker)
  app/ws/hub.py            WebSocket hub + relay Redis
  app/seed.py, seed_data.py  seed dữ liệu nền / mẫu; seed_data.USERS = tài khoản demo (mật khẩu công khai)
  alembic/sql/000N_*.sql   cấu trúc CSDL (nguồn thật) · alembic/versions/000N_*.py đọc tệp SQL tương ứng
  tests/                   pytest không cần CSDL (kiểm thử đơn vị backend)

frontend/                  React 18, Vite 6, Tailwind 3, TanStack Query 5, Zustand 5, React Router 6, react-leaflet 4,
                           Recharts 2, lucide-react. Không có test runner — kiểm tra bằng `npm run build`.
  nginx.conf + nginx/      cấu hình nginx trong image (gzip_static, cache API công khai, real-ip, proxy-headers, security-headers)
  scripts/compress.mjs     chạy sau `vite build`: nén sẵn dist/**/*.gz cho gzip_static
  vite.config.js           manualChunks dạng hàm: vendor (react, router, query, zustand, clsx) · map (leaflet) · charts;
                           plugin serviceWorker: src/sw.js → dist/sw.js (điền VERSION + PRECACHE)
  public/                  favicon, icon-192/512.png, manifest.webmanifest (PWA)
  src/sw.js                service worker cổng công khai (chỉ đăng ký ở bản build — main.jsx), README §9.4
  src/App.jsx              route + Guard(obj, act), mỗi trang `lazy()`; trang công khai /, /cong-khai, /dang-nhap…
  src/api/                 client.js (api(), useAreaParams) · hooks.js (useAreaQuery, useUnits…) · useSocket.js
  src/app/store.js         Zustand: theme, filter, focus, alertDraft, gps, auth, wsStatus, soundOn, sidebar, savedAt, toasts
  src/rbac/                permissions.js (khớp domain) · usePermission.js (usePermission, useCanAll, useAllowedCodes, Can)
  src/pages/               trang điều hành (DataImport = nhập dữ liệu chính thức); pages/public/ = cổng công khai (PublicPortal, ReportForm, TicketTracker,
                           ReservoirMonitor, LandslideMonitor, NetworkBanner = báo mất mạng / gợi ý bản nhẹ)
  src/components/          common/ (ui.jsx: KpiCard Modal Tabs Section Empty…, Turnstile, DispatchModal…) · layout/ ·
                           map/ (MapLayers, MapTools = nền bản đồ + công cụ, icons, leafletGlobal) · charts/ (chartTheme) ·
                           account/Mfa.jsx (cài đặt / quản lý xác thực 2 lớp — Login import tĩnh, UserMenu lazy)
  src/index.css            biến màu CSS sáng/tối; tailwind.config.js ánh xạ token
```

## 3. Lệnh

```bash
cp .env.example .env && docker compose up -d --build        # dev: DEMO_MODE=true, SIMULATOR=true
docker compose logs -f backend worker
docker compose exec backend python -m app.seed --reset      # nạp lại dữ liệu (bị chặn ở production)

# Lint + kiểm thử backend (trong container dev)
docker compose exec backend sh -c "ruff format app tests alembic && ruff check app tests alembic && pytest -q"
# …hoặc container dùng một lần với mã nguồn hiện tại (Git Bash trên Windows cần MSYS_NO_PATHCONV=1):
MSYS_NO_PATHCONV=1 docker run --rm -u 0 -v "$(pwd -W)/backend:/src" -w /src caobang-pctt-backend \
  sh -c "ruff format app tests alembic && ruff check app tests alembic && pytest -q -p no:cacheprovider"

cd frontend && npm run build                                # kiểm tra frontend
node tests/e2e/smoke.mjs && node tests/e2e/rbac-test.mjs    # kiểm thử API (README §12.1), cần DEMO_MODE=true
docker run --rm --network caobang-pctt_default -v "$PWD/tests/load:/load" grafana/k6 run /load/load.js   # tải (§12.2)
docker compose -f docker-compose.prod.yml --env-file .env.production config -q   # kiểm tra compose chạy thật
```

CI chạy `ruff format --check` — luôn format trước khi xong việc. Máy host Windows có thể không có Python: chạy công cụ
Python trong container.

## 4. Kiến trúc & vòng đời

- **Tiến trình** (`RUN_MODE`): `api` (gunicorn nhiều worker — **không** chạy tác vụ nền), `worker` (`python -m app.worker`,
  **đúng 1 bản**: simulator, runner nguồn kéo, cầu nối MQTT, phát hiện mất tín hiệu), `all` (máy nhỏ). Việc khởi động
  dùng chung ở `lifecycle.startup()`; việc chỉ được chạy 1 lần giữa nhiều tiến trình đặt trong `advisory_lock`.
- **Trạng thái dùng chung** giữa tiến trình → CSDL hoặc Redis (`app/infra/`), không để trong biến module (ngoại lệ:
  cache/fallback bộ nhớ khi không có Redis, chỉ dùng cho máy đơn).
- **Redis**: `pctt:events` (sự kiện WebSocket — mọi tiến trình publish, mọi tiến trình api relay), `pctt:casbin` (báo thay
  đổi policy để nạp lại), `pctt:dataver` (phiên bản dữ liệu, tăng ở `hub.publish` trừ sự kiện tần suất cao), `pctt:worker:heartbeat` (nhịp
  worker, `/health` đọc), khoá `rl:*` (giới hạn tần suất), `loginfail:*`, `cache:public:*` / `cache:view:*` (cache).
- **Chịu tải** (README §3, §12.2): cổng công khai = nginx cache 10 s + `cached("public:…")`; màn hình điều hành =
  `cached_view` theo phiên bản dữ liệu + gộp yêu cầu trùng; việc tốn CPU (ảnh) chạy `asyncio.to_thread`; frontend tách
  chunk theo trang, tệp tĩnh nén sẵn. Giữ các cơ chế này khi thêm tính năng.
- **Worker** ghi nhịp mỗi 30 s (`infra/heartbeat.py`): tệp `/tmp/pctt-worker-heartbeat` cho healthcheck container, Redis
  cho `/health` (báo `degraded` nếu mất nhịp > 2 phút).
- **Middleware** (ngoài → trong): `ProxyHeadersMiddleware` (tin `TRUSTED_PROXIES`) → `CORSMiddleware` → `RateLimitMiddleware`
  → router. Thêm middleware phải giữ ProxyHeaders ngoài cùng.
- **Chạy thật**: service `migrate` chạy `alembic upgrade head && python -m app.seed` một lần; backend/worker khởi động sau.
  Dev: backend tự migrate + seed trước gunicorn. db/redis/minio ở mạng `data` (internal).
- **nginx (frontend)**: cache 10 s mọi `GET /api/v1/public/*` (trả stale khi backend lỗi), ghi đè `X-Forwarded-For`,
  `gzip_static` cho tệp tĩnh + gzip động cho API, header bảo mật qua snippet (vì `add_header` trong `location` không kế thừa từ `server`).

## 5. Môi trường & cấu hình

- `APP_ENV` = `development` | `staging` | `production`. Khác development → `preflight.enforce()` chạy ở startup API/worker
  và đầu `seed.main()`: lỗi (khoá mặc định, mật khẩu dev, PIN yếu, PUBLIC_BASE_URL không https, TRUSTED_PROXIES `*`,
  Turnstile thiếu một khoá…) → dừng; cảnh báo → log `[cấu hình] …`. production còn cấm `DEMO_MODE` / `SIMULATOR`.
  Thêm cấu hình nhạy cảm → thêm kiểm tra vào `preflight.check()` + test trong `tests/test_production_hardening.py`.
- **Thêm biến môi trường**: `app/config.py` + `docker-compose.yml` + `docker-compose.prod.yml` + `.env.example` +
  `.env.production.example` + bảng README §5. Không khai báo biến chưa có code đọc. `docker-compose.prod.yml` không có
  giá trị mặc định yếu cho bí mật: dùng `${VAR:?thông báo}`.
- `DEMO_MODE=true`: seed nạp dữ liệu mẫu + tài khoản demo (chỉ khi CSDL trống). `false`: chỉ dữ liệu nền (địa giới,
  đường, mẫu tin, danh mục vật tư) + Superadmin. `SIMULATOR=true`: bộ mô phỏng sinh số đo, GPS, SOS, tiến độ phát tin.
- Tài khoản khi khởi động (`rbac/seed.ensure_user`): chỉ **tạo** khi chưa có và gán vai trò **ngay lúc tạo**; tài khoản
  đã có thì **không** đụng tới mật khẩu, trạng thái khoá, vai trò (kể cả khi đã bị gỡ hết vai trò). Seed demo ghi vai trò
  trực tiếp vào `casbin_rule`. Giữ nguyên nguyên tắc này.
- API key nguồn kéo: `OPEN_METEO_API_KEY`, `OPENWEATHER_API_KEY` → `runner.apply_env_keys()` ghi vào
  `integrations.data_sources.secret_enc` mỗi lần khởi động (.env là nguồn chính khi có đặt). Token nguồn đẩy và khoá
  thiết bị IoT chỉ quản lý ở giao diện.

## 6. Quy ước backend

**Chung**: ruff (line-length 110, rule E F I B UP), Python 3.12. Thông báo lỗi `HTTPException(status, "tiếng Việt")`.
`DBAPIError` được bắt toàn cục → 400 "Dữ liệu không hợp lệ" (VD UUID sai). Router khai báo trong `app/api/v1/<tên>.py`,
đăng ký trong vòng lặp `include_router` của `main.py` (prefix `/api/v1`).

**CSDL**
- SQL thuần qua `app/db.py`: `fetch_all`, `fetch_one`, `execute` (tự commit), `transaction()` cho nhiều lệnh; truyền
  `conn=` để chạy trong transaction. Truy vấn PostGIS viết trực tiếp; toạ độ SRID 4326, `ST_MakePoint(lon, lat)`.
- **Không viết `:param::type`** trong `text()` — SQLAlchemy không nhận bind; dùng `CAST(:param AS type)`. Tham số có thể
  `None` trong biểu thức `IS NULL` / `COALESCE` cũng phải `CAST` để Postgres suy ra kiểu.
- Tên bảng luôn kèm schema: `spatial_admin`, `resources`, `operations`, `iot_telemetry` (hypertable `sensor_readings`),
  `communications`, `integrations`, `community`; Casbin ở `public.casbin_rule`.
- **Migration**: không sửa migration cũ. Thêm `alembic/sql/000N_<tên>.sql` + `alembic/versions/000N_<tên>.py` (chép mẫu
  `0004`: `revision`, `down_revision`, `upgrade()` đọc tệp SQL, viết `downgrade()`). Seed / dữ liệu mẫu phải cập nhật theo.

**Bộ lọc địa phương**: route nhận `codes: list[str] = Depends(parse_codes)` (hoặc `area_scope(...)` khi cần RBAC), dùng
`area_clause("t.location", codes)` cho cột hình học, `unit_clause("t.admin_unit_id", codes)` cho khoá ngoại; truyền
`{"codes": codes}` vào tham số SQL.

**Phân quyền (bắt buộc cho mọi endpoint nội bộ)** — chi tiết README §8
- Casbin `rbac_with_domains`, domain phân cấp `*` → `CUM/*` → `CUM/MA_XA` (cột `administrative_units.rbac_domain`).
- `require_permission(obj, act, scope_loader)`: một tài nguyên cụ thể (loader trong `scope_loaders.py` đọc xã của
  tài nguyên: `sos_ticket`, `warehouse`, `vehicle`, `broadcast_domains`, `citizen_report`).
- `area_scope(obj, act)`: danh sách lọc theo vùng ∩ phạm vi được phép → mã xã cho `area_clause`.
- `require_any(obj, act)` rồi kiểm tra chi tiết bằng `can(user, obj, act, domain)` / `can_all(...)` trong thân hàm.
- **Không** kiểm tra tên vai trò trong route. Quyền mới → `ALL_PERMISSIONS` + vai trò trong `SYSTEM_ROLES`
  (`rbac/permissions.py`) + bảng README §8. API trả `admin_code` cho đối tượng frontend cần gate theo xã.
- Đổi quyền / mật khẩu / khoá tài khoản → `bump_token_version()` (JWT cũ bị từ chối).

**Realtime & nhật ký**
- `hub.publish(event, data, scope=None, code=None)`: sự kiện gắn xã truyền `scope` (`"sos"`, `"monitoring"`, `"report"`)
  và `code` = mã xã để chỉ người có quyền ở xã đó nhận (VD `hub.publish("sos.updated", ticket, "sos", ticket["admin_code"])`).
- Sự kiện hiện có: `reading.new`, `sos.new`, `sos.updated`, `dispatch.updated`, `gps.update`, `hazard.new`,
  `broadcast.updated`, `inventory.changed`, `call.new`, `log.new`, `report.new`, `report.updated`, `ingest.log`,
  `source.updated`. Sự kiện mới phải thêm nhánh xử lý trong `frontend/src/api/useSocket.js`.
- Nhật ký sự kiện điều hành: `services/events.log_event(message, category, severity, admin_unit_id|lat/lon)`.
  Nhật ký pháp lý thao tác người dùng: `auth.audit(user, action, entity, entity_id, details)` — mọi thao tác ghi đều gọi.

**Tích hợp dữ liệu** — chi tiết README §6
- Nguồn kéo: `integrations/adapters/<tên>.py` có `async run(source, api_key) -> dict`; đăng ký trong `runner.ADAPTERS` và
  `DEFAULT_SOURCES`; hàm phân tích dữ liệu viết thuần (không I/O) để unit test.
- Nguồn đẩy: mọi số đo đi qua `ingest.ingest_readings()` (kiểm tra → ghi → WebSocket → `simulator.check_triggers`).
- Trạm có `source` = `simulator` | `iot` | `external`; bộ mô phỏng chỉ sinh cho `simulator`.
- Bí mật: `crypto.encrypt/decrypt` (Fernet từ `SECRET_KEY`); khoá thiết bị băm bằng `crypto.hash_key`. Không log URL chứa
  API key (log `httpx` đã hạ xuống WARNING).

**Cổng công khai** (`api/v1/public.py`, không cần đăng nhập) — chi tiết README §9
- **Chỉ trả dữ liệu an toàn công khai**: không vị trí lực lượng / kho / phương tiện, không nội dung / toạ độ / SĐT phiếu
  SOS, không danh bạ cán bộ, không họ tên / SĐT / IP người phản ánh, không phản ánh chưa duyệt, không cảnh báo chưa phát.
- Bọc truy vấn bằng `infra.cache.cached("public:<khoá>", ttl, build)`; dữ liệu liên quan thay đổi → `invalidate("public:")`.
  Nhớ nginx cache thêm 10 s nên dữ liệu công khai có thể trễ tới ~TTL + 10 s.
- Thêm trường mới vào phản hồi công khai → cập nhật danh sách trường cấm trong `tests/e2e/public-test.mjs`.
- Endpoint công khai **tạo dữ liệu** (webhook…) phải có khoá: mẫu `sos.require_intake_key` (`hmac.compare_digest`).
- Bản nhẹ `/ban-nhe` (`services/lite.py`, `GET /public/lite`): chỉ HTML + CSS nội tuyến, không JS / ảnh / tệp ngoài;
  mọi giá trị qua `html.escape`; mỗi danh sách có trần `MAX_*` để luôn < `MAX_BYTES` (50 KB) — thêm mục mới thì thêm
  trần và cập nhật `test_lite.test_worst_case_stays_under_limit`. Tham số `xa` lạ → trang toàn tỉnh (không tạo khoá cache).
  Phê duyệt cảnh báo gọi `invalidate("public:")` để bản nhẹ / cổng hiện ngay.

**Giới hạn tần suất & IP**
- Quy tắc ở `RULES` trong `infra/ratelimit.py` (khớp tiền tố, quy tắc cụ thể đặt trước). Nhà mạng dùng chung IP (CGNAT) →
  không siết thao tác của người dân theo IP; dùng `await ratelimit.limit(tên, khoá, số_lần, giây)` theo SĐT / khoá phụ.
  API đã đăng nhập đếm theo phiên (`per_session=True`).
- IP người dùng: luôn `request.client.host`. **Không** dùng `--forwarded-allow-ips=*`, không tự đọc `X-Forwarded-For`.

**Xác thực & dữ liệu cá nhân**
- Mật khẩu mới phải qua `auth.password_problem`; PIN ký duyệt băm như mật khẩu. Đổi / đặt lại mật khẩu tăng `token_version`.
- Xác thực 2 lớp (`app/mfa.py`, `api/v1/mfa.py`, README §11.1): `/auth/login` với tài khoản đã bật / vai trò bắt buộc trả
  `{"mfa": "verify"|"setup", "challenge"}` thay cho token — client mới phải xử lý bước 2. Phiếu mang `aud=pctt-mfa`, chỉ
  giải mã qua `mfa.challenge_user` (không bao giờ nhận làm token phiên). Sai mã đếm vào `auth.lock_key` như sai mật khẩu;
  bộ đếm chỉ xoá trong `complete_login`. Bật / tắt / đặt lại 2 lớp tăng `token_version`. `user_from_token` từ chối người
  có vai trò trong `TOTP_REQUIRED_ROLES` mà chưa bật. Kiểm mã luôn qua `mfa.check_code` (cập nhật có điều kiện
  `totp_last_step` / gạch mã khôi phục — chống dùng lại, chống gửi đồng thời). Tài khoản demo / e2e không bị bắt buộc vì
  `TOTP_REQUIRED_ROLES` trống ở dev.
- Ảnh: luôn qua `services/reports.process_image` (xoá EXIF, chống bomb, JPEG) rồi `infra.storage.put`; ảnh chưa duyệt chỉ
  phát qua `signed_photo_url`.
- Log không ghi query string, token, SĐT, toạ độ người dân (`main.DropQueryString` áp cho `uvicorn.access` và `uvicorn.error`).
  Gửi dữ liệu ra dịch vụ ngoài phải che thông tin cá nhân trước (mẫu `sos_nlp.redact_for_llm`).

**Hiệu năng & chịu tải**
- Truy vấn tổng hợp cho màn hình điều hành (dashboard, bản đồ, tổng hợp nguồn lực) → `return await cached_view(tên,
  params, lambda: _build(...))` (mẫu `dashboard.kpis`, `map_layers.layers`). `params` = MỌI thứ quyết định kết quả, mã xã
  phải là danh sách ĐÃ giao với phạm vi quyền (từ `area_scope` / `allowed_codes`) — không đưa dữ liệu riêng của từng người
  (tên, id người xem) vào kết quả được cache. `cached_view` trả `Response` (chuỗi JSON đã lưu); hàm `_build` trả dict/list.
- Dữ liệu cần tươi tuyệt đối (danh sách SOS, nhật ký) không cache. Thao tác ghi phải `hub.publish` để `cached_view` hết
  hiệu lực ngay; thao tác ghi không phát sự kiện chỉ được làm mới sau tối đa `VIEW_TTL` = 15 s. Sự kiện tần suất cao
  (`cache.HIGH_FREQUENCY_EVENTS`: số đo, GPS, nhật ký) KHÔNG tăng phiên bản — cached_view tự làm mới theo khung 5 giây;
  sự kiện mới làm thay đổi dữ liệu tổng hợp mà không thuộc nhóm này thì mặc định đã tăng phiên bản.
- Cache mã hoá JSON bằng `jsonable_encoder` (giống phản hồi thường: Decimal → số, datetime → ISO) — không dùng
  `json.dumps(default=str)` cho dữ liệu trả API.
- Việc tốn CPU (xử lý ảnh, tính toán lớn) → `await asyncio.to_thread(...)`; không chạy đồng bộ trong hàm async (chặn mọi
  yêu cầu khác của tiến trình). Gọi thư viện đồng bộ (MinIO SDK…) cũng qua `asyncio.to_thread` (mẫu `infra/storage.py`).
- Truy vấn PostGIS trên ranh giới lớn: lọc bằng hộp bao / `ST_Intersects` (dùng index) trước, `::geography` sau
  (mẫu `area.IN_PROVINCE_SQL`, `public._locate`).
- Pool CSDL mặc định 5 + 5 mỗi tiến trình; tổng kết nối phải < `max_connections` (README §10.2).

**Seed & mô phỏng**: dữ liệu hằng ở `seed_data.py`, logic ở `seed.py` (`seed_admin`, `seed_roads` luôn chạy; `seed_telemetry`,
`seed_resources`, `seed_comms`, `seed_operations` chỉ khi `DEMO_MODE`). Kịch bản khí tượng mô phỏng: `services/scenario.py`
(chu kỳ 96 giờ). Seed gán lại `admin_unit_id` theo vị trí thực (`reconcile_admin_units`) — phạm vi RBAC dựa trên ranh giới xã.

## 7. Quy ước frontend

- **Gọi API**: `api(path, { method, body, params })` trong `src/api/client.js` — tự thêm tiền tố `/api/v1`, Bearer token từ
  store, lỗi → `ApiError(status, detail)`, 401 → đăng xuất. Upload multipart (phản ánh) dùng `fetch` trực tiếp.
- **Truy vấn theo vùng lọc**: `useAreaQuery(key, path, extra)`; `key` phải trùng khoá mà `useSocket.js` invalidate khi có sự
  kiện (VD `sos`, `kpis`, `map-layers`, `stations`, `rainfall`, `warehouses`, `reports`, `int-sources`…) để tự làm mới.
- **Route**: trang điều hành trong `Shell` bọc `<Guard obj act>`; trang công khai ngoài `Shell`. Trang công khai
  (`pages/public/`) chỉ gọi `/public/*`. Trang mới khai báo `lazy(() => import(...))` trong `App.jsx` (đã có `Suspense`) —
  không import tĩnh trang vào `App.jsx` (kéo cả trang vào gói tải lần đầu của người dân).
- **Service worker** (`src/sw.js`): chỉ lưu `GET` cùng origin, không `Authorization`, không `Range`; API công khai được
  lưu phải nằm trong `PUBLIC_API` — không thêm endpoint có dữ liệu cá nhân / vị trí (`locate`, `track`, `route`, ảnh).
  Trong `.then` của `fetch` phải `res.clone()` **đồng bộ** trước mọi `await` (trang đọc body trước → clone lỗi, bị nuốt
  lặng lẽ). Bản lưu mang `X-PCTT-Saved-At` → `api()` đặt `store.savedAt` → `NetworkBanner`. Thử thật: build image, mở
  cổng 2 lần, dừng container frontend, tải lại (README §9.4); máy dev Vite không đăng ký service worker.
- **Kích thước gói**: thư viện nặng chỉ dùng khi bấm (xuất PDF/Excel: `utils/exportPdf.js`, `exportExcel.js`) phải
  `await import(...)` động. Không thêm thư viện vào `manualChunks` dạng object (kéo theo thư viện phụ thuộc dùng chung
  vào chunk đó); dùng dạng hàm trong `vite.config.js`. Sau khi build, kiểm tra `dist/index.html` không preload chunk nặng.
  Cổng công khai hiện tải ~220 KB (gzip) lần đầu — giữ dưới mức này.
- **Phân quyền UI**: `<Can I="dispatch" a="create" scope={x.admin_code}>`, `usePermission(obj, act, scope)`,
  `useCanAll`, `useAllowedCodes(obj, act)` (null = toàn tỉnh). UI chỉ ẩn/hiện — backend mới chặn thật.
- **Giao diện**: màu qua biến CSS (`src/index.css`) + token Tailwind (`bg-panel`, `bg-panel2`, `text-ink-2`, `text-muted`,
  `border-line`, `bg-danger`, `text-good`, `text-accent`…); màu trạng thái cố định; hỗ trợ cả sáng và tối. Component
  dùng chung trong `components/common/ui.jsx` (KpiCard, Modal, Tabs, Section, Empty, Progress, StatusDot). Icon `lucide-react`.
- **Biểu đồ** Recharts lấy màu từ `useChartTheme()` (+ `axisProps`, `ChartTooltip`); không dùng 2 trục Y (tách biểu đồ).
- **Bản đồ**: `leaflet-draw` và `protomaps-leaflet` cần `L` toàn cục → `components/map/leafletGlobal.js` import trước.
  Nền bản đồ chỉ qua `<BaseLayer>` trong `components/map/MapTools.jsx`: nền có `local` (Địa lý, Ban đêm) vẽ từ
  `/tiles/caobang.pmtiles` khi máy chủ có tệp (đọc phần đầu tệp lấy vùng phủ); zoom < 7 hoặc khung nhìn ra ngoài vùng phủ
  → thêm nền Google / CARTO bên dưới (Google thể hiện đúng Hoàng Sa, Trường Sa — không hạ `LOCAL_MIN_ZOOM` xuống ≤ 6).
  `pmtiles` và `protomaps-leaflet` chỉ `import()` động — không import tĩnh (giữ gói tải đầu cổng công khai ~220 KB).
  `BaseLayer` đặt `map.setMaxZoom` trong layout effect: `MarkerClusterGroup` lỗi "Map has no maxZoom" nếu chưa có.
  Nền ngoài chưa có giấy phép (README §6.9); đổi nguồn phải giữ ghi công và thể hiện đúng chủ quyền.
- **Chống bot**: `components/common/Turnstile.jsx` (khoá site lấy từ `GET /public/config`; token dùng 1 lần — đổi `key` để
  lấy token mới).
- Trạng thái toàn cục (Zustand `app/store.js`): chỉ thứ dùng chung nhiều trang (auth, bộ lọc vùng, theme, toasts…);
  dữ liệu máy chủ để trong TanStack Query. `localStorage` luôn bọc try/catch (`safeGet/safeSet`).

## 8. Bảo mật — kiểm tra trước khi xong việc

- [ ] Endpoint nội bộ mới có dependency RBAC; endpoint công khai không lộ trường cấm; endpoint công khai tạo dữ liệu có khoá.
- [ ] Không bí mật / mật khẩu / key thật trong mã, log, tệp mẫu; không giá trị mặc định yếu trong `docker-compose.prod.yml`.
- [ ] Không in token, SĐT, toạ độ người dân vào log; POST cho dữ liệu nhạy cảm (không đặt trên URL).
- [ ] SQL chỉ dùng tham số bind (không f-string giá trị người dùng; f-string chỉ cho mệnh đề tĩnh như `area_clause`).
- [ ] Thao tác ghi có `audit(...)`; thao tác đổi quyền tăng `token_version`.
- [ ] Không làm yếu `preflight`, giới hạn tần suất, `TRUSTED_PROXIES`, xử lý ảnh, Maker–Checker (người soạn không tự duyệt,
      người duyệt cần quyền trên mọi xã nhận tin, bắt buộc PIN).

## 9. Kiểm thử

- `backend/tests/` (pytest, `asyncio_mode=auto`, không cần CSDL): `test_services.py` (NLP, định tuyến, khớp lực lượng, ngưỡng),
  `test_rbac.py`, `test_integrations.py` (phân vị tổ hợp, kiểm tra số đo, LoRaWAN/MQTT, key .env),
  `test_reports_infra.py` (ảnh, luật giới hạn, mật khẩu, cache, tra cứu), `test_production_hardening.py` (preflight,
  IP sau proxy, giới hạn theo SĐT/phiên, khoá intake, che SĐT, lọc log), `test_cache.py` (gộp yêu cầu trùng, cached_view).
- Test phải **độc lập môi trường**: `Settings.model_construct(**kw)` thay vì đọc env; `monkeypatch.setattr(cache, "get_redis",
  lambda: None)` khi kiểm cache bộ nhớ. **Không chạy pytest trong container production** (ghi vào Redis/CSDL thật).
- `tests/e2e/*.mjs` kiểm thử API end-to-end, cần stack dev với `DEMO_MODE=true` (dùng tài khoản demo); tham số 1 = URL backend.
  Chạy lại liên tiếp → xoá khoá `rl:*` trong Redis. `iot-test.mjs` gọi `docker exec caobang-pctt-mqtt` (tên container cố định).
- CI (`ci.yml`): ruff + pytest → build frontend → kiểm tra `docker-compose.prod.yml` → stack Docker Compose
  (`DEMO_MODE=true`, `SIMULATOR=true`, `TOTP_REQUIRED_ROLES=kiem_thu_2fa`) + 10 script API (`lite-test.mjs` chạy qua
  nginx: tham số = URL frontend :8080; `totp-test.mjs` tự tính mã TOTP, cần biến trên để thử luồng bắt buộc).
  Thay đổi hành vi nghiệp vụ / quyền → cập nhật script tương ứng.
- `tests/load/load.js` (k6, README §12.2): thay đổi đường đi của cổng công khai hoặc dashboard (thêm API, bỏ cache…) →
  chạy lại, so với bảng kết quả trong README; cập nhật bảng khi số liệu đổi đáng kể.

## 10. Công thức cho việc thường gặp

- **Endpoint nội bộ mới**: router trong `api/v1/`, dependency RBAC phù hợp (§6), SQL qua `app/db.py`, lọc vùng bằng
  `area_clause`, `audit()` cho thao tác ghi, `hub.publish` nếu màn hình khác cần làm mới, `cached_view` nếu là truy vấn
  tổng hợp được nhiều màn hình gọi; frontend dùng `useAreaQuery` với khoá trùng sự kiện; thêm kịch bản vào tests/e2e.
- **Trang frontend mới**: tệp trong `pages/`, `lazy()` + `<Route>` trong `App.jsx` bọc `<Guard>`, mục menu trong
  `components/layout/Sidebar.jsx`; build rồi kiểm tra gói tải lần đầu của cổng công khai không tăng.
- **Quyền mới**: `permissions.py` (`ALL_PERMISSIONS`, vai trò) → README §8 → `<Can>` ở frontend → kiểm thử `rbac-test.mjs`.
- **Dữ liệu công khai mới**: endpoint trong `public.py` bọc `cached`, chỉ trường an toàn → cập nhật `public-test.mjs` → README §9.1.
- **Bảng / cột mới**: migration mới (§6) → seed nếu cần dữ liệu nền → README §2.2 nếu là dữ liệu phải nhập từ nguồn chính thức.
- **Biến cấu hình mới**: §5 (6 nơi) → `preflight` nếu nhạy cảm.
- **Nguồn dữ liệu kéo mới**: adapter + `ADAPTERS` + `DEFAULT_SOURCES` + (tuỳ chọn) key trong `env_source_keys()` và
  config → test hàm phân tích → README §6.1.
- **Kênh cảnh báo thật** (SMS, Cell Broadcast, Zalo…): bộ gửi trong `services/broadcast.py` (hoặc `services/channels/`),
  trạng thái giao nhận lấy từ nhà cung cấp thay `advance_delivery`, bí mật qua config + preflight, cập nhật README §2.1 / §6.
- **Loại dữ liệu nhập mới** (README §2.4): thêm `Dataset` vào `data_import/specs.py` (cột CSDL, kiểu, ràng buộc, khoá,
  `refs`, `insert_only`, `replaceable` chỉ khi bảng không bị tham chiếu); kiểm tra riêng → `engine._row_checks`; bảng
  chưa có mã ổn định → migration thêm `code` + unique index. `test_data_import` tự nhập thử dòng mẫu của mọi loại;
  thêm tên vào `ORDER` trong `tests/e2e/import-test.mjs`; cập nhật bảng README §2.4. Không nhập dữ liệu chính thức
  bằng SQL tay. Bảng dùng chung nhiều loại bản ghi (VD `administrative_units`: tỉnh / xã / xóm): `fixed` cho cột phân
  loại, `conflict_where` để upsert không ghi đè loại khác, `Ref(where=...)` giới hạn mã tham chiếu, `replace_scope` +
  `replace_within` để "thay toàn bộ" chỉ xoá trong phạm vi tệp (mẫu: loại `xom`).
- **Xóm / địa danh cho bộ tách tin SOS** (`sos_nlp.load_gazetteer`): xã + xóm (cấp thôn, `unit_code` = mã xã cha) +
  `place_names` khác. Cache theo `GAZETTEER_VERSION_KEY` (Redis) + TTL 5 phút — dữ liệu địa danh đổi ngoài công cụ
  nhập thì gọi `sos_nlp.invalidate_gazetteer()`. Tên xóm trùng giữa các xã: chỉ gán xóm khi tin nhắc cả xã.
- **Chức năng mô phỏng → thật**: tắt nhánh mô phỏng tương ứng khi có dữ liệu thật (mẫu: trạm `source='iot'`), cập nhật README §2.

## 11. Bẫy đã biết

- `:param::type` trong `text()` không bind — dùng `CAST`.
- `docker-compose.yml` đặt `container_name` cố định → không chạy được 2 stack dev song song (dùng `-p <tên>` + tệp
  override `container_name: !reset null` nếu cần stack thử nghiệm riêng); `docker-compose.prod.yml` đặt tên project riêng.
- `DEMO_MODE` chỉ có tác dụng khi CSDL trống; đổi giữa chừng cần `python -m app.seed --reset` (xoá dữ liệu nghiệp vụ).
- gunicorn `--forwarded-allow-ips` không nhận CIDR (uvicorn thì nhận) → xử lý IP ở `ProxyHeadersMiddleware` trong app;
  không đặt biến môi trường `FORWARDED_ALLOW_IPS` (gunicorn đọc và kiểm tra nó).
- nginx: `add_header` trong `location` xoá header kế thừa từ `server` → luôn `include` lại `security-headers.conf`.
- Image backend chạy user `app` (không root): ghi tệp chỉ trong `/app/storage` hoặc `/tmp`; `docker run` với mã nguồn
  mount cần `-u 0` nếu công cụ cần ghi.
- Tệp `.sh`, `.conf`, compose dùng LF (`.gitattributes`); script có CRLF sẽ lỗi trong container.
- Git Bash trên Windows tự đổi đường dẫn `/x` → đặt `MSYS_NO_PATHCONV=1` khi `docker run -w /src` / `-v`.
- Mã phiếu `SOS-xxxx` / `PA-xxxx` tăng dần nên đoán được — tra cứu công khai luôn yêu cầu mã + SĐT, trả lỗi giống nhau.
- Nền ngoài trong `MapTools.jsx` (Google / CARTO: zoom toàn quốc, Vệ tinh, Địa hình) **chưa có giấy phép** (README §6.9);
  không thêm nguồn tile mới khi chưa có giấy phép / key. Máy dev không có `data/tiles/caobang.pmtiles` → bản đồ dùng nền
  ngoài (Vite trả index.html cho `/tiles/…`, đọc phần đầu tệp lỗi → coi như không có); thử nền tự lưu trữ trên stack
  docker (`sh deploy/fetch-basemap.sh` trước).
- `location /tiles/` trong nginx phải giữ `gzip off` và `try_files $uri =404` — nén động làm hỏng HTTP Range, còn rơi về
  index.html thì thư viện pmtiles đọc sai định dạng.
- Vite cảnh báo "is dynamically imported … but also statically imported" → `lazy()` vô tác dụng với module đó; import tĩnh
  thống nhất hoặc bỏ import tĩnh ở nơi khác.
- Pool CSDL lớn × nhiều tiến trình → "too many clients" dưới tải (đã gặp khi kiểm thử tải với 6 tiến trình × 20).
- Kiểm thử tải trên máy dev: k6, CSDL, nginx, backend dùng chung CPU → số liệu tuyệt đối thấp hơn máy chủ thật; so sánh
  trước/sau trên cùng máy, số liệu chấp nhận go-live đo trên máy chủ thật.
