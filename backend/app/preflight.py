"""Kiểm tra cấu hình trước khi khởi động (API, worker, seed).

staging / production: cấu hình nguy hiểm (khoá bí mật mặc định, mật khẩu dev, tắt giới hạn tần suất…) → dừng
khởi động với danh sách lỗi rõ ràng, thay vì lặng lẽ chạy với giá trị yếu. production còn cấm dữ liệu mẫu và
bộ mô phỏng. development: bỏ qua.
"""

from __future__ import annotations

import logging
from urllib.parse import urlparse

from app.auth import password_problem
from app.config import (
    DEV_DB_PASSWORD,
    DEV_JWT_SECRET,
    DEV_MINIO_PASSWORD,
    DEV_SUPERADMIN_PASSWORD,
    DEV_SUPERADMIN_PIN,
    Settings,
    settings,
)

log = logging.getLogger(__name__)

APP_ENVS = ("development", "staging", "production")
MIN_SECRET_LEN = 32
MIN_SUPERADMIN_PASSWORD_LEN = 12


def weak_pin(pin: str) -> bool:
    """PIN phê duyệt cảnh báo: ≥ 6 chữ số, không lặp một chữ số, không dãy tăng/giảm liên tiếp."""
    if not pin.isdigit() or len(pin) < 6 or len(set(pin)) == 1:
        return True
    steps = {int(b) - int(a) for a, b in zip(pin, pin[1:], strict=False)}
    return steps in ({1}, {-1})


