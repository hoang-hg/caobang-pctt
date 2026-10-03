"""Trang bản nhẹ cho mạng yếu (/ban-nhe, README 9.4): HTML thuần do máy chủ dựng — không JavaScript, không ảnh, không
tải thêm tệp nào, luôn < 50 KB (gzip còn ~10 KB). Mở được trên điện thoại cũ, mạng 2G, khi cổng đầy đủ quá nặng.

Nội dung: cảnh báo đang hiệu lực (48 giờ), sông vượt báo động, đường dây nóng; chọn xã (form GET) → mức nguy cơ, vùng
nguy hiểm, mưa dự báo 24 giờ, điểm sơ tán của xã. Chỉ dữ liệu đã công khai trên cổng (app/api/v1/public.py).
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from html import escape

from app.db import fetch_all, fetch_one
from app.services.broadcast import active_alert_sql
from app.services.data_import.parsing import strip_accents
from app.services.readings import LATEST_COLS, LATEST_JOIN
from app.services.simulator import alarm_level

MAX_ALERTS = 8
MAX_ALERT_CHARS = 700
MAX_HAZARDS = 10
MAX_SITES = 25
MAX_RIVERS = 20
MAX_BYTES = 50_000
VN_TZ = timezone(timedelta(hours=7))  # Việt Nam không đổi giờ theo mùa

NATIONAL_HOTLINES = [
    {"number": "112", "name": "Tìm kiếm cứu nạn"},
    {"number": "114", "name": "Cứu nạn cứu hộ – Phòng cháy chữa cháy"},
    {"number": "115", "name": "Cấp cứu y tế"},
    {"number": "113", "name": "Công an"},
]
RISK_LABEL = {"cao": "NGUY CƠ CAO", "trung_binh": "Nguy cơ trung bình", "thap": "Nguy cơ thấp"}
RISK_ADVICE = {
    "cao": "Bạn đang ở trong vùng nguy hiểm. Di chuyển ngay đến điểm sơ tán an toàn gần nhất, gọi 112 nếu cần trợ giúp.",
    "trung_binh": "Theo dõi sát cảnh báo, chuẩn bị đồ dùng thiết yếu, sẵn sàng sơ tán khi có lệnh.",
    "thap": "Chưa ghi nhận nguy cơ tại vị trí của bạn. Tiếp tục theo dõi thông tin chính thức.",
}
SEVERITY = {"do": "Rất cao", "cam": "Cao", "vang": "Trung bình"}
HAZARD = {"sat_lo": "Sạt lở", "ngap": "Ngập lụt", "lu_quet": "Lũ quét"}
SITE_TYPE = {
    "truong_hoc": "Trường học",
    "nha_van_hoa": "Nhà văn hoá",
    "tru_so": "Trụ sở",
    "doanh_trai": "Doanh trại",
}
RIVER_LEVEL = ["Dưới báo động I", "Trên báo động I", "Trên báo động II", "Trên báo động III"]

ACTIVE_ALERTS_SQL = (
    """
