# Prompt chỉnh từng giao diện theo thiết kế Part 1 — cho người mới, không rành công nghệ

Theo mục A–G của tài liệu "Thiết kế trang web điều hành PCTT cấp tỉnh thành phố — Part 1".

## Cách dùng

1. **Mỗi lần giao một giao diện.**
   - Ghép **PHẦN CHUNG** (bên dưới) với prompt của giao diện đó, dán vào một phiên mới.
   - Phiên có thể là claude.ai/code (repo `hoang-hg/caobang-pctt`, nhánh `main`), `claude --cloud "…"`, hoặc Claude trong VS Code.
2. **Thứ tự nên làm:** A Tổng quan → D Điều hành cứu hộ → E Cảnh báo → C Vật tư & Lực lượng → B Bản đồ → F Bộ lọc & Sáng/Tối → G Nhập & quản lý dữ liệu.
3. **Mỗi giao diện là một PR.**
   - Xem trên máy (Vite :5173) trước khi merge.
   - CI phải xanh mới merge; tag/deploy để anh/chị tự quyết.
4. **Phiên cloud không đọc được file .docx thiết kế** (file không có trong repo). Vì vậy mỗi prompt đã tóm tắt sẵn yêu cầu của mục tương ứng.

---

## PHẦN CHUNG (dán kèm mọi prompt)