def check(s: Settings) -> tuple[list[str], list[str]]:
    """Trả về (lỗi, cảnh báo). Lỗi chặn khởi động ở staging/production."""
    errors: list[str] = []
    warnings: list[str] = []
    if s.app_env not in APP_ENVS:
        return [f"APP_ENV phải là một trong {', '.join(APP_ENVS)} (đang là {s.app_env!r})"], []
    if s.is_dev:
        return [], []

    # Khoá bí mật
    if s.jwt_secret == DEV_JWT_SECRET or len(s.jwt_secret) < MIN_SECRET_LEN:
        errors.append(f"JWT_SECRET phải là chuỗi ngẫu nhiên ≥ {MIN_SECRET_LEN} ký tự (openssl rand -hex 32)")
    if len(s.secret_key) < MIN_SECRET_LEN:
        errors.append(
            f"SECRET_KEY phải đặt riêng, ngẫu nhiên ≥ {MIN_SECRET_LEN} ký tự — khoá này mã hoá API key đối tác, "
            "không được dẫn xuất từ JWT_SECRET"
        )
    elif s.secret_key == s.jwt_secret:
        errors.append("SECRET_KEY phải khác JWT_SECRET")

    # Mật khẩu hạ tầng
    if DEV_DB_PASSWORD in s.database_url:
        errors.append("DATABASE_URL / POSTGRES_PASSWORD đang dùng mật khẩu dev — đặt mật khẩu mạnh")
    if s.minio_endpoint and s.minio_secret_key in ("", DEV_MINIO_PASSWORD):
        errors.append("MINIO_ROOT_PASSWORD đang dùng mật khẩu dev — đặt mật khẩu mạnh")

    # Tài khoản quản trị tổng (dùng khi tạo lần đầu)
    pw = s.superadmin_password
    if pw == DEV_SUPERADMIN_PASSWORD or len(pw) < MIN_SUPERADMIN_PASSWORD_LEN or password_problem(pw):
        errors.append(
            f"SUPERADMIN_PASSWORD phải ≥ {MIN_SUPERADMIN_PASSWORD_LEN} ký tự, có cả chữ và số, khác mật khẩu mặc định"
        )
    if s.superadmin_pin == DEV_SUPERADMIN_PIN or weak_pin(s.superadmin_pin):
        errors.append(
            "SUPERADMIN_PIN (mã phê duyệt phát cảnh báo) phải ≥ 6 chữ số, không lặp/không liên tiếp"
        )

    # Mạng & truy cập công khai
    if not s.rate_limit_enabled:
        errors.append("RATE_LIMIT_ENABLED phải bật khi mở cho người dân")
    if "*" in s.trusted_proxies:
        errors.append("TRUSTED_PROXIES không được là '*' — sẽ cho phép giả mạo IP để vượt giới hạn tần suất")
    origins = [o.strip() for o in s.cors_origins.split(",") if o.strip()]
    if "*" in origins:
        errors.append("CORS_ORIGINS không được là '*'")
    elif any("localhost" in o or "127.0.0.1" in o for o in origins):
        warnings.append("CORS_ORIGINS còn địa chỉ localhost — chỉ để tên miền thật")
    base = urlparse(s.public_base_url)
    if base.scheme != "https" or base.hostname in (None, "localhost", "127.0.0.1"):
        errors.append(
            "PUBLIC_BASE_URL phải là địa chỉ https:// thật (dùng trong email đặt lại mật khẩu, link chia sẻ)"
        )
    if s.intake_api_key and len(s.intake_api_key) < MIN_SECRET_LEN:
        errors.append(f"INTAKE_API_KEY phải ≥ {MIN_SECRET_LEN} ký tự ngẫu nhiên")

    # Chống spam form công khai
    if bool(s.turnstile_secret) != bool(s.turnstile_site_key):
        errors.append(
            "Cần đặt CẢ TURNSTILE_SITE_KEY và TURNSTILE_SECRET (thiếu một khoá → form phản ánh bị từ chối)"
        )
    elif not s.turnstile_secret:
        warnings.append("Chưa bật Cloudflare Turnstile — form phản ánh chỉ có giới hạn tần suất + honeypot")

    # Xác thực 2 lớp
    if not s.totp_required_role_set:
        warnings.append(
            "Chưa bắt buộc xác thực 2 lớp (TOTP_REQUIRED_ROLES) — nên bật cho super_admin, truong_ban, admin_tinh, "
            "chi_huy_cum (quản trị tài khoản, phê duyệt cảnh báo)"
        )

    # Sao lưu
    if not s.backup_remote:
        warnings.append(
            "Bản sao lưu chỉ nằm trên máy chủ này (chưa đặt BACKUP_REMOTE + --profile offsite) — hỏng ổ đĩa / máy chủ là "
            "mất cả dữ liệu lẫn bản sao lưu (README 10.5)"
        )

    # Dịch vụ phụ
    if s.smtp_host in ("", "mailpit"):
        warnings.append(
            "SMTP_HOST chưa trỏ tới máy chủ thư thật — người dùng không nhận được email quên mật khẩu"
        )
    elif s.smtp_user and not s.smtp_password:
        warnings.append(
            "SMTP_USER đã đặt nhưng SMTP_PASSWORD trống — máy chủ thư sẽ từ chối đăng nhập: email quên mật khẩu, báo "
            "sự cố không gửi được (Gmail: dùng mật khẩu ứng dụng)"
        )
    if s.llm_api_url:
        warnings.append(
            "LLM_API_URL đang bật: nội dung tin SOS (đã che SĐT) được gửi tới dịch vụ ngoài — cần đánh giá "
            "tác động xử lý / chuyển dữ liệu cá nhân ra nước ngoài theo Luật Bảo vệ dữ liệu cá nhân"
        )

    # Dữ liệu mẫu — chỉ cấm ở production (staging được phép để trình diễn)
    for flag, name in ((s.demo_mode, "DEMO_MODE"), (s.simulator, "SIMULATOR")):
        if flag:
            (errors if s.app_env == "production" else warnings).append(
                f"{name}=true: hệ thống sinh dữ liệu/tài khoản MẪU — cấm ở production"
            )
    return errors, warnings


def enforce(s: Settings = settings) -> None:
    errors, warnings = check(s)
    for w in warnings:
        log.warning("[cấu hình] %s", w)
    if errors:
        detail = "\n  - ".join(errors)
        raise RuntimeError(f"Cấu hình không an toàn cho APP_ENV={s.app_env}:\n  - {detail}")
