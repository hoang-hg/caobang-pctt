"""Cache ngắn hạn dùng chung giữa các tiến trình (Redis; không có Redis → bộ nhớ trong tiến trình).

- ``cached(key, ttl, producer)``: cache theo khoá + TTL. Gộp yêu cầu trùng khoá (single-flight) trong tiến trình và
  giữa các tiến trình (khoá Redis) → lúc đông người, một truy vấn nặng chỉ chạy 1 lần thay vì N lần cùng lúc.
- ``cached_view(name, params, producer)``: cho màn hình điều hành đã đăng nhập. Khoá gồm **phiên bản dữ liệu** (tăng ở
  sự kiện nghiệp vụ: SOS, điều động, vùng nguy hiểm, cảnh báo, kho…) và **khung thời gian 5 giây** (cho sự kiện tần suất
  cao: số đo IoT, GPS — không tăng phiên bản để lúc bão cache vẫn có tác dụng). Kết quả: sự kiện nghiệp vụ có hiệu lực
  ngay, số đo trễ tối đa 5 giây; N màn hình cùng tải lại chỉ tính 1 lần. ``params`` phải chứa mọi thứ quyết định kết quả
  (mã xã ĐÃ giao với phạm vi quyền). Trả thẳng chuỗi JSON đã lưu (``Response``) — không giải mã / mã hoá lại mỗi lần
  trúng cache (~20 ms với 76 KB).
- Mã hoá JSON bằng ``jsonable_encoder`` của FastAPI → cùng định dạng với phản hồi không cache (Decimal → số,
  datetime → ISO 8601).
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import time
from collections import OrderedDict
from collections.abc import Awaitable, Callable
from typing import Any

from fastapi.encoders import jsonable_encoder
from starlette.responses import Response

from app.infra.redis import get_redis

_memory: OrderedDict[str, tuple[float, str]] = OrderedDict()
_MAX_MEMORY_KEYS = 500
_inflight: dict[str, asyncio.Future[str | None]] = {}
_memory_version = 0

DATA_VERSION_KEY = "pctt:dataver"
VIEW_TTL = 15  # giới hạn trên cho thao tác ghi không phát sự kiện realtime
VIEW_BUCKET_S = 5  # số đo / GPS (không tăng phiên bản) trễ tối đa chừng này giây
# Sự kiện tần suất cao / chỉ là nhật ký → không tăng phiên bản dữ liệu (dựa vào khung thời gian VIEW_BUCKET_S)
HIGH_FREQUENCY_EVENTS = frozenset({"reading.new", "gps.update", "ingest.log", "log.new"})
LOCK_MS = 5000  # tiến trình giữ khoá tính quá lâu → khoá tự hết hạn
WAIT_S = 3.0  # tiến trình khác chờ kết quả tối đa, quá thì tự tính


def _dumps(value: Any) -> str:
    return json.dumps(jsonable_encoder(value), ensure_ascii=False)


async def _read(r, key: str) -> str | None:
    if r is not None:
        try:
            return await r.get(key)
        except Exception:  # Redis lỗi → vẫn phục vụ từ CSDL
            return None
    item = _memory.get(key)
    return item[1] if item and item[0] > time.monotonic() else None


async def _write(r, key: str, payload: str, ttl: int) -> None:
    if r is not None:
        try:
            await r.set(key, payload, ex=ttl)
        except Exception:
            pass
        return
    _memory[key] = (time.monotonic() + ttl, payload)
    _memory.move_to_end(key)
    while len(_memory) > _MAX_MEMORY_KEYS:
        _memory.popitem(last=False)


async def _compute(r, key: str, ttl: int, producer: Callable[[], Awaitable[Any]]) -> str:
    """Tính giá trị; giữa nhiều tiến trình chỉ tiến trình giữ khoá Redis tính, tiến trình khác chờ kết quả."""
    locked = False
    if r is not None:
        try:
            locked = bool(await r.set(f"{key}:lock", "1", nx=True, px=LOCK_MS))
        except Exception:
            locked = True
        if not locked:
            deadline = time.monotonic() + WAIT_S
            while time.monotonic() < deadline:
                await asyncio.sleep(0.05)
                if (hit := await _read(r, key)) is not None:
                    return hit
    try:
        payload = _dumps(await producer())
        await _write(r, key, payload, ttl)
        return payload
    finally:
        if r is not None and locked:
            try:
                await r.delete(f"{key}:lock")
            except Exception:
                pass


async def cached(key: str, ttl: int, producer: Callable[[], Awaitable[Any]]) -> Any:
    return json.loads(await _cached_payload(key, ttl, producer))


async def _cached_payload(key: str, ttl: int, producer: Callable[[], Awaitable[Any]]) -> str:
    """Chuỗi JSON của giá trị (từ cache hoặc vừa tính)."""
    key = f"cache:{key}"
    r = get_redis()
    if (hit := await _read(r, key)) is not None:
        return hit
    if (pending := _inflight.get(key)) is not None:  # cùng tiến trình đang tính khoá này → chờ chung
        payload = await asyncio.shield(pending)
        if payload is not None:
            return payload
        return _dumps(await producer())
    future: asyncio.Future[str | None] = asyncio.get_running_loop().create_future()
    _inflight[key] = future
    try:
        payload = await _compute(r, key, ttl, producer)
    except BaseException:
        future.set_result(None)  # yêu cầu đang chờ tự tính lại, không nhận lỗi của yêu cầu khác
        raise
    finally:
        _inflight.pop(key, None)
    future.set_result(payload)
    return payload


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


async def data_version() -> str:
    r = get_redis()
    if r is not None:
        try:
            return await r.get(DATA_VERSION_KEY) or "0"
        except Exception:
            pass
    return str(_memory_version)


async def bump_data_version(event: str | None = None) -> None:
    """Gọi khi dữ liệu nghiệp vụ thay đổi (hub.publish đã gọi sẵn); bỏ qua sự kiện tần suất cao."""
    if event in HIGH_FREQUENCY_EVENTS:
        return
    global _memory_version
    _memory_version += 1
    r = get_redis()
    if r is not None:
        try:
            await r.incr(DATA_VERSION_KEY)
        except Exception:
            pass


async def cached_view(
    name: str, params: dict, producer: Callable[[], Awaitable[Any]], ttl: int = VIEW_TTL
) -> Response:
    digest = hashlib.sha1(json.dumps(params, sort_keys=True, default=str).encode()).hexdigest()[:16]
    bucket = int(time.time() // VIEW_BUCKET_S)
    payload = await _cached_payload(f"view:{name}:{await data_version()}:{bucket}:{digest}", ttl, producer)
    return Response(payload, media_type="application/json")
