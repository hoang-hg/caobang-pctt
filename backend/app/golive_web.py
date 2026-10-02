"""Kiểm tra Go / No-Go TỪ BÊN NGOÀI qua địa chỉ công khai (docs/GO-LIVE.md, điều kiện 7): HTTPS / HSTS, header an
toàn, /health/full, Swagger tắt, và 5 kịch bản đối kháng T1–T5 (lộ dữ liệu người báo, lớp nội bộ trên bản đồ công khai,
tra cứu xác nhận mã có thật, ảnh chưa duyệt / không chữ ký / còn EXIF, API nội bộ không đăng nhập).

    dcp exec -T worker python -m app.golive_web https://pctt.caobang.gov.vn     # deploy/golive-check.sh gọi sẵn
    docker run --rm <image backend> python -m app.golive_web https://…          # từ máy khác (bỏ qua kiểm tra cần CSDL)

Chỉ ĐỌC, trừ 2 lần tra cứu sai (T3): SĐT giả ngẫu nhiên + mã không tồn tại + 1 phiếu đã đóng quá 7 ngày — tính vào giới
hạn chống dò của các mã đó, không khoá tra cứu của người đang chờ cứu hộ.
Mã thoát 1 khi có LỖI.
"""

from __future__ import annotations

import asyncio
import io
import re
import secrets
import sys
from urllib.parse import urlsplit

import httpx
from PIL import Image

from app.golive import FAIL, MANUAL, OK, WARN, Item

PUBLIC_MAP_KEYS = {
    "blocked_roads",
    "evacuation_sites",
    "hazard_points",
    "hazard_zones",
    "landslides",
    "reports",
    "reservoirs",
    "stations",
}
REPORT_PRIVATE = re.compile(r"reporter|phone|ip_hash|email|moderated_by|track_key|reject_reason")
MAP_PRIVATE = re.compile(r"force|vehicle|warehouse|inventory|commander|personnel|reporter")
INTERNAL_APIS = [
    "sos",
    "reports",
    "resources/forces",
    "resources/warehouses",
    "alerts/contacts",
    "alerts/broadcasts",
    "rbac/users",
    "data-import/submissions",
    "integrations/devices",
    "dashboard/logs",
    "map/storm-track",
]
HSTS_MIN_S = 180 * 86400


def image_metadata(data: bytes) -> list[str]:
    """Siêu dữ liệu còn sót trong ảnh công khai: EXIF (GPS, máy), XMP (có thể chứa lại toạ độ), comment JPEG (địa chỉ…).
    services/reports.process_image phải xoá hết. Không đọc được ảnh → báo luôn để người kiểm tra mở xem."""
    try:
        info = Image.open(io.BytesIO(data)).info
    except Exception:  # noqa: BLE001 — trang lỗi / không phải ảnh
        return ["không đọc được ảnh"]
    return sorted(k for k in ("exif", "xmp", "comment") if info.get(k)) + (
        ["Exif"] if b"Exif" in data[:65536] else []
    )


def _keys(obj) -> set[str]:
    """Mọi tên trường trong JSON (lồng nhau)."""
    out: set[str] = set()
    if isinstance(obj, dict):
        for k, v in obj.items():
            out.add(k)
            out |= _keys(v)
    elif isinstance(obj, list):
        for v in obj:
            out |= _keys(v)
    return out


async def _db_value(sql: str) -> str | None:
    """Giá trị cột "v" của dòng đầu — cần CSDL (chạy trong container worker); chạy từ máy khác → None."""
    try:
        from app.db import fetch_one

        row = await fetch_one(sql)
        return row["v"] if row else None
    except Exception:  # noqa: BLE001 — không có CSDL
        return None


# T4: phản ánh chờ duyệt có ảnh (ảnh chưa duyệt không được xem công khai)
PENDING_PHOTO_SQL = """SELECT id::text AS v FROM community.citizen_reports
                        WHERE status = 'cho_duyet' AND jsonb_array_length(photos) > 0 LIMIT 1"""
# T3: mã phiếu CÓ THẬT để so với mã không tồn tại. Tra cứu sai được tính vào giới hạn chống dò của mã → chỉ dùng phiếu
# đã đóng quá 7 ngày (không khoá tra cứu của người đang chờ cứu hộ)
OLD_CLOSED_CODE_SQL = """SELECT code AS v FROM (
        SELECT code, resolved_at AS t FROM operations.sos_tickets WHERE status = 'hoan_thanh'
        UNION ALL
        SELECT code, created_at FROM community.citizen_reports WHERE status IN ('da_xu_ly', 'tu_choi')
    ) x WHERE t < now() - interval '7 days' ORDER BY random() LIMIT 1"""


