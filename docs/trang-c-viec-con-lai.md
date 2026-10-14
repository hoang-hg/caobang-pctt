# Trang C – Vật tư & Lực lượng cứu hộ: đối chiếu thiết kế và việc còn lại

Đối chiếu với mục **C. Thiết kế chi tiết mục Quản lý Vật tư & Lực lượng Cứu hộ** (tài liệu thiết kế Part 1) và các yêu
cầu giao diện chung (màu rủi ro thống nhất, thông tin khẩn trên cùng, thao tác chính dễ bấm, bảng có tìm / lọc / phân trang /
xuất Excel – PDF, form chia bước báo lỗi ngay khi nhập, trạng thái tải / trống / lỗi / mất mạng, 360 px, theo phân quyền).
Hai nhóm người dùng: **cán bộ hiện trường** (điện thoại, thao tác nhanh, nút to, ít gõ) và **lãnh đạo / quản lý** (nắm tình
hình trong vài giây qua chỉ số, bản đồ, biểu đồ, cảnh báo nổi bật).

- Cập nhật: 14/10/2026 — mã nguồn `main` gồm PR #69 (bố cục, danh sách), #70 (thao tác hiện trường, form), #71 (biểu đồ
  cho lãnh đạo, thống nhất màu kho trên Bản đồ, tài liệu này).
- Máy chủ thử vẫn chạy **v1.0.3**, **chưa có** các thay đổi trên — xem V1 trong `docs/trang-a-viec-con-lai.md` (triển khai
  chung cho mọi trang).
- Dữ liệu nền dùng chung với trang A: `docs/trang-a-viec-con-lai.md` mục 2 (D1 — lực lượng, kho, tồn kho, phương tiện,
  điểm cấp nhiên liệu), README 2.4 (mẫu nhập).

