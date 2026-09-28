"""Phản ánh hiện trường của người dân: xử lý ảnh, lưu trữ, link ảnh có chữ ký, tạo phản ánh.

Quyền riêng tư: họ tên / SĐT người gửi chỉ cán bộ có ``report.view`` mới xem; ảnh được mã hoá lại để xoá EXIF
(toạ độ GPS, model điện thoại…). API công khai chỉ trả phản ánh đã duyệt, không kèm thông tin người gửi.
"""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import io
import json
import logging
import time
import uuid
import warnings
from datetime import UTC, datetime

import httpx
from PIL import Image, ImageOps, UnidentifiedImageError

from app.area import IN_PROVINCE_SQL
from app.config import settings
from app.db import fetch_one
from app.infra import storage
from app.rbac import domains
from app.services.events import log_event
from app.ws.hub import hub

log = logging.getLogger(__name__)

CATEGORY = {
    "ngap": "Ngập lụt",
    "sat_lo": "Sạt lở đất đá",
    "lu_quet": "Lũ quét",
    "cay_do": "Cây đổ",
    "dut_dien": "Đứt dây điện / mất điện",
    "hu_hong_duong": "Hư hỏng đường",
    "sap_cau": "Sập cầu, ngầm tràn",
    "mac_ket": "Người mắc kẹt",
    "khac": "Khác",
}
MAX_PHOTOS = 3
MAX_BYTES = 8 * 1024 * 1024
MAX_PIXELS = 40_000_000  # chống "ảnh bom" giải nén
ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP", "MPO"}
FULL_SIZE = 1600
THUMB_SIZE = 400
PHOTO_URL_TTL = 3600


class ReportError(ValueError):
    pass


def process_image(data: bytes) -> tuple[bytes, bytes, int, int]:
    """Kiểm tra & chuẩn hoá ảnh → (ảnh JPEG đầy đủ, ảnh thu nhỏ, rộng, cao). Hàm thuần — kiểm thử được."""
    if len(data) > MAX_BYTES:
        raise ReportError("Ảnh vượt quá 8 MB")
    with warnings.catch_warnings():
        warnings.simplefilter("error", Image.DecompressionBombWarning)
        try:
            img = Image.open(io.BytesIO(data))
            if img.format not in ALLOWED_FORMATS:
                raise ReportError("Chỉ nhận ảnh JPEG, PNG hoặc WebP")
            if img.width * img.height > MAX_PIXELS:
                raise ReportError("Ảnh có kích thước quá lớn")
            img.load()
        except (
            UnidentifiedImageError,
            Image.DecompressionBombWarning,
            Image.DecompressionBombError,
            OSError,
        ) as exc:
            raise ReportError("Tệp không phải ảnh hợp lệ") from exc
    img = ImageOps.exif_transpose(img).convert("RGB")  # xoay đúng chiều rồi bỏ EXIF khi lưu lại
    full = img.copy()
    full.thumbnail((FULL_SIZE, FULL_SIZE))
    thumb = img.copy()
    thumb.thumbnail((THUMB_SIZE, THUMB_SIZE))
    out_full, out_thumb = io.BytesIO(), io.BytesIO()
    full.save(out_full, "JPEG", quality=82, optimize=True)
    thumb.save(out_thumb, "JPEG", quality=75, optimize=True)
    return out_full.getvalue(), out_thumb.getvalue(), full.width, full.height


def _sign(report_id: str, idx: int, thumb: bool, exp: int) -> str:
    msg = f"{report_id}:{idx}:{int(thumb)}:{exp}".encode()
    key = (settings.secret_key or settings.jwt_secret).encode()
    return hmac.new(key, msg, hashlib.sha256).hexdigest()[:32]


def signed_photo_url(report_id: str, idx: int, thumb: bool = False) -> str:
    exp = int(time.time()) + PHOTO_URL_TTL
    return f"/api/v1/reports/{report_id}/photos/{idx}?thumb={int(thumb)}&exp={exp}&sig={_sign(report_id, idx, thumb, exp)}"


def verify_photo_signature(report_id: str, idx: int, thumb: bool, exp: int, sig: str) -> bool:
    return exp >= time.time() and hmac.compare_digest(
        _sign(report_id, idx, thumb, exp).encode(), sig.encode()
    )


def public_photo_url(report_id: str, idx: int, thumb: bool = False) -> str:
    return f"/api/v1/public/reports/{report_id}/photos/{idx}?thumb={int(thumb)}"


def ip_hash(ip: str | None) -> str | None:
    if not ip:
        return None
    return hashlib.sha256(f"{ip}:{settings.secret_key or settings.jwt_secret}".encode()).hexdigest()[:24]


