# Trang D – Điều hành cứu hộ & điểm nóng khẩn cấp: đối chiếu thiết kế và việc còn lại

Đối chiếu với mục **D. Thiết kế chi tiết mục Trung tâm Điều hành Cứu hộ & Điểm nóng Khẩn cấp** (tài liệu thiết kế Part 1)
và các yêu cầu giao diện chung (màu rủi ro thống nhất, thông tin khẩn trên cùng, thao tác chính dễ bấm, bảng có tìm / lọc /
phân trang / xuất Excel – PDF, form chia bước báo lỗi ngay khi nhập, trạng thái tải / trống / lỗi / mất mạng, 360 px, theo
phân quyền). Hai nhóm người dùng: **cán bộ hiện trường** (điện thoại, thao tác nhanh, nút to, ít gõ) và **lãnh đạo / quản
lý** (nắm tình hình trong vài giây qua chỉ số, bản đồ, biểu đồ, cảnh báo nổi bật).

- Cập nhật: 15/10/2026 — mã nguồn `main` gồm PR #72 (bố cục, bảng, trạng thái), #73 (form chia bước, thanh thao tác
  nhanh), #74 (bản đồ tác chiến, diễn biến 48 giờ, tra cứu hồ sơ, tài liệu này).
- Máy chủ thử vẫn chạy **v1.0.3**, **chưa có** các thay đổi trên — xem V1 trong `docs/trang-a-viec-con-lai.md` (triển khai
  chung cho mọi trang).
- Dữ liệu nền dùng chung với trang A: `docs/trang-a-viec-con-lai.md` mục 2 (D1 — lực lượng, điểm sơ tán, xóm…), README 2.4
  (mẫu nhập).

