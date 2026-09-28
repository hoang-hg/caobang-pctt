"""Khởi tạo Casbin AsyncEnforcer (singleton trong tiến trình).

Domain phân cấp tỉnh → cụm → xã dùng ``key_match``: nhóm quyền gán ở ``"BAOLAC/*"``
khớp mọi yêu cầu có domain ``"BAOLAC/CB-..."``; gán ở ``"*"`` khớp mọi domain.

Nhiều tiến trình: sau mỗi thay đổi policy, ``notify_policy_changed()`` phát lên kênh Redis
``pctt:casbin``; mọi tiến trình nghe kênh đó và nạp lại policy (tương tự Redis watcher của thientai-org-backend).
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from pathlib import Path

from casbin import AsyncEnforcer
from casbin.util.builtin_operators import key_match_func
from casbin_async_sqlalchemy_adapter import Adapter

from app.db import engine
from app.infra.redis import get_redis

log = logging.getLogger(__name__)

_MODEL = Path(__file__).with_name("model.conf")
CHANNEL = "pctt:casbin"
_enforcer: AsyncEnforcer | None = None
_lock: asyncio.Lock | None = None
_watcher: asyncio.Task | None = None
# Định danh tiến trình để bỏ qua thông báo của chính mình. KHÔNG dùng PID: mỗi container đánh PID từ đầu → worker
# gunicorn ở 2 bản backend (--scale backend=N) trùng PID, bản kia bỏ qua thông báo đổi quyền và giữ quyền cũ
_PROCESS_ID = uuid.uuid4().hex


async def init_enforcer() -> AsyncEnforcer:
    global _enforcer, _lock
    if _lock is None:
        _lock = asyncio.Lock()
    async with _lock:
        if _enforcer is not None:
            return _enforcer
        enforcer = AsyncEnforcer(str(_MODEL), Adapter(engine))
        enforcer.add_named_domain_matching_func("g", key_match_func)
        await enforcer.load_policy()
        log.info(
            "[rbac] %d policy, %d grouping", len(enforcer.get_policy()), len(enforcer.get_grouping_policy())
        )
        _enforcer = enforcer
        return enforcer


def get_enforcer() -> AsyncEnforcer:
    if _enforcer is None:
        raise RuntimeError("RBAC enforcer chưa khởi tạo (lifespan chưa chạy init_enforcer)")
    return _enforcer


async def reload_policy() -> None:
    if _enforcer is not None:
        await _enforcer.load_policy()


async def notify_policy_changed() -> None:
    r = get_redis()
    if r is not None:
        try:
            await r.publish(CHANNEL, _PROCESS_ID)
        except Exception:
            log.warning("[rbac] không phát được thông báo đổi policy", exc_info=True)


def start_policy_watcher() -> None:
    global _watcher
    if get_redis() is not None and _watcher is None:
        _watcher = asyncio.create_task(_watch())


async def stop_policy_watcher() -> None:
    if _watcher:
        _watcher.cancel()


async def _watch() -> None:
    while True:
        try:
            pubsub = get_redis().pubsub()
            await pubsub.subscribe(CHANNEL)
            # Vừa (kết nối lại) đăng ký: thay đổi quyền trong lúc mất kết nối Redis không nhận được thông báo → nạp lại
            await reload_policy()
            async for msg in pubsub.listen():
                if msg.get("type") == "message" and msg.get("data") != _PROCESS_ID:
                    await reload_policy()
                    log.info("[rbac] nạp lại policy (thay đổi từ tiến trình %s)", msg.get("data"))
        except asyncio.CancelledError:
            raise
        except Exception:
            log.warning("[rbac] watcher mất kết nối Redis — thử lại", exc_info=True)
            await asyncio.sleep(3)
