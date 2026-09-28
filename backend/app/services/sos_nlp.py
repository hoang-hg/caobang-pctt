"""Bóc tách tin nhắn cầu cứu phi cấu trúc → JSON (địa điểm, số người, loại sự cố, mức ưu tiên).

Mặc định dùng bộ luật (regex + từ điển địa danh) để chạy offline. Nếu cấu hình LLM_API_URL/KEY,
hệ thống gọi thêm mô hình ngôn ngữ (API dạng OpenAI-compatible) và ưu tiên kết quả của mô hình.
"""

import json
import logging
import re
import time
import unicodedata

import httpx

from app.config import settings
from app.db import fetch_all
from app.infra.redis import get_redis

log = logging.getLogger(__name__)


def norm(text: str) -> str:
    s = text.replace("đ", "d").replace("Đ", "D")
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", s.lower()).strip()


INCIDENT_KEYWORDS = [
    ("sap_nha", ["sap nha", "nha sap", "do nha", "sap do"]),
    ("sat_lo", ["sat lo", "sat nui", "lo dat", "dat da", "vui lap", "sut lun", "nut nha", "nut dat"]),
    ("lu_quet", ["lu quet", "cuon troi", "nuoc suoi dang", "suoi dang"]),
    ("cap_cuu", ["cap cuu", "bi thuong", "thuong nang", "sap sinh", "chuyen da", "bat tinh", "benh nang"]),
    ("tiep_te", ["het luong thuc", "het gao", "nuoc sach", "tiep te", "thieu an", "het do an"]),
    ("ngap_lut", ["ngap", "nuoc len", "lu ", "nuoc dang", "mai nha", "tren gac"]),
]

VULNERABLE_KEYWORDS = {
    "nguoi_gia": ["cu gia", "nguoi gia", "cu ong", "cu ba", "80 tuoi", "90 tuoi"],
    "tre_em": ["tre em", "tre nho", "em be", "chau nho"],
    "thuong_nang": ["thuong nang", "bi thuong", "bat tinh"],
    "thai_phu": ["ba bau", "mang thai", "sap sinh", "thai phu"],
}

# Số viết bằng chữ — so trên chữ CÒN DẤU: bỏ dấu thì "phía sau hộ ông A" = "sáu hộ" (24 người), "tin từ người dân" =
# "tư người" (4 người). Tin gõ không dấu: chỉ nhận "<số> nguoi" với từ không mơ hồ (không "tu", "sau"; không "ho" —
# hộ / họ / hồ).
NUM_WORDS_VI = {
    "một": 1,
    "hai": 2,
    "ba": 3,
    "bốn": 4,
    "tư": 4,
    "năm": 5,
    "sáu": 6,
    "bảy": 7,
    "bẩy": 7,
    "tám": 8,
    "chín": 9,
    "mười": 10,
}
NUM_WORDS_ASCII = {"mot": 1, "hai": 2, "ba": 3, "bon": 4, "nam": 5, "bay": 7, "tam": 8, "chin": 9, "muoi": 10}

COORD_RE = re.compile(r"(2[23]\.\d{3,})\s*[,; ]\s*(10[56]\.\d{3,})")
PEOPLE_RE = re.compile(r"(\d{1,3})\s*(nguoi|nhan khau|ho|chau|em|cu)\b")
WORD_PEOPLE_VI_RE = re.compile(r"(?<!\w)(" + "|".join(NUM_WORDS_VI) + r")\s+(người|hộ)(?!\w)")
WORD_PEOPLE_ASCII_RE = re.compile(r"\b(" + "|".join(NUM_WORDS_ASCII) + r")\s+nguoi\b")


