"""Danh mục quyền RBAC — nguồn sự thật duy nhất (SSOT).

Mọi quyền trong hệ thống khai báo tại đây và mô tả trong ``README.md`` mục 8.
Quyền ``scopable=True`` được kiểm tra theo phạm vi địa bàn (tỉnh / cụm / xã);
quyền ``scopable=False`` chỉ cấp được ở phạm vi toàn tỉnh ``"*"``.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from enum import StrEnum
from typing import Final


class Resource(StrEnum):
    MONITORING = "monitoring"  # dashboard, bản đồ, trạm quan trắc, dự báo
    SOS = "sos"  # phiếu yêu cầu cứu hộ
    DISPATCH = "dispatch"  # lệnh điều động
    RESOURCE = "resource"  # lực lượng, kho, phương tiện, điểm sơ tán
    INVENTORY = "inventory"  # tồn kho vật tư
    VEHICLE = "vehicle"  # trạng thái phương tiện
    ALERT = "alert"  # lệnh cảnh báo đa kênh
    CONTACT = "contact"  # danh bạ
    HOTLINE = "hotline"  # tổng đài / IVR
    AUDIT = "audit"  # nhật ký pháp lý
    USER = "user"  # tài khoản người dùng
    INTEGRATION = "integration"  # nguồn dữ liệu ngoài, thiết bị IoT
    REPORT = "report"  # phản ánh hiện trường của người dân
    DATA = "data"  # nhập dữ liệu chính thức từ tệp
    EVACUATION = "evacuation"  # kế hoạch và tiến độ sơ tán nhân dân theo xã
    INCIDENT = "incident"  # điểm sự cố (sạt lở, giao thông, hạ tầng) cán bộ đánh dấu trên bản đồ


class Action(StrEnum):
    VIEW = "view"
    CREATE = "create"
    UPDATE = "update"
    RESOLVE = "resolve"
    ISSUE = "issue"
    APPROVE = "approve"
    OPERATE = "operate"
    MANAGE = "manage"
    MODERATE = "moderate"
    IMPORT = "import"
    SUBMIT = "submit"


@dataclass(frozen=True, slots=True)
class Permission:
    resource: Resource
    action: Action
    scopable: bool
    description: str

    @property
    def code(self) -> str:
        return f"{self.resource.value}.{self.action.value}"


R, A = Resource, Action

ALL_PERMISSIONS: Final[tuple[Permission, ...]] = (
    Permission(R.MONITORING, A.VIEW, True, "Xem dashboard, bản đồ giám sát, số liệu quan trắc"),
    Permission(
        R.MONITORING,
        A.UPDATE,
        False,
        "Cập nhật số liệu vận hành hồ chứa theo báo cáo; nhập bản tin dự báo mực nước của KTTV",
    ),
    Permission(R.SOS, A.VIEW, True, "Xem phiếu SOS"),
    Permission(R.SOS, A.CREATE, True, "Tiếp nhận / tạo phiếu SOS"),
    Permission(R.SOS, A.UPDATE, True, "Chuyển trạng thái, đổi mức ưu tiên phiếu SOS"),
    Permission(R.SOS, A.RESOLVE, True, "Xác nhận đã cứu an toàn"),
    Permission(R.EVACUATION, A.UPDATE, True, "Cập nhật kế hoạch và tiến độ sơ tán nhân dân của xã"),
    Permission(
        R.INCIDENT,
        A.UPDATE,
        True,
        "Đánh dấu / kết thúc điểm sự cố (sạt lở, giao thông, hạ tầng) trên bản đồ — hiện ngay trên cổng công khai",
    ),
    Permission(R.DISPATCH, A.CREATE, True, "Phát lệnh điều động lực lượng"),
    Permission(R.RESOURCE, A.VIEW, True, "Xem lực lượng, kho, phương tiện, điểm sơ tán"),
    Permission(R.INVENTORY, A.ISSUE, True, "Ra lệnh xuất kho"),
    Permission(R.VEHICLE, A.UPDATE, True, "Cập nhật trạng thái phương tiện"),
    Permission(R.ALERT, A.VIEW, True, "Xem lệnh cảnh báo & tỷ lệ chuyển giao"),
    Permission(R.ALERT, A.CREATE, True, "Soạn lệnh cảnh báo (Maker)"),
    Permission(R.ALERT, A.APPROVE, True, "Phê duyệt / từ chối lệnh cảnh báo (Checker)"),
    Permission(R.CONTACT, A.VIEW, True, "Xem danh bạ chỉ huy"),
    Permission(R.HOTLINE, A.OPERATE, False, "Vận hành tổng đài, phân luồng cuộc gọi"),
    Permission(R.AUDIT, A.VIEW, False, "Xem nhật ký pháp lý"),
    Permission(R.USER, A.VIEW, True, "Xem tài khoản trong phạm vi"),
    Permission(R.USER, A.MANAGE, True, "Tạo tài khoản con, cấp / thu hồi vai trò trong phạm vi"),
    Permission(R.REPORT, A.VIEW, True, "Xem phản ánh của người dân (kể cả SĐT người gửi)"),
    Permission(R.REPORT, A.MODERATE, True, "Duyệt / từ chối / chuyển SOS phản ánh của người dân"),
    Permission(R.INTEGRATION, A.VIEW, False, "Xem nguồn dữ liệu, thiết bị IoT, giám sát kết nối"),
    Permission(R.INTEGRATION, A.MANAGE, False, "Cấu hình nguồn dữ liệu, đăng ký thiết bị IoT, cấp khoá"),
    Permission(
        R.DATA,
        A.IMPORT,
        False,
        "Nhập dữ liệu chính thức từ tệp (điểm sơ tán, vùng nguy hiểm, danh bạ…); phê duyệt hồ sơ xã/phường gửi",
    ),
    Permission(
        R.DATA,
        A.SUBMIT,
        True,
        "Gửi dữ liệu của xã/phường (điểm sơ tán, danh bạ, lực lượng…) chờ cấp tỉnh phê duyệt",
    ),
)

GLOBAL_SCOPE: Final[str] = "*"
SUPER_ADMIN_ROLE: Final[str] = "super_admin"
ROLE_NAME_PATTERN: Final[re.Pattern[str]] = re.compile(r"^[a-z][a-z0-9_]{2,40}$")

_BY_CODE: Final[dict[str, Permission]] = {p.code: p for p in ALL_PERMISSIONS}


def get_permission(code: str) -> Permission | None:
    return _BY_CODE.get(code)


def perms(*codes: str) -> list[tuple[str, str]]:
    out = []
    for c in codes:
        if c not in _BY_CODE:
            raise ValueError(f"Quyền không tồn tại: {c}")
        obj, act = c.split(".")
        out.append((obj, act))
    return out


# ---------------------------------------------------------------------------
# 3 vai trò cố định — MỖI CẤP 1 VAI TRÒ, mỗi tài khoản đúng 1 vai trò tại 1 phạm vi (đồng bộ điều hành, rõ dấu vết):
#   Cấp 1  super_admin  Quản trị hệ thống    phạm vi toàn tỉnh "*"
#   Cấp 2  admin_tinh   Quản trị tỉnh        phạm vi toàn tỉnh "*"   — mọi tài khoản cấp tỉnh soạn / duyệt cảnh báo (PIN)
#   Cấp 3  admin_xa     Quản trị xã/phường   phạm vi đúng 1 xã "<CUM>/<MA_XA>"
# Chỉ CẤP TRÊN tạo / quản lý tài khoản cấp dưới: Cấp 1 → mọi cấp, Cấp 2 → Cấp 3, Cấp 3 → không ai. Cùng cấp không đổi
# mật khẩu / PIN / xác thực 2 lớp của nhau (chống mạo danh). Không có vai trò tuỳ chỉnh.
# Vai trò cũ (trước 10/2026) tự chuyển khi khởi động — RETIRED_ROLES, app/rbac/seed.py.
#   name, tên hiển thị, mô tả, cấp trên (không phải Cấp 1) được cấp?, danh sách quyền
# ---------------------------------------------------------------------------
PROVINCE_ROLE: Final[str] = "admin_tinh"
COMMUNE_ROLE: Final[str] = "admin_xa"

SYSTEM_ROLES: Final[tuple[tuple[str, str, str, bool, list[tuple[str, str]]], ...]] = (
    (
        SUPER_ADMIN_ROLE,
        "Quản trị hệ thống",
        "Toàn quyền; tạo và quản lý tài khoản mọi cấp",
        False,
        [("*", "*")],
    ),
    (
        PROVINCE_ROLE,
        "Quản trị tỉnh",
        "Điều hành toàn tỉnh: SOS, điều động, soạn và duyệt cảnh báo (cần PIN, không tự duyệt lệnh mình soạn), tổng đài, "
        "kho, nhập dữ liệu, duyệt hồ sơ xã gửi; tạo và quản lý tài khoản Cấp 3",
        False,
        perms(*(p.code for p in ALL_PERMISSIONS)),
    ),
    (
        COMMUNE_ROLE,
        "Quản trị xã/phường",
        "Trong địa bàn xã: tiếp nhận và xử lý SOS, cập nhật tiến độ sơ tán, đánh dấu sự cố trên bản đồ, duyệt phản ánh, "
        "xuất kho của xã, gửi dữ liệu chờ tỉnh duyệt",
        True,
        perms(
            "monitoring.view",
            "sos.view",
            "sos.create",
            "sos.update",
            "sos.resolve",
            "evacuation.update",
            "incident.update",
            "resource.view",
            "inventory.issue",
            "alert.view",
            "contact.view",
            "report.view",
            "report.moderate",
            "data.submit",
        ),
    ),
)
SYSTEM_ROLE_NAMES: Final[frozenset[str]] = frozenset(r[0] for r in SYSTEM_ROLES)
ROLE_LEVEL: Final[dict[str, int]] = {SUPER_ADMIN_ROLE: 1, PROVINCE_ROLE: 2, COMMUNE_ROLE: 3}
LEVEL_LABEL: Final[dict[int, str]] = {
    1: "Cấp 1 · Tổng hệ thống",
    2: "Cấp 2 · Cấp tỉnh",
    3: "Cấp 3 · Cấp xã/phường",
}
NO_LEVEL: Final[int] = 9  # tài khoản chưa có vai trò

# Vai trò cũ → vai trò mới (None = bỏ: tài khoản bị khoá chờ cấp trên cấp lại đúng cấp)
RETIRED_ROLES: Final[dict[str, str | None]] = {
    "truong_ban": PROVINCE_ROLE,  # Lãnh đạo BCH
    "truc_ban": PROVINCE_ROLE,  # Trực ban điều hành
    "can_bo_xa": COMMUNE_ROLE,  # Cán bộ PCTT xã
    "chi_huy_cum": None,  # bỏ cụm (địa bàn huyện cũ)
    "thu_kho": None,
    "quan_sat": None,
}


def scope_fits(role: str, domain: str) -> bool:
    """Cấp 1, Cấp 2 chỉ ở phạm vi toàn tỉnh; Cấp 3 đúng 1 xã (không cụm, không toàn tỉnh)."""
    if ROLE_LEVEL.get(role, NO_LEVEL) <= 2:
        return domain == GLOBAL_SCOPE
    return role == COMMUNE_ROLE and domain != GLOBAL_SCOPE and not domain.endswith("/*")


def level_of(roles: list[str] | set[str]) -> int:
    """Cấp cao nhất (số nhỏ nhất) trong các vai trò; không có vai trò hợp lệ → NO_LEVEL."""
    return min((ROLE_LEVEL.get(r, NO_LEVEL) for r in roles), default=NO_LEVEL)
