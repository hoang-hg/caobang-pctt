"""Giới hạn tần suất theo địa chỉ IP (fixed window), dùng Redis để thống nhất giữa nhiều tiến trình.

Luật khai báo tập trung ở ``RULES`` — khớp theo (method, tiền tố đường dẫn), luật đầu tiên khớp được áp dụng.
Vượt ngưỡng → 429 kèm ``Retry-After``. IP lấy từ ``request.client`` — ProxyHeadersMiddleware (app/main.py) đã thay
bằng IP người dùng khi kết nối đến từ TRUSTED_PROXIES; nginx ghi đè X-Forwarded-For nên không giả mạo được.

Lưu ý CGNAT: nhà mạng di động dùng chung 1 IP công cộng cho rất nhiều thuê bao → ngưỡng theo IP của các thao tác
của người dân phải đủ rộng; chặn lạm dụng bằng khoá phụ (VD theo SĐT: ``limit()``) và Turnstile thay vì siết IP.
"""

from __future__ import annotations

import hashlib
import time
from dataclasses import dataclass

from fastapi import HTTPException
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from app.config import settings
from app.infra.redis import get_redis


@dataclass(frozen=True)
class Rule:
    name: str
    method: str  # "*" = mọi method
    prefix: str
    limit: int
    window_s: int
    per_session: bool = False  # có Bearer token → đếm theo phiên đăng nhập (cả phòng trực chung 1 IP)


SESSION_IP_CEILING = 5  # khi đếm theo phiên, vẫn chặn 1 IP vượt 5× ngưỡng (token giả để né giới hạn)


RULES: tuple[Rule, ...] = (
    Rule("login", "POST", "/api/v1/auth/login", 30, 60),  # + khoá theo tài khoản sau 10 lần sai (auth.py)
    Rule("forgot", "POST", "/api/v1/auth/forgot-password", 5, 3600),
    Rule("reset", "POST", "/api/v1/auth/reset-password", 10, 3600),
    Rule("public_report", "POST", "/api/v1/public/reports", 30, 3600),  # + 5/giờ theo SĐT (public.py)
    Rule("public_route", "GET", "/api/v1/public/route", 20, 60),
    Rule("public_locate", "GET", "/api/v1/public/locate", 30, 60),
    Rule("public_track", "POST", "/api/v1/public/track", 20, 60),  # chống dò SĐT / mã phiếu
    Rule("public", "*", "/api/v1/public", 120, 60),
    Rule(
        "intake", "POST", "/api/v1/sos/intake", 300, 60
    ),  # webhook từ vài IP cổng Zalo/app, đã xác thực khoá
    Rule("ingest", "POST", "/api/v1/ingest", 1200, 60),
    Rule("api", "*", "/api/v1", 600, 60, per_session=True),
)

_memory: dict[str, tuple[int, float]] = {}


def match_rule(method: str, path: str) -> Rule | None:
    for rule in RULES:
        if (rule.method == "*" or rule.method == method) and path.startswith(rule.prefix):
            return rule
    return None


async def hit(key: str, window_s: int) -> int:
    """Tăng bộ đếm của cửa sổ hiện tại, trả về số lần đã gọi."""
    r = get_redis()
    if r is not None:
        try:
            count = await r.incr(key)
            if count == 1:
                await r.expire(key, window_s)
            return int(count)
        except Exception:
            pass  # Redis lỗi → dùng bộ nhớ trong
    now = time.time()
    count, expires = _memory.get(key, (0, now + window_s))
    if expires <= now:
        count, expires = 0, now + window_s
    _memory[key] = (count + 1, expires)
    if len(_memory) > 50_000:  # dọn khoá hết hạn
        for k in [k for k, (_, e) in _memory.items() if e <= now]:
            _memory.pop(k, None)
    return count + 1


class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if not settings.rate_limit_enabled:
            return await call_next(request)
        rule = match_rule(request.method, request.url.path)
        if rule is None:
            return await call_next(request)
        ip = request.client.host if request.client else "unknown"
        window = int(time.time() // rule.window_s)
        auth = request.headers.get("authorization", "")
        if rule.per_session and auth.startswith("Bearer "):
            session = hashlib.sha256(auth.encode()).hexdigest()[:24]
            count = await hit(f"rl:{rule.name}:s:{session}:{window}", rule.window_s)
            ip_count = await hit(f"rl:{rule.name}:ip:{ip}:{window}", rule.window_s)
            over = count > rule.limit or ip_count > rule.limit * SESSION_IP_CEILING
        else:
            count = await hit(f"rl:{rule.name}:{ip}:{window}", rule.window_s)
            over = count > rule.limit
        if over:
            retry = rule.window_s - int(time.time() % rule.window_s)
            return JSONResponse(
                status_code=429,
                content={"detail": "Quá nhiều yêu cầu, vui lòng thử lại sau"},
                headers={"Retry-After": str(retry)},
            )
        response = await call_next(request)
        response.headers["X-RateLimit-Limit"] = str(rule.limit)
        response.headers["X-RateLimit-Remaining"] = str(max(0, rule.limit - count))
        return response


def _keyed(name: str, key: str, window_s: int) -> str:
    return f"rl:{name}:{key}:{int(time.time() // window_s)}"


async def check_limit(name: str, key: str, max_hits: int, window_s: int) -> None:
    """Giới hạn theo khoá tuỳ ý (VD số điện thoại) trong route: đã dùng hết lượt → HTTP 429. KHÔNG tính thêm lượt —
    gọi ``count_hit`` sau khi thao tác thành công, để yêu cầu bị từ chối (ảnh lỗi, ngoài tỉnh…) không làm mất lượt."""
    if settings.rate_limit_enabled and await peek(_keyed(name, key, window_s)) >= max_hits:
        raise HTTPException(
            429,
            "Quá nhiều yêu cầu, vui lòng thử lại sau",
            headers={"Retry-After": str(window_s - int(time.time() % window_s))},
        )


async def count_hit(name: str, key: str, window_s: int) -> None:
    if settings.rate_limit_enabled:
        await hit(_keyed(name, key, window_s), window_s)


async def peek(key: str) -> int:
    r = get_redis()
    if r is not None:
        try:
            return int(await r.get(key) or 0)
        except Exception:
            pass
    count, expires = _memory.get(key, (0, 0))
    return count if expires > time.time() else 0


async def clear(key: str) -> None:
    r = get_redis()
    if r is not None:
        try:
            await r.delete(key)
        except Exception:
            pass
    _memory.pop(key, None)