async def verify_turnstile(token: str | None, ip: str | None) -> bool:
    """Cloudflare Turnstile (nếu cấu hình TURNSTILE_SECRET)."""
    if not settings.turnstile_secret:
        return True
    if not token:
        return False
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.post(
                "https://challenges.cloudflare.com/turnstile/v0/siteverify",
                data={"secret": settings.turnstile_secret, "response": token, "remoteip": ip or ""},
            )
    except httpx.TransportError as exc:
        # Mất kết nối quốc tế lúc thiên tai không được chặn người dân gửi phản ánh — vẫn còn giới hạn tần suất
        log.warning("Turnstile không kết nối được (%s) — cho qua", exc)
        return True
    if r.status_code >= 500:  # Cloudflare gặp sự cố — xử lý như mất kết nối
        log.warning("Turnstile lỗi máy chủ %s — cho qua", r.status_code)
        return True
    if r.status_code != 200:  # 4xx / 429 (khoá sai, bị giới hạn khi bị tấn công) → không cho qua
        log.warning("Turnstile từ chối kiểm tra (%s)", r.status_code)
        return False
    try:
        return bool(r.json().get("success"))
    except ValueError:
        return False


async def create_report(
    *,
    category: str,
    description: str,
    lat: float,
    lon: float,
    address: str | None,
    reporter_name: str | None,
    reporter_phone: str | None,
    photos: list[bytes],
    client_ip: str | None,
    hamlet: str | None = None,
) -> dict:
    if category not in CATEGORY:
        raise ReportError("Loại phản ánh không hợp lệ")
    hamlet_name = None
    if hamlet:  # mã xóm người dân chọn (GET /public/hamlets) → lưu tên kèm xã tại thời điểm gửi
        h = await fetch_one(
            """SELECT c.name, p.name AS commune, p.unit_type FROM spatial_admin.administrative_units c
                 JOIN spatial_admin.administrative_units p ON p.id = c.parent_id
                WHERE c.code = :h AND c.level = 'thon'""",
            {"h": hamlet},
        )
        if not h:
            raise ReportError("Xóm / tổ dân phố không có trong danh sách — chọn lại hoặc để trống")
        hamlet_name = f"{h['name']}, {'phường' if h['unit_type'] == 'phuong' else 'xã'} {h['commune']}"
    if len(photos) > MAX_PHOTOS:
        raise ReportError(f"Tối đa {MAX_PHOTOS} ảnh")
    inside = await fetch_one(
        f"SELECT {IN_PROVINCE_SQL} AS ok FROM spatial_admin.administrative_units p WHERE p.code = 'CB'",
        {"lat": lat, "lon": lon},
    )
    if not inside or not inside["ok"]:
        raise ReportError("Vị trí nằm ngoài địa bàn tỉnh Cao Bằng")
    # Giải mã / thu nhỏ ảnh tốn CPU ~1 giây/ảnh → chạy trong thread để không chặn các yêu cầu khác của tiến trình.
    # Kiểm tra hết ảnh trước khi ghi gì.
    processed = await asyncio.to_thread(lambda: [process_image(p) for p in photos])

    report_id = str(uuid.uuid4())
    now = datetime.now(UTC)
    meta = []
    for i, (full, thumb, w, h) in enumerate(processed):
        key = f"reports/{now:%Y/%m}/{report_id}/{i}.jpg"
        tkey = f"reports/{now:%Y/%m}/{report_id}/{i}_thumb.jpg"
        await storage.put(key, full, "image/jpeg")
        await storage.put(tkey, thumb, "image/jpeg")
        meta.append({"key": key, "thumb_key": tkey, "width": w, "height": h})

    row = await fetch_one(
        """INSERT INTO community.citizen_reports (id, category, description, location, address, hamlet_name,
                 admin_unit_id, reporter_name, reporter_phone, photos, client_ip_hash)
           VALUES (CAST(:id AS uuid), :c, :d, ST_SetSRID(ST_MakePoint(:lon, :lat), 4326), :addr, :hamlet,
                   (SELECT id FROM spatial_admin.administrative_units WHERE level = 'xa'
                     ORDER BY geom <-> ST_SetSRID(ST_MakePoint(:lon, :lat), 4326) LIMIT 1),
                   :rn, :rp, CAST(:ph AS jsonb), :ip)
           RETURNING code, admin_unit_id""",
        {
            "id": report_id,
            "c": category,
            "d": description,
            "lat": lat,
            "lon": lon,
            "addr": address,
            "hamlet": hamlet_name,
            "rn": reporter_name,
            "rp": reporter_phone,
            "ph": json.dumps(meta),
            "ip": ip_hash(client_ip),
        },
    )
    code = domains.code_of_unit_id(row["admin_unit_id"])
    unit = next((u for u in domains.units() if u.code == code), None)
    await hub.publish(
        "report.new",
        {
            "id": report_id,
            "code": row["code"],
            "category": category,
            "admin_name": unit.name if unit else None,
            "photos": len(meta),
        },
        "report",
        code,
    )
    await log_event(
        f"Phản ánh mới {row['code']} – {CATEGORY[category]}"
        + (f" tại {unit.name}" if unit else "")
        + " (chờ duyệt)",
        "nguoi_dan",
        "info",
        admin_unit_id=row["admin_unit_id"],
    )
    return {"id": report_id, "code": row["code"], "photos": len(meta)}