```text
Bạn làm việc trên repo caobang-pctt — hệ thống điều hành phòng chống thiên tai & tìm kiếm cứu nạn tỉnh Cao Bằng
(56 xã/phường). Đọc CLAUDE.md trước khi sửa. Trả lời, ghi chú, commit bằng tiếng Việt có dấu.

NGƯỜI DÙNG (không rành công nghệ, giỏi chuyên môn PCTT):
- Lãnh đạo Ban Chỉ huy PCTT & TKCN tỉnh: xem nhanh trên màn hình lớn hoặc máy tính bảng, ra quyết định, duyệt cảnh
  báo bằng PIN. Ít thao tác, cần thấy ngay việc gấp.
- Trực ban tỉnh: tiếp nhận SOS, điều động lực lượng, soạn lệnh cảnh báo — thao tác nhiều, cần nhanh, ít bước.
- Cán bộ xã/phường: chủ yếu dùng điện thoại, mạng yếu, ít quen máy tính — xin chi viện, cập nhật sơ tán, báo cáo.
Mục tiêu: người mới mở màn hình lần đầu, KHÔNG đọc hướng dẫn, vẫn biết đang có chuyện gì và bấm vào đâu.

GIAO DIỆN HIỆN BỊ "AI HOÁ" — BỎ CÁC DẤU HIỆU SAU:
- Tiêu đề kiểu khẩu hiệu, chữ IN HOA giãn cách; câu mô tả dài dưới mọi tiêu đề.
- Gradient, đổ bóng phát sáng, viền đỏ/hồng khắp nơi, khung lồng trong khung, biểu tượng đặt trong ô vuông màu.
- Emoji, chấm nhấp nháy liên tục, hiệu ứng phóng to khi rê chuột.
- Thuật ngữ tiếng Anh / viết tắt trên màn hình: Dashboard, KPI, SLA, ETA, QPF, Nowcast, P10–P90, Maker–Checker,
  HEC-HMS, ECMWF/GFS, Tác chiến, TOC… → thay bằng từ cán bộ PCTT quen dùng.
- Hàng chục huy hiệu, chip, con số trang trí không phục vụ quyết định; nút chữ mơ hồ ("Xử lý", "Thực thi").

THAY BẰNG:
- Văn phong công việc PCTT quen thuộc: "Báo động I/II/III", "sơ tán", "điều động", "phiếu cứu hộ", "lệnh cảnh báo",
  "trực ban", "xã xin chi viện", "kho dự trữ", "định mức".
- Mỗi màn trả lời MỘT câu hỏi chính; việc gấp nằm trên cùng; mỗi khu vực tối đa MỘT nút chính tô màu.
- Câu trạng thái bằng lời thay cho số trơ trọi, ví dụ "Sông Bằng Giang tại Cao Bằng đang lên 15 cm/giờ — có thể chạm
  Báo động II lúc 21:00", "Kho Bảo Lạc còn 15% định mức gạo — cần bổ sung".
- Chữ nội dung ≥ 14 px, con số chính to rõ; biểu tượng luôn kèm chữ; vùng chạm ≥ 44 px trên màn cảm ứng.
- Màu: chỉ thang 4 mức rủi ro có sẵn (utils/risk.js: Xanh / Vàng / Cam / Đỏ, Xám = chưa có dữ liệu) cho rủi ro, cộng
  1 màu nhấn cho thao tác; nền trung tính. Đỏ chỉ dùng cho việc thật sự khẩn.
- "Mới mẻ, sống động" bằng chuyển động CÓ Ý NGHĨA: phiếu mới trượt vào, số liệu đổi có hiệu ứng nhẹ, bản đồ bay tới
  điểm vừa chọn; tôn trọng chế độ giảm chuyển động (prefers-reduced-motion). Màn trống có hình minh hoạ đơn giản và
  câu nói rõ cần làm gì.
- Hướng dẫn tại chỗ: lần đầu mở mỗi màn có gợi ý 3 bước (tắt được, nhớ trên máy); nút "?" nhỏ giải thích thuật ngữ
  chuyên môn bằng một câu.
- Thao tác nhiều bước làm theo từng bước (Tiếp / Quay lại); hỏi xác nhận bằng câu nói rõ hậu quả; báo kết quả bằng lời.

KỸ THUẬT & RÀNG BUỘC:
- Frontend: React 18 + Tailwind 3 + lucide-react + Recharts + Leaflet. KHÔNG thêm thư viện mới.
- Dùng lại khung có sẵn: PAGE (components/layout/page.js), PageHeader, ExportMenu, Segmented, Tabs, Section
  (components/common), StatCard (components/dashboard), UrgentStrip, thang màu utils/risk.js; lớp nút .btn-primary,
  .btn-secondary, .btn-ghost, .btn-danger; số dùng lớp `num`. Sửa ở thành phần dùng chung thì mọi trang cùng đẹp lên.
- KHÔNG đổi API backend. Nếu thật cần, đề xuất trước; chỉ thêm nhỏ, không phá vỡ, ghi rõ trong PR.
- KHÔNG làm mất chức năng đang có; giữ nguyên phân quyền 3 cấp (tỉnh / xã); không hiển thị dữ liệu mẫu cho người dân
  như dữ liệu thật; nút "Báo cáo nhanh" (tạo phiếu SOS) vẫn cố định trên thanh trên cùng.
- Xe, xuồng và đội cứu hộ KHÔNG có định vị GPS trực tiếp: hiển thị nơi đóng quân, điểm đến, tiến độ do đội báo
  (link nhiệm vụ) — không đề xuất theo dõi vị trí điện thoại cán bộ.
- Kiểm tra: điện thoại 360 px không tràn ngang; nền Sáng và Tối đều đúng màu; `cd frontend && npm run lint && npm run
  build` sạch; cập nhật tests/ui/ui-test.mjs cho phần giao diện đã đổi (bài kiểm thử tìm phần tử theo tên nút / nhãn).
- Repo công khai: không đưa ảnh chụp có dữ liệu, tên / số điện thoại thật, khoá bí mật, file .docx lên repo.

BÀN GIAO: tạo nhánh mới từ main, commit nhỏ theo từng ý, mở PR mô tả trước/sau bằng lời (kèm danh sách chữ / thuật
ngữ đã đổi). KHÔNG tự merge, KHÔNG gắn tag, KHÔNG deploy.
```

---

## A. Tổng quan (Dashboard)

