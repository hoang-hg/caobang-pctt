"""Tài khoản CSDL riêng cho ứng dụng (DB1 — docs/csdl-viec-con-lai.md).

    python -m app.db_roles     # service "migrate" chạy sau alembic + seed, MỖI lần triển khai

Backend / worker kết nối bằng APP_DB_USER (mặc định pctt_app): KHÔNG phải superuser, chỉ đọc / ghi dữ liệu nghiệp vụ, không
đổi cấu trúc bảng; hai bảng nhật ký pháp lý chỉ được đọc và ghi thêm (thu hồi UPDATE / DELETE / TRUNCATE; migration 0022 có
thêm trigger chặn). Tài khoản chủ sở hữu (POSTGRES_USER) chỉ dùng cho migrate và sao lưu.

Chạy lại mỗi lần triển khai nên: bảng / chuỗi số mới của migration được cấp quyền ngay; đổi APP_DB_PASSWORD trong
.env.production rồi triển khai lại là mật khẩu đổi theo. APP_DB_PASSWORD trống (máy dev, CI E2E) → bỏ qua, ứng dụng dùng
tài khoản chủ sở hữu như trước.
"""

from __future__ import annotations

import asyncio
import base64
import hashlib
import hmac
import os
import re

from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncConnection

from app.config import settings
from app.db import APPEND_ONLY_LOGS, engine

# Schema dữ liệu nghiệp vụ (đọc / ghi). public chỉ cấp riêng bảng luật phân quyền (casbin) — không cấp alembic_version.
SCHEMAS = (
    "spatial_admin",
    "resources",
    "operations",
    "iot_telemetry",
    "communications",
    "community",
    "integrations",
)
PUBLIC_TABLES = ("public.casbin_rule",)
PUBLIC_SEQUENCES = ("public.casbin_rule_id_seq",)
ROLE_NAME = re.compile(r"^[a-z_][a-z0-9_]{0,62}$")


def scram_sha256(password: str, iterations: int = 4096) -> str:
    """Mã băm SCRAM-SHA-256 đúng dạng PostgreSQL lưu (pg_authid). Gửi mã băm thay mật khẩu gốc: mật khẩu không nằm trong câu
    lệnh, không lọt ra nhật ký CSDL hay thông báo lỗi."""
    salt = os.urandom(16)
    salted = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, iterations)
    client_key = hmac.new(salted, b"Client Key", hashlib.sha256).digest()
    stored_key = hashlib.sha256(client_key).digest()
    server_key = hmac.new(salted, b"Server Key", hashlib.sha256).digest()
    salt64, stored64, server64 = (base64.b64encode(b).decode() for b in (salt, stored_key, server_key))
    return f"SCRAM-SHA-256${iterations}:{salt64}${stored64}:{server64}"


async def ensure_app_role(name: str, password: str) -> list[str]:
    """Tạo / cập nhật tài khoản ứng dụng và cấp quyền. Trả về các bước đã làm (in ra log của service migrate)."""
    if not ROLE_NAME.match(name):
        raise SystemExit(f"[db_roles] APP_DB_USER không hợp lệ ({name!r}): chỉ chữ thường, số, gạch dưới")
    done: list[str] = []
    try:
        async with engine.begin() as conn:
            await _apply(conn, name, password, done)
    except DBAPIError as e:  # chỉ in lỗi của máy chủ CSDL — không in câu lệnh / tham số
        raise SystemExit(f"[db_roles] lỗi CSDL: {e.orig}") from None
    return done


async def _apply(conn: AsyncConnection, name: str, password: str, done: list[str]) -> None:
    owner = await conn.scalar(text("SELECT current_user"))
    if name == owner:
        raise SystemExit(f"[db_roles] APP_DB_USER ({name}) phải khác tài khoản chủ sở hữu CSDL ({owner})")
    exists = await conn.scalar(text("SELECT 1 FROM pg_roles WHERE rolname = :n"), {"n": name})
    verb = "ALTER" if exists else "CREATE"
    await conn.exec_driver_sql(
        f"{verb} ROLE {name} WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION "
        f"PASSWORD '{scram_sha256(password)}'"
    )
    done.append(f"{'cập nhật' if exists else 'tạo'} tài khoản {name} (không superuser)")
    db = await conn.scalar(text("SELECT quote_ident(current_database())"))
    schemas = ", ".join(SCHEMAS)
    for stmt in (
        f"GRANT CONNECT ON DATABASE {db} TO {name}",
        f"GRANT USAGE ON SCHEMA {schemas} TO {name}",
        f"GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA {schemas} TO {name}",
        f"GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA {schemas} TO {name}",
        f"GRANT SELECT, INSERT, UPDATE, DELETE ON {', '.join(PUBLIC_TABLES)} TO {name}",
        f"GRANT USAGE, SELECT, UPDATE ON {', '.join(PUBLIC_SEQUENCES)} TO {name}",
        f"REVOKE UPDATE, DELETE, TRUNCATE ON {', '.join(APPEND_ONLY_LOGS)} FROM {name}",
    ):
        await conn.exec_driver_sql(stmt)
    done.append(f"cấp quyền đọc / ghi {len(SCHEMAS)} schema nghiệp vụ; nhật ký pháp lý chỉ đọc + ghi thêm")


async def main() -> None:
    if not settings.app_db_password:
        print(
            "[db_roles] APP_DB_PASSWORD trống — bỏ qua (ứng dụng dùng tài khoản chủ sở hữu CSDL, chỉ hợp với máy dev)"
        )
        return
    for step in await ensure_app_role(settings.app_db_user, settings.app_db_password):
        print(f"[db_roles] {step}")
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