def parse_rules(text: str, gazetteer: list[dict]) -> dict:
    t = norm(text)

    incident = "ngap_lut"
    for code, kws in INCIDENT_KEYWORDS:
        if any(k in t for k in kws):
            incident = code
            break

    vulnerable = [code for code, kws in VULNERABLE_KEYWORDS.items() if any(k in t for k in kws)]

    trapped = 0
    households = False
    for m in PEOPLE_RE.finditer(t):
        n = int(m.group(1))
        if m.group(2) == "ho":
            households = True
            n *= 4  # quy đổi hộ → nhân khẩu (bình quân ~4 người/hộ)
        trapped = max(trapped, n)
    if trapped == 0:
        # Một số bàn phím gửi chữ tổ hợp (NFD) → đưa về dạng dựng sẵn (NFC) trước khi so
        low = unicodedata.normalize("NFC", text).lower()
        if m := WORD_PEOPLE_VI_RE.search(low):
            households = m.group(2) == "hộ"
            trapped = NUM_WORDS_VI[m.group(1)] * (4 if households else 1)
        elif m := WORD_PEOPLE_ASCII_RE.search(t):
            trapped = NUM_WORDS_ASCII[m.group(1)]

    place = _match_place(t, gazetteer)

    coords = None
    m = COORD_RE.search(text)
    if m:
        coords = (float(m.group(1)), float(m.group(2)))

    # Mức ưu tiên SLA: 1 = sinh tử, 2 = nguy hiểm, 3 = hỗ trợ
    if (
        incident in ("sap_nha", "lu_quet")
        or "thuong_nang" in vulnerable
        or "thai_phu" in vulnerable
        or incident == "cap_cuu"
    ):
        priority = 1
    elif incident == "sat_lo" and ("vui" in t or "mac ket" in t or "thuong" in t):
        priority = 1
    elif incident == "tiep_te":
        priority = 3
    elif "mai nha" in t or "mac ket" in t or "cuu voi" in t or vulnerable:
        priority = 1 if trapped >= 4 and "mai nha" in t else 2
    else:
        priority = 2

    return {
        "incident_type": incident,
        "priority": priority,
        "trapped_count": trapped,
        "counted_households": households,
        "vulnerable": vulnerable,
        "place": {k: place[k] for k in ("name", "unit_code", "lat", "lon", "kind")} if place else None,
        "coords": coords,
        "engine": "rules",
    }


def _match_place(t: str, gazetteer: list[dict]) -> dict | None:
    """Địa danh trong tin (đã chuẩn hoá): ưu tiên xóm / địa danh cụ thể (tên dài hơn) rồi mới đến xã/phường.

    Tên xóm trùng ở nhiều xã (sau sáp nhập có hàng nghìn xóm): tin có nhắc xã → chỉ xét xóm thuộc xã đó; vẫn không
    phân biệt được (cùng tên, khác xã) → chỉ trả xã nếu có, không đoán bừa xóm.
    """
    hits = [g for g in gazetteer if (g.get("re") or _name_re(g["norm"])).search(t)]
    communes = sorted((g for g in hits if g["kind"] == "xa"), key=lambda g: -len(g["norm"]))
    places = [g for g in hits if g["kind"] != "xa"]
    if communes:
        codes = {g["unit_code"] for g in communes}
        places = [g for g in places if g["unit_code"] in codes]
    if places:
        longest = max(len(g["norm"]) for g in places)
        top = [g for g in places if len(g["norm"]) == longest]
        if len({g["unit_code"] for g in top}) == 1:
            return top[0]
    return communes[0] if communes else None


def _name_re(name_norm: str) -> re.Pattern:
    return re.compile(r"\b" + re.escape(name_norm) + r"\b")


# Tiền tố bỏ khi so tên (“thôn Nà Pồng” trong tin = “Nà Pồng”). Không bỏ “Bản”: một phần tên riêng (Bản Ngắn).
NAME_PREFIXES = ("Tổ dân phố ", "Thôn ", "Xóm ", "Khu di tích ", "Tổ ")
GAZETTEER_TTL_S = 300  # dự phòng: tải lại tối đa sau 5 phút kể cả khi không có tín hiệu
GAZETTEER_VERSION_KEY = "pctt:gazetteer:ver"  # tăng khi nhập xóm / ranh giới xã → mọi tiến trình tải lại ngay

_gazetteer_cache: list[dict] | None = None
_gazetteer_at = 0.0
_gazetteer_ver: str | None = None
_local_ver = 0  # chạy không Redis (1 tiến trình)


async def _gazetteer_version() -> str:
    r = get_redis()
    if r is not None:
        try:
            return await r.get(GAZETTEER_VERSION_KEY) or "0"
        except Exception:
            pass
    return f"local:{_local_ver}"


async def invalidate_gazetteer() -> None:
    global _local_ver
    _local_ver += 1
    r = get_redis()
    if r is not None:
        try:
            await r.incr(GAZETTEER_VERSION_KEY)
        except Exception:
            pass