```text
GIAO DIỆN: Tổng quan — frontend/src/pages/Dashboard.jsx và components/dashboard/ (KpiStrip, StatCard, DecisionPanel,
SituationBar, TacticalMiniMap, OperationsTable), components/charts/.

THIẾT KẾ (mục A): màn giám sát trung tâm cho Ban Chỉ huy, dạng lưới, dùng được cả màn hình lớn lẫn máy tính bảng.
- Ô chỉ số trên cùng: mưa trung bình lưu vực và mưa lớn nhất (mm/24 giờ); mực nước sông so với Báo động I/II/III;
  số hộ / nhân khẩu đã sơ tán trên kế hoạch; số phiếu SOS chờ xử lý (báo đỏ nếu quá 15 phút chưa có lực lượng nhận);
  quân số ứng trực / đang làm nhiệm vụ; phương tiện chuyên dụng đang hoạt động.
- Biểu đồ: mực nước thực đo + dự báo có vạch Báo động I–III; mưa theo giờ + mưa cộng dồn, 1–3 giờ tới vẽ nét đứt (dự
  báo); ngưỡng sạt lở (mưa 3 ngày so với cường độ mưa, chia Đỏ / Cam / Vàng); vật tư cứu trợ theo địa phương (phần
  thiếu so với định mức).
- Nhật ký sự kiện cập nhật liên tục (vận hành hồ, cứu hộ, phản ánh của người dân).
- Xuất toàn màn hình ra PDF để báo cáo nhanh UBND tỉnh. Phòng điều hành mặc định nền tối.

CÂU HỎI NGƯỜI DÙNG CẦN TRẢ LỜI TRONG 5 GIÂY: "Chỗ nào đang nguy hiểm nhất? Việc gì đang chờ tôi quyết định?"

VIỆC CẦN LÀM:
1. Trên cùng (dưới dải khẩn): MỘT câu tóm tắt tình hình bằng lời, ghép từ số liệu thật ("2 trạm vượt Báo động II, 12
   phiếu SOS chờ — 3 phiếu quá hạn, 2 hồ đang xả lũ"). Không có số liệu thì nói "chưa có số liệu", không nói "an toàn".
2. "Việc chờ quyết định" là khối nổi bật đầu tiên: mỗi dòng một việc, con số lớn, nút đi thẳng tới chỗ xử lý.
3. 6 ô chỉ số: mỗi ô một con số lớn + một dòng ý nghĩa bằng lời + mũi tên xu hướng; ô SOS báo đỏ khi có phiếu chờ quá
   15 phút (chỉ nhãn nhấp nháy, không nhấp nháy cả ô).
4. Mỗi biểu đồ có tiêu đề là câu kết luận, ví dụ "Sông Bằng Giang tại Cao Bằng: Báo động I, dự báo lên Báo động II
   lúc 21:00". Vạch Báo động ghi chữ ngay trên đường; phần dự báo ghi chữ "Dự báo"; "P10–P90" đổi thành "khoảng có
   thể xảy ra"; bỏ tên mô hình khỏi tiêu đề (để trong nút "?").
5. Nhật ký thành dòng thời gian: giờ + biểu tượng loại + một câu ngắn; lọc bằng nút chữ (Tất cả / Cứu hộ / Hồ chứa /
   Cảnh báo / Người dân).
6. Chế độ trình chiếu màn hình lớn: chữ to, nền tối, tự chuyển chuyên đề.

GIỮ NGUYÊN: các thẻ Hồ chứa & xả lũ / Sạt lở & đường đèo / Cấp xã / Hệ thống; menu "Xuất" (ảnh chụp PDF, báo cáo văn
bản, Excel); thứ tự trên điện thoại (Việc chờ quyết định → bản đồ → biểu đồ → nhật ký); trang Cấp xã của tài khoản xã.

NGHIỆM THU: không còn từ tiếng Anh / viết tắt trên màn; điện thoại 360 × 740 thấy dải khẩn + 6 ô chỉ số không cần
cuộn; người chưa từng dùng chỉ ra được "việc chờ tôi" và "chỗ nguy hiểm nhất" ngay lần đầu.
```

## B. Bản đồ giám sát

