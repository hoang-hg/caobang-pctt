"""Kiểm tra Go / No-Go trước khi mở cổng cho người dân — phần chạy TRONG máy chủ (docs/GO-LIVE.md, điều kiện 2–6).

    dcp exec -T worker python -m app.golive     # hoặc deploy/golive-check.sh <tên miền>: gồm cả kiểm tra từ bên ngoài

Chỉ ĐỌC: không ghi CSDL / Redis / tệp. Chạy trong container worker (có /backups để kiểm tra sao lưu).
ĐẠT / LỖI / CẢNH BÁO: tự kiểm; THỦ CÔNG: điều kiện máy không tự kiểm được, cần người xác nhận. Mã thoát 1 khi có LỖI.
"""

from __future__ import annotations

import asyncio
import re
import sys
from collections.abc import Awaitable, Callable
from dataclasses import dataclass

from app import preflight
from app.config import settings
from app.db import engine, fetch_all, fetch_one
from app.infra import ops_watch
from app.rbac.authz import usernames_with
from app.rbac.enforcer import get_enforcer, init_enforcer
from app.rbac.permissions import SUPER_ADMIN_ROLE
from app.seed_data import DEMO_EMAIL_DOMAIN, DEMO_PHONE_PREFIX
from app.seed_data import USERS as DEMO_USERS
from app.services.data_import.specs import DATASETS

OK, FAIL, WARN, MANUAL = "ĐẠT", "LỖI", "CẢNH BÁO", "THỦ CÔNG"
DEFAULT_ADMIN_NAMES = frozenset({"admin", "administrator", "root", "superadmin", "quantri", "quan_tri"})
MIN_APPROVERS = 2  # người duyệt cảnh báo trực 24/7 — 1 người ốm / mất liên lạc là không phát được cảnh báo
# Mã ví dụ của tệp mẫu nhập dữ liệu (CB-DST-001, CB-LL-001…) — không trùng kiểu mã thật như CB-WL-BANGGIANG
SAMPLE_CODE_RE = re.compile(r"-0*1$")
# Dữ liệu bắt buộc trước khi công bố cổng: (bảng, điều kiện, tên) — thiếu = người dân không có điểm sơ tán / số gọi
REQUIRED_DATA = [
    ("spatial_admin.administrative_units", "level = 'xa' AND geom IS NOT NULL", "ranh giới xã / phường"),
    ("resources.evacuation_sites", "TRUE", "điểm sơ tán"),
    ("iot_telemetry.hazard_zones", "source <> 'sensor'", "vùng nguy hiểm (bản đồ phân vùng)"),
    ("communications.contacts", "TRUE", "danh bạ / đường dây nóng"),
    ("iot_telemetry.monitoring_stations", "TRUE", "trạm quan trắc"),
]


@dataclass
class Item:
    status: str
    text: str


def _few(names: list[str], n: int = 5) -> str:
    return ", ".join(names[:n]) + (f" … (+{len(names) - n})" if len(names) > n else "")


async def check_config() -> list[Item]:
    out: list[Item] = []
    if settings.app_env != "production":
        out.append(Item(FAIL, f"APP_ENV={settings.app_env} — máy chủ thật phải là production"))
    errors, warnings = preflight.check(settings)
    out += [Item(FAIL, e) for e in errors]
    # Điều kiện Go: sạch cả CẢNH BÁO khởi động (Turnstile, SMTP thật, sao lưu ra ngoài, bắt buộc 2 lớp…)
    out += [Item(FAIL, f"[cảnh báo khởi động] {w}") for w in warnings]
    if settings.demo_mode or settings.simulator:
        out.append(Item(FAIL, "DEMO_MODE / SIMULATOR đang bật — số liệu trên cổng là giả"))
    return out or [Item(OK, "Kiểm tra cấu hình khi khởi động: không lỗi, không cảnh báo")]


