"""Khai báo các loại dữ liệu nhập được từ tệp. Thêm loại mới = thêm một ``Dataset`` vào ``DATASETS`` (+ README §2.4).

Tên cột trong tệp viết không dấu, gạch dưới (``vi_do``); tệp có thể viết có dấu / hoa thường (``Vĩ độ``) — xem
``parsing.norm_key``. Giá trị liệt kê cũng so khớp không dấu (``Trường học`` = ``truong_hoc``).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

MAX_ROWS = 20_000
MAX_FILE_BYTES = 20 * 1024 * 1024
DEFAULT_VALID_UNTIL = "2099-12-31"  # vùng nguy hiểm theo bản đồ phân vùng chính thức: không hết hạn


@dataclass(frozen=True)
class Field:
    name: str  # tên cột trong tệp / thuộc tính GeoJSON
    label: str  # mô tả tiếng Việt
    column: str | None = None  # cột CSDL; None = chỉ dùng để xử lý (VD ngưỡng báo động ghép thành jsonb)
    kind: str = "text"  # text | code | int | float | date | bool | enum | phone | list
    required: bool = False
    choices: tuple[str, ...] = ()
    min: float | None = None
    max: float | None = None
    default: Any = None
    example: str = ""


@dataclass(frozen=True)
class Ref:
    """Cột tham chiếu tới bảng khác theo mã: giá trị trong tệp là mã, cột CSDL nhận id."""

    field: str  # tên trường trong tệp (VD ma_kho)
    column: str  # cột CSDL (VD warehouse_id)
    table: str  # bảng đích
    key: str = "code"  # cột mã ở bảng đích
    value: str = "id"  # cột lấy giá trị
    where: str = "TRUE"  # điều kiện SQL tĩnh trên bảng đích (VD chỉ nhận mã cấp xã)


@dataclass(frozen=True)
class Dataset:
    name: str
    label: str
    description: str
    table: str
    key: tuple[str, ...]  # cột CSDL làm khoá cập nhật (ON CONFLICT)
    fields: tuple[Field, ...]
    geometry: str = "none"  # none | point | polygon
    geometry_columns: tuple[str, ...] = ()  # cột hình học nhận vị trí / vùng
    geometry_required: bool = True
    admin_unit: bool = False  # gán admin_unit_id theo ma_xa hoặc vị trí
    refs: tuple[Ref, ...] = ()
    insert_only: tuple[str, ...] = ()  # cột chỉ ghi khi thêm mới (không ghi đè khi cập nhật)
    fixed: dict[str, Any] = field(default_factory=dict)  # cột cố định (luôn ghi)
    fixed_insert: dict[str, Any] = field(default_factory=dict)  # cột cố định chỉ khi thêm mới
    touch: tuple[str, ...] = ()  # cột thời gian đặt now() khi ghi
    update_only: bool = False  # chỉ cập nhật bản ghi đã có (VD ranh giới 56 xã)
    replaceable: bool = False  # cho phép chế độ "thay toàn bộ" (xoá bản ghi không có trong tệp)
    replace_scope: str = "TRUE"  # điều kiện SQL tĩnh giới hạn dòng bị xoá khi thay toàn bộ
    # Thay toàn bộ chỉ trong phạm vi các giá trị của 1 cột trong tệp: (tên cột, điều kiện SQL dùng :within)
    # VD xóm: chỉ xoá xóm cũ của những xã CÓ trong tệp, xã khác giữ nguyên
    replace_within: tuple[str, str] | None = None
    conflict_where: str = (
        ""  # chỉ cập nhật bản ghi trùng mã thoả điều kiện (bảo vệ bản ghi khác loại cùng bảng)
    )
    public: bool = False  # dữ liệu hiện trên cổng công khai → xoá cache công khai sau khi nhập

    def get_field(self, name: str) -> Field | None:
        return next((f for f in self.fields if f.name == name), None)


def code_field(example: str) -> Field:
    return Field(
        "ma", "Mã định danh (duy nhất, không đổi giữa các lần nhập)", "code", "code", True, example=example
    )


LAT = Field("vi_do", "Vĩ độ WGS84 (VD 22.6657)", None, "float", False, min=20, max=25, example="22.6657")
LON = Field(
    "kinh_do", "Kinh độ WGS84 (VD 106.2522)", None, "float", False, min=103, max=108, example="106.2522"
)
MA_XA = Field("ma_xa", "Mã xã/phường (trống = tự xác định theo vị trí)", None, "code", example="CB-THUCPHAN")
LEVEL3 = ("do", "cam", "vang")

DATASETS: dict[str, Dataset] = {
    d.name: d
    for d in (
        Dataset(
            "ranh_gioi_xa",
            "Ranh giới xã/phường",
            "Cập nhật ranh giới chính thức (thay ranh giới Voronoi xấp xỉ), dân số, số hộ cho 56 xã/phường đã có. "
            "Chỉ nhận GeoJSON (Polygon / MultiPolygon, WGS84). Phạm vi phân quyền và việc gán SOS, phản ánh vào xã "
            "dựa trên ranh giới này.",
            "spatial_admin.administrative_units",
            ("code",),
            (
                Field("ma", "Mã xã/phường đã có trong hệ thống", "code", "code", True, example="CB-THUCPHAN"),
                Field("ten", "Tên chính thức (trống = giữ nguyên)", "name", example="Thục Phán"),
                Field("dan_so", "Dân số", "population", "int", min=0, example="12500"),
                Field("so_ho", "Số hộ", "households", "int", min=0, example="3100"),
            ),
            geometry="polygon",
            geometry_columns=("geom",),
            update_only=True,
            public=True,
        ),
        Dataset(
            "xom",
            "Xóm / tổ dân phố",
            "Tên xóm, tổ dân phố theo nghị quyết sắp xếp của HĐND từng xã / phường — người dân chọn khi gửi phản ánh; "
            "dùng cho tìm kiếm và nhận biết xóm trong tin nhắn SOS. Không cần toạ độ. Sau sáp nhập: chọn “Thay toàn "
            "bộ” → xóm cũ của các xã CÓ trong tệp bị xoá, xã khác giữ nguyên. Mã trống = tự sinh theo mã xã + tên.",
            "spatial_admin.administrative_units",
            ("code",),
            (
                Field("ma", "Mã xóm (trống = tự sinh: <mã xã>-<tên không dấu>)", "code", "code", example=""),
                Field("ma_xa", "Mã xã/phường trực thuộc", None, "code", True, example="CB-PHUCHOA"),
                Field("ten", "Tên xóm / tổ dân phố", "name", required=True, example="Xóm Nà Pò"),
                Field(
                    "loai",
                    "Loại",
                    "unit_type",
                    "enum",
                    choices=("xom", "to_dan_pho", "thon", "ban"),
                    default="xom",
                    example="xom",
                ),
                Field("dan_so", "Dân số", "population", "int", min=0, example="320"),
                Field("so_ho", "Số hộ", "households", "int", min=0, example="80"),
            ),
            refs=(Ref("ma_xa", "parent_id", "spatial_admin.administrative_units", where="level = 'xa'"),),
            fixed={"level": "thon"},
            conflict_where="spatial_admin.administrative_units.level = 'thon'",
            replaceable=True,
            replace_scope="level = 'thon'",
            replace_within=(
                "ma_xa",
                "parent_id IN (SELECT id FROM spatial_admin.administrative_units WHERE code = ANY(:within))",
            ),
            public=True,
        ),
        Dataset(
            "diem_so_tan",
            "Điểm sơ tán",
            "Điểm sơ tán theo phương án ứng phó của từng xã — hiện trên cổng công khai (“Tôi đang ở đâu?”).",
            "resources.evacuation_sites",
            ("code",),
            (
                code_field("CB-DST-001"),
                Field("ten", "Tên điểm sơ tán", "name", required=True, example="Trường THCS Hợp Giang"),
                Field(
                    "loai",
                    "Loại",
                    "site_type",
                    "enum",
                    True,
                    choices=("truong_hoc", "nha_van_hoa", "tru_so", "doanh_trai", "khac"),
                    example="truong_hoc",
                ),
                Field("suc_chua", "Sức chứa (người)", "capacity", "int", True, min=1, example="300"),
                Field("dang_o", "Số người đang ở", "current_occupancy", "int", min=0, default=0, example="0"),
                # Hiện CÔNG KHAI trên cổng (nút Gọi, bản nhẹ) — README 9.1
                Field(
                    "sdt_lien_he",
                    "Số điện thoại trực — CÔNG KHAI cho người dân (số của điểm / UBND xã, không dùng số cá nhân)",
                    "contact_phone",
                    "phone",
                    example="0206 3852 000",
                ),
                LAT,
                LON,
                MA_XA,
            ),
            geometry="point",
            geometry_columns=("location",),
            admin_unit=True,
            replaceable=True,
            public=True,
        ),
        Dataset(
            "vung_nguy_hiem",
            "Vùng nguy hiểm",
            "Vùng nguy cơ sạt lở / ngập / lũ quét theo bản đồ phân vùng chính thức — hiện trên cổng công khai, "
            "chỉ đường an toàn tự tránh. Chỉ nhận GeoJSON (Polygon / MultiPolygon, WGS84). Thay toàn bộ không xoá "
            "vùng do cảm biến tự tạo.",
            "iot_telemetry.hazard_zones",
            ("code",),
            (
                code_field("CB-VNH-001"),
                Field("ten", "Tên vùng", "name", required=True, example="Khu dân cư xóm Nà Rì"),
                Field(
                    "loai",
                    "Loại",
                    "type",
                    "enum",
                    True,
                    choices=("sat_lo", "ngap", "lu_quet"),
                    example="sat_lo",
                ),
                Field("muc_do", "Mức độ", "level", "enum", True, choices=LEVEL3, example="do"),
                Field("do_sau_m", "Độ sâu ngập (m, vùng ngập)", "depth_m", "float", min=0, example=""),
                Field(
                    "hieu_luc_den",
                    "Hiệu lực đến ngày (trống = không thời hạn)",
                    "valid_until",
                    "date",
                    default=DEFAULT_VALID_UNTIL,
                    example="",
                ),
                MA_XA,
            ),
            geometry="polygon",
            geometry_columns=("geom",),
            admin_unit=True,
            fixed={"source": "import"},
            replaceable=True,
            replace_scope="source <> 'sensor'",
            public=True,
        ),
        Dataset(
            "diem_nguy_hiem",
            "Điểm nguy hiểm",
            "Điểm sạt lở, điểm đen giao thông, hạ tầng hư hỏng.",
            "iot_telemetry.hazard_points",
            ("code",),
            (
                code_field("CB-DNH-001"),
                Field("ten", "Tên điểm", "name", required=True, example="Taluy Km 12 QL34"),
                Field(
                    "loai",
                    "Loại",
                    "type",
                    "enum",
                    True,
                    choices=("sat_lo", "giao_thong", "ha_tang"),
                    example="sat_lo",
                ),
                Field("muc_do", "Mức độ", "level", "enum", True, choices=LEVEL3, example="cam"),
                Field("mo_ta", "Mô tả", "description", example="Nứt taluy dương dài 30 m"),
                Field(
                    "dang_hoat_dong", "Còn nguy hiểm (có/không)", "active", "bool", default=True, example="có"
                ),
                LAT,
                LON,
                MA_XA,
            ),
            geometry="point",
            geometry_columns=("location",),
            admin_unit=True,
            replaceable=True,
            public=True,
        ),
        Dataset(
            "danh_ba",
            "Danh bạ chỉ huy & đường dây nóng",
            "Danh bạ phân cấp tỉnh → xã → thôn. Đường dây nóng trên cổng công khai lấy các dòng cấp “tinh” có "
            "cơ quan “Văn phòng thường trực BCH” hoặc “BCH PCTT & TKCN tỉnh”.",
            "communications.contacts",
            ("code",),
            (
                code_field("CB-DB-001"),
                Field(
                    "ma_cap_tren",
                    "Mã dòng cấp trên (trong tệp hoặc đã có; trống = cấp cao nhất)",
                    None,
                    "code",
                    example="",
                ),
                Field("cap", "Cấp", "level", "enum", True, choices=("tinh", "xa", "thon"), example="tinh"),
                Field("co_quan", "Cơ quan", "org", required=True, example="Văn phòng thường trực BCH"),
                Field("ho_ten", "Họ tên", "full_name", required=True, example="Nguyễn Văn A"),
                Field("chuc_vu", "Chức vụ", "position", required=True, example="Chánh Văn phòng"),
                Field("sdt", "Số điện thoại", "phone", "phone", True, example="0206 3852 000"),
                Field("tan_so_vo_tuyen", "Tần số vô tuyến", "radio_freq", example=""),
                Field(
                    "trang_thai",
                    "Trạng thái",
                    "status",
                    "enum",
                    choices=("truc", "san_sang", "vang"),
                    default="truc",
                    example="truc",
                ),
                Field("thu_tu", "Thứ tự hiển thị", "sort", "int", default=0, example="1"),
                MA_XA,
            ),
            admin_unit=True,
            replaceable=True,
            public=True,
        ),
        Dataset(
            "tram_quan_trac",
            "Trạm quan trắc",
            "Trạm đo mưa, mực nước, cảm biến nghiêng / độ ẩm đất và ngưỡng báo động chính thức. Trạm mới chờ "
            "thiết bị IoT (trang Nguồn dữ liệu) — không bao giờ bị bộ mô phỏng sinh số đo.",
            "iot_telemetry.monitoring_stations",
            ("id",),
            (
                Field("ma", "Mã trạm", "id", "code", True, example="CB-WL-BANGGIANG"),
                Field("ten", "Tên trạm", "name", required=True, example="Trạm thuỷ văn Cao Bằng"),
                Field(
                    "loai",
                    "Loại",
                    "type",
                    "enum",
                    True,
                    choices=("luong_mua", "muc_nuoc", "do_nghieng", "do_am_dat"),
                    example="muc_nuoc",
                ),
                Field("song", "Sông", "river", example="Bằng Giang"),
                Field("don_vi", "Đơn vị đo (mm, m, °, %)", "unit", required=True, example="m"),
                Field("bao_dong_1", "Ngưỡng báo động I", None, "float", example="180"),
                Field("bao_dong_2", "Ngưỡng báo động II", None, "float", example="181"),
                Field("bao_dong_3", "Ngưỡng báo động III", None, "float", example="182"),
                LAT,
                LON,
                MA_XA,
            ),
            geometry="point",
            geometry_columns=("location",),
            admin_unit=True,
            fixed_insert={"source": "external"},
        ),
        Dataset(
            "ho_chua",
            "Hồ chứa",
            "Hồ thuỷ điện / thuỷ lợi (thông số tĩnh). Mực nước, cửa xả, lưu lượng vận hành: trực ban cập nhật ở Dashboard → "
            "chuyên đề Hồ chứa & Xả lũ (nút “Cập nhật vận hành”), không nhập ở đây.",
            "iot_telemetry.reservoirs",
            ("id",),
            (
                Field("ma", "Mã hồ", "id", "code", True, example="HO-BANGGIANG"),
                Field("ten", "Tên hồ", "name", required=True, example="Thuỷ điện Bằng Giang"),
                Field("song", "Sông", "river", example="Bằng Giang"),
                Field("cong_suat_mw", "Công suất (MW)", "capacity_mw", "float", min=0, example="11"),
                Field("mnbt_m", "Mực nước dâng bình thường (m)", "normal_level", "float", example="190"),
                Field("so_cua_xa", "Số cửa xả", "spill_gates", "int", min=0, default=0, example="3"),
                LAT,
                LON,
                MA_XA,
            ),
            geometry="point",
            geometry_columns=("location",),
            admin_unit=True,
            touch=("updated_at",),
            public=True,
        ),
        Dataset(
            "kho",
            "Kho vật tư",
            "Kho dự trữ vật tư cứu trợ các cấp.",
            "resources.warehouses",
            ("code",),
            (
                code_field("CB-KHO-001"),
                Field("ten", "Tên kho", "name", required=True, example="Kho BCH tỉnh"),
                Field(
                    "cap",
                    "Cấp",
                    "level",
                    "enum",
                    True,
                    choices=("tinh", "cum", "xa", "da_chien"),
                    example="tinh",
                ),
                Field("thu_kho", "Thủ kho", "manager", example="Trần Văn B"),
                Field("sdt", "Số điện thoại", "phone", "phone", example="0912 000 000"),
                LAT,
                LON,
                MA_XA,
            ),
            geometry="point",
            geometry_columns=("location",),
            admin_unit=True,
        ),
        Dataset(
            "ton_kho",
            "Tồn kho vật tư",
            "Số lượng và định mức từng vật tư ở từng kho (kho phải có trước — nhập “Kho vật tư” trước).",
            "resources.inventory",
            ("warehouse_id", "item_code"),
            (
                Field("ma_kho", "Mã kho", None, "code", True, example="CB-KHO-001"),
                Field(
                    "ma_vat_tu",
                    "Mã vật tư (danh mục trên trang Vật tư)",
                    None,
                    "code",
                    True,
                    example="MI_TOM",
                ),
                Field("so_luong", "Số lượng hiện có", "quantity", "int", True, min=0, example="500"),
                Field("dinh_muc", "Định mức an toàn", "safety_quota", "int", True, min=0, example="400"),
                Field("han_su_dung", "Hạn sử dụng", "expiry_date", "date", example="2027-06-30"),
            ),
            refs=(
                Ref("ma_kho", "warehouse_id", "resources.warehouses"),
                Ref("ma_vat_tu", "item_code", "resources.items", key="code", value="code"),
            ),
            touch=("last_updated",),
        ),
        Dataset(
            "luc_luong",
            "Lực lượng",
            "Đơn vị lực lượng ứng cứu. Vị trí là nơi đóng quân; vị trí hiện tại chỉ đặt khi thêm mới "
            "(sau đó cập nhật theo GPS / điều động).",
            "resources.forces",
            ("code",),
            (
                code_field("CB-LL-001"),
                Field("ten", "Tên đơn vị", "name", required=True, example="Đại đội công binh"),
                Field(
                    "loai",
                    "Loại",
                    "org_type",
                    "enum",
                    True,
                    choices=("quan_su", "cong_an", "bien_phong", "dan_quan", "tinh_nguyen", "y_te"),
                    example="quan_su",
                ),
                Field("cap", "Cấp", "level", "enum", True, choices=("tinh", "xa"), example="tinh"),
                Field("noi_dong_quan", "Nơi đóng quân", "base_name", example="TP. Cao Bằng"),
                Field("chi_huy", "Chỉ huy", "commander", example="Đại uý Lê Văn C"),
                Field("sdt", "Số điện thoại", "contact_phone", "phone", example="0912 000 001"),
                Field("tan_so_vo_tuyen", "Tần số vô tuyến", "radio_freq", example=""),
                Field("quan_so", "Quân số", "personnel_total", "int", True, min=0, example="60"),
                Field("san_sang", "Quân số sẵn sàng", "personnel_ready", "int", min=0, example="50"),
                Field("ky_nang", "Kỹ năng (phân tách bằng ;)", "skills", "list", example="cuu_nan;vuot_lu"),
                LAT,
                LON,
                MA_XA,
            ),
            geometry="point",
            geometry_columns=("home_location", "location"),
            admin_unit=True,
            insert_only=("location",),
            touch=("updated_at",),
        ),
        Dataset(
            "phuong_tien",
            "Phương tiện",
            "Phương tiện, thiết bị cứu hộ (lực lượng quản lý phải có trước).",
            "resources.vehicles",
            ("code",),
            (
                code_field("CB-PT-001"),
                Field("ten", "Tên phương tiện", "name", required=True, example="Xuồng máy 01"),
                Field(
                    "loai",
                    "Loại",
                    "vehicle_type",
                    "enum",
                    True,
                    choices=(
                        "xuong",
                        "ca_no",
                        "ghe",
                        "xe_loi_nuoc",
                        "xe_boc_thep",
                        "xe_tai",
                        "may_xuc",
                        "may_ui",
                        "xe_cuu_thuong",
                        "may_phat_dien",
                        "may_cua",
                        "flycam",
                        "bts_luu_dong",
                    ),
                    example="xuong",
                ),
                Field(
                    "nhom",
                    "Nhóm",
                    "category",
                    "enum",
                    True,
                    choices=("duong_thuy", "duong_bo", "thiet_bi"),
                    example="duong_thuy",
                ),
                Field("ma_luc_luong", "Mã lực lượng quản lý", None, "code", example="CB-LL-001"),
                Field("suc_cho", "Sức chở (người)", "capacity", "int", min=0, example="8"),
                LAT,
                LON,
            ),
            geometry="point",
            geometry_columns=("current_location",),
            geometry_required=False,
            refs=(Ref("ma_luc_luong", "force_id", "resources.forces"),),
            insert_only=("current_location",),
            touch=("updated_at",),
        ),
        Dataset(
            "cay_xang",
            "Điểm cấp nhiên liệu",
            "Cây xăng / kho nhiên liệu dự trữ cho phương tiện cứu hộ.",
            "resources.fuel_depots",
            ("code",),
            (
                code_field("CB-CX-001"),
                Field("ten", "Tên điểm", "name", required=True, example="Cửa hàng xăng dầu số 1"),
                Field("xang_l", "Xăng (lít)", "gasoline_l", "int", True, min=0, example="8000"),
                Field("dau_l", "Dầu (lít)", "diesel_l", "int", True, min=0, example="12000"),
                Field("suc_chua_l", "Sức chứa (lít)", "capacity_l", "int", True, min=0, example="30000"),
                LAT,
                LON,
                MA_XA,
            ),
            geometry="point",
            geometry_columns=("location",),
            admin_unit=True,
            replaceable=True,
        ),
    )
}

# Loại dữ liệu xã/phường được GỬI (quyền data.submit) → chờ cấp tỉnh (data.import) phê duyệt rồi mới ghi / hiển thị.
# Giá trị: giới hạn cấp {trường: các giá trị được phép} — VD xã chỉ gửi danh bạ cấp xã / thôn, kho & lực lượng cấp xã.
# Loại không có ở đây (ranh giới xã, trạm quan trắc, hồ chứa, cây xăng) chỉ cấp tỉnh nhập.
SUBMITTABLE: dict[str, dict[str, tuple[str, ...]]] = {
    "xom": {},
    "diem_so_tan": {},
    "vung_nguy_hiem": {},
    "diem_nguy_hiem": {},
    "danh_ba": {"cap": ("xa", "thon")},
    "kho": {"cap": ("xa",)},
    "ton_kho": {},
    "luc_luong": {"cap": ("xa",)},
    "phuong_tien": {},
}
# Xã gửi "thay toàn bộ": chỉ xoá bản ghi thuộc xã mình, thêm điều kiện riêng (SQL tĩnh) từng loại
SCOPED_REPLACE_EXTRA: dict[str, str] = {"danh_ba": "level IN ('xa', 'thon')"}
