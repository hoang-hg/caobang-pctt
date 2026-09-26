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

engine = create_async_engine(settings.database_url, pool_size=10, max_overflow=10, pool_pre_ping=True)


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
