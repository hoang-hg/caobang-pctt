"""Khởi tạo Casbin AsyncEnforcer (singleton trong tiến trình).

Domain phân cấp tỉnh → cụm → xã dùng ``key_match``: nhóm quyền gán ở ``"BAOLAC/*"``
khớp mọi yêu cầu có domain ``"BAOLAC/CB-..."``; gán ở ``"*"`` khớp mọi domain.
Backend chạy 1 worker nên không cần watcher đồng bộ policy giữa tiến trình
(khi scale nhiều worker: thêm Redis watcher như thientai-org-backend).
"""

from __future__ import annotations

import asyncio
import logging
from pathlib import Path

from casbin import AsyncEnforcer
from casbin.util.builtin_operators import key_match_func
from casbin_async_sqlalchemy_adapter import Adapter

from app.db import engine

log = logging.getLogger(__name__)

_MODEL = Path(__file__).with_name("model.conf")
_enforcer: AsyncEnforcer | None = None
_lock: asyncio.Lock | None = None


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
