"""Dịch vụ tra cứu tiến độ cứu trợ khẩn cấp (SOS) và phản ánh hiện trường cho người dân.

Nguyên tắc bảo vệ dữ liệu (endpoint công khai, không đăng nhập — mã phiếu tăng dần nên đoán được):
- Chỉ tra đúng 1 mã phiếu; không tìm gần đúng, không tìm theo SĐT (tránh liệt kê phiếu của người khác).
- Phiếu có lưu SĐT → phải nhập SĐT trùng khớp mới thấy; sai SĐT trả kết quả giống "không tồn tại".
- Phiếu phản ánh gửi ẩn danh (không SĐT) → chỉ trả mốc tiến độ, không trả mô tả / địa chỉ.
- Không bao giờ trả ghi chú nội bộ của phiếu SOS, lý do từ chối nội bộ, vị trí lực lượng.
"""

from __future__ import annotations

import re
from datetime import UTC, datetime
from zoneinfo import ZoneInfo

from app.db import fetch_all
from app.services.reports import CATEGORY
from app.services.sos import INCIDENT_LABEL

TZ_VN = ZoneInfo("Asia/Ho_Chi_Minh")

SOS_STATUS_LABELS = {
    "moi": "Đã tiếp nhận – Đang phân loại",
    "dieu_phoi": "Đã điều phối lực lượng",
    "thuc_thi": "Đội cứu hộ đang trên đường đến",
    "hoan_thanh": "Đã cứu hộ an toàn",
}

REPORT_STATUS_LABELS = {
    "cho_duyet": "Đã tiếp nhận – Chờ xác minh",
    "da_duyet": "Đã xác minh – Đang triển khai xử lý",
    "tu_choi": "Không phê duyệt",
    "da_xu_ly": "Đã xử lý xong hoàn tất",
}


def format_vn_time(dt: datetime | None) -> str | None:
    if not dt:
        return None
    local = dt.astimezone(TZ_VN) if dt.tzinfo else dt
    return local.strftime("%H:%M (%d/%m/%Y)")


def mask_phone(phone: str | None) -> str | None:
    if not phone:
        return None
    clean = re.sub(r"\D", "", phone)
    if len(clean) >= 9:
        return f"{clean[:3]}***{clean[-3:]}"
    return "***"