```text
GIAO DIỆN: Bản đồ giám sát — frontend/src/pages/MonitoringMap.jsx, components/map/ (MapPanels, MapLayers, MapTools,
MapKpis, MapLegend, IncidentModal).

THIẾT KẾ (mục B): bản đồ toàn màn hình, các bảng nổi bên trên: bảng lớp dữ liệu (trái), thanh thời gian 12 giờ qua →
24 giờ tới (dưới), bảng cảnh báo khẩn liên tục (phải), công cụ bản đồ (nền vệ tinh / địa hình / đường phố, đo khoảng
cách, khoanh vùng). 4 nhóm lớp: (1) mưa, mực nước, hồ chứa, radar, bão; (2) vùng ngập, điểm sạt lở, sự cố giao
thông; (3) lực lượng, kho vật tư (% hàng còn), điểm sơ tán (đang chứa / sức chứa); (4) người dân cầu cứu (SOS).
Bấm đối tượng → cửa sổ thông tin có biểu đồ nhỏ và nút hành động (gọi điện, ra lệnh xuất kho); camera xem trực tiếp;
khoanh vùng → đếm số hộ trong vùng → soạn cảnh báo; tìm đường an toàn né vùng ngập / sạt lở; kéo biểu tượng đội cứu
hộ thả vào điểm SOS để điều động.

CÂU HỎI CẦN TRẢ LỜI: "Chuyện gì đang xảy ra ở đâu? Đội nào ở gần?"

VIỆC CẦN LÀM:
1. Hai chế độ đặt tên dễ hiểu kèm một câu giải thích: "Xem tình hình" (chỉ lớp rủi ro — mặc định cho lãnh đạo) và
   "Điều hành" (thêm lực lượng, kho, lộ trình, điểm sơ tán).
2. Bảng lớp 4 nhóm theo thiết kế, tên đời thường: "Mưa & mực nước", "Vùng nguy hiểm", "Lực lượng & kho", "Người dân
   cầu cứu". Mỗi lớp: công tắc to + biểu tượng mẫu + số đếm; nút "Về mặc định".
3. Cửa sổ thông tin: tiêu đề đọc được (không mã máy), 2–3 con số chính viết thành câu, nút hành động lớn (Gọi /
   Điều động / Xem biểu đồ / Mở phiếu).
4. Kéo-thả đội vào điểm SOS: gợi ý chữ "Kéo đội cứu hộ thả vào điểm cầu cứu để điều động"; hộp xác nhận nói rõ đội
   nào, đến đâu, khoảng cách, tuyến có an toàn không.
5. Thanh thời gian ghi "12 giờ trước … Bây giờ … 24 giờ tới" và nói lớp nào đổi theo giờ, lớp nào không.
6. Chú giải luôn mở được bằng 1 chạm; màn hình máy tính dành ≥ 70% cho bản đồ.

GIỮ NGUYÊN: tài khoản xã chỉ thấy và bay tới xã mình; bảng "Tình hình" / "Điểm nóng"; đo khoảng cách, khoanh vùng
gửi sang soạn cảnh báo; thanh thao tác dưới cùng trên điện thoại. Không có GPS trực tiếp của xe / xuồng (xem phần chung).

NGHIỆM THU: người mới bật được lớp "Vùng ngập", tìm được đội gần một điểm SOS và mở hộp điều động mà không cần hướng
dẫn; điện thoại không bị bảng che quá nửa bản đồ.
```

## C. Vật tư & Lực lượng

