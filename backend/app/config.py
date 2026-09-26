from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://pctt:pctt_dev_password@localhost:5432/caobang_pctt"
    jwt_secret: str = "doi-khoa-bi-mat-nay-khi-trien-khai-that"
    jwt_expire_hours: int = 12
    cors_origins: str = "http://localhost:5173,http://localhost:8080"

    # Chế độ demo: lộ danh sách tài khoản mẫu cho nút đăng nhập nhanh — TẮT khi triển khai thật
    demo_mode: bool = True

    # Bộ mô phỏng dữ liệu thời gian thực (cảm biến, GPS, SOS)
    simulator: bool = True
    simulator_tick_seconds: float = 4.0
    simulator_sos_every_ticks: int = 45  # ~3 phút một tin SOS mô phỏng

    # Khoá mã hoá bí mật nguồn dữ liệu (API key đối tác); trống = dẫn xuất từ JWT_SECRET
    secret_key: str = ""

    # Tích hợp dữ liệu ngoài
    open_meteo_enabled: bool = True  # dự báo tổ hợp ECMWF/GFS (cần Internet)
    mqtt_url: str = ""  # VD mqtt://mqtt:1883 — trống = tắt cầu nối MQTT
    mqtt_topic: str = "caobang/pctt/+/readings"

    # Hạ tầng chạy thật
    redis_url: str = ""  # VD redis://redis:6379/0 — trống = chạy 1 tiến trình, dùng bộ nhớ trong
    run_mode: str = "all"  # all | api | worker — tách tác vụ nền (mô phỏng, đồng bộ, MQTT) khỏi API
    public_base_url: str = "http://localhost:8080"  # dùng cho link đặt lại mật khẩu, trang chia sẻ
    rate_limit_enabled: bool = True

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

    # Chống spam form công khai (Cloudflare Turnstile) — trống = chỉ giới hạn tần suất + honeypot
    turnstile_secret: str = ""

    # Hook LLM tuỳ chọn để bóc tách tin nhắn SOS (mặc định dùng bộ luật)
    llm_api_url: str = ""
    llm_api_key: str = ""
    llm_model: str = ""


settings = Settings()