**Kết luận:** trang D đã có đủ những gì mục D mô tả về giao diện: dải thông tin khẩn trên cùng, 4 ô chỉ số, bảng điều phối
4 cột (điện thoại: thẻ chọn cột), danh sách có tìm không dấu, lọc, xếp, phân trang, xuất Excel / PDF, trạng thái tải / lỗi
/ mất mạng (PR #72); tiếp nhận đa kênh và cập nhật sơ tán chia 2 bước, sửa phiếu, huỷ lệnh báo lỗi ngay, thanh thao tác
dưới đáy điện thoại (PR #73); bản đồ tác chiến (phiếu đang mở, lộ trình đội đếm ngược ETA, vùng nguy cơ, điểm sơ tán), diễn
biến 48 giờ và thời gian xử lý cho lãnh đạo, tra cứu hồ sơ 7 / 30 ngày (PR #74).

**Không còn việc giao diện nào làm được mà không cần dữ liệu mới hoặc hệ thống bên ngoài.** Còn lại (mục 4): dữ liệu nền
thật (CD1 — lực lượng, điểm sơ tán, mạng đường cho định tuyến an toàn, danh mục xóm cho bóc tách địa danh); nhận tin tự động
từ Zalo OA / ứng dụng (CD2 — cổng có sẵn); gửi lệnh tới trưởng nhóm qua SMS / Zalo / thông báo đẩy (CD3); phương án phân bổ
hộ dân tới điểm sơ tán (CD4); kích hoạt điểm nóng theo mưa cực ngắn (CD6 — cần nguồn radar, ngưỡng mưa gây sạt); hai việc
chờ quyết định (CD5 — bóc tách bằng mô hình ngôn ngữ, CD8 — sắc Vàng / Cam của thang chung). Theo dõi GPS đội cứu hộ **không
làm** theo quyết định ngày 29/09/2026 (CD7).

## 1. Đối chiếu với thiết kế mục D (rà ngày 15/10/2026, theo từng ý)

| Yêu cầu của thiết kế | Hiện trạng |
|---|---|
| D.1 Tích hợp Zalo OA API & cổng thông tin: tin cầu cứu từ Zalo / ứng dụng di động vào hệ thống | **Một phần** — cổng nhận tự động `POST /api/v1/sos/intake` có sẵn (khoá `INTAKE_API_KEY`, gửi lại cùng mã tin không tạo phiếu thứ hai); phản ánh trên cổng công khai chuyển được thành phiếu SOS; chưa nối Zalo OA / ứng dụng thật (CD2) |
| D.1 Bóc tách tin nhắn (AI) → JSON, ghim toạ độ | Đạt — bộ luật bóc tách loại sự cố, mức ưu tiên, số người (cộng theo nhóm), nhóm yếu thế, tên xóm / xã → toạ độ; trực ban kiểm tra, sửa ở bước 2 trước khi tạo phiếu; báo "có thể trùng" (cùng SĐT hoặc cách dưới 200 m trong 30 phút). Mô hình ngôn ngữ (LLM) là tuỳ chọn, **không bật tới dịch vụ ở nước ngoài** khi chưa đánh giá chuyển dữ liệu (README 11; CD5) |
| D.1 SLA: Cấp 1 Đỏ (phản hồi dưới 3 phút), Cấp 2 Cam, Cấp 3 Vàng | Đạt — 3′ / 15′ / 60′ cho "Chờ xử lý" và "Chờ điều động" (cùng quy tắc với máy chủ), màu theo thang chung; quá hạn → viền đỏ + nhãn "Quá hạn" nhấp nháy, dải khẩn, ô chỉ số; tỉ lệ tiếp nhận trong SLA 48 giờ |
| D.2 Bảng Kanban 4 cột thay danh sách Excel | Đạt — từ 1280 px đủ 4 cột, kéo thả hoặc "Chuyển trạng thái"; nhỏ hơn: thẻ chọn cột (số phiếu, chấm Đỏ khi cột có phiếu quá hạn), không cuộn lồng nhau; thêm cách xem "Danh sách" |
| D.2 Cột 1: cảnh báo nhấp nháy liên tục cùng âm thanh | Đạt — chuông khi có phiếu mới cấp 1–2 (bật / tắt ở thanh trên cùng), thông báo nổi mọi phiếu mới, biểu tượng phiếu mới nhấp nháy trên bản đồ; phiếu quá hạn: nhãn nhấp nháy — không nhấp nháy cả thẻ (chữ, nút mờ theo nhịp, khó đọc) |
| D.2 Cột 2: đã xác minh, đang chỉ định lực lượng | Đạt — nút "Tiếp nhận" (tài khoản xã) / "Điều phối" (quyền điều động); đồng hồ "Chờ điều động" chạy tới khi có đội đi |
| D.2 Cột 3: toạ độ GPS lực lượng nối với điểm SOS, đếm ngược ETA | **Một phần** — bản đồ tác chiến vẽ lộ trình đã giao từ nơi đóng quân tới điểm SOS (qua vùng nguy hiểm: cam); ETA đếm ngược trên thẻ phiếu và ở "Đội đang làm nhiệm vụ" (quá ETA lên đầu); **không** theo dõi GPS (CD7) |
| D.2 Cột 4: cán bộ hiện trường bấm "Đã cứu an toàn" trên di động; lưu hồ sơ | Đạt — link nhiệm vụ `/nhiem-vu` cho trưởng nhóm (không cần tài khoản): đã đến / đã cứu an toàn / cần chi viện; "đã cứu" chờ trực ban xác nhận; phiếu, lệnh, báo cáo hiện trường, nhật ký lưu trong CSDL; Danh sách tra cứu phiếu đã xong trong 48 giờ / 7 ngày / 30 ngày, xuất Excel / PDF |
| D.3 Lọc đa biến bán kính 5 km theo kỹ năng | Đạt — gợi ý lực lượng, phương tiện gần nhất theo loại sự cố / kỹ năng, mở rộng bán kính dần (ghi bán kính đã dùng) |
| D.3 Định tuyến an toàn (PostGIS, tránh ngầm tràn, đường có nguy cơ sạt) | Đạt theo dữ liệu đường đang có — tuyến nhanh nhất né đoạn giao vùng sạt lở / lũ quét / ngập sâu đang hiệu lực, cả tuyến được kiểm lại với mọi vùng nguy hiểm, kèm cảnh báo trạm mực nước gần tuyến; mạng đường còn thưa → đoạn không có dữ liệu đường ghi rõ, không khẳng định an toàn (CD1) |
| D.3 Nút [Phát lệnh khẩn cấp]: thông báo đẩy kèm toạ độ tới trưởng nhóm | **Một phần** — lệnh điều động tạo link nhiệm vụ (toạ độ, chỉ đường, gọi người báo tin); hộp thoại ghi rõ "chưa gửi tin cho đội", có nút gọi và sao chép lệnh; chưa gửi tự động (CD3) |
| D.4 Tự kích hoạt từ trạm quan trắc: khoanh vùng đỏ, tạo phiếu "Nguy cơ sạt lở", đề xuất sơ tán | Đạt (theo cảm biến) — độ nghiêng / độ ẩm đất vượt BĐ II (số đo thật hoặc mô phỏng) → vùng nguy cơ bán kính 1 km (12 giờ; trạm mất tín hiệu thì giữ vùng), phiếu SOS nguồn "Cảm biến" cấp 1–2, bản nháp lệnh di dời chờ duyệt (Maker–Checker); vùng hiện trên bản đồ tác chiến. Mưa cực ngắn chưa là điều kiện kích hoạt (CD6) |
| D.4 Theo dõi tiến độ di dời dân | Đạt — tiến độ theo xã (form 2 bước, số đã sơ tán bằng nút −/+), ô chỉ số "Sơ tán an toàn", dải khẩn |
| D.4 Sức chứa điểm sơ tán, phân bổ hộ dân tới từng điểm để tránh quá tải | **Một phần** — số người / sức chứa từng điểm (đầy Đỏ, trên 85% Cam — dải khẩn, bản đồ, cổng công khai cùng thang); chưa có phương án phân bổ thôn → điểm (CD4) |
| Chung: màu theo mức rủi ro, thống nhất | Đạt — Đỏ / Cam / Vàng theo mức ưu tiên ở thẻ, chip, bản đồ (cụm điểm theo phiếu khẩn nhất), biểu đồ; nút đỏ chỉ cho việc khẩn ("Điều phối" đổi sang nút xanh). Lưu ý sắc Vàng / Cam (CD8) |
| Chung: thông tin khẩn trên cùng | Đạt — dải khẩn dính trên cùng khi cuộn (điện thoại 1 hàng); chạm mục → bảng đã lọc hoặc khối sơ tán |
| Chung: thao tác chính dễ bấm | Đạt — mỗi thẻ phiếu một nút chính theo bước kế tiếp (Điều phối / Tiếp nhận / Đội đã đến / Đã an toàn); thanh dưới đáy điện thoại Chờ xử lý · Sơ tán · Báo SOS · Thực thi · Gọi 112; vùng chạm ≥ 44 px trên màn cảm ứng |
| Chung: bảng có tìm, lọc, phân trang, Excel / PDF | Đạt — tìm không dấu, lọc mức / tình huống / loại sự cố / kênh kèm số phiếu, xếp, phân trang; Excel / PDF mọi phiếu đang lọc, **không kèm SĐT, nội dung tin của người dân**; bộ lọc, cách xem, kỳ tra cứu trên địa chỉ trang |
| Chung: form chia bước, báo lỗi ngay | Đạt — tiếp nhận 2 bước, cập nhật sơ tán 2 bước, sửa phiếu, huỷ lệnh, điều động 2 bước; lỗi dưới từng ô, bấm khi còn lỗi → con trỏ về ô lỗi (không tắt nút im lặng) |
| Chung: trạng thái tải / trống / lỗi / mất mạng | Đạt — không tải được phiếu → "không có nghĩa là không có ai cần cứu" (trước đây hiện "Không có phiếu"); lớp bản đồ lỗi → nói rõ, điểm SOS vẫn hiện; mất mạng → dải báo, nút ghi tắt kèm lý do |
| Chung: 360 px | Đạt — 0 px tràn ngang, 0 vùng chạm < 44 px trên điện thoại / iPad (ui-test; trước sửa: 108 vùng chạm nhỏ, tràn 12 px) |
| Chung: theo phân quyền | Đạt — nút ghi chỉ hiện với quyền ở đúng xã của phiếu (máy chủ kiểm tra lại); tài khoản xã: tiêu đề xã mình, không có "Điều phối", "Sơ tán" vào thẳng xã mình |

## 2. Bảng tổng hợp việc còn lại

| # | Việc | Phụ thuộc | Cần ai cung cấp | Ưu tiên |
|---|---|---|---|---|
| GD1 | **Bố cục, bảng, trạng thái**: dải khẩn, 4 ô chỉ số, bảng điều phối theo thiết bị, danh sách, tìm – lọc – phân trang – Excel / PDF, tải / lỗi / mất mạng | Không cần dữ liệu, không đổi API | — | **Đã làm** (PR #72) |
| GD2 | **Thao tác hiện trường**: tiếp nhận, sơ tán 2 bước, sửa phiếu, huỷ lệnh báo lỗi ngay; thanh thao tác dưới đáy điện thoại | Không cần dữ liệu, không đổi API | — | **Đã làm** (PR #73) |
| GD3 | **Cho lãnh đạo**: bản đồ tác chiến, đội đếm ngược ETA, diễn biến 48 giờ, thời gian xử lý; tra cứu hồ sơ 7 / 30 ngày | Không cần dữ liệu; API giới hạn kỳ tra cứu (sửa nhỏ) | — | **Đã làm** (PR #74) |
| CD1 | **Dữ liệu nền thật**: lực lượng (kỹ năng, nơi đóng quân, SĐT chỉ huy), điểm sơ tán (sức chứa, SĐT trực), mạng đường (định tuyến an toàn), danh mục xóm (bóc tách địa danh) | Dữ liệu | như trang A D1; mạng đường: Sở Xây dựng / đơn vị quản lý đường | **Cao nhất** |
| CD2 | **Nhận tin tự động** từ Zalo OA / ứng dụng di động (cổng có sẵn) | Bên gửi + khoá `INTAKE_API_KEY` | Zalo OA của tỉnh, đơn vị làm ứng dụng | Cao (khi vận hành) |
| CD3 | **Gửi lệnh tới trưởng nhóm** qua SMS / Zalo ZNS / thông báo đẩy, kèm toạ độ, link nhiệm vụ | Hợp đồng + tích hợp | Nhà mạng, Zalo OA (= BC4 trang C, BD10 trang B) | Cao (khi vận hành) |
| CD4 | **Phương án sơ tán**: thôn nào đến điểm nào, bao nhiêu hộ | Dữ liệu + sửa nhỏ | Các xã (phương án ứng phó) | Trung bình |
| CD5 | Bóc tách tin bằng mô hình ngôn ngữ (LLM) | Quyết định + đánh giá chuyển dữ liệu | Chủ dự án, bộ phận pháp chế | Thấp |
| CD6 | Kích hoạt điểm nóng theo **mưa cực ngắn** | Nguồn mưa dự báo cực ngắn + ngưỡng mưa gây sạt theo vùng | Đài KTTV (radar — cùng BD6 trang B), cơ quan địa chất | Trung bình |
| CD7 | Theo dõi GPS đội cứu hộ | — | — | **Không làm** (quyết định 29/09/2026) |
| CD8 | Sắc Vàng / Cam của thang rủi ro chung gần nhau trên biểu đồ | Quyết định (đổi màu ảnh hưởng toàn hệ thống) | Chủ dự án | Thấp |

## 3. Việc giao diện đã làm

### GD1 — Bố cục, bảng, trạng thái (PR #72)

- **Dải thông tin khẩn** (khung chung `UrgentStrip`, trang C dùng lại): phiếu quá hạn SLA, cấp 1 chưa có đội, đội cần chi
  viện, điểm sơ tán đầy (Đỏ); đội đi lộ trình qua vùng nguy hiểm, điểm sắp đầy (Cam); đội báo đã cứu chờ xác nhận (Vàng).
- **4 ô chỉ số** (`RescueKpis`): phiếu đang mở theo mức, quá hạn SLA + phiếu chờ lâu nhất, người cần cứu / đã cứu 48 giờ,
  tiến độ sơ tán + điểm đầy / sắp đầy; chạm ô → bảng đã lọc.
- **Bảng điều phối** (`RescueBoard`) và **thẻ phiếu** (`TicketCard`): một nút chính theo bước kế tiếp; **Danh sách**
  (`TicketTable`): bảng trên máy tính, thẻ trên điện thoại; tìm, lọc, xếp (`FilterToolbar` — tách từ trang C), phân trang,
  Excel / PDF.
- Trạng thái tải / lỗi / mất mạng nói rõ; điểm sơ tán theo thang `occupancyLevel` (cùng biểu tượng trên Bản đồ).

### GD2 — Thao tác hiện trường (PR #73)

- **Tiếp nhận 2 bước**: kênh bằng nút to, SĐT sai báo ngay khi gõ, nội dung → bóc tách → kiểm tra phân loại (mức ưu tiên
  kèm SLA, loại sự cố, số người −/+, nhóm yếu thế); bóc tách lỗi vẫn sang bước 2.
- **Cập nhật sơ tán 2 bước**: chạm chọn xã (tìm không dấu) → số liệu, số đã sơ tán bằng nút −/+, xem trước tiến độ, lỗi
  dưới từng ô; tài khoản một xã vào thẳng xã mình.
- **Sửa phiếu**, **huỷ lệnh** (lý do chọn nhanh); **thanh dưới đáy điện thoại** Chờ xử lý · Sơ tán · Báo SOS · Thực thi ·
  Gọi 112.
- Khung dùng chung: nút ✕ của hộp thoại 44 px trên màn cảm ứng; ô số `QtyStepper` cao 44 px trên iPad.

### GD3 — Cho lãnh đạo (PR #74)

- **Bản đồ tác chiến** (`RescueMap`, trong khối "Bản đồ tác chiến & diễn biến 48 giờ" — laptop / iPad mở sẵn, điện thoại thu
  gọn để bảng phiếu lên trước và không tải lớp bản đồ khi chưa mở):
  - phiếu đang mở gom cụm, màu cụm theo phiếu khẩn nhất; tự vừa khung các phiếu;
  - lộ trình đội (qua vùng nguy hiểm: cam), vùng nguy cơ đang hiệu lực (gồm vùng khoanh tự động từ trạm), điểm sơ tán;
  - chạm điểm → "Xem phiếu trên bảng" mở đúng phiếu;
  - "Đội đang làm nhiệm vụ" đếm ngược ETA, quá ETA lên đầu;
  - màn cảm ứng: một ngón cuộn trang, hai ngón kéo / phóng bản đồ.
- **Diễn biến 48 giờ** (`SosTrend`):
  - phiếu nhận theo khung 3 giờ, cột chồng theo mức ưu tiên — một trục, chú giải ghi số từng mức, hộp chú thích khi rê /
    chạm;
  - thời gian xử lý trung vị: tiếp nhận, có đội đi, đội đến nơi;
  - tỉ lệ tiếp nhận trong SLA, số phiếu trễ.
- **Tra cứu hồ sơ** ở Danh sách: phiếu đã xong trong 48 giờ / 7 ngày / 30 ngày (`?ky=7n|30n`) cho báo cáo tuần, tháng.
  Dải khẩn, ô chỉ số, bản đồ, diễn biến vẫn theo 48 giờ. API `GET /api/v1/sos?hours=` thêm giới hạn 1–2.160 giờ (90 ngày),
  quá hạn trả 422.

## 4. Việc chờ dữ liệu / hệ thống bên ngoài

### CD1 — Dữ liệu nền thật

- **Hiện trạng:** máy thử dùng dữ liệu mẫu (lực lượng, 24 điểm sơ tán, đoạn đường mẫu, danh mục xóm mẫu). Định tuyến an toàn
  chạy trên mạng đường đã nhập; chỗ chưa có đường thì tuyến đi chim bay và ghi rõ "không có dữ liệu đường".
- **Cần:** danh sách lực lượng, điểm sơ tán theo phương án ứng phó của tỉnh và các xã; mạng đường (ít nhất quốc lộ, tỉnh lộ,
  đường liên xã, ngầm tràn); danh mục xóm / tổ dân phố đủ 56 xã.
- **Sau khi nhập:** không phải sửa giao diện.

### CD2 — Nhận tin tự động từ Zalo OA / ứng dụng

- **Hiện trạng:** cổng `POST /api/v1/sos/intake` **tắt** tới khi đặt `INTAKE_API_KEY` (README 6.6).
- **Cần:** bên gửi (Zalo OA của Ban Chỉ huy, ứng dụng cảnh báo) gọi cổng với khoá được cấp và mã tin gốc.
- **Việc lập trình:** không có ở trang D — phiếu vào bảng điều phối như phiếu tạo tay, kênh ghi đúng nguồn.

### CD3 — Gửi lệnh tới trưởng nhóm

Giống BC4 trang C, BD10 trang B: kênh SMS Brandname / Zalo ZNS / thông báo đẩy. Hộp thoại điều động đã có nhánh "Đã gửi
lệnh tới …" — máy chủ trả `sent: true` khi gửi được là đủ; nội dung gồm toạ độ và link nhiệm vụ đã có sẵn.

### CD4 — Phương án sơ tán (thôn → điểm)

- **Hiện trạng:** tiến độ sơ tán theo xã (số hộ, nhân khẩu) và số người ở từng điểm do xã / trực ban cập nhật; chưa biết
  thôn nào sơ tán tới điểm nào.
- **Cần:** phương án sơ tán của từng xã: thôn / tổ → điểm sơ tán, số hộ dự kiến.
- **Việc lập trình khi có:** bảng phân bổ (mẫu nhập mới), so số hộ dự kiến với sức chứa từng điểm → cảnh báo quá tải
  trước khi sơ tán.

### CD5 — Bóc tách bằng mô hình ngôn ngữ

Hệ thống có sẵn móc nối `LLM_API_URL` / `LLM_API_KEY` (SĐT được che trước khi gửi), mặc định tắt — bộ luật đang chạy. Chỉ bật
với dịch vụ trong nước hoặc sau khi đánh giá chuyển dữ liệu ra nước ngoài (Luật Bảo vệ dữ liệu cá nhân, README 11).

### CD6 — Kích hoạt điểm nóng theo mưa cực ngắn

- **Hiện trạng:** điểm nóng tự động kích hoạt theo cảm biến nghiêng / độ ẩm đất; lượng mưa 72 giờ chỉ đưa vào nội dung bản
  nháp lệnh di dời.
- **Cần:** nguồn mưa dự báo cực ngắn (radar — xem BD6 trang B) và ngưỡng mưa gây sạt theo vùng do cơ quan chuyên môn đưa ra.
- **Việc lập trình khi có:** thêm điều kiện kích hoạt cạnh cảm biến, dùng lại luồng vùng nguy cơ → phiếu → bản nháp lệnh.

### CD7 — Theo dõi GPS (không làm)

Ngày 29/09/2026 chủ dự án quyết định **không làm** chia sẻ vị trí điện thoại của đội cứu hộ; xuồng, xe chưa gắn thiết bị định
vị. Bản đồ tác chiến vẽ lộ trình đã giao và ETA; trạng thái "đã đến" do trưởng nhóm báo qua link nhiệm vụ.

### CD8 — Sắc Vàng / Cam của thang chung

Công cụ kiểm định màu cho thấy Vàng `#fab219` và Cam `#ec835a` cách nhau ΔE 13,6 — dưới ngưỡng 15 nên khó phân biệt kể cả
với người nhìn màu bình thường; trên nền sáng, Vàng và Cam tương phản dưới 3:1. Trên biểu đồ cột chồng đã bù bằng số từng
mức ở chú giải, khe hở giữa các phần, hộp chú thích. Muốn tách rõ hơn phải đổi sắc Cam / Vàng của **thang chung** (thẻ, chip,
bản đồ, cổng công khai cùng đổi) — chờ chủ dự án quyết định, không tự đổi.

## 5. Kiểm tra khi có dữ liệu thật

1. Triển khai bản mới (V1 của trang A).
2. Nhập dữ liệu nền (CD1); mở `/cuu-ho` trên máy tính, iPad, điện thoại:
   - dải khẩn: mỗi mục mở đúng phiếu; số trên ô "Quá hạn SLA" bằng số phiếu trong bảng đã lọc;
   - bản đồ tác chiến: số trên tiêu đề bằng số điểm + số trong các cụm; lộ trình, vùng nguy cơ khớp Bản đồ giám sát;
   - Danh sách 30 ngày: xuất Excel, so với sổ trực ban.
3. Diễn tập với trực ban, cán bộ xã trên điện thoại: tiếp nhận một tin, điều động, trưởng nhóm báo qua link nhiệm vụ, xác
   nhận đã cứu; cập nhật sơ tán — ghi lại bước còn phải gõ nhiều, nhãn khó hiểu.
4. Dùng thử với lãnh đạo: đọc dải khẩn, 4 ô chỉ số, bản đồ, diễn biến 48 giờ trong vài giây — ghi lại chỉ số còn thiếu.

## 6. Tham chiếu mã nguồn

| Phần | Tệp |
|---|---|
| Trang Điều hành cứu hộ (bộ lọc, cách xem, kỳ tra cứu trên địa chỉ; Excel / PDF; thanh thao tác nhanh) | `frontend/src/pages/RescueCenter.jsx` |
| Số liệu suy ra: tình huống phiếu, bộ lọc, xếp, dải khẩn, diễn biến 48 giờ, thời gian xử lý | `frontend/src/components/rescue/rescueFacts.js` |
| Ô chỉ số, bảng điều phối, thẻ phiếu, danh sách | `components/rescue/RescueKpis.jsx`, `RescueBoard.jsx`, `TicketCard.jsx`, `TicketTable.jsx` |
| Bản đồ tác chiến, diễn biến 48 giờ | `components/rescue/RescueMap.jsx`, `SosTrend.jsx` |
| Tiếp nhận, giám sát sơ tán | `components/rescue/Intake.jsx`, `Evacuation.jsx` (`EvacuationModal`) |
| Form: điều động, link nhiệm vụ, sửa phiếu, huỷ lệnh, số người ở điểm sơ tán | `components/common/DispatchModal.jsx`, `MissionLink.jsx`, `EditTicketModal.jsx`, `CancelDispatchModal.jsx`, `OccupancyModal.jsx` |
| Khung dùng chung | `components/common/UrgentStrip.jsx`, `FilterToolbar.jsx`, `QuickActionBar.jsx`, `QtyStepper.jsx`, `ui.jsx` (`Tabs`, `Pager`, `StepChips`, `SortTh`, `Modal`) |
| Đồng hồ SLA; thang màu (`sosLevel`, `occupancyLevel`) | `frontend/src/utils/sla.js`, `utils/risk.js` |
| API phiếu SOS, sơ tán | `backend/app/api/v1/sos.py` (`/sos?hours=`, `/sos/parse`, `/sos/intake`, `/evacuation`), `backend/app/services/sos.py` |
| Bóc tách tin, khớp lực lượng, định tuyến an toàn | `backend/app/services/sos_nlp.py`, `dispatch_matching.py`, `safe_routing.py` |
| Link nhiệm vụ cho trưởng nhóm | `backend/app/api/v1/mission.py`, `frontend/src/pages/public/MissionPage.jsx` |
| Điểm nóng tự động từ cảm biến; giữ vùng khi trạm mất tín hiệu | `backend/app/services/simulator.py` (`check_triggers`, `sensor_hotspot`), `sensor_zones.py` |
| Lớp bản đồ (lộ trình, vùng nguy cơ, điểm sơ tán) | `backend/app/api/v1/map_layers.py` |
| Kiểm thử | `tests/ui/ui-test.mjs` (khối "Điều hành cứu hộ" — laptop, iPad dọc, điện thoại 360, tài khoản phường), `tests/e2e/rbac-test.mjs` (giới hạn kỳ tra cứu) |

## 7. Các thay đổi đã làm cho trang D (để tra cứu)

| PR | Nội dung |
|---|---|
| #72 | Dải thông tin khẩn (`UrgentStrip`, dùng chung với trang C), 4 ô chỉ số chạm được; bảng điều phối 4 cột / thẻ chọn cột; thẻ phiếu một nút chính, quá hạn viền đỏ + nhãn nhấp nháy; danh sách bảng / thẻ, tìm không dấu, lọc kèm số phiếu, xếp, phân trang, Excel / PDF (không kèm SĐT, nội dung tin); trạng thái tải / lỗi / mất mạng; thang `occupancyLevel` cho điểm sơ tán; ui-test khối "Điều hành cứu hộ" |
| #73 | Tiếp nhận 2 bước, cập nhật sơ tán 2 bước, sửa phiếu, huỷ lệnh — lỗi hiện ngay dưới ô; thanh dưới đáy điện thoại; nút ✕ hộp thoại, ô số −/+ 44 px trên màn cảm ứng; ui-test các form, thanh thao tác, tài khoản phường |
| #74 | Bản đồ tác chiến (gom cụm theo phiếu khẩn nhất, lộ trình, vùng nguy cơ, điểm sơ tán, đội đếm ngược ETA), diễn biến 48 giờ, thời gian xử lý; tra cứu hồ sơ 7 / 30 ngày (API giới hạn 90 ngày); tài liệu này |
