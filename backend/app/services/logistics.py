"""Số liệu hậu cần cán bộ cập nhật tay: trạng thái / nhiên liệu phương tiện, nhập thêm hàng vào kho, nhiên liệu dự trữ,
vật tư mang theo khi điều động. Hàm thuần — API ở app/api/v1/resources.py và sos.py, kiểm thử ở tests/test_logistics.py.

Nguyên tắc: số chưa có ai báo thì hiện "chưa cập nhật", không điền số mặc định (trước đây nhiên liệu mọi phương tiện
"100%" khi chạy thật); chặn gõ nhầm trước khi số liệu vào màn hình chỉ huy và gợi ý điều động.
"""

from __future__ import annotations

from datetime import date

from pydantic import BaseModel, Field, model_validator

FUEL_LOW = 20  # % — phương tiện có mức nhiên liệu đã báo dưới ngưỡng này không được gợi ý điều động
VEHICLE_STATUS_LABEL = {
    "san_sang": "Sẵn sàng",
    "nhiem_vu": "Đang làm nhiệm vụ",
    "bao_duong": "Bảo dưỡng / hỏng",
}


class VehicleUpdateIn(BaseModel):
    """Trực ban / đơn vị quản lý báo tình trạng phương tiện. "Đang làm nhiệm vụ" chỉ do lệnh điều động gán."""

    status: str | None = Field(None, pattern="^(san_sang|bao_duong)$")
    fuel_level: int | None = Field(None, ge=0, le=100, description="Mức nhiên liệu (%)")
    note: str | None = Field(None, max_length=200, description="Lý do bảo dưỡng / hỏng, nguồn báo")

    @model_validator(mode="after")
    def _something_to_update(self) -> VehicleUpdateIn:
        if self.status is None and self.fuel_level is None:
            raise ValueError("Chọn trạng thái hoặc nhập mức nhiên liệu")
        return self


class ReceiveIn(BaseModel):
    item_code: str = Field(min_length=1, max_length=40)
    quantity: int = Field(gt=0, le=10_000_000)
    safety_quota: int | None = Field(
        None, ge=0, le=10_000_000, description="Bắt buộc khi mặt hàng mới ở kho này"
    )
    expiry_date: date | None = None
    source: str | None = Field(None, max_length=200, description="VD: Hàng cứu trợ của Hội Chữ thập đỏ")


def merged_expiry(old: date | None, new: date | None) -> date | None:
    """Lô mới trộn với hàng đang có: hạn dùng của dòng tồn kho là hạn SỚM NHẤT — hàng cũ hết hạn trước, cảnh báo
    "sắp hết hạn" phải theo lô cũ (lấy hạn lô mới là che mất hàng sắp hỏng)."""
    dates = [d for d in (old, new) if d]
    return min(dates) if dates else None


def receive_problem(body: ReceiveIn, existing: bool, today: date) -> str | None:
    if not existing and body.safety_quota is None:
        return "Mặt hàng mới ở kho này — nhập định mức an toàn để hệ thống tính % dự trữ"
    if body.expiry_date and body.expiry_date < today:
        return "Hạn dùng đã qua — không nhập hàng hết hạn vào kho cứu trợ"
    return None


class FuelDepotIn(BaseModel):
    gasoline_l: int = Field(ge=0, le=10_000_000)
    diesel_l: int = Field(ge=0, le=10_000_000)
    source: str | None = Field(None, max_length=200)


def depot_problem(gasoline: int, diesel: int, capacity: int) -> str | None:
    if capacity and gasoline + diesel > capacity:
        return f"Tổng xăng + dầu ({gasoline + diesel} L) vượt sức chứa ({capacity} L) — kiểm tra lại số liệu"
    return None


def supplies_shortage(supplies: dict[str, int], stock: dict[str, int]) -> list[str]:
    """Mã mặt hàng kho không đủ cho lệnh điều động (rỗng = đủ)."""
    return [code for code, n in supplies.items() if n > 0 and stock.get(code, 0) < n]
