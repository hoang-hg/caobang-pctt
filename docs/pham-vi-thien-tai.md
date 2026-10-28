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
| Hồ chứa, thủy điện, xả lũ | Hệ thống **không còn hồ chứa**: bỏ tab Hồ chứa (Tổng quan, cổng người dân — link cũ `?tab=hochua` mở Mực nước sông suối), lớp bản đồ, ô "Hồ chứa · Sạt lở" (còn "Sạt lở, đèo dốc"), biểu đồ vận hành dưới biểu đồ mực nước, thẻ bảng số liệu, nút cập nhật vận hành, mẫu tin "Hồ chứa xả lũ", nhóm nhật ký "Hồ chứa", loại nhập dữ liệu "Hồ chứa", tìm kiếm hồ, kịch bản giả lập xả lũ. Máy chủ: bỏ API `/dashboard/reservoirs`, `/dashboard/reservoir-operations`, `/public/reservoirs`, `PATCH /reservoirs/{mã}/operation`, trường `reservoirs` của KPI / bản đồ / tổng quan công khai, bộ mô phỏng hồ, dữ liệu mẫu hồ | Bảng `iot_telemetry.reservoirs`, `reservoir_operations` và mẫu tin cũ **giữ trong CSDL** (không xoá dữ liệu); bật lại phải khôi phục mã từ lịch sử git | #137 |
| Sắp xếp giao diện theo 3 nhóm | **Tổng quan**: tab Mưa lớn (`?tab=mua_lon`) · Sạt lở, lũ quét (`?tab=sat_lo`) · Ngập lụt (`?tab=ngap_lut` — mực nước các trạm, bản tin dự báo), huy hiệu trên tab (mưa 24 giờ lớn nhất, số điểm cấm đường, số trạm vượt báo động), chuyên đề biểu đồ của Tổng hợp cùng thứ tự, trình chiếu xoay Tổng hợp → Mưa lớn → Sạt lở, lũ quét → Ngập lụt. **Bản đồ**: nhóm lớp Mưa lớn · Sạt lở, lũ quét · Ngập lụt · Trạm đo, sự cố, phản ánh. **Cảnh báo**: mẫu tin xếp Mưa lớn → Sạt lở → Lũ quét → Ngập lụt, tên nhóm đầu dòng. **Đợt thiên tai**: loại "Lũ, ngập lụt" đổi tên "Ngập lụt". **Cổng người dân**: nhóm menu "Sạt lở, lũ quét", "Ngập lụt"; 3 chuyên đề trọng tâm (thêm Mưa lớn — mở bản đồ mưa dự báo). **Hướng dẫn** theo 3 nhóm | Link cũ `?tab=sat_lo` giữ nguyên | #138 |