async def check_transport(c: httpx.AsyncClient, base: str) -> list[Item]:
    out: list[Item] = []
    if not base.startswith("https://"):
        return [Item(FAIL, f"{base} không phải HTTPS")]
    r = await c.get(base + "/")
    out.append(Item(OK if r.status_code == 200 else FAIL, f"Trang chủ qua HTTPS: HTTP {r.status_code}"))
    hsts = r.headers.get("strict-transport-security", "")
    age = int(m[1]) if (m := re.search(r"max-age=(\d+)", hsts)) else 0
    out.append(
        Item(OK, f"HSTS: {hsts}")
        if age >= HSTS_MIN_S
        else Item(FAIL, f"HSTS thiếu hoặc quá ngắn (cần max-age ≥ {HSTS_MIN_S}): {hsts or 'không có'}")
    )
    for h, want in (("x-content-type-options", "nosniff"), ("content-security-policy", "default-src")):
        v = r.headers.get(h, "")
        out.append(Item(OK if want in v else FAIL, f"Header {h}: {v[:60] or 'không có'}"))
    host = urlsplit(base).netloc
    try:
        plain = await c.get(f"http://{host}/", follow_redirects=False)
        loc = plain.headers.get("location", "")
        ok = plain.status_code in (301, 302, 307, 308) and loc.startswith("https://")
        out.append(Item(OK if ok else FAIL, f"http:// chuyển sang https://: HTTP {plain.status_code} {loc}"))
    except httpx.HTTPError as exc:
        out.append(Item(WARN, f"Không gọi được http://{host} ({exc.__class__.__name__}) — cổng 80 đóng?"))
    return out


async def check_service(c: httpx.AsyncClient, base: str) -> list[Item]:
    out: list[Item] = []
    r = await c.get(base + "/health/full")
    body = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
    bad = [k for k, v in (body.get("checks") or {}).items() if not v]
    out.append(
        Item(OK, "/health/full: 200, mọi kiểm tra đạt")
        if r.status_code == 200
        else Item(FAIL, f"/health/full: HTTP {r.status_code}, lỗi: {', '.join(bad) or '?'}")
    )
    # Swagger / OpenAPI: nginx không chuyển các đường dẫn này tới backend (trả trang giao diện) — kiểm tra NỘI DUNG
    for path in ("/docs", "/openapi.json", "/redoc", "/api/v1/docs", "/api/v1/openapi.json"):
        r = await c.get(base + path)
        exposed = r.status_code == 200 and re.search(r"swagger-ui|redoc|\"openapi\"\s*:", r.text[:5000], re.I)
        out.append(
            Item(
                FAIL if exposed else OK,
                f"{path}: {'LỘ tài liệu API' if exposed else f'không có Swagger (HTTP {r.status_code})'}",
            )
        )
    code = (await c.get(f"{base}/api/v1/auth/demo-accounts")).status_code
    out.append(Item(OK if code == 404 else FAIL, f"/api/v1/auth/demo-accounts: HTTP {code} (phải 404)"))
    lite = await c.get(base + "/ban-nhe")
    out.append(
        Item(
            OK if lite.status_code == 200 and len(lite.content) < 50_000 else FAIL,
            f"/ban-nhe: HTTP {lite.status_code}, {len(lite.content) // 1024} KB (mạng yếu: < 50 KB)",
        )
    )
    a = await c.get(base + "/api/v1/public/overview")
    b = await c.get(base + "/api/v1/public/overview")
    cache = b.headers.get("x-cache-status")
    out.append(
        Item(OK, f"Cache nginx cho API công khai: {a.headers.get('x-cache-status')} → {cache}")
        if cache and cache != "MISS"
        else Item(
            WARN,
            f"API công khai không qua cache nginx (X-Cache-Status: {cache}) — cao điểm sẽ dồn vào backend",
        )
    )
    return out