async def check_data() -> list[Item]:
    out: list[Item] = []
    for table, where, label in REQUIRED_DATA:
        n = (await fetch_one(f"SELECT count(*) AS n FROM {table} WHERE {where}"))["n"]
        out.append(Item(OK, f"{label}: {n}") if n else Item(FAIL, f"Chưa nhập {label}"))
    if not (await fetch_one("SELECT count(*) AS n FROM resources.forces"))["n"]:
        out.append(Item(WARN, "Chưa nhập lực lượng cứu hộ — điều động SOS không có đơn vị để chọn"))

    # Trạm mực nước thiếu ngưỡng báo động chính thức → không phân loại được mức nguy hiểm cho người dân
    rows = await fetch_all(
        """SELECT name FROM iot_telemetry.monitoring_stations
            WHERE type = 'muc_nuoc' AND (coalesce(alarm_thresholds->>'bd1', '') = ''
               OR coalesce(alarm_thresholds->>'bd2', '') = '' OR coalesce(alarm_thresholds->>'bd3', '') = '')
            ORDER BY name"""
    )
    if rows:
        out.append(
            Item(
                FAIL, f"{len(rows)} trạm mực nước thiếu ngưỡng BĐ I/II/III: {_few([r['name'] for r in rows])}"
            )
        )
    # Ngưỡng đảo thứ tự / gõ nhầm (nhập trước khi công cụ nhập chặn lỗi này) → báo sai cấp báo động cho người dân.
    # CASE: chỉ ép kiểu khi cả 3 là số (Postgres không bảo đảm thứ tự tính các vế AND)
    rows = await fetch_all(
        """SELECT name FROM iot_telemetry.monitoring_stations
            WHERE type = 'muc_nuoc'
              AND CASE WHEN jsonb_typeof(alarm_thresholds->'bd1') = 'number'
                        AND jsonb_typeof(alarm_thresholds->'bd2') = 'number'
                        AND jsonb_typeof(alarm_thresholds->'bd3') = 'number'
                   THEN NOT ((alarm_thresholds->>'bd1')::float < (alarm_thresholds->>'bd2')::float
                             AND (alarm_thresholds->>'bd2')::float < (alarm_thresholds->>'bd3')::float)
                   ELSE false END
            ORDER BY name"""
    )
    if rows:
        out.append(
            Item(
                FAIL,
                f"{len(rows)} trạm mực nước có ngưỡng không tăng dần I < II < III: {_few([r['name'] for r in rows])}",
            )
        )
    fresh = await fetch_one(
        "SELECT count(DISTINCT station_id) AS n FROM iot_telemetry.sensor_readings WHERE time > now() - interval '24 hours'"
    )
    if not fresh["n"]:
        out.append(Item(WARN, 'Chưa trạm nào có số đo trong 24 giờ — cổng hiện mọi trạm "Chưa có số liệu"'))

    # Dữ liệu mẫu còn sót: tài khoản demo (trừ Superadmin ban đầu — kiểm ở phần tài khoản), SĐT mẫu (0999 …), bản ghi
    # của tệp mẫu nhập dữ liệu (mã …-001)
    demo = await fetch_all(
        """SELECT username FROM communications.users
            WHERE is_active AND (username = ANY(:names) OR email LIKE :dom) ORDER BY username""",
        {
            "names": [u[0] for u in DEMO_USERS if u[0] != settings.superadmin_username],
            "dom": f"%@{DEMO_EMAIL_DOMAIN}",
        },
    )
    if demo:
        out.append(Item(FAIL, f"Còn tài khoản demo đang hoạt động: {_few([r['username'] for r in demo])}"))
    phones = await fetch_one(
        """SELECT (SELECT count(*) FROM communications.contacts WHERE phone LIKE :p)
                + (SELECT count(*) FROM resources.evacuation_sites WHERE contact_phone LIKE :p) AS n""",
        {"p": f"{DEMO_PHONE_PREFIX} %"},
    )
    if phones["n"]:
        out.append(
            Item(
                FAIL, f"{phones['n']} danh bạ / điểm sơ tán còn SĐT mẫu {DEMO_PHONE_PREFIX} … (dữ liệu demo)"
            )
        )
    for ds in DATASETS.values():
        code = ds.get_field("ma")
        if ds.key != ("code",) or not code or not SAMPLE_CODE_RE.search(code.example or ""):
            continue
        if (await fetch_one(f"SELECT count(*) AS n FROM {ds.table} WHERE code = :c", {"c": code.example}))[
            "n"
        ]:
            out.append(
                Item(
                    FAIL,
                    f"Còn bản ghi mẫu {code.example} ({ds.label}) — từ tệp mẫu nhập dữ liệu, xoá hoặc thay",
                )
            )
    return out