async def load_gazetteer() -> list[dict]:
    """Xã/phường + xóm / tổ dân phố (administrative_units cấp thôn, unit_code = mã xã cha) + địa danh khác."""
    global _gazetteer_cache, _gazetteer_at, _gazetteer_ver
    ver = await _gazetteer_version()
    if (
        _gazetteer_cache is None
        or ver != _gazetteer_ver
        or time.monotonic() - _gazetteer_at > GAZETTEER_TTL_S
    ):
        rows = await fetch_all(
            """
            SELECT u.name, u.code AS unit_code, ST_Y(u.center) AS lat, ST_X(u.center) AS lon, 'xa' AS kind
              FROM spatial_admin.administrative_units u WHERE u.level = 'xa'
            UNION ALL
            SELECT u.name, p.code, ST_Y(COALESCE(u.center, p.center)), ST_X(COALESCE(u.center, p.center)), 'thon'
              FROM spatial_admin.administrative_units u JOIN spatial_admin.administrative_units p ON p.id = u.parent_id
             WHERE u.level = 'thon'
            UNION ALL
            SELECT p.name, u.code, ST_Y(p.geom), ST_X(p.geom), p.kind
              FROM spatial_admin.place_names p JOIN spatial_admin.administrative_units u ON u.id = p.admin_unit_id
             WHERE p.kind <> 'thon'
            """
        )
        for r in rows:
            base = r["name"]
            for prefix in NAME_PREFIXES:
                if base.startswith(prefix):
                    base = base[len(prefix) :]
                    break
            r["norm"] = norm(base)
            r["re"] = _name_re(r["norm"])
        _gazetteer_cache, _gazetteer_at, _gazetteer_ver = rows, time.monotonic(), ver
    return _gazetteer_cache


# SĐT / số giấy tờ (CCCD) Việt Nam: bắt đầu bằng 0, 84 hoặc +84, tổng 9–12 chữ số, cho phép 1 dấu cách, chấm, gạch
# giữa các chữ số. Không bắt số thập phân như toạ độ "106.123456" (không bắt đầu bằng 0/84) — LLM cần vị trí.
_PHONE_RE = re.compile(r"(?<![\d.])(?:\+?84|0)(?:[ .\-]?\d){8,11}(?!\d)")


def redact_for_llm(text: str) -> str:
    """Che SĐT / số giấy tờ trước khi gửi ra dịch vụ LLM bên ngoài — LLM không cần chúng để phân loại."""
    return _PHONE_RE.sub("[SỐ]", text)


async def _parse_llm(text: str) -> dict | None:
    if not (settings.llm_api_url and settings.llm_api_key):
        return None
    text = redact_for_llm(text)
    prompt = (
        "Trích xuất thông tin từ tin nhắn cầu cứu thiên tai tại tỉnh Cao Bằng. Trả về JSON với các khóa: "
        "incident_type (ngap_lut|sat_lo|lu_quet|sap_nha|cap_cuu|tiep_te), priority (1|2|3), trapped_count (int), "
        "vulnerable (mảng: nguoi_gia|tre_em|thuong_nang|thai_phu), place_name (tên thôn/xã). Tin nhắn: "
        + text
    )
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                settings.llm_api_url,
                headers={"Authorization": f"Bearer {settings.llm_api_key}"},
                json={
                    "model": settings.llm_model,
                    "messages": [{"role": "user", "content": prompt}],
                    "response_format": {"type": "json_object"},
                },
            )
            resp.raise_for_status()
            return json.loads(resp.json()["choices"][0]["message"]["content"])
    except Exception as exc:  # LLM lỗi → dùng kết quả bộ luật
        log.warning("LLM parse failed: %s", exc)
        return None


INCIDENT_TYPES = {code for code, _ in INCIDENT_KEYWORDS}


def clean_llm(llm: dict) -> dict:
    """Chỉ giữ giá trị LLM hợp lệ — mô hình có thể trả loại sự cố lạ, ưu tiên "1" / 4, số người âm… → CSDL từ chối
    (ràng buộc CHECK) và phiếu SOS không tạo được. Giá trị không hợp lệ → giữ kết quả bộ luật."""
    out: dict = {}
    if llm.get("incident_type") in INCIDENT_TYPES:
        out["incident_type"] = llm["incident_type"]
    try:
        if 1 <= (p := int(llm["priority"])) <= 3:
            out["priority"] = p
    except (KeyError, TypeError, ValueError):
        pass
    try:
        if 0 <= (n := int(llm["trapped_count"])) <= 10000:
            out["trapped_count"] = n
    except (KeyError, TypeError, ValueError):
        pass
    if isinstance(llm.get("vulnerable"), list):
        out["vulnerable"] = [v for v in llm["vulnerable"] if v in VULNERABLE_KEYWORDS]
    return out


async def extract(text: str) -> dict:
    gaz = await load_gazetteer()
    result = parse_rules(text, gaz)
    llm = await _parse_llm(text)
    if isinstance(llm, dict):
        result.update(clean_llm(llm))
        if isinstance(llm.get("place_name"), str) and llm["place_name"]:
            match = parse_rules(llm["place_name"], gaz)["place"]
            if match:
                result["place"] = match
        result["engine"] = "llm+rules"
    return result
