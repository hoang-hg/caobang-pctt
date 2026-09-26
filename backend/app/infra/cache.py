"""Cache ngắn hạn cho API công khai (chịu tải khi đông người xem lúc có thiên tai).

Redis nếu có (dùng chung giữa các tiến trình), ngược lại bộ nhớ trong tiến trình.
"""

from __future__ import annotations

import json
import time
from collections import OrderedDict
from collections.abc import Awaitable, Callable
from typing import Any

from app.infra.redis import get_redis

_memory: OrderedDict[str, tuple[float, str]] = OrderedDict()
_MAX_MEMORY_KEYS = 500


async def cached(key: str, ttl: int, producer: Callable[[], Awaitable[Any]]) -> Any:
    key = f"cache:{key}"
    r = get_redis()
    if r is not None:
        try:
            hit = await r.get(key)
            if hit is not None:
                return json.loads(hit)
        except Exception:  # Redis lỗi → vẫn phục vụ từ CSDL
            r = None
    else:
        item = _memory.get(key)
        if item and item[0] > time.monotonic():
            return json.loads(item[1])

    value = await producer()
    payload = json.dumps(value, ensure_ascii=False, default=str)
    if r is not None:
        try:
            await r.set(key, payload, ex=ttl)
        except Exception:
            pass
    else:
        _memory[key] = (time.monotonic() + ttl, payload)
        _memory.move_to_end(key)
        while len(_memory) > _MAX_MEMORY_KEYS:
            _memory.popitem(last=False)
    return json.loads(payload)


async def invalidate(prefix: str) -> None:
    prefix = f"cache:{prefix}"
    r = get_redis()
    if r is not None:
        try:
            async for k in r.scan_iter(match=f"{prefix}*"):
                await r.delete(k)
        except Exception:
            pass
    for k in [k for k in _memory if k.startswith(prefix)]:
        _memory.pop(k, None)