async def check_accounts() -> list[Item]:
    out: list[Item] = []
    await init_enforcer()
    roles: dict[str, set[str]] = {}
    for g in get_enforcer().get_grouping_policy():
        roles.setdefault(g[0], set()).add(g[1])
    users = {
        r["username"]: r
        for r in await fetch_all(
            """SELECT username, is_active, totp_enabled_at IS NOT NULL AS totp, pin_hash IS NOT NULL AS has_pin,
                      password_changed_at IS NOT NULL AS changed
                 FROM communications.users"""
        )
    }
    active = {u for u, r in users.items() if r["is_active"]}

    must_2fa = settings.totp_required_role_set | {SUPER_ADMIN_ROLE}
    no_totp = sorted(u for u in active if roles.get(u, set()) & must_2fa and not users[u]["totp"])
    if no_totp:
        out.append(Item(FAIL, f"Chưa cài xác thực 2 lớp (vai trò bắt buộc): {_few(no_totp)}"))
    else:
        out.append(Item(OK, "Superadmin và vai trò bắt buộc 2 lớp đều đã cài xác thực 2 lớp"))

    first = settings.superadmin_username
    if first in active and first.lower() in DEFAULT_ADMIN_NAMES:
        out.append(
            Item(
                FAIL,
                f'Tài khoản quản trị ban đầu "{first}" (tên dễ đoán) còn hoạt động — tạo Superadmin đích '
                "danh rồi khoá tài khoản này",
            )
        )
    supers = sorted(u for u in active if SUPER_ADMIN_ROLE in roles.get(u, set()) and not users[u]["changed"])
    if supers:
        out.append(Item(WARN, f"Superadmin chưa đổi mật khẩu ban đầu: {_few(supers)}"))

    approvers = sorted(u for u in usernames_with("alert", "approve") if u in active and users[u]["has_pin"])
    if len(approvers) >= MIN_APPROVERS:
        out.append(Item(OK, f"{len(approvers)} người duyệt cảnh báo toàn tỉnh có PIN: {_few(approvers)}"))
    else:
        out.append(
            Item(
                FAIL,
                f"Chỉ {len(approvers)} người duyệt cảnh báo toàn tỉnh có PIN (cần ≥ {MIN_APPROVERS} người "
                "trực 24/7, không tính người soạn)",
            )
        )
    out.append(
        Item(MANUAL, "Superadmin và người duyệt đã đổi PIN ban đầu (hệ thống không lưu thời điểm đổi PIN)")
    )
    return out


async def check_backup() -> list[Item]:
    base = ops_watch.BACKUP_DIR
    if not base.is_dir():
        return [
            Item(
                FAIL,
                f"Không thấy {base} — chạy trong container worker: dcp exec -T worker python -m app.golive",
            )
        ]
    out: list[Item] = []
    if not any((base / "db").glob("*.dump")):
        out.append(Item(FAIL, "Chưa có bản sao lưu CSDL nào (backups/db) — xem dcp logs backup"))
    else:
        out += [Item(OK if c.ok else FAIL, c.detail) for c in await ops_watch.check_backup()]
    if not settings.backup_remote:
        out.append(Item(FAIL, "BACKUP_REMOTE chưa đặt — bản sao lưu chỉ nằm trên chính máy chủ này"))
    elif not ops_watch.OFFSITE_MARKER.is_file():
        out.append(
            Item(FAIL, f"Chưa chép sao lưu ra {settings.backup_remote} lần nào — xem dcp logs backup-offsite")
        )
    else:
        out += [Item(OK if c.ok else FAIL, c.detail) for c in await ops_watch.check_offsite()]
    out.append(
        Item(
            MANUAL,
            "Đã diễn tập khôi phục thành công trên MÁY KHÁC: deploy/restore-drill.sh — ghi thời gian "
            "vào docs/GO-LIVE.md",
        )
    )
    return out