```text
GIAO DIỆN: Vật tư & Lực lượng — frontend/src/pages/Resources.jsx, components/resources/ (ResourceKpis, ForceList,
WarehouseList, VehicleList, ItemSummary, InventoryLedger, QuickDispatch, ReadinessCharts, ResourceAlerts).

THIẾT KẾ (mục C): Trưởng ban nắm "ta có gì, ở đâu, tình trạng ra sao" để điều động ngay. Lọc theo địa bàn, cấp quản
lý (tỉnh / xã), tình trạng (sẵn sàng / đang làm nhiệm vụ / bảo trì). Ô chỉ số: cán bộ chiến sĩ sẵn sàng; xuồng, xe lội
nước đang rảnh; tỉ lệ dự trữ lương thực / nước uống (đỏ nếu kho dưới 20%). Ba phần:
- Lực lượng: đơn vị, quân số (tổng / sẵn sàng / đang làm nhiệm vụ), nơi đóng quân (xem trên bản đồ), chỉ huy và số
  điện thoại (bấm gọi), kỹ năng (lặn, lái xuồng, sơ cứu, cứu hộ vùng núi / sạt lở), nút "Điều động nhanh".
- Kho vật tư: kho tỉnh / cụm / dã chiến; mặt hàng lương thực, nước uống, y tế, đồ dùng; Đỏ = dưới 20% định mức, Cam =
  sắp hết hạn; biểu đồ kho đầy / kho thiếu để điều tiết giữa các vùng.
- Phương tiện: đường thuỷ / đường bộ / thiết bị chuyên dụng; tình trạng 3 màu kèm mức nhiên liệu; nhiên liệu dự trữ.
Điều động: hệ thống gợi ý đội + phương tiện gần nhất đủ điều kiện; xuất Excel / PDF.

CÂU HỎI CẦN TRẢ LỜI: "Còn thiếu gì? Đội / xuồng nào đang rảnh để điều đi ngay?"

VIỆC CẦN LÀM:
1. Mở trang thấy ngay khối "Cần bổ sung / cần sửa": kho dưới 20%, hàng sắp hết hạn, phương tiện hỏng — mỗi dòng một
   câu ("Kho cụm Bảo Lạc: gạo còn 15% định mức") + nút "Xuất / nhập kho" hoặc "Xem".
2. Danh sách dễ đọc trên điện thoại (thẻ thay bảng nhiều cột): tên, tình trạng bằng chữ + màu, con số chính, nút Gọi
   chỉ huy to.
3. Kho: thanh mức dự trữ có vạch định mức, ghi số còn và "đủ / cần bổ sung"; nhập / xuất kho từng bước — chọn mặt hàng
   bằng nút, số lượng bằng −/+, lý do chọn sẵn.
4. Điều động nhanh: gợi ý viết thành câu ("Đội dân quân xã X — cách 2 km — 6 người sẵn sàng — có xuồng"), một nút xác
   nhận; sau khi điều, trạng thái đổi ngay và nói rõ bước tiếp theo.
5. Bộ lọc gọn một hàng; bỏ thuật ngữ; tên phần đổi thành "Lực lượng", "Kho vật tư", "Phương tiện".

GIỮ NGUYÊN: sổ xuất – nhập kho, xuất Excel / PDF, phân quyền xã (xã chỉ thấy và thao tác tại xã mình), biểu đồ cho
lãnh đạo, thanh thao tác dưới cùng trên điện thoại.

NGHIỆM THU: cán bộ kho mới xuất được 10 thùng mì cho một phiếu cứu hộ trong ≤ 4 bước; lãnh đạo nói được "kho nào đang
thiếu" chỉ sau một lần nhìn.
```

## D. Điều hành cứu hộ

