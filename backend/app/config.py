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

    # Hook LLM tuỳ chọn để bóc tách tin nhắn SOS (mặc định dùng bộ luật)
    llm_api_url: str = ""
    llm_api_key: str = ""
    llm_model: str = ""


settings = Settings()