async def check_monitoring() -> list[Item]:
    out: list[Item] = []
    for fn in (
        ops_watch.check_db,
        ops_watch.check_redis,
        ops_watch.check_worker,
        ops_watch.check_api,
        ops_watch.check_disk,
    ):
        try:
            out += [Item(OK if c.ok else FAIL, c.detail) for c in await fn()]
        except Exception as exc:  # noqa: BLE001 — báo đúng kiểm tra bị lỗi, chạy tiếp các kiểm tra khác
            out.append(Item(FAIL, f"{fn.__name__}: {exc}"))
    if not settings.smtp_host or not ops_watch.recipients():
        out.append(
            Item(FAIL, "Chưa có SMTP / người nhận email sự cố (OPS_ALERT_EMAILS hoặc SUPERADMIN_EMAIL)")
        )
    if not settings.ops_alert_webhook_url:
        out.append(
            Item(WARN, "Chỉ báo sự cố qua email — SMTP lỗi thì không ai biết; đặt thêm OPS_ALERT_WEBHOOK_URL")
        )
    out.append(
        Item(
            MANUAL,
            "Giám sát đặt NGOÀI máy chủ gọi https://<tên miền>/health/full mỗi phút (UptimeRobot, Uptime "
            "Kuma máy khác, hoặc deploy/external-monitor.sh) và đã thử nhận báo",
        )
    )
    return out


SECTIONS: list[tuple[str, Callable[[], Awaitable[list[Item]]]]] = [
    ("2. Cấu hình", check_config),
    ("3. Dữ liệu", check_data),
    ("4. Tài khoản", check_accounts),
    ("5. Sao lưu", check_backup),
    ("6. Giám sát", check_monitoring),
]


async def run() -> list[tuple[str, list[Item]]]:
    results = []
    for title, fn in SECTIONS:
        try:
            items = await fn()
        except Exception as exc:  # noqa: BLE001 — 1 phần lỗi không che các phần khác
            items = [Item(FAIL, f"Không kiểm tra được: {exc}")]
        results.append((title, items))
    results.append(
        (
            "7. Kiểm thử trên máy thật",
            [
                Item(MANUAL, "deploy/golive-check.sh <tên miền>: HTTPS / HSTS + 5 kịch bản đối kháng đạt"),
                Item(MANUAL, "Kiểm thử tải k6 (tests/load) đạt trên máy chủ thật — 10% dân số trong 1 giờ"),
                Item(
                    MANUAL,
                    "BCH có văn bản: hệ thống CHƯA là kênh cảnh báo chính thức tới khi tích hợp SMS / Cell Broadcast",
                ),
            ],
        )
    )
    return results


def main() -> int:
    results = asyncio.run(_main())
    fails = sum(i.status == FAIL for _, items in results for i in items)
    warns = sum(i.status == WARN for _, items in results for i in items)
    for title, items in results:
        print(f"\n== {title}")
        for i in items:
            print(f"{i.status:<9} {i.text}")
    verdict = "NO-GO" if fails else "GO (sau khi xác nhận các mục THỦ CÔNG)"
    print(f"\n{fails} LỖI, {warns} CẢNH BÁO → {verdict}")
    return 1 if fails else 0


async def _main() -> list[tuple[str, list[Item]]]:
    try:
        return await run()
    finally:
        await engine.dispose()


if __name__ == "__main__":
    sys.exit(main())
