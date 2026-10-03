"""Số liệu cán bộ nhập trên bản đồ điều hành: bản tin bão, điểm sự cố, số người ở điểm sơ tán.

Hàm thuần (không I/O) — API ở app/api/v1/map_layers.py và resources.py gọi trước khi ghi, kiểm thử ở
tests/test_map_ops.py. Mục tiêu chung: chặn gõ nhầm trước khi số liệu lên bản đồ chỉ huy và cổng công khai.
"""

from __future__ import annotations

from datetime import datetime, timedelta

from pydantic import BaseModel, Field

# Cấp bão theo Quyết định 18/2021/QĐ-TTg (cấp gió Beaufort mạnh nhất vùng gần tâm)
STORM_CLASSES = (
    (16, "Siêu bão"),
    (12, "Bão rất mạnh"),
    (10, "Bão mạnh"),
    (8, "Bão"),
    (6, "Áp thấp nhiệt đới"),
    (0, "Vùng áp thấp"),
)
STORM_LAT = (0.0, 35.0)  # Biển Đông, Tây Thái Bình Dương gần, đất liền Bắc Bộ – Nam Trung Quốc
STORM_LON = (95.0, 135.0)
STORM_SPAN = timedelta(days=7)  # mốc xa nhất so với giờ phát hành (quá khứ + dự báo)

INCIDENT_TYPES = {"sat_lo": "Sạt lở", "giao_thong": "Sự cố giao thông", "ha_tang": "Sự cố hạ tầng"}
INCIDENT_LEVELS = ("do", "cam", "vang")
INCIDENT_LEVEL_VI = {"do": "rất cao", "cam": "cao", "vang": "trung bình"}
INCIDENT_MAX_HOURS = 7 * 24
# Phản ánh của người dân → loại điểm sự cố gợi ý khi chuyển (cán bộ vẫn chọn lại được)
REPORT_TO_INCIDENT = {
    "sat_lo": "sat_lo",
    "lu_quet": "sat_lo",
    "cay_do": "giao_thong",
    "hu_hong_duong": "giao_thong",
    "sap_cau": "giao_thong",
    "ngap": "giao_thong",
    "dut_dien": "ha_tang",
}
OCCUPANCY_MAX_RATIO = 2  # đang ở > 2 lần sức chứa → gần như chắc gõ thừa chữ số


def active_point_sql(alias: str = "") -> str:
    """Điều kiện SQL "điểm nguy hiểm đang hiệu lực" — dùng chung bản đồ điều hành, cổng công khai, chỉ đường."""
    a = f"{alias}." if alias else ""
    return f"{a}active AND ({a}expires_at IS NULL OR {a}expires_at > now())"


def value_at(
    points: list[tuple[datetime, float]], at: datetime, max_gap: timedelta = timedelta(hours=12)
) -> float | None:
    """Giá trị tại thời điểm ``at``: nội suy tuyến tính giữa hai mốc kề nhau (cách nhau ≤ max_gap); trùng mốc → đúng
    giá trị đó; ngoài khoảng các mốc → None (thanh thời gian hiện "chưa có dự báo", không kéo dài số cuối)."""
    pts = sorted(points)
    for (t0, v0), (t1, v1) in zip(pts, pts[1:], strict=False):
        if t0 <= at <= t1 and t1 - t0 <= max_gap:
            span = (t1 - t0).total_seconds()
            return v0 if span == 0 else round(v0 + (v1 - v0) * (at - t0).total_seconds() / span, 3)
    return next((v for t, v in pts if t == at), None)


def storm_class(wind_level: int | None) -> str:
    level = wind_level or 0
    return next(label for floor, label in STORM_CLASSES if level >= floor)


class StormPoint(BaseModel):
    time: datetime
    lat: float  # vùng hợp lệ kiểm ở storm_problem (báo "đảo vĩ độ / kinh độ" thay vì lỗi kiểu dữ liệu)
    lon: float
    wind_level: int | None = Field(None, ge=0, le=17, description="Cấp gió mạnh nhất (Beaufort)")
    gust_level: int | None = Field(None, ge=0, le=17, description="Giật cấp")
    radius_km: float | None = Field(None, gt=0, le=1000, description="Bán kính gió mạnh từ cấp 6 (km)")


class StormBulletinIn(BaseModel):
    name: str = Field(min_length=2, max_length=120, description="VD: Bão số 3 (YAGI)")
    issued_at: datetime
    source: str | None = Field(
        None, max_length=200, description="VD: Trung tâm Dự báo KTTV quốc gia, tin 16h"
    )
    points: list[StormPoint] = Field(min_length=2, max_length=80)


def storm_problem(body: StormBulletinIn, now: datetime) -> str | None:
    """Lỗi của bản tin bão (None = hợp lệ)."""
    times = [p.time for p in body.points]
    if body.issued_at.tzinfo is None or any(t.tzinfo is None for t in times):
        return "Thời điểm phải kèm múi giờ"
    if body.issued_at > now + timedelta(minutes=5) or body.issued_at < now - timedelta(days=3):
        return "Giờ phát hành không hợp lệ (tương lai hoặc quá 3 ngày)"
    if len(set(times)) != len(times):
        return "Có hai mốc trùng thời điểm"
    if any(abs(t - body.issued_at) > STORM_SPAN for t in times):
        return "Mốc thời gian phải trong vòng 7 ngày quanh giờ phát hành"
    for p in body.points:
        if not (STORM_LAT[0] <= p.lat <= STORM_LAT[1] and STORM_LON[0] <= p.lon <= STORM_LON[1]):
            return f"Toạ độ ({p.lat}, {p.lon}) ngoài khu vực theo dõi — kiểm tra thứ tự vĩ độ / kinh độ"
        if p.gust_level is not None and p.wind_level is not None and p.gust_level < p.wind_level:
            return f"Mốc {p.time:%H:%M %d/%m}: cấp giật ({p.gust_level}) nhỏ hơn cấp gió ({p.wind_level})"
    if not any(t <= body.issued_at + timedelta(hours=1) for t in times):
        return "Thiếu vị trí tâm bão hiện tại (mốc tại hoặc trước giờ phát hành)"
    return None


class IncidentIn(BaseModel):
    lat: float = Field(ge=20, le=25)
    lon: float = Field(ge=103, le=108)
    type: str = Field(pattern="^(sat_lo|giao_thong|ha_tang)$")
    level: str = Field(pattern="^(do|cam|vang)$")
    name: str = Field(min_length=3, max_length=160, description="VD: Cây đổ chắn QL3 km 12")
    description: str | None = Field(None, max_length=1000)
    hours: int = Field(24, ge=1, le=INCIDENT_MAX_HOURS, description="Hiệu lực (giờ) — hết hạn tự ẩn")
    report_id: str | None = Field(None, description="Phản ánh của người dân được chuyển thành điểm sự cố")


class OccupancyIn(BaseModel):
    current_occupancy: int = Field(ge=0, le=100_000)
    source: str | None = Field(None, max_length=200, description="VD: Điện thoại trưởng điểm lúc 15h")


def occupancy_problem(value: int, capacity: int) -> str | None:
    """Vượt sức chứa vẫn nhận (thực tế có lúc chen chúc) nhưng quá 2 lần sức chứa là gõ nhầm."""
    if capacity > 0 and value > capacity * OCCUPANCY_MAX_RATIO:
        return (
            f"{value} người vượt quá {OCCUPANCY_MAX_RATIO} lần sức chứa ({capacity}) — kiểm tra lại số liệu"
        )
    return None
