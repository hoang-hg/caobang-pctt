"""Nhập dữ liệu chính thức từ tệp CSV / Excel / GeoJSON (README §2.4).

specs.py      khai báo loại dữ liệu (cột, kiểu, ràng buộc, bảng đích)
parsing.py    đọc tệp, chuẩn hoá giá trị (hàm thuần)
engine.py     kiểm tra (validate) và ghi (apply) trong 1 transaction
templates.py  tệp mẫu, mô tả cho giao diện
__main__.py   dòng lệnh cho người vận hành
"""

from app.services.data_import.engine import Report, apply, validate
from app.services.data_import.parsing import ImportFileError
from app.services.data_import.specs import DATASETS

__all__ = ["DATASETS", "ImportFileError", "Report", "apply", "validate"]
