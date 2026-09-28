"""Tự giám sát vận hành: phát hiện sự cố hạ tầng, báo cho người vận hành qua email (+ webhook chat tuỳ chọn).

- Worker (1 bản) kiểm tra mỗi phút: CSDL, Redis, API (OPS_API_URL), dung lượng ổ đĩa, bản sao lưu CSDL trong 26 giờ,
  lần chép sao lưu ra ngoài máy chủ gần nhất (khi đặt BACKUP_REMOTE). Kết quả ghi Redis → GET /health/full.
- API theo dõi ngược nhịp worker (worker chết thì không còn ai báo): mỗi phút đúng 1 tiến trình API kiểm tra (khoá Redis).
- Báo khi 1 kiểm tra lỗi 2 lần liên tiếp (tránh báo nhầm lúc khởi động lại dịch vụ), nhắc lại mỗi OPS_ALERT_REPEAT_MIN
  phút khi còn lỗi, báo khi đã khôi phục.
Máy chủ mất điện / mất mạng thì không tự báo được → vẫn cần giám sát bên ngoài gọi /health/full (README 10.6).
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import shutil
import time
from collections.abc import Awaitable, Callable
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx

from app.config import settings
from app.db import fetch_one
from app.infra.heartbeat import STALE_S, worker_age_s
from app.infra.mailer import send_mail
from app.infra.redis import get_redis

log = logging.getLogger(__name__)

BACKUP_DIR = Path(
    "/backups"
)  # gắn chỉ đọc vào worker (docker-compose.prod.yml); không có → bỏ qua kiểm tra sao lưu
OFFSITE_MARKER = Path(
    "/ops/offsite/offsite-ok"
)  # backup-offsite ghi "<thời điểm> <chu kỳ giây>" sau mỗi lần chép
BACKUP_MAX_AGE_S = 26 * 3600
EVERY_S = 60
TIMEOUT_S = 10
FAILS_TO_ALERT = 2
STATUS_KEY = "pctt:ops:status"  # kết quả vòng kiểm tra gần nhất của worker
STATUS_TTL_S = 300
WORKER_STATE_KEY = "pctt:ops:state:worker"  # trạng thái báo (lỗi từ lúc nào, đã báo chưa)
API_STATE_KEY = "pctt:ops:state:api"
API_LOCK_KEY = "pctt:ops:api-watch"
VN_TZ = timezone(timedelta(hours=7))
_STARTED = time.monotonic()


@dataclass
class Check:
    name: str
    ok: bool
    detail: str


def _uptime() -> float:
    return time.monotonic() - _STARTED


def _ago(seconds: float) -> str:
    return f"{seconds / 3600:.1f} giờ" if seconds >= 3600 else f"{max(seconds, 0) / 60:.0f} phút"


async def check_db() -> list[Check]:
    await fetch_one("SELECT 1 AS ok")
    return [Check("db", True, "CSDL hoạt động")]


async def check_redis() -> list[Check]:
    if (r := get_redis()) is None:
        return []
    await r.ping()
    return [Check("redis", True, "Redis hoạt động")]


async def check_api() -> list[Check]:
    if not settings.ops_api_url:
        return []
    async with httpx.AsyncClient(timeout=TIMEOUT_S) as client:
        res = await client.get(settings.ops_api_url)
    ok = res.status_code == 200
    return [
        Check("api", ok, "API hoạt động" if ok else f"API trả mã {res.status_code} — xem dcp logs backend")
    ]


async def check_worker() -> list[Check]:
    age = await worker_age_s()
    if age is not None and age <= STALE_S:
        return [Check("worker", True, "Worker hoạt động")]
    since = "không có nhịp" if age is None else f"mất nhịp {_ago(age)}"
    return [
        Check(
            "worker",
            False,
            f"Worker {since} — ngừng đồng bộ dự báo, nhận MQTT, phát hiện mất tín hiệu; xem dcp logs worker",
        )
    ]


async def check_disk(paths: tuple[str, ...] = ("/", str(BACKUP_DIR))) -> list[Check]:
    """Mỗi ổ đĩa 1 lần: "/" của container nằm trên ổ chứa dữ liệu Docker (cả volume CSDL, ảnh), /backups là BACKUP_DIR."""
    warn = settings.ops_disk_warn_pct
    out: list[Check] = []
    seen: set[int] = set()
    for p in paths:
        try:
            dev = os.stat(p).st_dev
        except OSError:
            continue
        if dev in seen:
            continue
        seen.add(dev)
        u = shutil.disk_usage(p)
        pct = round(u.used * 100 / (u.used + u.free))  # như cột Use% của df (không tính phần dành cho root)
        detail = f"Ổ đĩa chứa {p} đã dùng {pct}% (còn {u.free / 2**30:.1f} GB, ngưỡng báo {warn}%)"
        out.append(Check(f"disk:{p}", pct < warn, detail))
    return out


async def check_backup(base: Path = BACKUP_DIR, now: float | None = None) -> list[Check]:
    folder = base / "db"
    if not folder.is_dir():
        return []
    dumps = [f.stat().st_mtime for f in folder.glob("*.dump")]
    if not dumps:
        if _uptime() < 3600:  # triển khai mới: service backup đang tạo bản đầu tiên
            return []
        return [
            Check("backup", False, "Chưa có bản sao lưu CSDL nào trong /backups/db — xem dcp logs backup")
        ]
    age = (now or time.time()) - max(dumps)
    ok = age <= BACKUP_MAX_AGE_S
    detail = f"Bản sao lưu CSDL gần nhất cách đây {_ago(age)}"
    return [Check("backup", ok, detail if ok else f"{detail} (quá 26 giờ) — xem dcp logs backup")]


async def check_offsite(marker: Path = OFFSITE_MARKER, now: float | None = None) -> list[Check]:
    if not settings.backup_remote or not marker.parent.is_dir():
        return []
    try:
        parts = marker.read_text().split()
        stamp, every = int(parts[0]), (int(parts[1]) if len(parts) > 1 else 3600)
    except FileNotFoundError:
        if _uptime() < 2 * 3600:  # lần chép đầu tiên có thể lâu
            return []
        return [
            Check(
                "offsite",
                False,
                f"Chưa chép bản sao lưu ra {settings.backup_remote} lần nào — đã chạy --profile offsite chưa? "
                "(dcp logs backup-offsite)",
            )
        ]
    except (ValueError, IndexError):
        return [
            Check("offsite", False, f"Tệp trạng thái {marker} không đọc được — xem dcp logs backup-offsite")
        ]
    age = (now or time.time()) - stamp
    ok = age <= 3 * every
    detail = f"Lần chép sao lưu ra ngoài máy chủ gần nhất cách đây {_ago(age)}"
    return [Check("offsite", ok, detail if ok else f"{detail} — xem dcp logs backup-offsite")]


CheckFn = Callable[[], Awaitable[list[Check]]]
WORKER_CHECKS: list[tuple[str, str, CheckFn]] = [
    ("db", "CSDL", check_db),
    ("redis", "Redis", check_redis),
    ("api", "API", check_api),
    ("disk", "Kiểm tra ổ đĩa", check_disk),
    ("backup", "Kiểm tra sao lưu", check_backup),
    ("offsite", "Kiểm tra sao lưu ngoài máy chủ", check_offsite),
]


async def run_checks(checks: list[tuple[str, str, CheckFn]]) -> list[Check]:
    async def one(name: str, label: str, fn: CheckFn) -> list[Check]:
        try:
            return await asyncio.wait_for(fn(), TIMEOUT_S)
        except Exception as e:  # noqa: BLE001 — mọi lỗi đều là sự cố cần báo
            reason = f"{type(e).__name__}: {e}" if str(e) else type(e).__name__
            return [Check(name, False, f"{label} lỗi / không phản hồi ({reason[:200]})")]

    results = await asyncio.gather(*(one(*c) for c in checks))
    return [c for group in results for c in group]


class Alerts:
    """Trạng thái báo theo từng kiểm tra đang lỗi: {tên: {"fails": số lần lỗi liên tiếp, "alerted": lúc báo gần nhất}}."""

    def __init__(self, state: dict | None = None) -> None:
        self.state: dict[str, dict] = state or {}

    def alerted(self, name: str) -> bool:
        return self.state.get(name, {}).get("alerted") is not None

    def update(self, checks: list[Check], now: float) -> tuple[list[Check], list[Check], list[Check]]:
        """→ (sự cố mới, sự cố đến hạn nhắc lại, đã khôi phục). Kiểm tra bị bỏ qua vòng này giữ nguyên trạng thái."""
        new: list[Check] = []
        repeat: list[Check] = []
        recovered: list[Check] = []
        for c in checks:
            if c.ok:
                if self.alerted(c.name):
                    recovered.append(c)
                self.state.pop(c.name, None)
                continue
            st = self.state.setdefault(c.name, {"fails": 0, "alerted": None})
            st["fails"] += 1
            if st["fails"] < FAILS_TO_ALERT:
                continue
            if st["alerted"] is None:
                new.append(c)
            elif now - st["alerted"] >= settings.ops_alert_repeat_min * 60:
                repeat.append(c)
        if new or repeat:  # mỗi lần gửi nhắc lại toàn bộ sự cố đang có → chung 1 nhịp nhắc
            for c in checks:
                if not c.ok and self.state.get(c.name, {}).get("fails", 0) >= FAILS_TO_ALERT:
                    self.state[c.name]["alerted"] = now
        return new, repeat, recovered


def compose(
    new: list[Check], repeat: list[Check], recovered: list[Check], failing: list[Check], now: float
) -> tuple[str, str] | None:
    """→ (tiêu đề, nội dung) email / tin nhắn, hoặc None khi không có gì cần báo."""
    if new:
        head = "SỰ CỐ: " + "; ".join(c.detail for c in new)
    elif repeat:
        head = "VẪN CÒN SỰ CỐ: " + "; ".join(c.detail for c in failing)
    elif recovered:
        head = "ĐÃ KHÔI PHỤC: " + "; ".join(c.detail for c in recovered)
    else:
        return None
    subject = f"[PCTT Cao Bằng] {head}"
    if len(subject) > 180:
        subject = subject[:179] + "…"
    lines: list[str] = []
    if failing:
        lines += ["Đang lỗi:", *(f"  ✗ {c.detail}" for c in failing), ""]
    if recovered:
        lines += ["Đã khôi phục:", *(f"  ✓ {c.detail}" for c in recovered), ""]
    at = datetime.fromtimestamp(now, VN_TZ).strftime("%H:%M %d/%m/%Y")
    lines += [
        f"Hệ thống: {settings.public_base_url} — lúc {at} (giờ Việt Nam).",
        "Xem nhanh trên máy chủ: dcp ps; dcp logs --tail 100 <dịch vụ> (README 10.6).",
    ]
    if failing:
        lines.append(f"Còn lỗi sẽ nhắc lại sau {settings.ops_alert_repeat_min} phút.")
    return subject, "\n".join(lines)


def recipients() -> list[str]:
    raw = settings.ops_alert_emails or settings.superadmin_email
    return [e.strip() for e in raw.split(",") if e.strip()]


async def notify(subject: str, body: str, problem: bool) -> None:
    # Luôn ghi log — kể cả khi máy chủ thư cũng đang lỗi
    (log.error if problem else log.warning)("[ops] %s", subject)
    for to in recipients():
        await send_mail(to, subject, body)
    if settings.ops_alert_webhook_url:
        try:
            async with httpx.AsyncClient(timeout=TIMEOUT_S) as client:
                res = await client.post(settings.ops_alert_webhook_url, json={"text": f"{subject}\n\n{body}"})
            if res.status_code >= 300:
                log.error("[ops] webhook cảnh báo trả mã %s", res.status_code)
        except Exception as e:  # noqa: BLE001
            # không ghi URL / chuỗi lỗi: URL webhook chứa token (Telegram, Slack…)
            log.error("[ops] gửi webhook cảnh báo thất bại (%s)", type(e).__name__)


async def _redis(coro: Awaitable) -> object | None:
    try:
        return await asyncio.wait_for(coro, TIMEOUT_S)
    except Exception:  # noqa: BLE001 — Redis lỗi đã có kiểm tra "redis" báo
        return None


class OpsWatch:
    def __init__(self) -> None:
        self._task: asyncio.Task | None = None
        self.states: dict[str, dict] = {}
        self.last: dict | None = None  # vòng kiểm tra gần nhất của worker trong tiến trình này

    def start_worker(self) -> None:
        self._task = asyncio.create_task(self._loop(self.worker_round, first_delay=30))

    def start_api(self) -> None:
        self._task = asyncio.create_task(self._loop(self.api_round, first_delay=120))

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()

    async def _loop(self, round_fn: Callable[[], Awaitable[None]], first_delay: int) -> None:
        await asyncio.sleep(first_delay)  # chờ các dịch vụ khác khởi động xong
        while True:
            try:
                await round_fn()
            except Exception:
                log.exception("[ops] vòng kiểm tra lỗi")
            await asyncio.sleep(EVERY_S)

    async def worker_round(self) -> None:
        checks = await run_checks(WORKER_CHECKS)
        now = time.time()
        self.last = {"time": int(now), "checks": [asdict(c) for c in checks]}
        if (r := get_redis()) is not None:
            await _redis(r.set(STATUS_KEY, json.dumps(self.last, ensure_ascii=False), ex=STATUS_TTL_S))
        await self._evaluate(WORKER_STATE_KEY, checks, now, shared=False)

    async def api_round(self) -> None:
        """Nhiều tiến trình API (gunicorn × số bản) → mỗi phút chỉ 1 tiến trình giữ khoá kiểm tra."""
        r = get_redis()
        if r is None or not await _redis(r.set(API_LOCK_KEY, "1", nx=True, ex=EVERY_S - 5)):
            return
        checks = await run_checks([("worker", "Worker", check_worker)])
        await self._evaluate(API_STATE_KEY, checks, time.time(), shared=True)

    async def _evaluate(self, key: str, checks: list[Check], now: float, shared: bool) -> None:
        """shared: nhiều tiến trình dùng chung trạng thái (API) → luôn đọc từ Redis. Worker (1 bản) giữ trong bộ nhớ
        (Redis lỗi vẫn báo được), Redis chỉ để nối tiếp sau khi khởi động lại — không báo lại sự cố đã báo."""
        r = get_redis()
        state = None if shared else self.states.get(key)
        if state is None and r is not None and (raw := await _redis(r.get(key))):
            state = json.loads(raw)
        alerts = Alerts(state)
        new, repeat, recovered = alerts.update(checks, now)
        self.states[key] = alerts.state
        if r is not None:
            await _redis(r.set(key, json.dumps(alerts.state), ex=7 * 86400))
        failing = [c for c in checks if not c.ok and alerts.alerted(c.name)]
        if msg := compose(new, repeat, recovered, failing, now):
            await notify(*msg, problem=bool(new or repeat))

    async def snapshot(self) -> dict[str, bool]:
        """Cho /health/full: CSDL, Redis (và worker khi chạy tách riêng) kiểm tra ngay; ổ đĩa, sao lưu, API theo vòng
        kiểm tra gần nhất của worker (quá 5 phút → bỏ qua; worker chết đã có kiểm tra "worker" báo)."""
        now_checks: list[tuple[str, str, CheckFn]] = [
            ("db", "CSDL", check_db),
            ("redis", "Redis", check_redis),
        ]
        if settings.run_mode == "api":
            now_checks.append(("worker", "Worker", check_worker))
        result = {c.name: c.ok for c in await run_checks(now_checks)}
        last = self.last
        if last is None and (r := get_redis()) is not None and (raw := await _redis(r.get(STATUS_KEY))):
            last = json.loads(raw)
        if last and time.time() - last["time"] <= STATUS_TTL_S:
            for c in last["checks"]:
                result.setdefault(c["name"], c["ok"])
        return result


ops_watch = OpsWatch()
