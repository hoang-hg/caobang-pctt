"""Truy cập CSDL: engine async + vài helper trả về dict.

Truy vấn không gian (PostGIS) viết bằng SQL thuần qua `text()` cho rõ ràng.
Lưu ý: không viết `:param::type` (SQLAlchemy không nhận bind) — dùng `CAST(:param AS type)`.
"""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection, create_async_engine

from app.config import settings

# Tiến trình API: câu lệnh chạy quá DB_STATEMENT_TIMEOUT_MS bị Postgres huỷ (lỗi 500) thay vì giữ kết nối trong pool
# — một truy vấn chậm không kéo chậm cả hệ thống. Worker / migrate / seed (tác vụ dài) không giới hạn. Việc dài có chủ
# đích trong API (nhập dữ liệu) tự nới bằng SET LOCAL statement_timeout trong transaction.
_timeout_ms = settings.db_statement_timeout_ms if settings.run_mode == "api" else 0
engine = create_async_engine(
    settings.database_url,
    pool_size=settings.db_pool_size,
    max_overflow=settings.db_max_overflow,
    pool_pre_ping=True,
    connect_args={"options": f"-c statement_timeout={_timeout_ms}"} if _timeout_ms > 0 else {},
)


@asynccontextmanager
async def transaction() -> AsyncIterator[AsyncConnection]:
    async with engine.begin() as conn:
        yield conn


async def fetch_all(
    sql: str, params: dict[str, Any] | None = None, conn: AsyncConnection | None = None
) -> list[dict]:
    if conn is not None:
        result = await conn.execute(text(sql), params or {})
        return [dict(r) for r in result.mappings().all()]
    # begin() để câu lệnh ghi (INSERT … RETURNING) được commit
    async with engine.begin() as c:
        result = await c.execute(text(sql), params or {})
        return [dict(r) for r in result.mappings().all()]


async def fetch_all_no_jit(sql: str, params: dict[str, Any] | None = None) -> list[dict]:
    """Truy vấn có hàm PostGIS nặng (chi phí ước lượng cao) → PostgreSQL bật JIT, mất 60–200 ms biên dịch cho truy vấn chạy
    chỉ ~40 ms. Tắt JIT riêng trong transaction này (SET LOCAL), không đổi cấu hình chung của CSDL."""
    async with engine.begin() as c:
        await c.execute(text("SET LOCAL jit = off"))
        result = await c.execute(text(sql), params or {})
        return [dict(r) for r in result.mappings().all()]


async def fetch_one(
    sql: str, params: dict[str, Any] | None = None, conn: AsyncConnection | None = None
) -> dict | None:
    rows = await fetch_all(sql, params, conn)
    return rows[0] if rows else None


async def execute(
    sql: str, params: dict[str, Any] | None = None, conn: AsyncConnection | None = None
) -> None:
    if conn is not None:
        await conn.execute(text(sql), params or {})
        return
    async with engine.begin() as c:
        await c.execute(text(sql), params or {})