async def check_red_team(c: httpx.AsyncClient, base: str) -> list[Item]:
    out: list[Item] = []
    api = base + "/api/v1"

    # T1. Phản ánh công khai không lộ người báo
    reports = (await c.get(f"{api}/public/reports", params={"hours": 720})).json()
    leak = sorted(k for k in _keys(reports) if REPORT_PRIVATE.search(k))
    out.append(
        Item(
            OK if not leak else FAIL,
            f"T1 phản ánh công khai: {len(reports)} bản, trường nhạy cảm: {leak or 'không'}",
        )
    )

    # T2. Bản đồ công khai: đúng các lớp công khai, không lực lượng / kho / phương tiện / người báo
    pmap = (await c.get(f"{api}/public/map")).json()
    extra, leak = set(pmap) - PUBLIC_MAP_KEYS, sorted(k for k in _keys(pmap) if MAP_PRIVATE.search(k))
    out.append(
        Item(
            OK if not extra and not leak else FAIL,
            f"T2 bản đồ công khai: lớp lạ {sorted(extra) or 'không'}, trường nội bộ {leak or 'không'}",
        )
    )

    # T3. Tra cứu sai SĐT: mã có thật và mã không tồn tại trả GIỐNG HỆT nhau (không xác nhận mã có thật).
    # SĐT giả ngẫu nhiên mỗi lần chạy → chạy lại nhiều lần không bị giới hạn chống dò theo SĐT
    phone = f"0900{secrets.randbelow(10**6):06d}"

    async def track(code: str) -> tuple | None:
        r = await c.post(f"{api}/public/track", json={"code": code, "phone": phone})
        if r.status_code == 429:
            return None
        d = r.json()
        return d.get("total"), d.get("verified"), len(d.get("results") or [])

    real = await _db_value(OLD_CLOSED_CODE_SQL)
    t_none = await track("SOS-9999999")
    t_real = await track(real) if real else t_none
    if t_none is None or t_real is None:
        out.append(
            Item(
                WARN,
                "T3 tra cứu đang bị giới hạn chống dò (đã chạy kiểm tra nhiều lần trong 1 giờ) — chạy lại sau",
            )
        )
    else:
        same = t_real == t_none == (0, False, 0)
        note = (
            f"mã có thật {real}: {t_real} = mã không tồn tại: {t_none}"
            if real
            else f"mã không tồn tại: {t_none}"
        )
        out.append(Item(OK if same else FAIL, f"T3 tra cứu sai SĐT — {note}"))
        if not real:
            out.append(
                Item(
                    WARN,
                    "T3 chưa có phiếu đã đóng quá 7 ngày để so (hoặc chạy ngoài máy chủ) — mới thử mã không tồn tại",
                )
            )

    # T4. Ảnh: công khai không còn EXIF; link nội bộ phải có chữ ký; ảnh chưa duyệt không xem được
    with_photo = next((r for r in reports if r.get("photos")), None)
    if with_photo:
        img = await c.get(base + with_photo["photos"][0]["full"])
        meta = image_metadata(img.content)
        out.append(
            Item(
                OK if img.status_code == 200 and not meta else FAIL,
                f"T4 ảnh công khai {with_photo['code']}: siêu dữ liệu còn sót {meta or 'không'} (EXIF / XMP / comment)",
            )
        )
        fake = await c.get(
            f"{api}/reports/{with_photo['id']}/photos/0",
            params={"thumb": 0, "exp": 9999999999, "sig": "0" * 32},
        )
        out.append(
            Item(
                OK if fake.status_code == 403 else FAIL,
                f"T4 link ảnh nội bộ chữ ký giả: HTTP {fake.status_code} (phải 403)",
            )
        )
    else:
        out.append(Item(WARN, "T4 chưa có phản ánh đã duyệt kèm ảnh — thử lại sau khi có"))
    pending = await _db_value(PENDING_PHOTO_SQL)
    if pending:
        code = (await c.get(f"{api}/public/reports/{pending}/photos/0")).status_code
        out.append(
            Item(
                OK if code == 404 else FAIL,
                f"T4 ảnh phản ánh chưa duyệt qua API công khai: HTTP {code} (phải 404)",
            )
        )
    else:
        out.append(
            Item(
                WARN,
                "T4 không có phản ánh chờ duyệt kèm ảnh (hoặc chạy ngoài máy chủ) — bỏ qua ảnh chưa duyệt",
            )
        )

    # T5. API nội bộ đóng với người chưa đăng nhập
    open_apis = []
    for p in INTERNAL_APIS:
        code = (await c.get(f"{api}/{p}")).status_code
        if code != 401:
            open_apis.append(f"{p}={code}")
    out.append(
        Item(
            OK if not open_apis else FAIL,
            f"T5 {len(INTERNAL_APIS)} API nội bộ không đăng nhập: {open_apis or 'đều 401'}",
        )
    )
    return out


async def run(base: str) -> list[tuple[str, list[Item]]]:
    base = base.rstrip("/")
    results = []
    async with httpx.AsyncClient(
        timeout=20, follow_redirects=True, headers={"User-Agent": "pctt-golive-check"}
    ) as c:
        for title, fn in (
            ("7a. HTTPS & header an toàn", check_transport),
            ("7b. Dịch vụ", check_service),
            ("7c. Kịch bản đối kháng T1–T5", check_red_team),
        ):
            try:
                items = await fn(c, base)
            except Exception as exc:  # noqa: BLE001 — 1 phần lỗi không che các phần khác
                items = [Item(FAIL, f"Không kiểm tra được: {exc.__class__.__name__}: {exc}")]
            results.append((title, items))
    try:
        from app.db import engine

        await engine.dispose()
    except Exception:  # noqa: BLE001, S110 — không có CSDL (chạy từ máy khác)
        pass
    results.append(
        (
            "7d. Còn lại",
            [
                Item(
                    MANUAL,
                    "Giao diện trên máy thật (chỉ xem): cd tests/ui && UI_READONLY=1 UI_USER=… UI_PASS=… "
                    f"node ui-test.mjs {base}",
                ),
                Item(MANUAL, "Kiểm thử tải k6 (README 12.2) trên máy chủ thật"),
            ],
        )
    )
    return results


def main() -> int:
    if len(sys.argv) != 2:
        print("Cách dùng: python -m app.golive_web https://<tên miền>")
        return 2
    results = asyncio.run(run(sys.argv[1]))
    fails = sum(i.status == FAIL for _, items in results for i in items)
    warns = sum(i.status == WARN for _, items in results for i in items)
    for title, items in results:
        print(f"\n== {title}")
        for i in items:
            print(f"{i.status:<9} {i.text}")
    print(f"\n{fails} LỖI, {warns} CẢNH BÁO → {'NO-GO' if fails else 'GO'} (phần kiểm tra từ bên ngoài)")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