SELECT b.code, b.title, b.message_body, b.severity, COALESCE(b.sent_at, b.approved_at) AS issued_at,
       b.target_admin_codes {extra}
  FROM communications.alert_broadcasts b
 WHERE """
    + active_alert_sql("b")
    + """
 ORDER BY (b.severity = 'do') DESC, COALESCE(b.sent_at, b.approved_at) DESC"""
)


async def province_hotlines() -> list[dict]:
    """Số trực ban cấp tỉnh (cổng công khai, bản nhẹ, link nhiệm vụ). So khớp tên cơ quan không dấu, không phân biệt hoa
    thường — trước đây phải trùng đúng chữ ("Văn phòng Thường trực BCH PCTT&TKCN tỉnh Cao Bằng" trong tệp danh bạ là mất
    số trực ban ở mọi nơi). Văn phòng thường trực trước, rồi Ban chỉ huy PCTT tỉnh."""
    return await fetch_all(
        """SELECT org, position, phone FROM communications.contacts
            WHERE level = 'tinh'
              AND (spatial_admin.norm(org) LIKE '%thuong truc%' OR spatial_admin.norm(org) LIKE '%pctt%'
                   OR spatial_admin.norm(org) LIKE '%ban chi huy%')
            ORDER BY (spatial_admin.norm(org) LIKE '%thuong truc%') DESC, sort LIMIT 2"""
    )


async def communes() -> list[dict]:
    rows = await fetch_all("SELECT code, name FROM spatial_admin.administrative_units WHERE level = 'xa'")
    return sorted(rows, key=lambda r: strip_accents(r["name"]).lower())


async def build(code: str | None) -> str:
    """HTML trang bản nhẹ; `code` là mã xã đã kiểm tra hợp lệ (None = toàn tỉnh)."""
    units = await communes()
    unit = next((u for u in units if u["code"] == code), None)
    if unit:
        alerts = await fetch_all(
            ACTIVE_ALERTS_SQL.format(
                extra=""", (:code = ANY(b.target_admin_codes) OR ST_Intersects(b.target_polygon,
                   (SELECT geom FROM spatial_admin.administrative_units WHERE code = :code))) AS here"""
            ),
            {"code": unit["code"]},
        )
    else:
        alerts = await fetch_all(ACTIVE_ALERTS_SQL.format(extra=", true AS here"))
    rivers = await fetch_all(
        f"""SELECT s.name, s.unit, s.alarm_thresholds AS thr, {LATEST_COLS}
              FROM iot_telemetry.monitoring_stations s {LATEST_JOIN}
             WHERE s.type = 'muc_nuoc' ORDER BY s.name"""
    )
    # Chỉ liệt kê sông vượt báo động (không khẳng định "an toàn"); chưa có số đo → không liệt kê
    rivers = [
        r | {"level": alarm_level(r["value"], r["thr"] or {}) if r["value"] is not None else 0}
        for r in rivers
    ]
    now = (await fetch_one("SELECT now() AS t"))["t"]
    commune = await _commune(unit, alerts) if unit else None
    return render(
        units=units,
        unit=unit,
        alerts=alerts,
        rivers=sorted((r for r in rivers if r["level"] >= 1), key=lambda r: -r["level"])[:MAX_RIVERS],
        commune=commune,
        hotlines=await province_hotlines(),
        now=now,
    )


async def _commune(unit: dict, alerts: list[dict]) -> dict:
    params = {"code": unit["code"]}
    hazards = await fetch_all(
        """SELECT z.type, z.level, z.name FROM iot_telemetry.hazard_zones z, spatial_admin.administrative_units u
            WHERE u.code = :code AND z.valid_until > now() AND z.geom && u.geom AND ST_Intersects(z.geom, u.geom)
            ORDER BY (z.level = 'do') DESC, z.name LIMIT :n""",
        params | {"n": MAX_HAZARDS},
    )
    forecast = await fetch_one(
        """SELECT round(sum(a.precip_p50)::numeric, 1)::float AS p50, round(sum(a.precip_p90)::numeric, 1)::float AS p90
             FROM iot_telemetry.area_forecasts a JOIN spatial_admin.administrative_units u ON u.id = a.admin_unit_id
            WHERE u.code = :code AND a.model = 'BLEND' AND a.time > now() AND a.time <= now() + interval '24 hours'""",
        params,
    )
    sites = await fetch_all(
        """SELECT e.name, e.site_type, e.capacity, e.current_occupancy, e.contact_phone AS hotline,
                  round(ST_Y(e.location)::numeric, 5)::float AS lat, round(ST_X(e.location)::numeric, 5)::float AS lon
             FROM resources.evacuation_sites e JOIN spatial_admin.administrative_units u ON u.id = e.admin_unit_id
            WHERE u.code = :code
            ORDER BY (e.current_occupancy < e.capacity) DESC, e.capacity DESC LIMIT :n""",
        params | {"n": MAX_SITES},
    )
    here = [a for a in alerts if a["here"]]
    if any(h["level"] == "do" for h in hazards) or any(a["severity"] == "do" for a in here):
        risk = "cao"
    elif hazards or here or (forecast and (forecast["p50"] or 0) >= 50):
        risk = "trung_binh"
    else:
        risk = "thap"
    return {"risk": risk, "hazards": hazards, "forecast": forecast, "sites": sites}


# ------------------------------------------------------------------------------------------------ HTML

CSS = (
    "body{font:16px/1.45 system-ui,sans-serif;margin:0 auto;max-width:640px;padding:8px 12px;color:#111;background:#fff}"
    "h1{font-size:19px;margin:6px 0}h2{font-size:17px;margin:18px 0 6px;border-bottom:2px solid #c00}"
    "a{color:#0645ad}.m{color:#555;font-size:14px}.b{border:2px solid #999;border-radius:6px;padding:8px;margin:8px 0}"
    ".do{border-color:#c00;background:#fee}.cam{border-color:#e60;background:#fff3e8}.vang{border-color:#ca0;background:#ffd}"
    "ul{padding-left:20px;margin:4px 0}li{margin:5px 0}select,button{font-size:16px;padding:6px;margin:4px 0}"
    ".t{display:inline-block;font-size:18px;font-weight:bold;padding:6px 12px;margin:3px 4px 3px 0;background:#c00;"
    "color:#fff;border-radius:6px;text-decoration:none}"
)


def _time(t: datetime) -> str:
    return t.astimezone(VN_TZ).strftime("%H:%M %d/%m")


def _trim(text: str, n: int) -> str:
    return text if len(text) <= n else text[: n - 1].rstrip() + "…"


def _num(v: float) -> str:
    return f"{v:g}".replace(".", ",")  # 181,08 — dấu thập phân kiểu Việt Nam


def render(*, units, unit, alerts, rivers, commune, hotlines, now) -> str:
    e = escape
    out: list[str] = [
        '<!doctype html><html lang="vi"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1">'
        f"<title>Cảnh báo thiên tai Cao Bằng – bản nhẹ</title><style>{CSS}</style></head><body>",
        "<h1>Cảnh báo thiên tai tỉnh Cao Bằng</h1>",
        f'<p class="m">Bản nhẹ cho mạng yếu · Cập nhật {_time(now)} · <a href="/">Bản đầy đủ (bản đồ)</a></p>',
        '<p><a class="t" href="tel:112">Gọi 112</a><a class="t" href="tel:114">114</a><a class="t" href="tel:115">115</a></p>',
    ]

    # Chọn xã
    options = "".join(
        f'<option value="{e(u["code"])}"{" selected" if unit and u["code"] == unit["code"] else ""}>{e(u["name"])}</option>'
        for u in units
    )
    out.append(
        '<form method="get" action="/ban-nhe"><label for="xa"><b>Xã / phường của bạn:</b></label><br>'
        f'<select id="xa" name="xa"><option value="">— Toàn tỉnh —</option>{options}</select> '
        "<button>Xem</button></form>"
    )

    if commune:
        risk = commune["risk"]
        out.append(
            f'<h2>{e(unit["name"])}</h2><div class="b {"do" if risk == "cao" else "cam" if risk == "trung_binh" else ""}">'
        )
        out.append(f"<b>{RISK_LABEL[risk]}</b><br>{e(RISK_ADVICE[risk])}</div>")
        if commune["hazards"]:
            items = "".join(
                f"<li>{HAZARD.get(h['type'], e(h['type']))} – {e(h['name'] or '')} (mức {SEVERITY.get(h['level'], e(h['level']))})</li>"
                for h in commune["hazards"]
            )
            out.append(f"<p><b>Vùng nguy hiểm trong xã:</b></p><ul>{items}</ul>")
        fc = commune["forecast"]
        if fc and fc["p50"] is not None:
            out.append(
                f"<p><b>Mưa dự báo 24 giờ tới:</b> khoảng {_num(fc['p50'])} mm "
                f"(có thể tới {_num(fc['p90'] or fc['p50'])} mm)</p>"
            )

    # Cảnh báo
    shown = [a for a in alerts if a["here"]][:MAX_ALERTS]
    other = sum(1 for a in alerts if not a["here"])
    out.append(
        f"<h2>Cảnh báo đang hiệu lực{' tại xã' if unit else ''} ({len([a for a in alerts if a['here']])})</h2>"
    )
    if not shown:
        out.append("<p>Không có cảnh báo trong 48 giờ qua.</p>")
    for a in shown:
        out.append(
            f'<div class="b {e(a["severity"])}"><b>{e(a["title"])}</b><br>'
            f'<span class="m">Mức {SEVERITY.get(a["severity"], e(a["severity"]))} · {_time(a["issued_at"])} · {e(a["code"])}</span>'
            f"<br>{e(_trim(a['message_body'], MAX_ALERT_CHARS))}</div>"
        )
    if unit and other:
        out.append(
            f'<p class="m">{other} cảnh báo khác trong tỉnh — <a href="/ban-nhe">xem toàn tỉnh</a></p>'
        )

    if rivers:
        items = "".join(
            f"<li><b>{e(r['name'])}</b>: {_num(r['value'])} {e(r['unit'] or 'm')} – {RIVER_LEVEL[r['level']]}"
            + (f" (số đo lúc {_time(r['time'])}, trạm mất tín hiệu)" if r.get("stale") else "")
            + "</li>"
            for r in rivers
        )
        out.append(f"<h2>Sông suối vượt báo động</h2><ul>{items}</ul>")

    if commune:
        out.append(f"<h2>Điểm sơ tán tại {e(unit['name'])}</h2>")
        if not commune["sites"]:
            out.append("<p>Chưa có điểm sơ tán được công bố cho xã này — liên hệ UBND xã hoặc gọi 112.</p>")
        items = []
        for s in commune["sites"]:
            free = max((s["capacity"] or 0) - (s["current_occupancy"] or 0), 0)
            kind = SITE_TYPE.get(s["site_type"], "")
            phone = s.get("hotline")  # số trực điểm sơ tán — công khai (README 9.1)
            call = f' · <a href="tel:{e("".join(phone.split()))}">Gọi {e(phone)}</a>' if phone else ""
            items.append(
                f"<li><b>{e(s['name'])}</b>{' – ' + kind if kind else ''}"
                f"<br>{'Còn chỗ ' + str(free) if free else 'Đã đầy'} / sức chứa {s['capacity'] or 0} người · "
                f'<a href="https://www.google.com/maps/dir/?api=1&amp;destination={s["lat"]},{s["lon"]}">Chỉ đường</a>'
                f"{call}</li>"
            )
        if items:
            out.append(f"<ul>{''.join(items)}</ul>")
    else:
        out.append('<p class="m">Chọn xã ở trên để xem mức nguy cơ và điểm sơ tán gần bạn.</p>')

    lines = [
        f'<li><a href="tel:{h["number"]}">{h["number"]}</a> – {h["name"]}</li>' for h in NATIONAL_HOTLINES
    ]
    lines += [
        f'<li><a href="tel:{e(h["phone"])}">{e(h["phone"])}</a> – {e(h["org"])}{", " + e(h["position"]) if h["position"] else ""}</li>'
        for h in hotlines
        if h["phone"]
    ]
    out.append(f"<h2>Đường dây nóng</h2><ul>{''.join(lines)}</ul>")
    out.append(
        '<p class="m">Nguồn: Ban Chỉ huy PCTT &amp; TKCN tỉnh Cao Bằng. Tải lại trang để cập nhật. '
        '<a href="/">Mở bản đầy đủ</a> để xem bản đồ, gửi phản ánh, tra cứu cứu hộ.</p></body></html>'
    )
    return "".join(out)
