"""Kiểm thử đơn vị: tự giám sát vận hành — kiểm tra ổ đĩa / sao lưu, nhịp báo sự cố, nội dung email, /health/full."""

import asyncio
import os
import time
from collections import namedtuple
from pathlib import Path

import pytest

from app.config import settings
from app.infra import ops_watch as ow
from app.infra.ops_watch import Alerts, Check, OpsWatch, compose

HOUR = 3600
Usage = namedtuple("Usage", "total used free")


@pytest.fixture(autouse=True)
def _no_redis(monkeypatch):
    monkeypatch.setattr(ow, "get_redis", lambda: None)
    monkeypatch.setattr(settings, "ops_alert_repeat_min", 180)


def bad(name="disk:/", detail="Ổ đĩa chứa / đã dùng 91%"):
    return Check(name, False, detail)


def good(name="disk:/", detail="Ổ đĩa chứa / đã dùng 40%"):
    return Check(name, True, detail)


def test_alert_after_two_failures_then_repeat_then_recover():
    a = Alerts()
    t = 1_000_000.0
    assert a.update([bad()], t) == ([], [], [])  # lỗi 1 lần: có thể chỉ là khởi động lại dịch vụ
    new, repeat, rec = a.update([bad()], t + 60)
    assert [c.name for c in new] == ["disk:/"] and not repeat and not rec
    assert a.update([bad()], t + 120) == ([], [], [])  # đã báo, chưa tới hạn nhắc
    _, repeat, _ = a.update([bad()], t + 60 + 180 * 60)
    assert [c.name for c in repeat] == ["disk:/"]
    new, repeat, rec = a.update([good()], t + 4 * HOUR)
    assert not new and not repeat and [c.name for c in rec] == ["disk:/"]
    assert a.state == {}


def test_single_blip_is_neither_alerted_nor_recovered():
    a = Alerts()
    a.update([bad("api")], 0)
    assert a.update([good("api")], 60) == ([], [], [])
    assert a.update([bad("api")], 120) == ([], [], [])  # đếm lại từ đầu


def test_new_problem_resets_reminder_for_all_failing():
    a = Alerts()
    a.update([bad("disk:/"), good("backup")], 0)
    a.update([bad("disk:/"), good("backup")], 60)  # báo disk
    a.update([bad("disk:/"), bad("backup")], 2 * HOUR)
    new, _, _ = a.update([bad("disk:/"), bad("backup")], 2 * HOUR + 60)  # báo backup, kèm nhắc disk
    assert [c.name for c in new] == ["backup"]
    assert a.state["disk:/"]["alerted"] == a.state["backup"]["alerted"] == 2 * HOUR + 60
    assert a.update([bad("disk:/"), bad("backup")], 4 * HOUR) == ([], [], [])  # chung 1 nhịp nhắc


def test_skipped_check_keeps_state():
    a = Alerts()
    a.update([bad("offsite")], 0)
    a.update([bad("offsite")], 60)
    a.update([], 120)  # vòng này bỏ qua kiểm tra offsite
    assert a.alerted("offsite")


def test_compose_subjects_and_body(monkeypatch):
    monkeypatch.setattr(settings, "public_base_url", "https://pctt.caobang.gov.vn")
    subject, body = compose([bad()], [], [], [bad()], 0)
    assert subject.startswith("[PCTT Cao Bằng] SỰ CỐ: Ổ đĩa chứa / đã dùng 91%")
    assert "✗ Ổ đĩa" in body and "https://pctt.caobang.gov.vn" in body and "07:00 01/01/1970" in body
    assert "nhắc lại sau 180 phút" in body
    subject, body = compose([], [], [good()], [], 0)
    assert subject.startswith("[PCTT Cao Bằng] ĐÃ KHÔI PHỤC:") and "✓" in body and "nhắc lại" not in body
    subject, _ = compose([], [bad()], [], [bad(), bad("backup", "Bản sao lưu quá 26 giờ")], 0)
    assert subject.startswith("[PCTT Cao Bằng] VẪN CÒN SỰ CỐ:") and "26 giờ" in subject
    assert compose([], [], [], [], 0) is None
    long = [bad(f"disk:/{i}", "x" * 80) for i in range(5)]
    assert len(compose(long, [], [], long, 0)[0]) == 180


def test_recipients_fall_back_to_superadmin(monkeypatch):
    monkeypatch.setattr(settings, "superadmin_email", "quantri@caobang.gov.vn")
    monkeypatch.setattr(settings, "ops_alert_emails", "")
    assert ow.recipients() == ["quantri@caobang.gov.vn"]
    monkeypatch.setattr(settings, "ops_alert_emails", " a@x.vn, b@x.vn ,")
    assert ow.recipients() == ["a@x.vn", "b@x.vn"]


async def test_disk_usage_per_device(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "ops_disk_warn_pct", 85)
    monkeypatch.setattr(ow.shutil, "disk_usage", lambda p: Usage(100 * 2**30, 90 * 2**30, 8 * 2**30))
    other = tmp_path / "khong-co"
    checks = await ow.check_disk((str(tmp_path), str(tmp_path / "."), str(other)))
    assert len(checks) == 1  # cùng ổ đĩa → 1 kiểm tra; đường dẫn không có → bỏ qua
    c = checks[0]
    assert not c.ok and "92%" in c.detail and "8.0 GB" in c.detail  # 90 / (90 + 8), như df
    monkeypatch.setattr(ow.shutil, "disk_usage", lambda p: Usage(100, 50, 50))
    assert (await ow.check_disk((str(tmp_path),)))[0].ok


