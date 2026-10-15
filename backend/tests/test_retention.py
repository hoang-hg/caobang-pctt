"""Thời hạn lưu dữ liệu cá nhân (DB4 — services/retention.py: clear_old_pii). Câu SQL thử trên stack có CSDL (README 12);
ở đây kiểm tra phần không cần CSDL: mặc định giữ mãi, xoá ảnh đúng khoá, lỗi kho ảnh không chặn việc ẩn."""

from app.services import retention


async def test_pii_kept_forever_by_default(monkeypatch):
    """PII_RETENTION_DAYS = 0 (mặc định, chưa có quyết định của đơn vị chủ quản) → không chạm CSDL, không ẩn gì."""

    async def no_db(*a, **kw):
        raise AssertionError("không được truy vấn CSDL khi giữ mãi")

    monkeypatch.setattr(retention, "fetch_all", no_db)
    monkeypatch.setattr(retention.settings, "pii_retention_days", 0)
    assert await retention.clear_old_pii() == {}


async def test_pii_clears_photos_and_survives_storage_errors(monkeypatch):
    """Phản ánh đến hạn: xoá cả ảnh gốc lẫn ảnh thu nhỏ khỏi kho; kho ảnh lỗi chỉ ghi log, vẫn đếm bản ghi đã ẩn."""
    calls: list[str] = []

    async def fake_fetch_all(sql, params):
        assert params == {"d": 90}
        if "citizen_reports" in sql and not calls:
            calls.append("phan_anh")
            return [{"photos": [{"key": "reports/a/0.jpg", "thumb_key": "reports/a/0_thumb.jpg"}]}]
        return []

    deleted: list[str] = []

    async def fake_delete(key):
        deleted.append(key)
        if key.endswith("_thumb.jpg"):
            raise OSError("kho ảnh không trả lời")

    monkeypatch.setattr(retention, "fetch_all", fake_fetch_all)
    monkeypatch.setattr(retention.storage, "delete", fake_delete)
    assert await retention.clear_old_pii(days=90) == {"phản ánh": 1}
    assert deleted == ["reports/a/0.jpg", "reports/a/0_thumb.jpg"]


def test_pii_queries_only_touch_finished_records():
    """Chỉ ẩn phiếu SOS đã xong, phản ánh đã qua duyệt; mỗi câu chỉ chọn bản ghi chưa ẩn (chạy lại nhiều lần vẫn đúng)."""
    sql = {name: q for name, q in retention.PII_TARGETS}
    assert "status = 'hoan_thanh'" in sql["phiếu SOS"]
    assert "status <> 'cho_duyet'" in sql["phản ánh"]
    assert all("pii_cleared_at IS NULL" in q for q in sql.values())