**Kết luận:** trang C đã có đủ những gì mục C mô tả về giao diện: dải thông tin khẩn trên cùng, 4 ô chỉ số theo thang màu
chung, 3 thẻ Lực lượng / Vật tư / Phương tiện có tìm không dấu, bộ lọc riêng, xếp, phân trang, xuất Excel / PDF mọi dòng
đang lọc (PR #69); thanh thao tác dưới đáy điện thoại, form xuất / nhập kho 2 bước, báo xe bằng chip, lỗi hiện ngay khi nhập
(PR #70); biểu đồ quân số theo loại lực lượng, phương tiện theo nhóm và tình trạng, tổng hợp theo mặt hàng, nhóm Y tế trong
biểu đồ phân bổ; biểu tượng kho trên Bản đồ cùng một thang màu với trang C (PR #71).

**Không còn việc giao diện nào làm được mà không cần dữ liệu mới.** Còn lại (mục 4): dữ liệu nền thật và **định mức an toàn
chuẩn** cho từng kho (BC1, BC2 — % dự trữ, cảnh báo cạn kiệt chỉ đúng khi định mức đúng); gọi qua tổng đài web (BC3); gửi
lệnh điều động qua SMS / Zalo / thông báo đẩy và số điện thoại người lái (BC4, BC5 — cùng BD10, BD9 của trang B). Theo dõi
GPS lực lượng **không làm** theo quyết định ngày 29/09/2026 (BC6).

## 1. Đối chiếu với thiết kế mục C (rà ngày 14/10/2026, theo từng ý)

| Yêu cầu của thiết kế | Hiện trạng |
|---|---|
| C.1 Thanh lọc: theo Huyện / Thị xã | Đạt — bộ lọc địa phương chung ở đầu trang (56 xã/phường sau 01/07/2025, nhóm lọc nhanh theo lưu vực); không còn cấp huyện |
| C.1 Thanh lọc: Cấp quản lý (Tỉnh, Huyện, Xã) | Đạt — Lực lượng: cấp tỉnh / cụm / xã; Kho: kho tỉnh / cụm / xã / dã chiến (cụm = địa bàn huyện cũ); mỗi lựa chọn kèm số dòng |
| C.1 Thanh lọc: Tình trạng (Sẵn sàng, Đang nhiệm vụ, Bảo trì) | Đạt — thẻ Lực lượng, Phương tiện; thẻ Vật tư lọc theo **mức dự trữ** (cạn kiệt, sắp hết hạn, dưới 50%, đủ) và nhóm hàng; Phương tiện thêm lọc nhiên liệu |
| C.1 Chỉ số: tổng cán bộ, chiến sĩ sẵn sàng | Đạt — "sẵn sàng / tổng", số đang làm nhiệm vụ; hết quân sẵn sàng → Đỏ; chạm ô → thẻ Lực lượng |
| C.1 Chỉ số: xuồng / xe lội nước đang rảnh | Đạt — xuồng rảnh / tổng xuồng, xe lội nước, máy xúc – ủi sẵn sàng; hết xuồng → Đỏ; chạm ô → phương tiện đường thủy sẵn sàng |
| C.1 Chỉ số: tỷ lệ dự trữ lương thực / nước (đỏ nếu kho dưới 20%) | Đạt — ô dự trữ lương thực · nước theo thang màu; ô "Kho cạn kiệt · sắp hết hạn" Đỏ khi có kho có mặt hàng dưới 20%, chạm → đúng các kho đó |
| C.1 Ba thẻ nội dung | Đạt — điện thoại: 3 thẻ chia đều bề ngang (trước phải kéo ngang tìm thẻ "Phương tiện"), chấm màu mức nặng nhất trên thẻ |
| C.2 Lực lượng: đơn vị, quân số tổng / sẵn sàng / nhiệm vụ | Đạt — bảng (máy tính) / thẻ (điện thoại, iPad dọc), vạch quân số; biểu đồ quân số theo loại lực lượng |
| C.2 Lực lượng: vị trí đóng quân, nút "Xem trên bản đồ" | Đạt |
| C.2 Lực lượng: chỉ huy & SĐT — gọi qua tổng đài web | **Một phần** — nút "Gọi" (gọi trực tiếp trên điện thoại / máy có phần mềm gọi); gọi qua tổng đài web chưa tích hợp (BC3) |
| C.2 Lực lượng: kỹ năng đặc thù | Đạt — chip kỹ năng, lọc theo kỹ năng, tìm không dấu theo kỹ năng |
| C.2 Lực lượng: "Điều động nhanh" — chọn đơn vị, gắn điểm nóng cần đến | Đạt — chọn phiếu SOS đang chờ (cấp 1, chờ lâu lên đầu) → lệnh điều động 2 bước, đơn vị chọn sẵn; chỉ tài khoản được ra lệnh điều động. Điểm nóng chưa có phiếu: tạo bằng "Báo SOS" rồi điều động |
| C.2 Vật tư: danh sách kho (tỉnh, huyện, dã chiến) | Đạt — mỗi kho một thẻ, vạch trái theo mức nặng nhất, thủ kho + nút gọi, xem trên bản đồ |
| C.2 Vật tư: danh mục hàng hoá, tồn kho tức thì | Đạt — từng mặt hàng: tồn, vạch % định mức, hạn dùng; mặt hàng thiếu / sắp hết hạn lên đầu; số tự nhảy khi xuất / nhập (WebSocket); "Theo mặt hàng" cộng các kho đang hiện |
| C.2 Cảnh báo Đỏ: kho cạn kiệt (dưới 20% định mức) | Đạt — dải khẩn, ô chỉ số, thẻ kho, bảng tác chiến Tổng quan, biểu tượng và popup kho trên Bản đồ — cùng một thang (`stockLevel`) |
| C.2 Cảnh báo Cam: gần hết hạn (thuốc, thực phẩm) | Đạt — hàng hết hạn dùng trong 30 ngày (chip "HSD dd/mm") |
| C.2 Biểu đồ phân bổ: kho đầy / kho thiếu để điều tiết | Đạt — cột chồng theo nhóm hàng của từng kho (lương thực, nước uống, đồ dùng cứu sinh, **y tế**), phần thiếu hụt, vạch 20% |
| C.3 Phân loại phương tiện: đường thủy / đường bộ / thiết bị | Đạt — lọc theo nhóm, mặc định đường thủy trước; biểu đồ phương tiện theo nhóm và tình trạng |
| C.3 🟢 Sẵn sàng kèm vạch nhiên liệu | Đạt — vạch theo thang chung: dưới 20% Đỏ (không được gợi ý điều động, khớp máy chủ), dưới 50% Vàng; chưa ai báo → "Chưa báo nhiên liệu" (Xám), không ghi số giả |
| C.3 🟡 Đang nhiệm vụ: tiến trình, vị trí đang hoạt động | **Một phần** — mã phiếu, "đang đến, ETA …" / "đã đến lúc …", vị trí trên bản đồ là vị trí đã nhập; không vẽ thanh tiến trình giả vì không có GPS (BC6) |
| C.3 🔴 Hỏng hóc / bảo dưỡng | Đạt — "Báo tình trạng" (chip lý do), lý do hiện trên thẻ / bảng |
| C.3 Quản lý nhiên liệu dự trữ tại các điểm | Đạt — xăng / dầu từng điểm, vạch % sức chứa, cập nhật được (báo lỗi khi vượt sức chứa) |
| C.4 Điều động: hộp thoại bật lên | Đạt — lệnh 2 bước (Lực lượng → Vật tư & xác nhận, tóm tắt lệnh trước khi phát) |
| C.4 Điều động: hệ thống gợi ý nhu cầu | Đạt — số người, phương tiện, vật tư gợi ý theo loại sự cố, số người mắc kẹt (`dispatch_matching.suggest_needs`) |
| C.4 Điều động: khớp nối tự động trong bán kính 5–10 km | Đạt — lực lượng, phương tiện gần nhất theo kỹ năng, mở rộng bán kính dần (ghi bán kính đã dùng) |
| C.4 Điều động: gửi SMS / Zalo / thông báo đẩy cho chỉ huy | **Chưa** — hộp thoại ghi rõ "chưa gửi tin cho đội", có nút gọi và sao chép lệnh kèm link nhiệm vụ (BC4) |
| C.4 Điều động: tự chuyển trạng thái "Đang làm nhiệm vụ" | Đạt — lệnh gán lực lượng, phương tiện; hoàn thành phiếu trả về sẵn sàng |
| C.4 Theo dõi lộ trình GPS | **Không làm** (BC6) — trưởng nhóm báo "đã đến" qua link nhiệm vụ |
| C.5 Cơ sở dữ liệu: lực lượng, kho, phương tiện, nhật ký điều động | Đạt (`resources.*`, `operations.dispatch_orders`, nhật ký sự kiện + nhật ký thao tác) |
| C.5 Cập nhật tức thì qua WebSocket | Đạt — `inventory.changed`, `dispatch.updated` → số trên mọi màn hình tự nhảy |
| C.5 Bảng tìm nhanh, xuất Excel / PDF báo cáo cấp trên | Đạt — tìm không dấu, lọc, xếp (bấm tiêu đề cột), phân trang 10 / 20 / 50; Excel / PDF **mọi dòng đang lọc** (PDF trên điện thoại dựng khổ laptop) |
| C.5 Bản đồ trong thẻ Phương tiện | Đạt — Leaflet, theo danh sách đang lọc; laptop: bên dưới bảng (cạnh bảng từ 1536 px) |
| Chung: màu theo mức rủi ro, thống nhất | Đạt — dưới 20% Đỏ, dưới 50% Vàng, sắp hết hạn Cam, chưa có định mức / chưa báo Xám; nút đỏ chỉ dành cho mức khẩn cấp ("Điều động nhanh" đổi sang nút xanh) |
| Chung: thông tin khẩn trên cùng | Đạt — dải khẩn dính trên cùng khi cuộn (Cam / Đỏ), điện thoại gọn 1 hàng; chạm mục → danh sách đã lọc; phiếu SOS chờ / quá hạn → nút sang Điều hành cứu hộ |
| Chung: thao tác chính dễ bấm | Đạt — thanh dưới đáy điện thoại Xuất kho · Nhập kho · Báo SOS · Báo xe · Gọi 112; nút ≥ 44 px trên màn cảm ứng |
| Chung: form chia bước, báo lỗi ngay | Đạt — xuất / nhập kho 2 bước, báo xe, nhiên liệu dự trữ, điều động 2 bước; bấm khi còn thiếu → hiện lỗi, đưa con trỏ tới ô đó |
| Chung: trạng thái tải / trống / lỗi / mất mạng | Đạt — khung đang tải; lỗi kèm "Thử lại" (trước đây hiện "Không có dữ liệu" như khi trống); trống kèm loại dữ liệu cần nhập; mất mạng: dải báo, nút ghi tắt kèm lý do |
| Chung: 360 px | Đạt — 0 px tràn ngang, 0 vùng chạm < 44 px trên điện thoại / iPad (ui-test) |
| Chung: theo phân quyền | Đạt — nút ghi chỉ hiện với quyền ở đúng xã của kho / phương tiện (máy chủ kiểm tra lại); tài khoản xã: tiêu đề là xã của mình, không có "Điều động" |

## 2. Bảng tổng hợp việc còn lại

| # | Việc | Phụ thuộc | Cần ai cung cấp | Ưu tiên |
|---|---|---|---|---|
| GC1 | **Bố cục, danh sách**: dải khẩn, ô chỉ số theo thang màu, thẻ / bảng, tìm – lọc – xếp – phân trang, Excel / PDF, trạng thái tải / lỗi / mất mạng, 360 px | Không cần dữ liệu, không đổi API | — | **Đã làm** (PR #69) |
| GC2 | **Thao tác hiện trường**: thanh dưới đáy điện thoại, form xuất / nhập kho 2 bước, báo xe bằng chip, nhiên liệu dự trữ, lỗi hiện ngay | Không cần dữ liệu, không đổi API | — | **Đã làm** (PR #70) |
| GC3 | **Cho lãnh đạo**: biểu đồ quân số theo loại lực lượng, phương tiện theo nhóm – tình trạng, tổng hợp theo mặt hàng, nhóm Y tế trong biểu đồ phân bổ; màu kho trên Bản đồ cùng thang | Không cần dữ liệu; API thêm trường (sửa nhỏ) | — | **Đã làm** (PR #71) |
| BC1 | **Dữ liệu nền thật**: lực lượng (quân số, chỉ huy, SĐT, kỹ năng), kho + tồn kho + hạn dùng, phương tiện (nhiên liệu, sức chở), điểm cấp nhiên liệu | Dữ liệu | như trang A D1 | **Cao nhất** |
| BC2 | **Định mức an toàn chuẩn** cho từng mặt hàng ở từng kho | Dữ liệu (quy định / phương án dự trữ) | Văn phòng BCH PCTT & TKCN tỉnh, các xã | **Cao** |
| BC3 | **Gọi qua tổng đài web** (bấm số trên màn hình, ghi âm / nhật ký cuộc gọi) | Tích hợp tổng đài SIP | Đơn vị cung cấp tổng đài (README 2.1: tổng đài IVR chưa nối SIP) | Trung bình |
| BC4 | **Gửi lệnh điều động** tới chỉ huy qua SMS / Zalo ZNS / thông báo đẩy | Hợp đồng + tích hợp | Nhà mạng, Zalo OA của tỉnh (= BD10 trang B) | Cao (khi vận hành) |
| BC5 | **Số điện thoại người lái** xuồng, xe | Dữ liệu + sửa nhỏ | Đơn vị quản lý phương tiện (= BD9 trang B) | Trung bình |
| BC6 | Theo dõi GPS lực lượng / phương tiện | — | — | **Không làm** (quyết định 29/09/2026) |

## 3. Việc giao diện đã làm

### GC1 — Bố cục, danh sách (PR #69)

- **Dải thông tin khẩn** (`ResourceAlerts.jsx`) tự tổng hợp từ danh sách đang tải: kho có hàng dưới 20% định mức (Đỏ), hàng
  hết hạn dùng trong 30 ngày (Cam), phương tiện báo dưới 20% nhiên liệu (Đỏ), phương tiện hỏng / bảo dưỡng (Vàng), điểm
  nhiên liệu dưới 20% sức chứa, hết xuồng / hết quân sẵn sàng; chạm mục → thẻ + bộ lọc. Không có gì: chỉ nói "chưa ghi nhận
  thiếu hụt" về phần có dữ liệu; vùng chưa có kho / phương tiện thì nói chưa đánh giá được.
- **Ô chỉ số** dùng lại ô của Tổng quan (`StatCard`); số kho cạn kiệt tính từ cùng danh sách với dải khẩn và bộ lọc — chạm
  ô "6 kho dưới 20%" mở đúng 6 kho.
- **Thẻ + bộ lọc trên địa chỉ trang** (`?tab=vat_tu&tt=can_kiet`): gửi được liên kết, nút Quay lại trả bộ lọc cũ; giá trị lạ
  bị bỏ qua.
- **Danh sách**: máy tính bảng (bấm tiêu đề cột để xếp), điện thoại / iPad dọc thẻ; phân trang (`usePaged`, `Pager`); Excel
  và PDF mọi dòng đang lọc.

### GC2 — Thao tác hiện trường (PR #70)

- **Thanh dưới đáy điện thoại** (khung chung `QuickActionBar`): Xuất kho · Nhập kho · Báo SOS · Báo xe · Gọi 112; chỉ kho /
  phương tiện tài khoản ghi được; một mục thì mở thẳng form, nhiều mục thì chọn (`PickSheet`, tìm không dấu).
- **Form**: xuất kho 2 bước (chạm mặt hàng → số lượng bằng nút −/+ `QtyStepper`, xem trước tồn còn lại, nơi nhận gợi ý từ
  điểm sơ tán); nhập kho 2 bước (hàng đang có / mặt hàng mới, chip hạn dùng, định mức bắt buộc với mặt hàng mới); báo xe
  (2 nút trạng thái, chip lý do hỏng, chip nhiên liệu); nhiên liệu dự trữ (lỗi từng ô, vượt sức chứa).

### GC3 — Cho lãnh đạo (PR #71)

- **Biểu đồ** trên danh sách mỗi thẻ (thu gọn được; điện thoại mặc định thu gọn để danh sách lên trước): quân số theo loại
  lực lượng (sẵn sàng / đang nhiệm vụ / chưa sẵn sàng), phương tiện theo nhóm (sẵn sàng / nhiệm vụ / bảo dưỡng – hỏng) —
  cột chồng nằm ngang, chú giải, nhãn "sẵn sàng / tổng", hộp chú thích khi rê / chạm; tính theo danh sách đang lọc.
- **Theo mặt hàng** (thẻ Vật tư): cộng tồn và định mức các kho đang hiện, % theo thang màu, số kho có mặt hàng đó dưới 20%,
  số kho sắp hết hạn — thiếu nhất lên đầu.
- **Nhóm Y tế** trong biểu đồ phân bổ kho và bảng tác chiến Tổng quan (thiết kế C.2 liệt kê túi sơ cứu, thuốc, Cloramin B);
  màu thứ 4 là tím — không dùng vàng của bộ màu vì vàng là mức "Vàng – theo dõi" trên cùng trang; đã kiểm định (mù màu,
  tương phản) với 3 màu cũ trên nền sáng và tối.
- **Bản đồ cùng thang màu**: biểu tượng kho viền theo mặt hàng thiếu nhất (dưới 20% Đỏ, dưới 50% Vàng — trước đây gộp cả kho
  và dưới 50% là Cam, nên kho có mặt hàng 5% vẫn viền bình thường); popup ghi "N mặt hàng dưới 20%", màu theo đúng nhóm hàng
  (trước đây theo thứ tự xuất hiện). API `/map/layers` thêm `min_pct`, `low_items`; `/dashboard/supplies` thêm nhóm `y_te`.

## 4. Việc chờ dữ liệu / hệ thống bên ngoài

### BC1 — Dữ liệu nền thật

- **Hiện trạng:** máy thử dùng dữ liệu mẫu (18 đơn vị, 11 kho, 34 phương tiện, 6 điểm cấp nhiên liệu). Các mẫu nhập có sẵn:
  "Lực lượng", "Kho vật tư", "Tồn kho vật tư", "Phương tiện", "Điểm cấp nhiên liệu" (README 2.4).
- **Cần:** danh sách thật theo phương án ứng phó của tỉnh và các xã; xã gửi qua "Gửi dữ liệu chờ duyệt", tỉnh duyệt.
- **Sau khi nhập:** không phải sửa giao diện — trang tự hiện, dải khẩn / ô chỉ số tính theo số thật.

### BC2 — Định mức an toàn chuẩn

- **Hiện trạng:** % dự trữ, cảnh báo cạn kiệt (dưới 20%), "dưới 50%" đều so với **định mức an toàn** nhập trong "Tồn kho vật
  tư" (hoặc khi nhập hàng mặt hàng mới). Định mức sai → cảnh báo sai (đặt thấp thì không báo khi thiếu thật). Mặt hàng chưa có
  định mức hiện Xám "chưa có định mức", không tính là cạn kiệt.
- **Cần:** định mức dự trữ theo quy định / phương án (theo dân số vùng, số hộ phải sơ tán…) cho từng mặt hàng, từng kho.
- **Việc lập trình:** không có; nếu định mức tính theo công thức (VD số hộ × định lượng) thì cần thống nhất công thức trước.

### BC3 — Gọi qua tổng đài web

- **Hiện trạng:** nút "Gọi" mở cuộc gọi của điện thoại / phần mềm gọi trên máy (liên kết `tel:`); không ghi nhật ký cuộc gọi.
- **Cần:** tổng đài có giao diện lập trình (gọi ra, ghi âm, trạng thái cuộc gọi) — cùng nhà cung cấp tổng đài / IVR.
- **Việc lập trình khi có:** nút "Gọi qua tổng đài" bên cạnh nút gọi trực tiếp, ghi nhật ký cuộc gọi vào phiếu / lệnh.

### BC4 — Gửi lệnh điều động tới chỉ huy

Giống BD10 của trang B: kênh SMS Brandname / Zalo ZNS / thông báo đẩy; hộp thoại điều động đã có nhánh "Đã gửi lệnh tới …"
— máy chủ trả `sent: true` khi gửi được là đủ.

### BC5 — Số điện thoại người lái

Giống BD9 của trang B: thêm người lái + số điện thoại vào mẫu nhập "Phương tiện"; thẻ / bảng phương tiện đổi nút "Gọi"
(đơn vị quản lý) thành "Gọi người lái".

### BC6 — Theo dõi GPS (không làm)

Ngày 29/09/2026 chủ dự án quyết định **không làm** chia sẻ vị trí điện thoại của đội cứu hộ; xuồng, xe chưa gắn thiết bị định
vị. Trạng thái "đang đến / đã đến" theo ETA và báo của trưởng nhóm qua link nhiệm vụ.

## 5. Kiểm tra khi có dữ liệu thật

1. Triển khai bản mới (V1 của trang A).
2. Nhập dữ liệu nền (BC1) và định mức (BC2); mở `/nguon-luc` trên điện thoại và máy tính:
   - dải khẩn: mỗi mục chạm vào mở đúng danh sách; số trên ô "Kho cạn kiệt" bằng số kho trong danh sách đã lọc;
   - so vài kho với sổ kho thật: tồn, % định mức, hạn dùng gần nhất; mặt hàng thiếu thật phải hiện Đỏ / Vàng;
   - "Theo mặt hàng": tổng tồn khớp báo cáo tổng hợp của tỉnh;
   - Bản đồ: viền biểu tượng kho khớp màu thẻ kho ở trang C.
3. Dùng thử với thủ kho, cán bộ xã trên điện thoại: xuất kho cho điểm sơ tán, nhập hàng cứu trợ, báo xe hỏng / nhiên liệu —
   ghi lại bước còn phải gõ nhiều, nhãn khó hiểu.
4. Dùng thử với lãnh đạo trên laptop, iPad: đọc dải khẩn + 4 ô chỉ số trong vài giây, mở biểu đồ từng thẻ, xuất PDF gửi cấp
   trên — ghi lại chỉ số còn thiếu.

## 6. Tham chiếu mã nguồn

| Phần | Tệp |
|---|---|
| Trang Vật tư & Lực lượng (thẻ, bộ lọc trên địa chỉ, tìm, xếp, phân trang, Excel / PDF, thanh thao tác nhanh) | `frontend/src/pages/Resources.jsx` |
| Số liệu suy ra: mức của kho, bộ lọc từng thẻ, cách xếp, dải khẩn | `frontend/src/components/resources/resourceFacts.js` |
| Dải khẩn, ô chỉ số, thanh tìm – lọc – xuất | `components/resources/ResourceAlerts.jsx`, `ResourceKpis.jsx`, `ResourceToolbar.jsx` |
| Danh sách lực lượng / kho / phương tiện (bảng, thẻ), bản đồ phương tiện, nhiên liệu dự trữ | `components/resources/ForceList.jsx`, `WarehouseList.jsx`, `VehicleList.jsx` |
| Biểu đồ cho lãnh đạo, tổng hợp theo mặt hàng | `components/resources/ReadinessCharts.jsx`, `ItemSummary.jsx`, `components/charts/SuppliesChart.jsx` |
| Chọn kho / phương tiện, điều động nhanh | `components/resources/PickSheet.jsx`, `QuickDispatch.jsx` |
| Form xuất / nhập kho, báo xe, nhiên liệu dự trữ; ô số lượng −/+ | `components/common/IssueModal.jsx`, `LogisticsModals.jsx`, `QtyStepper.jsx` |
| Thang màu dự trữ dùng chung (`stockLevel`, `STOCK_LOW`, `STOCK_WATCH`, `EXPIRY_DAYS`) | `frontend/src/utils/risk.js` |
| Phân trang, tìm không dấu (`foldVi`) | `frontend/src/utils/usePaged.js`, `utils/format.js` |
| Thành phần dùng chung: `Tabs` (`fit`, `label`), `Pager`, `StepChips`, `Progress` (`level`) | `frontend/src/components/common/ui.jsx` |
| Biểu tượng, popup kho trên Bản đồ (cùng thang) | `components/map/icons.js` (`warehouseIcon`), `MapLayers.jsx` (`WarehousePopup`), `MapLegend.jsx` |
| API nguồn lực | `backend/app/api/v1/resources.py` (`/resources/summary`, `/forces`, `/warehouses`, `/vehicles`, `/fuel-depots`, nhập / xuất kho, báo xe) |
| Quy tắc ghi (nhiên liệu thấp, nhập hàng, sức chứa) | `backend/app/services/logistics.py` (`FUEL_LOW`) |
| Biểu đồ phân bổ kho (thêm nhóm `y_te`), lớp kho trên bản đồ (`min_pct`, `low_items`) | `backend/app/api/v1/dashboard.py` (`/dashboard/supplies`), `backend/app/api/v1/map_layers.py` |
| Kiểm thử | `tests/ui/ui-test.mjs` (khối "Vật tư & Lực lượng" — laptop, iPad dọc, điện thoại 360, tài khoản phường; khối "Thao tác hiện trường") |

## 7. Các thay đổi đã làm cho trang C (để tra cứu)

| PR | Nội dung |
|---|---|
| #69 | Dải thông tin khẩn trên cùng, 4 ô chỉ số (StatCard) chạm được, thang màu dự trữ dùng chung `stockLevel`; 3 thẻ vừa màn 360 px; bộ lọc riêng từng thẻ kèm số dòng, thẻ + bộ lọc trên địa chỉ; tìm không dấu, xếp, phân trang, Excel / PDF mọi dòng đang lọc; bảng (máy tính) / thẻ (điện thoại) nút ≥ 44 px; trạng thái tải / lỗi / trống / không khớp lọc / mất mạng; tài khoản xã: tiêu đề xã của mình; biểu đồ phân bổ ghi "nhóm hàng" (trước ghi sai "mặt hàng"); sửa kèm thẻ nguồn dữ liệu tràn ngang khi lỗi có URL dài; ui-test khối "Vật tư & Lực lượng" |
| #70 | Thanh dưới đáy điện thoại (Xuất kho · Nhập kho · Báo SOS · Báo xe · Gọi 112), chọn kho / phương tiện; form xuất / nhập kho 2 bước, báo xe bằng chip, nhiên liệu dự trữ — lỗi hiện ngay, xem trước tồn; form xuất kho mở từ Bản đồ chờ số tồn mới nhất; ui-test khối "Thao tác hiện trường" |
| #71 | Biểu đồ quân số theo loại lực lượng, phương tiện theo nhóm – tình trạng; "Theo mặt hàng"; nhóm Y tế trong biểu đồ phân bổ, bảng tác chiến; biểu tượng / popup kho trên Bản đồ cùng thang màu (API thêm `min_pct`, `low_items`); tài liệu này |
