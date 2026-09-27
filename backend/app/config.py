from pydantic_settings import BaseSettings, SettingsConfigDict

# Giá trị mặc định chỉ dùng cho máy phát triển — app/preflight.py chặn khởi động nếu còn dùng ở staging/production
DEV_JWT_SECRET = "doi-khoa-bi-mat-nay-khi-trien-khai-that"
DEV_DB_PASSWORD = "pctt_dev_password"
DEV_MINIO_PASSWORD = "pctt_minio_dev_password"
DEV_SUPERADMIN_PASSWORD = "admin123"
DEV_SUPERADMIN_PIN = "0000"
PRIVATE_NETWORKS = "127.0.0.1,::1,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # development | staging | production — staging/production bắt buộc qua kiểm tra cấu hình (app/preflight.py)
    app_env: str = "development"

    database_url: str = f"postgresql+psycopg://pctt:{DEV_DB_PASSWORD}@localhost:5432/caobang_pctt"
    # Mỗi tiến trình mở tối đa pool_size + max_overflow kết nối → tổng ≈ (API_WORKERS × số bản backend + 1) × 10.
    # Backend async giữ kết nối rất ngắn nên 5 + 5 là đủ; tăng quá mức → Postgres báo "too many clients" khi tăng tải
    db_pool_size: int = 5
    db_max_overflow: int = 5
    jwt_secret: str = DEV_JWT_SECRET
    jwt_expire_hours: int = 12
    cors_origins: str = "http://localhost:5173,http://localhost:8080"
    # Vai trò BẮT BUỘC xác thực 2 lớp (TOTP), cách nhau dấu phẩy — VD super_admin,truong_ban,admin_tinh,chi_huy_cum.
    # Trống = không bắt buộc (ai cũng tự bật được). Người có vai trò này chưa bật → lần đăng nhập sau phải cài đặt.
    totp_required_roles: str = ""
    totp_issuer: str = (
        "BCH PCTT Cao Bằng"  # tên hiện trong ứng dụng xác thực (Google / Microsoft Authenticator)
    )

    # Chế độ trình diễn: seed nạp dữ liệu MẪU (trạm, lực lượng, kho, điểm sơ tán, SOS…) + tài khoản demo.
    # Tắt: chỉ nạp dữ liệu nền (địa giới, đường, mẫu tin). BẮT BUỘC tắt khi triển khai thật.
    demo_mode: bool = False

    # Bộ mô phỏng dữ liệu thời gian thực (cảm biến, GPS, SOS, tiến độ phát tin) — TẮT khi triển khai thật
    simulator: bool = False
    simulator_tick_seconds: float = 4.0
    simulator_sos_every_ticks: int = 45  # ~3 phút một tin SOS mô phỏng

    # Quản trị viên tổng (Superadmin) — chỉ dùng để TẠO tài khoản lần đầu; sau đó đổi mật khẩu/PIN trong giao diện
    superadmin_username: str = "admin"
    superadmin_full_name: str = "Quản trị hệ thống"
    superadmin_email: str = "admin@caobang-pctt.local"
    superadmin_password: str = DEV_SUPERADMIN_PASSWORD
    superadmin_pin: str = DEV_SUPERADMIN_PIN
    superadmin_role: str = "super_admin"
    superadmin_domain: str = "*"

    # Khoá mã hoá bí mật nguồn dữ liệu (API key đối tác); trống = dẫn xuất từ JWT_SECRET (chỉ cho phép ở development)
    secret_key: str = ""

    # Tích hợp dữ liệu ngoài. API key nguồn kéo: đặt ở đây (áp vào CSDL mỗi lần khởi động, .env là nguồn chính)
    # hoặc để trống và nhập ở trang "Nguồn dữ liệu & IoT". Token nguồn IoT, khoá thiết bị: chỉ quản lý ở giao diện.
    open_meteo_enabled: bool = True  # dự báo tổ hợp ECMWF/GFS (cần Internet)
    open_meteo_api_key: str = (
        ""  # gói thương mại (customer-*.open-meteo.com); trống = gói miễn phí phi thương mại
    )
    openweather_api_key: str = ""  # One Call 3.0; đặt key → tự bật nguồn OpenWeather
    mqtt_url: str = ""  # VD mqtt://user:pass@mqtt:1883 — trống = tắt cầu nối MQTT
    mqtt_topic: str = "caobang/pctt/+/readings"
    # Khoá cho cổng tiếp nhận SOS tự động POST /api/v1/sos/intake (webhook Zalo OA / app) — trống = tắt cổng
    intake_api_key: str = ""

    # Hạ tầng chạy thật
    redis_url: str = ""  # VD redis://redis:6379/0 — trống = chạy 1 tiến trình, dùng bộ nhớ trong
    run_mode: str = "all"  # all | api | worker — tách tác vụ nền (mô phỏng, đồng bộ, MQTT) khỏi API
    public_base_url: str = "http://localhost:8080"  # dùng cho link đặt lại mật khẩu, trang chia sẻ
    rate_limit_enabled: bool = True
    # Reverse proxy được tin (IP/CIDR): chỉ khi kết nối đến từ đây mới lấy IP người dùng trong X-Forwarded-For.
    # nginx (frontend) ghi đè X-Forwarded-For bằng đúng 1 IP → không giả mạo được để vượt giới hạn tần suất.
    trusted_proxies: str = PRIVATE_NETWORKS
    # Swagger /docs, /redoc, /openapi.json — trống = bật ở development, tắt ở staging/production
    api_docs: bool | None = None

    # Lưu trữ ảnh (MinIO / S3)
    minio_endpoint: str = ""  # VD minio:9000 — trống = lưu ảnh vào thư mục cục bộ
    minio_access_key: str = ""
    minio_secret_key: str = ""
    minio_bucket: str = "caobang-pctt"
    minio_secure: bool = False
    local_storage_dir: str = "/app/storage"

    # Email (quên mật khẩu)
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = "BCH PCTT Cao Bang <no-reply@caobang-pctt.local>"
    smtp_starttls: bool = True

    # Chống spam form công khai (Cloudflare Turnstile) — cần CẢ HAI khoá; trống = chỉ giới hạn tần suất + honeypot
    turnstile_site_key: str = ""  # khoá công khai, frontend lấy qua GET /api/v1/public/config
    turnstile_secret: str = ""

    # Hook LLM tuỳ chọn để bóc tách tin nhắn SOS (mặc định dùng bộ luật). Số điện thoại được che trước khi gửi.
    llm_api_url: str = ""
    llm_api_key: str = ""
    llm_model: str = ""

    @property
    def is_dev(self) -> bool:
        return self.app_env == "development"

    @property
    def docs_enabled(self) -> bool:
        return self.is_dev if self.api_docs is None else self.api_docs

    @property
    def totp_required_role_set(self) -> frozenset[str]:
        return frozenset(r.strip() for r in self.totp_required_roles.split(",") if r.strip())


settings = Settings()
