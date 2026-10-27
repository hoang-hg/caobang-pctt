# Phạm vi thiên tai hệ thống theo dõi

Quyết định của BCH (27/10/2026): hệ thống **chỉ nhấn mạnh 3 nhóm thiên tai**

1. **Mưa lớn**
2. **Sạt lở, lũ quét**
3. **Ngập lụt**

Các phần ngoài 3 nhóm được xử lý như bảng dưới. Cấu hình giao diện nằm một chỗ: `frontend/src/utils/hazardScope.js`.

| Phần | Cách xử lý | Bật lại / ghi chú | PR |
|---|---|---|---|
| Bão, áp thấp nhiệt đới — lớp "Đường đi của bão" (Bản đồ giám sát), nút "Nhập / cập nhật bản tin bão", mẫu tin "Bão / Áp thấp nhiệt đới", lý do kết thúc cảnh báo "Bão / áp thấp đã suy yếu", chữ "bão" trong hướng dẫn | **Ẩn khỏi giao diện**. API `/map/storm-track`, bản tin bão đã lưu, mẫu tin trong CSDL giữ nguyên; trang Bản đồ không tải bản tin bão | `SHOW_STORM = true` | #136 |
| Loại đợt thiên tai "Rét hại, sương muối", "Khác" | **Không còn trong danh sách chọn** khi tạo đợt (còn: Mưa lớn, Sạt lở đất, Lũ quét, Lũ / ngập lụt). Đợt cũ đã lưu loại này vẫn hiện đúng loại; máy chủ vẫn nhận các mã cũ | `EVENT_HAZARD_CHOICES` | #136 |
| Hồ chứa, thủy điện, xả lũ | Hệ thống **không còn hồ chứa** | — | (PR tiếp theo) |
| Sắp xếp giao diện theo 3 nhóm (tab Tổng quan, lớp bản đồ, mẫu tin, cổng người dân, hướng dẫn) | Làm sau khi bỏ hồ chứa | — | (PR tiếp theo) |