async def test_backup_freshness(monkeypatch, tmp_path):
    assert await ow.check_backup(tmp_path) == []  # chưa gắn thư mục sao lưu (máy dev)
    (tmp_path / "db").mkdir()
    monkeypatch.setattr(ow, "_uptime", lambda: 600)
    assert await ow.check_backup(tmp_path) == []  # vừa triển khai: service backup đang tạo bản đầu
    monkeypatch.setattr(ow, "_uptime", lambda: 2 * HOUR)
    [c] = await ow.check_backup(tmp_path)
    assert not c.ok and "Chưa có bản sao lưu" in c.detail
    now = time.time()
    old, new = tmp_path / "db" / "pctt_1.dump", tmp_path / "db" / "pctt_2.dump"
    for f, age in ((old, 50 * HOUR), (new, 5 * HOUR)):
        f.write_bytes(b"x")
        os.utime(f, (now - age, now - age))
    (tmp_path / "db" / "pctt_3.dump.part").write_bytes(b"x")  # đang ghi dở: không tính
    [c] = await ow.check_backup(tmp_path, now)
    assert c.ok and "5.0 giờ" in c.detail
    [c] = await ow.check_backup(tmp_path, now + 22 * HOUR)
    assert not c.ok and "quá 26 giờ" in c.detail


async def test_offsite_freshness(monkeypatch, tmp_path):
    marker = tmp_path / "offsite-ok"
    monkeypatch.setattr(settings, "backup_remote", "")
    assert await ow.check_offsite(marker) == []  # không dùng offsite → preflight đã cảnh báo
    monkeypatch.setattr(settings, "backup_remote", "offsite:pctt/caobang")
    assert await ow.check_offsite(Path(tmp_path / "khong-gan" / "offsite-ok")) == []
    monkeypatch.setattr(ow, "_uptime", lambda: HOUR)
    assert await ow.check_offsite(marker) == []  # lần chép đầu có thể lâu
    monkeypatch.setattr(ow, "_uptime", lambda: 3 * HOUR)
    [c] = await ow.check_offsite(marker)
    assert not c.ok and "--profile offsite" in c.detail
    marker.write_text("1000000 3600\n")
    assert (await ow.check_offsite(marker, 1_000_000 + 2 * HOUR))[0].ok
    assert not (await ow.check_offsite(marker, 1_000_000 + 3 * HOUR + 1))[0].ok
    marker.write_text("1000000 600\n")  # chu kỳ 10 phút → quá 30 phút là lỗi
    assert not (await ow.check_offsite(marker, 1_000_000 + 31 * 60))[0].ok
    marker.write_text("hỏng")
    assert not (await ow.check_offsite(marker))[0].ok


async def test_run_checks_turns_errors_and_timeouts_into_failures(monkeypatch):
    monkeypatch.setattr(ow, "TIMEOUT_S", 0.05)

    async def boom():
        raise ConnectionRefusedError("[Errno 111] Connection refused")

    async def hang():
        await asyncio.sleep(1)
        return []

    async def skip():
        return []

    checks = await ow.run_checks([("db", "CSDL", boom), ("api", "API", hang), ("offsite", "Offsite", skip)])
    assert [(c.name, c.ok) for c in checks] == [("db", False), ("api", False)]
    assert "CSDL lỗi" in checks[0].detail and "Connection refused" in checks[0].detail
    assert "TimeoutError" in checks[1].detail


async def test_worker_round_notifies_once_and_on_recovery(monkeypatch):
    sent = []

    async def fake_notify(subject, body, problem):
        sent.append((subject, problem))

    state = {"ok": False}

    async def disk():
        return [Check("disk:/", state["ok"], "Ổ đĩa")]

    monkeypatch.setattr(ow, "notify", fake_notify)
    monkeypatch.setattr(ow, "WORKER_CHECKS", [("disk", "Ổ đĩa", disk)])
    w = OpsWatch()
    for _ in range(3):
        await w.worker_round()
    assert [p for _, p in sent] == [True]
    assert w.last["checks"] == [{"name": "disk:/", "ok": False, "detail": "Ổ đĩa"}]
    state["ok"] = True
    await w.worker_round()
    assert [p for _, p in sent] == [True, False] and "ĐÃ KHÔI PHỤC" in sent[-1][0]


async def test_snapshot_merges_fresh_worker_results(monkeypatch):
    async def ok_db():
        return [Check("db", True, "")]

    async def no_redis():
        return []

    async def dead_worker():
        return [Check("worker", False, "")]

    monkeypatch.setattr(ow, "check_db", ok_db)
    monkeypatch.setattr(ow, "check_redis", no_redis)
    monkeypatch.setattr(ow, "check_worker", dead_worker)
    monkeypatch.setattr(settings, "run_mode", "all")
    w = OpsWatch()
    assert await w.snapshot() == {"db": True}
    w.last = {
        "time": int(time.time()),
        "checks": [{"name": "disk:/", "ok": False}, {"name": "db", "ok": False}],
    }
    assert await w.snapshot() == {"db": True, "disk:/": False}  # CSDL: kết quả kiểm tra ngay được ưu tiên
    w.last["time"] -= ow.STATUS_TTL_S + 1
    assert await w.snapshot() == {"db": True}  # kết quả cũ → bỏ qua
    monkeypatch.setattr(settings, "run_mode", "api")
    assert await w.snapshot() == {"db": True, "worker": False}