```text
GIAO DIỆN: Điều hành cứu hộ — frontend/src/pages/RescueCenter.jsx, components/rescue/ (RescueBoard, TicketCard,
TicketTable, Intake, Evacuation, RescueKpis, RescueMap, SosTrend), components/common/DispatchModal.jsx.

THIẾT KẾ (mục D): tiếp nhận yêu cầu cứu hộ từ nhiều kênh (Zalo, ứng dụng, tổng đài, cán bộ) về một chỗ; máy tự bóc tách
tin nhắn (địa chỉ, số người mắc kẹt, loại sự cố) và ghim lên bản đồ. 3 mức ưu tiên kèm hạn phản hồi: Cấp 1 Đỏ — sinh
tử (dưới 3 phút), Cấp 2 Cam — nguy hiểm (15 phút), Cấp 3 Vàng — hỗ trợ (60 phút). Bảng 4 cột: Chờ xử lý → Đang điều
phối → Đang thực thi (đếm ngược thời gian tiếp cận) → Hoàn thành (đội hiện trường xác nhận đã cứu an toàn). Điều động
theo đúng loại lực lượng (sạt lở cần máy xúc, chó nghiệp vụ — không phải xuồng), tuyến né ngầm tràn / sạt lở, nút phát
lệnh khẩn cho trưởng nhóm. Tự tạo điểm nóng từ số liệu trạm; theo dõi sơ tán và sức chứa điểm sơ tán.

CÂU HỎI CẦN TRẢ LỜI: "Phiếu nào phải xử lý ngay? Đã có đội nào đi chưa?"

VIỆC CẦN LÀM:
1. Bốn cột đặt tên đời thường: "Mới báo — chưa ai nhận", "Đang tìm đội", "Đội đang đến", "Đã cứu xong".
2. Mỗi thẻ phiếu: mức ưu tiên bằng chữ + màu; việc gì, ở đâu, bao nhiêu người, có người già / trẻ em không; đã chờ bao
   lâu viết bằng chữ ("Chờ 5 phút — quá hạn 2 phút"); MỘT nút chính đúng bước tiếp theo (Nhận phiếu / Điều đội / Đội đã
   đến / Xác nhận đã cứu).
3. Tiếp nhận tin: dán tin nhắn → máy tự điền → người dùng chỉ kiểm tra và bấm "Tạo phiếu"; phần máy tự đoán đánh dấu
   "cần kiểm tra lại".
4. Điều động: hộp thoại 3 bước — chọn đội được gợi ý (khoảng cách, số người, kỹ năng bằng chữ) → vật tư mang theo →
   xác nhận; tuyến an toàn nói bằng câu; nút "Sao chép lệnh gửi Zalo" và "Gọi trưởng nhóm".
5. Phiếu mới trượt vào kèm âm báo; "Xã xin chi viện" có nhãn riêng dễ thấy.
6. Sơ tán: mỗi điểm sơ tán một thanh "đang chứa / sức chứa", cảnh báo "sắp đầy".

GIỮ NGUYÊN: thứ tự ưu tiên (quá hạn → cấp ưu tiên → thời gian nhận); kéo-thả giữa các cột; link nhiệm vụ cho trưởng
nhóm hiện trường; danh sách + tra cứu 48 giờ / 7 / 30 ngày; xuất Excel / PDF; quyền (cán bộ xã không có nút điều động).

NGHIỆM THU: trực ban mới tạo phiếu từ một tin nhắn Zalo và điều đội đi trong ≤ 60 giây mà không cần hướng dẫn; nhìn
một lần biết ngay phiếu nào quá hạn.
```

## E. Cảnh báo khẩn cấp & Hotline

