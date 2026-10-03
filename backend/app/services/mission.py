"""Link nhiệm vụ cho trưởng nhóm hiện trường (dân quân / tổ cứu hộ thường không có tài khoản).

Lệnh điều động sinh một mã bí mật gắn với ĐÚNG lệnh đó; trực ban gửi kèm nội dung lệnh qua Zalo / SMS. Trưởng nhóm mở
trên điện thoại, không đăng nhập: xem điểm SOS, mở chỉ đường, báo "đã đến" / "đã cứu an toàn" / "cần chi viện".

- Mã nằm sau dấu ``#`` của đường dẫn: trình duyệt không gửi phần này lên máy chủ → không vào log nginx / backend, không
  lọt qua Referer khi bấm sang Google Maps. Trang đọc mã rồi gửi trong header ``X-Mission-Token``.
- CSDL chỉ lưu SHA-256 của mã. Mã hết hiệu lực khi lệnh xong / huỷ, sau ``MISSION_TTL_HOURS``, hoặc khi trực ban cấp
  link mới (link cũ lộ ra ngoài → cấp lại).
- API nằm ở ``/api/v1/mission`` — KHÔNG đặt dưới ``/api/v1/public/``: nginx cache tiền tố đó theo đường dẫn, không
  theo header → nhiệm vụ của đội này có thể trả cho đội khác.
- Không lấy vị trí điện thoại. "Đã cứu an toàn" KHÔNG tự đóng phiếu: trực ban xác nhận hoàn thành (link lộ ra ngoài
  cũng không đóng được phiếu đang cứu).
"""

import hashlib
import re
import secrets

from pydantic import BaseModel, Field

from app.config import settings

MISSION_TTL_HOURS = 72
MAX_REPORTS_PER_HOUR = (
    30  # mỗi link: đủ cho đội báo nhiều lần, chặn link lộ ra ngoài bị dùng để spam trực ban
)
TOKEN_RE = re.compile(r"[A-Za-z0-9_-]{20,100}")
ACTIVE = ("dang_di", "da_den")

REPORT_LABEL = {
    "arrived": "Đã đến hiện trường",
    "rescued": "Đã cứu an toàn",
    "need_support": "Cần chi viện",
}

INVALID = "Link nhiệm vụ không hợp lệ hoặc đã được thay bằng link mới — liên hệ trực ban"
FINISHED = "Nhiệm vụ đã kết thúc — cảm ơn các đồng chí. Cần hỗ trợ thêm, gọi trực ban."
EXPIRED = "Link nhiệm vụ đã hết hạn — đề nghị trực ban cấp link mới"
CANCELLED = "Lệnh điều động này đã được trực ban huỷ — dừng di chuyển, liên hệ trực ban để nhận lệnh mới"


def new_token() -> tuple[str, str]:
    """(mã gửi cho đội, SHA-256 lưu CSDL). 24 byte ngẫu nhiên → 32 ký tự, không dò được."""
    token = secrets.token_urlsafe(24)
    return token, hash_token(token)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def valid_format(token: str | None) -> bool:
    return bool(token) and TOKEN_RE.fullmatch(token) is not None


def mission_url(token: str) -> str:
    return f"{settings.public_base_url.rstrip('/')}/nhiem-vu#{token}"


def order_message(ticket: dict, url: str, eta_min: int | None = None) -> str:
    """Nội dung lệnh trực ban sao chép gửi trưởng nhóm (Zalo / SMS)."""
    return (
        f"[LỆNH KHẨN] {ticket['code']}: {ticket['address'] or ticket['admin_name']} – "
        f"toạ độ {ticket['lat']:.5f},{ticket['lon']:.5f}."
        + (f" ETA {eta_min} phút." if eta_min is not None else "")
        + f" Mở nhiệm vụ, báo đến / đã cứu / cần chi viện: {url}"
    )


class MissionReportIn(BaseModel):
    kind: str = Field(pattern="^(arrived|rescued|need_support)$")
    people_safe: int | None = Field(None, ge=0, le=10_000, description="Số người đã đưa tới nơi an toàn")
    note: str | None = Field(None, max_length=500)


def report_problem(body: MissionReportIn) -> str | None:
    if body.kind == "need_support" and len((body.note or "").strip()) < 3:
        return "Ghi rõ cần chi viện gì (VD: thêm xuồng, cáng, có người bị thương nặng)"
    if body.kind == "rescued" and body.people_safe is None:
        return "Ghi số người đã đưa tới nơi an toàn (không tìm thấy ai: ghi 0 và ghi chú)"
    if body.kind != "rescued" and body.people_safe is not None:
        return "Số người an toàn chỉ ghi khi báo đã cứu"
    return None


def report_log(kind: str, code: str, force: str, note: str | None, people_safe: int | None, trapped: int):
    """(nội dung nhật ký vận hành, mức) cho báo cáo hiện trường."""
    tail = f": {note}" if note else ""
    if kind == "need_support":
        return f"{code} — {force} CẦN CHI VIỆN{tail}", "danger"
    if kind == "rescued":
        left = trapped - (people_safe or 0)
        return (
            f"{force} báo đã đưa {people_safe}"
            + (f"/{trapped}" if trapped else "")
            + f" người tại {code} tới nơi an toàn"
            + (f" — CÒN {left} NGƯỜI CHƯA RÕ" if left > 0 else "")
            + f" — chờ trực ban xác nhận hoàn thành{tail}",
            "warning" if left > 0 else "info",
        )
    return f"{force} đã đến hiện trường {code} (báo qua link nhiệm vụ){tail}", "info"
