"""Kiểm thử đơn vị cache chịu tải: gộp yêu cầu trùng khoá, cache màn hình điều hành theo phiên bản dữ liệu."""

import asyncio
import json
import uuid

import pytest

from app.infra import cache


@pytest.fixture(autouse=True)
def memory_only(monkeypatch):
    monkeypatch.setattr(cache, "get_redis", lambda: None)  # kiểm bộ nhớ trong, không đụng Redis đang chạy


def test_single_flight_runs_producer_once():
    calls = {"n": 0}

    async def producer():
        calls["n"] += 1
        await asyncio.sleep(0.05)
        return {"v": calls["n"]}

    async def run():
        key = f"test:{uuid.uuid4().hex}"
        return await asyncio.gather(*(cache.cached(key, 60, producer) for _ in range(50)))

    results = asyncio.run(run())
    assert calls["n"] == 1  # 50 yêu cầu đồng thời → 1 lần truy vấn
    assert all(r == {"v": 1} for r in results)
    results[0]["v"] = 99  # mỗi yêu cầu nhận bản sao riêng
    assert results[1] == {"v": 1}


def test_failed_producer_does_not_poison_waiters():
    calls = {"n": 0}

    async def producer():
        calls["n"] += 1
        await asyncio.sleep(0.02)
        if calls["n"] == 1:
            raise RuntimeError("CSDL lỗi thoáng qua")
        return {"ok": True}

    async def run():
        key = f"test:{uuid.uuid4().hex}"
        return await asyncio.gather(
            *(cache.cached(key, 60, producer) for _ in range(3)), return_exceptions=True
        )

    results = asyncio.run(run())
    assert isinstance(results[0], RuntimeError)
    assert results[1:] == [{"ok": True}, {"ok": True}]


def test_cached_view_invalidated_by_data_version():
    calls = {"n": 0}

    async def producer():
        calls["n"] += 1
        return {"n": calls["n"]}

    async def run():
        params = {"codes": [uuid.uuid4().hex]}
        a = await cache.cached_view("kpis", params, producer)
        b = await cache.cached_view("kpis", params, producer)  # cùng phiên bản → dùng lại
        await cache.bump_data_version()  # có sự kiện realtime
        c = await cache.cached_view("kpis", params, producer)
        d = await cache.cached_view("kpis", {"codes": ["khac"]}, producer)  # phạm vi khác → khoá khác
        return a, b, c, d

    a, b, c, d = (json.loads(r.body) for r in asyncio.run(run()))
    assert a == b == {"n": 1}
    assert c == {"n": 2} and d == {"n": 3}


def test_cached_view_uses_fastapi_json_encoding():
    from datetime import UTC, datetime
    from decimal import Decimal

    async def producer():
        return {"mm": Decimal("12.3"), "time": datetime(2026, 9, 27, 6, 3, 51, tzinfo=UTC)}

    body = json.loads(asyncio.run(cache.cached_view("enc", {"k": uuid.uuid4().hex}, producer)).body)
    assert body == {"mm": 12.3, "time": "2026-09-27T06:03:51+00:00"}  # số là số, ngày ISO (Safari đọc được)


def test_high_frequency_events_do_not_bump_version():
    async def run():
        before = await cache.data_version()
        for event in ("reading.new", "gps.update", "ingest.log", "log.new"):
            await cache.bump_data_version(event)
        same = await cache.data_version()
        await cache.bump_data_version("sos.new")
        return before, same, await cache.data_version()

    before, same, after = asyncio.run(run())
    assert same == before and after != before