```text
GIAO DIỆN: Cảnh báo & Hotline — frontend/src/pages/Alerts.jsx, components/alerts/ (Composer, BroadcastCards,
AlertModals, AlertMap, DeliveryChart, ContactDirectory, HotlinePanel, AuditLog, AlertKpis).

THIẾT KẾ (mục E): phát cảnh báo qua nhiều kênh (Zalo OA, thông báo trên ứng dụng, SMS / tin nhắn vùng, loa phát
thanh); mẫu tin dựng sẵn có chỗ trống tự điền để soạn dưới 10 giây (xả lũ hồ chứa, di dời sạt lở, bão đổ bộ); chọn
vùng bằng cách vẽ trên bản đồ hoặc chọn xã; tự sinh bản nháp khi cảm biến / mô hình dự báo vượt ngưỡng; danh bạ phân
cấp Tỉnh → Xã → Thôn, bấm số để gọi; phân luồng cuộc gọi tổng đài; người soạn khác người duyệt, duyệt bằng mã PIN;
bảng kết quả chuyển tin theo kênh; nhật ký pháp lý (ai tạo, ai duyệt, nội dung, giờ gửi).

CÂU HỎI CẦN TRẢ LỜI: lãnh đạo — "Có lệnh nào chờ tôi duyệt?"; trực ban — "Soạn và gửi lệnh thế nào cho nhanh?";
mọi người — "Người dân đã nhận được tin chưa?"

VIỆC CẦN LÀM:
1. Lãnh đạo mở trang thấy ngay "Chờ bạn duyệt": mỗi lệnh xem trước như tin người dân sẽ nhận, vùng nhận, số người nhận,
   nút "Duyệt bằng PIN" lớn và "Trả lại" kèm lý do.
2. Soạn lệnh 3 bước: chọn mẫu bằng thẻ có hình và tên việc ("Xả lũ hồ chứa", "Di dời do sạt lở", "Bão đổ bộ", "Tự
   soạn") → điền chỗ trống bằng ô có ví dụ → chọn vùng (bản đồ / danh sách xã) và xem trước trên khung điện thoại,
   kèm ước tính số người nhận.
3. "Maker–Checker" đổi thành "Người soạn — Người duyệt"; giải thích ngắn vì sao cần PIN.
4. Kết quả gửi: thanh tiến độ theo kênh bằng chữ ("Đã tới 97% thuê bao · 26/27 loa đã phát"); kênh chưa tích hợp phải
   ghi rõ "chưa gửi được qua kênh này", tuyệt đối không giả "đã gửi".
5. Danh bạ: cây Tỉnh → Xã → Thôn, tìm không dấu, nút Gọi lớn; nhật ký pháp lý thành dòng thời gian "ai — làm gì — lúc
   nào".
6. Bản nháp tự động từ cảm biến có nhãn "Máy đề xuất — cần người duyệt".

GIỮ NGUYÊN: mã PIN, phân quyền (cán bộ xã chỉ xem, không soạn), gia hạn / kết thúc cảnh báo, lịch sử lệnh, xuất Excel /
PDF, bản đồ vùng cảnh báo.

NGHIỆM THU: trực ban mới soạn được lệnh "Xả lũ hồ chứa" cho 3 xã trong ≤ 60 giây; lãnh đạo duyệt bằng PIN trong ≤ 3
chạm từ lúc mở trang.
```

## F. Bộ lọc địa phương & chế độ Sáng/Tối

```text
GIAO DIỆN: thanh trên cùng — frontend/src/components/layout/Header.jsx, components/common/AdminFilter.jsx, OmniSearch.jsx,
UserMenu.jsx (Theo máy / Sáng / Tối), index.css (biến màu), utils/risk.js.

THIẾT KẾ (mục F): chọn một địa bàn thì MỌI trang (bản đồ, tổng quan, danh sách SOS, nguồn lực) chỉ hiện dữ liệu của
địa bàn đó. Chọn theo cây Tỉnh → Xã/Phường → Thôn; bản đồ tự phóng vừa ranh giới, phủ mờ vùng ngoài. Lọc nhanh theo
vùng thiên tai (vùng trũng hạ lưu sông Bằng Giang – Hiến; vùng núi, đèo dốc). Ô tìm kiếm gõ tự do tên địa danh, toạ độ
GPS hoặc mã phiếu SOS, có gợi ý. Nền tối cho phòng điều hành (đỡ mỏi mắt, màu cảnh báo nổi rõ); nền sáng cho hiện
trường dưới nắng và khi in / xuất PDF; tự theo hệ điều hành và nhớ lựa chọn.

CÂU HỎI CẦN TRẢ LỜI: "Tôi đang xem vùng nào? Đổi vùng thế nào? Về toàn tỉnh thế nào?"

VIỆC CẦN LÀM:
1. Nút địa bàn luôn ghi rõ "Đang xem: Xã Cô Ba" (hoặc "Toàn tỉnh Cao Bằng") và có nút "Về toàn tỉnh" dễ thấy; đầu mọi
   trang hiện cùng nhãn địa bàn.
2. Hộp chọn: ô tìm không dấu trên cùng; nhóm "Cần chú ý" (xã Đỏ / Cam) lên đầu, mỗi xã kèm lý do bằng lời ("3 phiếu SOS
   quá hạn"); nhóm theo vùng (hạ lưu, vùng núi, biên giới); xã chọn gần đây.
3. Tìm kiếm: khi trống hiện ví dụ cách gõ ("Gõ tên xóm, mã phiếu SOS hoặc toạ độ"); kết quả nhóm theo loại (Địa danh /
   Phiếu SOS / Trạm / Đơn vị), chạm là bay tới trên bản đồ.
4. Sáng / Tối: menu 3 lựa chọn bằng chữ "Theo máy / Sáng / Tối"; kiểm tra tương phản chữ màu cảnh báo trên cả hai nền;
   bản đồ nền đổi theo; in luôn nền sáng.
5. Gọn thanh trên cùng cho người mới: biểu tượng nào cũng có chữ (hoặc chú thích khi rê / chạm); bớt nút ít dùng vào
   menu tài khoản.

GIỮ NGUYÊN: bộ lọc nhớ theo tài khoản; tài khoản xã mặc định là xã mình (không thấy xã khác); phím "/" mở tìm kiếm;
"Báo cáo nhanh" cố định trên thanh trên cùng.

NGHIỆM THU: người mới đổi sang một xã rồi về toàn tỉnh trong ≤ 3 chạm; ở cả nền sáng và nền tối, mọi chữ đạt tương phản
≥ 4,5 : 1.
```

