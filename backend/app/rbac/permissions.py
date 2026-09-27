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
    RBAC = "rbac"  # quản trị vai trò
    INTEGRATION = "integration"  # nguồn dữ liệu ngoài, thiết bị IoT
    REPORT = "report"  # phản ánh hiện trường của người dân
    DATA = "data"  # nhập dữ liệu chính thức từ tệp


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
    Permission(R.SOS, A.VIEW, True, "Xem phiếu SOS"),
    Permission(R.SOS, A.CREATE, True, "Tiếp nhận / tạo phiếu SOS"),
    Permission(R.SOS, A.UPDATE, True, "Chuyển trạng thái, đổi mức ưu tiên phiếu SOS"),
    Permission(R.SOS, A.RESOLVE, True, "Xác nhận đã cứu an toàn"),
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
    Permission(R.RBAC, A.MANAGE, False, "Quản trị vai trò (tạo / sửa / xoá role)"),
    Permission(R.REPORT, A.VIEW, True, "Xem phản ánh của người dân (kể cả SĐT người gửi)"),
    Permission(R.REPORT, A.MODERATE, True, "Duyệt / từ chối / chuyển SOS phản ánh của người dân"),
    Permission(R.INTEGRATION, A.VIEW, False, "Xem nguồn dữ liệu, thiết bị IoT, giám sát kết nối"),
    Permission(R.INTEGRATION, A.MANAGE, False, "Cấu hình nguồn dữ liệu, đăng ký thiết bị IoT, cấp khoá"),
    Permission(
        R.DATA, A.IMPORT, False, "Nhập dữ liệu chính thức từ tệp (điểm sơ tán, vùng nguy hiểm, danh bạ…)"
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
# Vai trò hệ thống (seed mỗi lần khởi động, không xoá được)
#   name, tên hiển thị, mô tả, được uỷ quyền?, danh sách quyền
# ---------------------------------------------------------------------------
_OPS = (
    "monitoring.view",
    "sos.view",
    "sos.create",
    "sos.update",
    "sos.resolve",
    "dispatch.create",
    "resource.view",
)

SYSTEM_ROLES: Final[tuple[tuple[str, str, str, bool, list[tuple[str, str]]], ...]] = (
    (SUPER_ADMIN_ROLE, "Quản trị hệ thống", "Toàn quyền, kể cả quản trị vai trò", False, [("*", "*")]),
    (
        "truong_ban",
        "Lãnh đạo BCH PCTT & TKCN",
        "Chỉ huy toàn diện, phê duyệt cảnh báo, quản lý tài khoản — không quản trị định nghĩa vai trò",
        False,
        perms(*(p.code for p in ALL_PERMISSIONS if p.code != "rbac.manage")),
    ),
    (
        "admin_tinh",
        "Quản trị tỉnh",
        "Quản trị hệ thống cấp tỉnh: Quản lý tài khoản, phân quyền cấp dưới, điều động, duyệt phản ánh và điều hành tác chiến toàn tỉnh",
        False,
        perms(
            "monitoring.view",
            "sos.view",
            "sos.create",
            "sos.update",
            "sos.resolve",
            "dispatch.create",
            "resource.view",
            "alert.view",
            "contact.view",
            "audit.view",
            "integration.view",
            "user.view",
            "user.manage",
            "report.view",
            "report.moderate",
            "data.import",
        ),
    ),
    (
        "admin_xa",
        "Quản trị xã/phường",
        "Quản trị cấp xã/phường: Tạo tài khoản cán bộ xã, duyệt phản ánh và xử lý SOS trong địa bàn xã",
        True,
        perms(
            "monitoring.view",
            "sos.view",
            "sos.create",
            "sos.update",
            "sos.resolve",
            "resource.view",
            "alert.view",
            "contact.view",
            "user.view",
            "user.manage",
            "report.view",
            "report.moderate",
        ),
    ),
    (
        "chi_huy_cum",
        "Chỉ huy cụm (địa bàn huyện cũ)",
        "Điều hành, phê duyệt cảnh báo và quản lý tài khoản trong cụm được giao",
        True,
        perms(
            *_OPS,
            "inventory.issue",
            "vehicle.update",
            "alert.view",
            "alert.create",
            "alert.approve",
            "contact.view",
            "user.view",
            "user.manage",
            "report.view",
            "report.moderate",
        ),
    ),
    (
        "truc_ban",
        "Trực ban điều hành",
        "Tiếp nhận SOS, điều động, soạn lệnh cảnh báo (Maker), vận hành tổng đài",
        True,
        perms(
            *_OPS,
            "vehicle.update",
            "alert.view",
            "alert.create",
            "contact.view",
            "hotline.operate",
            "integration.view",
            "report.view",
            "report.moderate",
        ),
    ),
    (
        "can_bo_xa",
        "Cán bộ PCTT xã/phường",
        "Tiếp nhận & cập nhật SOS, theo dõi nguồn lực trong xã",
        True,
        perms(
            "monitoring.view",
            "sos.view",
            "sos.create",
            "sos.update",
            "sos.resolve",
            "resource.view",
            "alert.view",
            "contact.view",
            "report.view",
        ),
    ),
    (
        "thu_kho",
        "Thủ kho",
        "Theo dõi và xuất kho vật tư",
        True,
        perms("monitoring.view", "resource.view", "inventory.issue"),
    ),
    (
        "quan_sat",
        "Quan sát (chỉ xem)",
        "Lãnh đạo sở ngành, cơ quan phối hợp — chỉ xem",
        True,
        perms("monitoring.view", "sos.view", "resource.view", "alert.view", "contact.view"),
    ),
)
SYSTEM_ROLE_NAMES: Final[frozenset[str]] = frozenset(r[0] for r in SYSTEM_ROLES)
NON_DELEGATABLE: Final[frozenset[str]] = frozenset({SUPER_ADMIN_ROLE, "truong_ban", "admin_tinh"})