def format_sos_item(t: dict, now: datetime) -> dict:
    code = t["code"]
    status = t["status"]
    force_name = t.get("force_name")
    dispatch_status = t.get("dispatch_status")
    dispatched_at = t.get("dispatched_at")
    acknowledged_at = t.get("acknowledged_at")
    received_at = t["received_at"]
    resolved_at = t.get("resolved_at")
    eta = t.get("eta")

    # Mốc 1: Tiếp nhận (🟡)
    s1 = {
        "step": 1,
        "name": "tiep_nhan",
        "title": "Đã tiếp nhận thông tin cứu nạn",
        "time": format_vn_time(received_at),
        "state": "done",
        "color": "yellow",
        "icon": "check",
        "detail": "BCH PCTT & TKCN tỉnh đã ghi nhận yêu cầu và đưa vào hệ thống điều hành tác chiến.",
    }

    # Mốc 2: Điều động lực lượng (🟠)
    is_dispatched = bool(force_name or dispatched_at or status in ("dieu_phoi", "thuc_thi", "hoan_thanh"))
    if is_dispatched:
        unit = force_name or "lực lượng cứu hộ"
        t2_time = format_vn_time(dispatched_at or acknowledged_at or received_at)
        s2 = {
            "step": 2,
            "name": "dieu_dong",
            "title": f"Đã điều động {unit} xuất phát",
            "time": t2_time,
            "state": "done" if status in ("thuc_thi", "hoan_thanh") else "current",
            "color": "orange",
            "icon": "truck",
            "detail": f"{unit[0].upper() + unit[1:]} đã nhận lệnh điều động từ BCH PCTT & TKCN.",
        }
    else:
        s2 = {
            "step": 2,
            "name": "dieu_dong",
            "title": "Điều động lực lượng cứu hộ",
            "time": None,
            "state": "current" if status == "dieu_phoi" else "waiting",
            "color": "orange",
            "icon": "truck",
            "detail": "BCH đang bố trí lực lượng cứu hộ gần nhất.",
        }

    # Mốc 3: Đội cứu hộ trên đường đến / tiếp cận (🟢)
    if status == "hoan_thanh":
        s3 = {
            "step": 3,
            "name": "dang_den",
            "title": "Đã tiếp cận hiện trường",
            "time": format_vn_time(resolved_at or acknowledged_at),
            "state": "done",
            "color": "green",
            "icon": "navigation",
            "detail": "Lực lượng cứu hộ đã tiếp cận hiện trường.",
        }
    elif status == "thuc_thi" or (dispatch_status and dispatch_status == "dang_di"):
        eta_text = "Đang di chuyển trên lộ trình an toàn"
        if eta:
            diff_min = max(1, round((eta - now).total_seconds() / 60))
            if diff_min <= 1:
                eta_text = "Dự kiến tiếp cận trong ít phút tới"
            else:
                eta_text = f"Dự kiến khoảng {diff_min} phút nữa tiếp cận"
        target_force = force_name or "cứu hộ"
        s3 = {
            "step": 3,
            "name": "dang_den",
            "title": "Đội cứu hộ đang trên đường đến",
            "time": eta_text,
            "state": "current",
            "color": "green",
            "icon": "navigation",
            "detail": f"Lực lượng {target_force} đang di chuyển tới hiện trường.",
        }
    else:
        s3 = {
            "step": 3,
            "name": "dang_den",
            "title": "Đội cứu hộ tiếp cận hiện trường",
            "time": None,
            "state": "waiting",
            "color": "green",
            "icon": "navigation",
            "detail": "Lực lượng cứu hộ sẽ di chuyển đến ngay sau khi xuất phát.",
        }

    # Mốc 4: Đã cứu hộ an toàn (🔵)
    if status == "hoan_thanh":
        s4 = {
            "step": 4,
            "name": "hoan_thanh",
            "title": "Đã cứu hộ an toàn",
            "time": format_vn_time(resolved_at),
            "state": "done",
            "color": "blue",
            "icon": "shield",
            "detail": "Cán bộ điều hành đã xác nhận hoàn thành cứu hộ.",
        }
    else:
        s4 = {
            "step": 4,
            "name": "hoan_thanh",
            "title": "Hoàn thành cứu nạn an toàn",
            "time": None,
            "state": "waiting",
            "color": "blue",
            "icon": "shield",
            "detail": "Cán bộ điều hành xác nhận khi đã đưa người gặp nạn tới nơi an toàn.",
        }

    return {
        "code": code,
        "type": "sos",
        "type_label": "Cứu trợ khẩn cấp (SOS)",
        "incident_type": t["incident_type"],
        "incident_label": INCIDENT_LABEL.get(t["incident_type"], t["incident_type"]),
        "status": status,
        "status_label": SOS_STATUS_LABELS.get(status, status),
        "created_at": t["received_at"].isoformat() if t.get("received_at") else None,
        "address": t.get("address"),
        "admin_name": t.get("admin_name"),
        "reporter_phone_masked": mask_phone(t.get("reporter_phone")),
        "force_name": force_name,
        "public_note": None,  # notes của phiếu SOS là ghi chú nội bộ — không công khai
        "timeline": [s1, s2, s3, s4],
    }


