"""Kết nối Redis dùng chung (tuỳ chọn). Không cấu hình REDIS_URL → trả None, các thành phần tự dùng bộ nhớ trong."""

from __future__ import annotations

import logging

from app.config import settings

log = logging.getLogger(__name__)
_client = None


def get_redis():
    global _client
    if not settings.redis_url:
        return None
    if _client is None:
        import redis.asyncio as aioredis

        _client = aioredis.from_url(settings.redis_url, decode_responses=True, health_check_interval=30)
    return _client


async def close_redis() -> None:
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None
