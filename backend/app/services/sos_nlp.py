"""Bóc tách tin nhắn cầu cứu phi cấu trúc → JSON (địa điểm, số người, loại sự cố, mức ưu tiên).

Mặc định dùng bộ luật (regex + từ điển địa danh) để chạy offline. Nếu cấu hình LLM_API_URL/KEY,
hệ thống gọi thêm mô hình ngôn ngữ (API dạng OpenAI-compatible) và ưu tiên kết quả của mô hình.
"""

import json
import logging
import re
import unicodedata

import httpx

from app.config import settings
from app.db import fetch_all

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

NUM_WORDS = {
    "mot": 1,
    "hai": 2,
    "ba": 3,
    "bon": 4,
    "tu": 4,
    "nam": 5,
    "sau": 6,
    "bay": 7,
    "tam": 8,
    "chin": 9,
    "muoi": 10,
}

COORD_RE = re.compile(r"(2[23]\.\d{3,})\s*[,; ]\s*(10[56]\.\d{3,})")
PEOPLE_RE = re.compile(r"(\d{1,3})\s*(nguoi|nhan khau|ho|chau|em|cu)\b")
WORD_PEOPLE_RE = re.compile(r"\b(" + "|".join(NUM_WORDS) + r")\s+(nguoi|ho)\b")


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
        m = WORD_PEOPLE_RE.search(t)
        if m:
            trapped = NUM_WORDS[m.group(1)] * (4 if m.group(2) == "ho" else 1)
            households = m.group(2) == "ho"

    # Địa danh: ưu tiên thôn/địa danh cụ thể (dài hơn) rồi mới đến xã/phường
    place = None
    for entry in sorted(gazetteer, key=lambda g: (g["kind"] == "xa", -len(g["norm"]))):
        if re.search(r"\b" + re.escape(entry["norm"]) + r"\b", t):
            place = entry
            break

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


_gazetteer_cache: list[dict] | None = None


async def load_gazetteer() -> list[dict]:
    global _gazetteer_cache
    if _gazetteer_cache is None:
        rows = await fetch_all(
            """
            SELECT u.name, u.code AS unit_code, ST_Y(u.center) AS lat, ST_X(u.center) AS lon, 'xa' AS kind
              FROM spatial_admin.administrative_units u WHERE u.level = 'xa'
            UNION ALL
            SELECT p.name, u.code, ST_Y(p.geom), ST_X(p.geom), p.kind
              FROM spatial_admin.place_names p JOIN spatial_admin.administrative_units u ON u.id = p.admin_unit_id
            """
        )
        for r in rows:
            base = r["name"]
            for prefix in ("Thôn ", "Tổ dân phố ", "Khu di tích "):
                if base.startswith(prefix):
                    base = base[len(prefix) :]
            r["norm"] = norm(base)
        _gazetteer_cache = rows
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


async def extract(text: str) -> dict:
    gaz = await load_gazetteer()
    result = parse_rules(text, gaz)
    llm = await _parse_llm(text)
    if llm:
        result.update(
            {k: llm[k] for k in ("incident_type", "priority", "trapped_count", "vulnerable") if k in llm}
        )
        if llm.get("place_name"):
            match = parse_rules(llm["place_name"], gaz)["place"]
            if match:
                result["place"] = match
        result["engine"] = "llm+rules"
    return result