def format_report_item(r: dict) -> dict:
    code = r["code"]
    status = r["status"]
    force_name = r.get("force_name")
    public_note = r.get("public_note")
    moderated_at = r.get("moderated_at")
    created_at = r["created_at"]

    # Mốc 1: Tiếp nhận phản ánh
    s1 = {
        "step": 1,
        "name": "tiep_nhan",
        "title": "Đã tiếp nhận thông tin phản ánh",
        "time": format_vn_time(created_at),
        "state": "done",
        "color": "yellow",
        "icon": "check",
        "detail": "Hệ thống đã ghi nhận phản ánh hiện trường và toạ độ vị trí của bạn.",
    }

    # Mốc 2: Cán bộ xác minh & thẩm định
    if status in ("da_duyet", "da_xu_ly"):
        s2 = {
            "step": 2,
            "name": "xac_minh",
            "title": "Cán bộ đã thẩm định & duyệt thông tin",
            "time": format_vn_time(moderated_at) or "Đã duyệt",
            "state": "done",
            "color": "orange",
            "icon": "check",
            "detail": "Cán bộ địa bàn đã xác minh phản ánh và công khai trên cổng thông tin.",
        }
    elif status == "tu_choi":
        s2 = {
            "step": 2,
            "name": "xac_minh",
            "title": "Phản ánh không được phê duyệt",
            "time": format_vn_time(moderated_at),
            "state": "rejected",
            "color": "red",
            "icon": "x",
            # reject_reason là ghi chú nội bộ của cán bộ — chỉ trả thông báo chung
            "detail": "Phản ánh chưa đủ căn cứ để xử lý (không rõ vị trí, trùng lặp hoặc không liên quan). "
            "Nếu tình huống vẫn tiếp diễn, hãy gửi lại phản ánh hoặc gọi đường dây nóng.",
        }
    else:  # cho_duyet
        s2 = {
            "step": 2,
            "name": "xac_minh",
            "title": "Đang chờ cán bộ xác minh",
            "time": "Đang kiểm tra",
            "state": "current",
            "color": "orange",
            "icon": "clock",
            "detail": "Cán bộ địa bàn đang kiểm tra nội dung, hình ảnh phản ánh.",
        }

    # Mốc 3: Triển khai khắc phục
    if status == "da_xu_ly":
        s3 = {
            "step": 3,
            "name": "xu_ly",
            "title": "Đã xử lý",
            "time": format_vn_time(moderated_at),
            "state": "done",
            "color": "green",
            "icon": "truck",
            "detail": public_note or "Cán bộ địa phương đã xử lý phản ánh.",
        }
    elif status == "da_duyet":
        s3 = {
            "step": 3,
            "name": "xu_ly",
            "title": "Đang xử lý",
            "time": "Đang thực hiện",
            "state": "current",
            "color": "green",
            "icon": "truck",
            "detail": public_note or "Cán bộ địa phương đang theo dõi, bố trí xử lý.",
        }
    elif status == "tu_choi":
        s3 = {
            "step": 3,
            "name": "xu_ly",
            "title": "Không chuyển xử lý",
            "time": None,
            "state": "rejected",
            "color": "red",
            "icon": "x",
            "detail": "Phản ánh không thuộc diện điều động khắc phục.",
        }
    else:  # cho_duyet
        s3 = {
            "step": 3,
            "name": "xu_ly",
            "title": "Xử lý phản ánh",
            "time": None,
            "state": "waiting",
            "color": "green",
            "icon": "truck",
            "detail": "Sau khi xác minh, cán bộ địa phương sẽ bố trí xử lý.",
        }

    # Mốc 4: Khắc phục hoàn tất
    if status == "da_xu_ly":
        s4 = {
            "step": 4,
            "name": "hoan_thanh",
            "title": "Đã khắc phục / Xử lý hoàn tất",
            "time": format_vn_time(moderated_at),
            "state": "done",
            "color": "blue",
            "icon": "shield",
            "detail": "Cán bộ đã đánh dấu phản ánh xử lý xong.",
        }
    elif status == "tu_choi":
        s4 = {
            "step": 4,
            "name": "hoan_thanh",
            "title": "Đóng phiếu phản ánh",
            "time": None,
            "state": "rejected",
            "color": "red",
            "icon": "x",
            "detail": "Phiếu phản ánh đã đóng.",
        }
    else:
        s4 = {
            "step": 4,
            "name": "hoan_thanh",
            "title": "Khắc phục hoàn tất",
            "time": None,
            "state": "waiting",
            "color": "blue",
            "icon": "shield",
            "detail": "Cán bộ đánh dấu hoàn tất khi đã xử lý xong.",
        }

    return {
        "code": code,
        "type": "report",
        "type_label": "Phản ánh hiện trường",
        "category": r["category"],
        "category_label": CATEGORY.get(r["category"], r["category"]),
        "description": r["description"],
        "status": status,
        "status_label": REPORT_STATUS_LABELS.get(status, status),
        "created_at": created_at.isoformat() if created_at else None,
        "address": r.get("address"),
        "admin_name": r.get("admin_name"),
        "reporter_phone_masked": mask_phone(r.get("reporter_phone")),
        "force_name": force_name,
        "public_note": public_note,
        "timeline": [s1, s2, s3, s4],
    }