## G. Nhập & quản lý dữ liệu (phục vụ mục G — cơ sở dữ liệu điều hành)

```text
GIAO DIỆN: frontend/src/pages/DataImport.jsx, DataImportForm.jsx, DataSubmissions.jsx (hồ sơ xã gửi), DataSources.jsx
(nguồn dữ liệu & thiết bị IoT), AccessControl.jsx (phân quyền).

THIẾT KẾ (mục G): cơ sở dữ liệu điều hành gồm 5 cụm — địa giới hành chính (tỉnh, xã, thôn, dân số, vùng nguy hiểm);
nguồn lực (lực lượng, kho, tồn kho, phương tiện, điểm sơ tán); điều hành khẩn cấp (phiếu SOS, lệnh điều động, nhật ký);
quan trắc (trạm, cảm biến, số đo, ngưỡng báo động); liên lạc (danh bạ, mẫu tin, lệnh cảnh báo, nhật ký pháp lý). Cán
bộ không rành công nghệ phải tự cập nhật được các danh mục này.

CÂU HỎI CẦN TRẢ LỜI: "Tôi muốn cập nhật danh sách điểm sơ tán / kho / danh bạ — làm thế nào cho đúng?"

VIỆC CẦN LÀM:
1. Nhập dữ liệu như điền biểu mẫu: chọn loại dữ liệu bằng thẻ có hình và câu mô tả ("Điểm sơ tán: trường học, nhà văn
   hoá đón dân khi sơ tán"); nút "Tải mẫu Excel" có sẵn dòng ví dụ; tải tệp lên → máy kiểm tra → báo lỗi theo dòng bằng
   lời ("Dòng 5: thiếu sức chứa") → xem trước → bấm "Ghi vào hệ thống". Có thêm cách điền trực tiếp từng dòng.
2. Hồ sơ xã gửi: danh sách chờ duyệt, xem trước / sau khi thay đổi, nút "Duyệt" và "Trả lại" kèm lý do.
3. Nguồn dữ liệu & IoT: mỗi nguồn một dòng trạng thái bằng chữ ("Đang nhận số đo — lần cuối 2 phút trước" / "Mất tín
   hiệu từ 03:10"); chi tiết kỹ thuật (khoá, địa chỉ máy chủ) giấu trong "Nâng cao".
4. Phân quyền: 3 cấp giải thích bằng lời (Quản trị hệ thống / Quản trị tỉnh / Quản trị xã); tạo tài khoản từng bước;
   hỏi xác nhận rõ hậu quả trước thao tác khoá / đặt lại mật khẩu.

GIỮ NGUYÊN: dữ liệu chỉ ghi khi không còn lỗi và ghi toàn bộ hoặc không ghi gì; xã chỉ gửi dữ liệu của xã mình và phải
chờ tỉnh duyệt; quyền quản lý tài khoản chỉ cấp trên → cấp dưới; nhật ký thao tác.

NGHIỆM THU: cán bộ xã mới gửi được danh sách 3 điểm sơ tán từ tệp mẫu mà không cần gọi hỏi; lỗi nào cũng nói rõ dòng
nào, sửa thế nào.
```