CODE_RE = re.compile(r"^(SOS|PA)-?(\d{3,7})$")

SOS_SQL = """
    SELECT t.code, t.status, t.incident_type, t.received_at, t.acknowledged_at, t.resolved_at,
           t.address, t.reporter_phone, u.name AS admin_name,
           d.status AS dispatch_status, d.dispatched_at, d.eta, f.name AS force_name
      FROM operations.sos_tickets t
      LEFT JOIN spatial_admin.administrative_units u ON u.id = t.admin_unit_id
      LEFT JOIN LATERAL (
          SELECT o.status, o.dispatched_at, o.eta, o.force_id FROM operations.dispatch_orders o
           WHERE o.ticket_id = t.id AND o.status <> 'huy'
           ORDER BY o.dispatched_at DESC LIMIT 1
      ) d ON TRUE
      LEFT JOIN resources.forces f ON f.id = d.force_id
     WHERE t.code = :code
"""

REPORT_SQL = """
    SELECT r.code, r.category, r.description, r.status, r.public_note, r.created_at, r.moderated_at,
           r.address, r.reporter_phone, u.name AS admin_name, f.name AS force_name
      FROM community.citizen_reports r
      LEFT JOIN spatial_admin.administrative_units u ON u.id = r.admin_unit_id
      LEFT JOIN LATERAL (
          SELECT o.force_id FROM operations.dispatch_orders o
           WHERE o.ticket_id = r.sos_ticket_id AND o.status <> 'huy'
           ORDER BY o.dispatched_at DESC LIMIT 1
      ) d ON TRUE
      LEFT JOIN resources.forces f ON f.id = d.force_id
     WHERE r.code = :code
"""

# Trường chỉ trả khi người tra cứu chứng minh là người gửi (nhập đúng SĐT)
PRIVATE_FIELDS = ("description", "address", "reporter_phone_masked", "force_name")


def normalize_code(raw: str) -> str | None:
    """'pa 1017' / 'PA1017' / 'SOS-1021' → mã chuẩn; chuỗi khác → None."""
    m = CODE_RE.match(re.sub(r"\s", "", raw or "").upper())
    return f"{m[1]}-{m[2]}" if m else None


def phone_matches(stored: str | None, given: str | None) -> bool:
    """So 9 số cuối (bỏ qua 0 / +84 đầu số)."""
    s, g = re.sub(r"\D", "", stored or ""), re.sub(r"\D", "", given or "")
    return len(s) >= 9 and len(g) >= 9 and s[-9:] == g[-9:]


def _empty(code: str) -> dict:
    return {"query": code, "total": 0, "results": [], "verified": False}


async def track_ticket(code_raw: str, phone: str | None = None) -> dict:
    """Tra cứu tiến độ 1 phiếu SOS / phản ánh theo đúng mã (+ SĐT người gửi nếu phiếu có SĐT)."""
    code = normalize_code(code_raw)
    if not code:
        return _empty(code_raw.strip())
    is_sos = code.startswith("SOS-")
    rows = await fetch_all(SOS_SQL if is_sos else REPORT_SQL, {"code": code})
    if not rows:
        return _empty(code)
    row = rows[0]
    has_phone = bool(re.sub(r"\D", "", row.get("reporter_phone") or ""))
    verified = has_phone and phone_matches(row["reporter_phone"], phone)
    # Phiếu có SĐT mà nhập sai / không nhập → trả như không tồn tại (không tiết lộ mã có thật).
    # Phiếu SOS không có SĐT (cán bộ tạo) → người dân không tra được.
    if (has_phone and not verified) or (is_sos and not has_phone):
        return _empty(code)
    item = format_sos_item(row, datetime.now(UTC)) if is_sos else format_report_item(row)
    if not verified:
        for k in PRIVATE_FIELDS:
            item[k] = None
    return {"query": code, "total": 1, "results": [item], "verified": verified}
