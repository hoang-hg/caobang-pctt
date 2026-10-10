# Trang A – Tổng quan: đối chiếu thiết kế và việc còn lại

Đối chiếu với mục **A. Thiết kế chi tiết cho Dashboard Tổng quan & Biểu đồ Dữ liệu** (tài liệu thiết kế Part 1) và các yêu cầu
giao diện bổ sung (màu rủi ro thống nhất, thông tin khẩn trên cùng, bảng có tìm / lọc / phân trang / xuất file, form chia bước
có báo lỗi khi nhập, trạng thái tải / trống / lỗi / mất mạng, 360 px, theo phân quyền).

- Cập nhật: 10/10/2026 — mã nguồn `main` gồm PR #36 → #52 (G1, G2 ở PR #50; 3 ô KPI và nhật ký vận hành hồ ở PR #51) và
  PR #63 (vùng chạm ≥ 44 px trên màn cảm ứng ở cả 5 tab).
- Máy chủ thử vẫn chạy **v1.0.3** (04/10/2026), **chưa có** các thay đổi trên. Cần tag + triển khai (V1) trước khi kiểm tra
  với dữ liệu thật.
- Hiện trạng từng nhóm dữ liệu: README mục **2.2**. Cách nhập: README mục **2.4**. Kiểm tra trước khi mở cổng: `docs/GO-LIVE.md`.

**Kết luận:** phần chức năng của mục A đã đủ theo thiết kế (bảng đối chiếu ngay dưới); 2 việc giao diện G1, G2 đã làm xong;
lần rà cuối (10/10/2026) sửa thêm 3 ô KPI trên điện thoại và nhật ký vận hành hồ (PR #51). Còn lại hai nhóm việc:

- **Không cần dữ liệu thật** — làm được ngay: V1 triển khai, V2 thử tải lại với đủ API hiện nay, V3 cho người dùng thật dùng
  thử (mục 12).
- **Chờ dữ liệu hoặc hệ thống bên ngoài**: D1 → D6, điểm 7 → 11. Không điền số mẫu / ngưỡng tự đặt để "lấp chỗ trống".

## Đối chiếu với thiết kế mục A (rà ngày 10/10/2026)

| Yêu cầu của thiết kế | Hiện trạng |
|---|---|
| A.1 Lưới 3 khối: chỉ số nhanh (trên), biểu đồ (giữa), nhật ký (bên); màn hình lớn, thu gọn cho máy tính bảng | Đạt — bố cục laptop / iPad / điện thoại, nhật ký cột phải; chế độ trình chiếu cho màn hình lớn |
| A.1 Nền tối mặc định | Đạt theo mục F.3: theo cài đặt Sáng / Tối của hệ điều hành và nhớ lựa chọn; trình chiếu luôn nền tối. Máy phòng điều hành cần đặt nền tối một lần (V1) |
| A.2 Mưa trung bình lưu vực (mm/24h) và mưa cực đại cục bộ | Đạt — bình quân theo diện tích (đa giác Thiessen); dòng "Lớn nhất" thấy cả trên điện thoại. Cần trạm đo mưa (D1) |
| A.2 Mực nước sông so với BĐ I, II, III | Đạt — kèm xu hướng, giờ dự báo vượt BĐ. Cần ngưỡng BĐ thật (D1) |
| A.2 Hộ / nhân khẩu đã sơ tán trên kế hoạch | Đạt. Cần kế hoạch sơ tán (D1) |
| A.2 SOS chờ xử lý, nhấp nháy đỏ khi quá 15 phút chưa có lực lượng | Đạt |
| A.2 Quân số ứng trực / làm nhiệm vụ; xuồng, xe lội nước đang hoạt động | Đạt. Cần danh sách lực lượng, phương tiện (D1) |
| A.3 Biểu đồ thủy văn: thực đo + dự báo, vạch BĐ I–III, tô phần vượt; vận hành hồ chứa | Đạt — dự báo lấy bản tin KTTV nhập tay (D5), chưa nối mô hình HEC-HMS (điểm 9); số liệu hồ nhập tay (D4) |
| A.3 Mưa: cột theo giờ + đường tích luỹ, 1–3 giờ tới nét đứt (QPF) | Đạt — 1–3 giờ tới là dự báo mô hình số, chưa phải radar (điểm 8); chưa đánh giá ngập úng đô thị (điểm 7) |
| A.3 Sạt lở: scatter / heatmap chuỗi thời gian, phân loại Đỏ / Cam / Vàng | Đạt — có cả hai; ngưỡng mưa còn minh hoạ (điểm 11); danh mục điểm đen viết cứng (D2) |
| A.3 Vật tư: cột chồng theo kho, phần trống là thiếu so với định mức | Đạt. Cần tồn kho, định mức dự trữ (D1) |
| A.4 Nhật ký cột phải, cập nhật tức thì: vận hành hồ (có lưu lượng xả), cứu hộ | Đạt |
| A.4 Báo cáo thiệt hại của người dân qua Zalo OA / ứng dụng | Cổng tiếp nhận đã có, đang tắt — chờ bên gửi (điểm 10) |
| A.5 PostgreSQL + PostGIS, API JSON nội bộ, số liệu IoT | Đạt — ảnh radar chưa có nguồn (điểm 8) |
| A.5 Vận hành mượt, độ trễ thấp | Đã tối ưu và đo ngày 27/09/2026; cần đo lại với đủ API trang A hiện nay (V2) |
| A.5 Xuất PDF snapshot định dạng chuẩn gửi UBND tỉnh / Ban Chỉ đạo | Đạt — PDF ảnh chụp + báo cáo văn bản thể thức Nghị định 30/2020 |
| A.5 Cấu trúc CSDL PostgreSQL / PostGIS liên kết quan trắc với điều hành | Đạt — các schema nghiệp vụ, `backend/alembic/sql/` |
| Yêu cầu giao diện chung (màu rủi ro, khẩn trên cùng, bảng, form nhiều bước, trạng thái, 360 px, phân quyền) | Đạt |
| Thao tác chính dễ bấm trên điện thoại / iPad (nút to) | Đạt — mọi vùng chạm của 5 tab ≥ 44 px trên màn cảm ứng, máy dùng chuột giữ cỡ gọn (PR #63). Giới hạn: điện thoại đang hiện thanh trình duyệt (VD iPhone Safari, vùng xem 390×664) thì hàng ô KPI cuối nằm dưới thanh đáy — kéo nhẹ là thấy; đã có từ trước PR #63 |

---

## 1. Bảng tổng hợp

| # | Việc | Phụ thuộc | Cần ai cung cấp | Ưu tiên |
|---|---|---|---|---|
| V1 | **Triển khai** bản mới lên máy chủ (tag); đặt nền tối cho màn hình phòng điều hành | Không cần dữ liệu | Chủ dự án quyết định tag | **Cao nhất** — máy chủ còn v1.0.3 |
| V2 | **Thử tải lại** (k6) với đủ API trang A đang gọi | Không cần dữ liệu (chạy lại khi có D1) | — | Cao — trước khi mở cổng |
| V3 | **Dùng thử với lãnh đạo, trực ban** (máy tính, iPad, điện thoại, màn hình lớn) | Người dùng thật; tốt nhất sau D1 | BCH tỉnh (bố trí buổi dùng thử) | Cao |
| D1 | Nhập dữ liệu nền cho các khối của trang A (trạm, ngưỡng BĐ, hồ chứa, kế hoạch sơ tán, lực lượng, kho…) | Dữ liệu | Đài KTTV, Sở Công Thương, các xã, BCH | **Cao nhất** — chưa có thì trang A chỉ hiện "chưa có" |
| D2 | Danh mục chính thức **điểm đen sạt lở & đường đèo** (hiện viết cứng 12 điểm trong mã) | Dữ liệu + lập trình | Sở Xây dựng / đơn vị quản lý đường bộ, Sở NN&MT | Cao |
| D3 | **Mạng đường** (xác định đoạn bị chia cắt ở tab Sạt lở, chỉ đường an toàn) | Dữ liệu + lập trình | Sở Xây dựng / OSM đã hiệu chỉnh | Trung bình |
| D4 | **Số liệu vận hành hồ chứa tự động** (mực nước, cửa xả, Q đến / Q xả) — hiện trực ban nhập tay | Thoả thuận + lập trình | Chủ đập, Sở Công Thương | Trung bình – cao (mùa lũ) |
| D5 | **Bản tin dự báo của Đài KTTV dạng số** (mực nước, mưa) — hiện trực ban nhập tay | Thoả thuận + lập trình | Đài KTTV Cao Bằng / Cục KTTV | Trung bình |
| D6 | **Cấp độ rủi ro thiên tai chính thức** — hiện màu mưa / dải tình huống là màu theo dõi tự tính | Dữ liệu | Đài KTTV (bản tin), BCH tỉnh | Thấp – trung bình |
| 7 | **Đánh giá nhanh nguy cơ ngập úng đô thị** trên biểu đồ mưa | Dữ liệu + lập trình | Sở Xây dựng / đơn vị thoát nước TP Cao Bằng | Trung bình |
| 8 | **Dự báo mưa 1–3 giờ từ radar (QPF)** | Tích hợp | Đài KTTV (sản phẩm radar) | Trung bình |
| 9 | **Dự báo mực nước từ mô hình thủy văn (HEC-HMS…)** | Tích hợp | Đài KTTV / đơn vị chạy mô hình | Trung bình |
| 10 | **Báo cáo thiệt hại của người dân qua Zalo OA / ứng dụng** vào nhật ký | Tích hợp | Tài khoản Zalo OA của tỉnh, bên phát triển ứng dụng | Thấp – trung bình |
| 11 | **Ngưỡng sạt lở hiệu chỉnh** (ngưỡng mưa I–D, ngưỡng cảm biến nghiêng / độ ẩm đất) | Dữ liệu | Viện / đơn vị nghiên cứu sạt lở, Sở NN&MT | Trung bình |
| G1 | Thẻ **Hồ chứa** trong bảng tác chiến (tìm, lọc, phân trang, xuất Excel / PDF) | Chỉ giao diện | — | **Đã làm** (PR #50) |
| G2 | **"Xem thêm" / phân trang** cho danh sách thẻ ở tab Hồ chứa và tab Sạt lở | Chỉ giao diện | — | **Đã làm** (PR #50) |

---

## 2. D1 — Dữ liệu nền cho các khối của trang A

Khi chạy thật (`DEMO_MODE=false`) các bảng dưới đây **đang trống**; trang A đã xử lý đúng trường hợp này (ghi "chưa có", khung
xám, không tô xanh như "an toàn"), nhưng chưa dùng để điều hành được.

| Khối trên trang A | Dữ liệu cần | Loại nhập (README 2.4) | Nguồn |
|---|---|---|---|
| Ô Mưa, biểu đồ mưa, mưa TB lưu vực (đa giác Thiessen) | Trạm đo mưa + số đo tự động | `tram_quan_trac` + kết nối thiết bị (HTTP / MQTT / LoRaWAN, README 6.4–6.5) | Đài KTTV Cao Bằng, VRain |
| Ô Mực nước, biểu đồ thủy văn, dự báo vượt BĐ | Trạm mực nước + **ngưỡng BĐ I / II / III** + số đo | `tram_quan_trac` | Đài KTTV Cao Bằng |
| Tab Hồ chứa, biểu đồ vận hành hồ | Danh mục hồ (MNDBT, số cửa xả, sông) + số liệu vận hành | `ho_chua`; số liệu vận hành: trực ban nhập ở tab Hồ chứa (nút "Cập nhật vận hành") tới khi có nguồn tự động (D4) | Chủ đập, Sở Công Thương |
| Heatmap cảm biến sạt lở | Trạm độ nghiêng / độ ẩm đất + ngưỡng | `tram_quan_trac` (loại `do_nghieng`, `do_am_dat`) | Đơn vị lắp đặt cảm biến |
| Ô Sơ tán | Kế hoạch và tiến độ sơ tán (hộ, nhân khẩu) theo xã | Xã cập nhật ở Điều hành cứu hộ → Giám sát sơ tán | Phương án ứng phó của từng xã |
| Ô Lực lượng, phương tiện | Lực lượng, xuồng, xe lội nước, máy xúc | `luc_luong`, `phuong_tien` | BCH Quân sự, Công an, đội xung kích |
| Biểu đồ vật tư (cột chồng, thiếu hụt) | Kho, tồn kho, **định mức dự trữ** | `kho`, `ton_kho` | Văn phòng BCH |
| Bản đồ điểm nóng | Vùng nguy hiểm, điểm nguy hiểm, điểm sơ tán | `vung_nguy_hiem`, `diem_nguy_hiem`, `diem_so_tan` | Bản đồ phân vùng rủi ro; phương án của xã |
| Bộ lọc xã / lưu vực | Ranh giới xã chính thức (hiện là dữ liệu công khai) | `ranh_gioi_xa` | Sở NN&MT (shapefile) |

Lưu ý:
- Lịch sử vận hành hồ chứa (biểu đồ dưới hydrograph, "Diễn biến vận hành 48 giờ") chỉ có **từ lúc triển khai bản có migration
  0020** trở đi — không có số liệu quá khứ.
- Nhập xong cần người thứ hai đối chiếu với văn bản gốc (README 2.4).

## 3. D2 — Danh mục điểm đen sạt lở & đường đèo

- **Hiện trạng:** 12 điểm (Đèo Khau Cốc Chà, Đèo Mẻ Pia, …) viết cứng trong `backend/app/services/landslides.py`
  (`KNOWN_BLACKSPOTS`), kèm cảm biến / trạm mưa gắn với từng điểm (`tilt_sensor_id`, `rain_station_id`, `soil_moisture_id`).
  Danh sách này được dùng **cả khi chạy thật**; trạng thái từng điểm tính từ số liệu thật (vùng nguy hiểm, đường bị chia cắt,
  cảm biến), điểm chưa có bằng chứng giám sát hiện xám "chưa có dữ liệu".
- **Cần:** danh mục chính thức — mã, tên, tuyến đường, xã, toạ độ, loại (đèo dốc / taluy / ngầm tràn…), mô tả, mã cảm biến và
  trạm mưa gắn kèm (nếu có), tuyến tránh.
- **Việc lập trình khi có:** thêm loại dữ liệu nhập (ví dụ `diem_den_sat_lo`) + bảng lưu, thay hằng `KNOWN_BLACKSPOTS` bằng dữ
  liệu đã nhập; giữ nguyên cách tính trạng thái. Kiểm thử `tests/e2e/landslide-test.mjs` hiện dựa vào danh sách mẫu — cần sửa
  theo.

## 4. D3 — Mạng đường

- **Hiện trạng:** khi chạy thật bảng `operations.road_nodes` / `road_segments` trống; **chưa có loại dữ liệu nhập** (README
  2.2). Tab Sạt lở vì vậy ghi rõ "chưa xác định được đoạn bị chia cắt" (không phải "không có ách tắc").
- **Cần:** mạng đường đã hiệu chỉnh (Sở Xây dựng / OSM).
- **Việc lập trình khi có:** loại dữ liệu nhập mạng đường; sau đó trạng thái "đường bị chia cắt" ở tab Sạt lở và chỉ đường an
  toàn tự chạy.

## 5. D4, D5, D6 — Nguồn tự động và cấp độ chính thức (bổ sung khi rà lại 10/10/2026)

Hệ thống hiện chỉ có bộ nối dự báo thời tiết (Open-Meteo, OpenWeather — `backend/app/integrations/adapters/`) và cổng nhận số
đo trạm IoT. Ba nguồn dưới đây README mục 6.7 ghi "⛔ cần thoả thuận"; tới khi có, trực ban **nhập tay** nên số liệu chỉ mới
như lần nhập gần nhất.

### D4 — Số liệu vận hành hồ chứa tự động

- **Hiện trạng:** trực ban nhập ở tab Hồ chứa (nút "Cập nhật vận hành": mực nước, số cửa xả mở, Q đến, Q xả, giờ báo, nguồn).
  Từ đó có lịch sử vận hành (trigger migration 0020), biểu đồ vận hành dưới biểu đồ thủy văn và dòng nhật ký "Cập nhật vận hành
  …, lưu lượng xả … m³/s".
- **Cần:** cách lấy số liệu từ chủ đập hoặc hệ thống giám sát vận hành hồ của Sở Công Thương (API / FTP / tệp), tần suất cập
  nhật khi đang xả lũ, mã hồ khớp danh mục đã nhập (`ho_chua`).
- **Việc lập trình khi có:** bộ nối ghi vào bảng hồ chứa như form trực ban (lịch sử tự có nhờ trigger); ghi nhật ký vận hành
  **kèm lưu lượng xả** khi số cửa xả đổi (như bộ mô phỏng); giữ nút nhập tay làm dự phòng.

### D5 — Bản tin dự báo của Đài KTTV dạng số

- **Hiện trạng:** đường dự báo trên biểu đồ thủy văn và giờ "dự báo vượt BĐ" ở ô Mực nước lấy từ bản tin KTTV do trực ban nhập
  (nút "Nhập bản tin dự báo KTTV", README 7.4). Dự báo mưa 3 giờ tới / 72 giờ là dự báo mô hình số Open-Meteo, không phải bản
  tin KTTV.
- **Cần:** bản tin dự báo mực nước (theo trạm) và mưa (theo khu vực) dạng số — API hoặc tệp, kèm số / giờ phát hành.
- **Việc lập trình khi có:** bộ nối đọc bản tin → ghi như nút nhập tay (mã `KTTV`), giữ nhãn nguồn trên biểu đồ. Khác với điểm 9
  (kết quả chạy mô hình): bản tin KTTV là dự báo chính thức, ưu tiên cao nhất.

### D6 — Cấp độ rủi ro thiên tai chính thức

- **Hiện trạng:** màu ô Mưa và chip mưa ở dải tình huống dùng ngưỡng theo dõi tự tính: mưa 24 giờ ≥ 50 mm Vàng, ≥ 100 mm Cam,
  ≥ 200 mm Đỏ (`rainLevel` trong `frontend/src/utils/risk.js`, theo thuật ngữ mưa to / mưa rất to của KTTV). Giao diện ghi rõ
  đây **không phải** cấp độ rủi ro thiên tai chính thức.
- **Cần:** cấp độ rủi ro thiên tai do cơ quan KTTV công bố trong bản tin (Quyết định 18/2021/QĐ-TTg) theo loại thiên tai và khu
  vực; nếu tỉnh có ngưỡng mưa riêng cho vùng núi thì kèm văn bản.
- **Việc lập trình khi có:** nhập (hoặc bộ nối D5 đọc) cấp độ rủi ro trong bản tin → chip riêng ở đầu dải tình huống, ghi số
  bản tin và giờ phát hành; giữ màu theo dõi tự tính như hiện nay để thấy diễn biến giữa hai bản tin.

## 6. Điểm 7 — Đánh giá nhanh nguy cơ ngập úng đô thị

Thiết kế A.3: phần 1–3 giờ tới của biểu đồ mưa dùng dự báo mưa cực ngắn "để đánh giá nhanh nguy cơ ngập úng đô thị cục bộ".

- **Hiện trạng:** biểu đồ mưa đã có phần 3 giờ tới (nét đứt) nhưng **chưa có ngưỡng ngập úng** nên chưa đánh giá.
- **Cần (đề nghị dạng bảng CSV / Excel):** mã xã/phường (hoặc tên tuyến phố, điểm ngập), ngưỡng mưa gây ngập theo **1 giờ**
  và theo **3 giờ** (mm), văn bản / nguồn của ngưỡng; nếu có: danh sách điểm hay ngập kèm toạ độ.
- **Việc lập trình khi có:** chỗ lưu ngưỡng theo xã/phường (loại dữ liệu nhập hoặc thuộc tính của xã); trên biểu đồ mưa vẽ
  vạch ngưỡng của vùng đang xem; khi mưa giờ vừa qua hoặc dự báo 3 giờ tới vượt ngưỡng → nhãn cảnh báo trên biểu đồ và một chip
  ở dải tình huống ("Nguy cơ ngập úng … theo dự báo …", ghi rõ nguồn dự báo).
- **Kiểm tra:** nhập ngưỡng cho 1 phường, chọn phường đó ở bộ lọc → thấy vạch ngưỡng; dự báo vượt ngưỡng → có cảnh báo.

## 7. Điểm 8 — Dự báo mưa 1–3 giờ từ radar (QPF)

- **Hiện trạng:** phần 3 giờ tới lấy từ **dự báo mô hình số Open-Meteo** cho từng trạm mưa
  (`backend/app/integrations/adapters/open_meteo.py`, lưu ở bảng `forecasts` với mã `QPF-NOWCAST`), giao diện ghi rõ "Dự báo
  mô hình 3 giờ tới", **không phải** nowcast radar. Lớp radar RainViewer trên Bản đồ chỉ là ảnh để xem, không dùng để tính.
- **Cần:** quyền truy cập sản phẩm radar / QPE–QPF của Đài KTTV (nguồn trong nước cần thoả thuận — README 6.7): định dạng (GeoTIFF / NetCDF / ảnh phản hồi vô tuyến + công
  thức Z–R), bước thời gian (5–10 phút), cách lấy (API / FTP), điều khoản sử dụng.
- **Việc lập trình khi có:**
  - Thêm nguồn tích hợp mới (cùng khung `backend/app/integrations`), quy ra mm/giờ cho từng trạm mưa / xã.
  - Lưu bằng **mã mô hình riêng** (ví dụ `QPF-RADAR`) — **không dùng lại** `QPF-NOWCAST` (đang là dự báo mô hình), để giao
    diện ghi đúng nguồn.
  - `GET /api/v1/dashboard/rainfall` và biểu đồ mưa ưu tiên radar khi có, ghi "Nowcast radar"; không có thì giữ dự báo mô
    hình như hiện nay.

## 8. Điểm 9 — Dự báo mực nước từ mô hình thủy văn (HEC-HMS…)

- **Hiện trạng:** đường dự báo trên biểu đồ thủy văn là **bản tin KTTV do trực ban nhập** (nút "Nhập bản tin dự báo KTTV",
  `PUT /api/v1/stations/{mã}/forecast`, mã `KTTV`, README 7.4); chưa có bản tin thì dùng đường do **bộ mô phỏng** sinh, giao diện ghi rõ
  "dự báo mô phỏng". Hệ thống không tự chạy mô hình thủy văn.
- **Cần:** kết quả chạy mô hình theo từng trạm mực nước — tốt nhất là **mực nước dự báo** theo giờ; nếu chỉ có lưu lượng Q thì
  cần thêm **quan hệ Q–H** (đường cong lưu lượng) của từng trạm. Tần suất chạy, cách nhận (tệp CSV / API).
- **Việc lập trình khi có:**
  - **Đổi mã của bộ mô phỏng trước**: hiện bộ mô phỏng ghi dự báo mực nước với mã `HEC-HMS` và mọi nơi coi mã này là "mô
    phỏng" — `backend/app/seed.py`, `backend/app/services/simulator.py`, `backend/app/api/v1/dashboard.py` (giờ dự báo vượt
    BĐ), `backend/app/api/v1/map_layers.py` (`FORECAST_PRIORITY`), `frontend/src/components/charts/Hydrograph.jsx`,
    `frontend/src/utils/stations.js`. Đổi sang mã riêng (ví dụ `MO_PHONG`) để kết quả mô hình thật **không bị gắn nhãn mô
    phỏng**.
  - Thêm nguồn "Kết quả mô hình thủy văn" (nhập tệp hoặc API) với nhãn riêng; thứ tự ưu tiên: bản tin KTTV → kết quả mô hình →
    mô phỏng (chỉ ở bản trình diễn).

## 9. Điểm 10 — Báo cáo của người dân qua Zalo OA / ứng dụng

- **Hiện trạng:** cổng tiếp nhận tự động `POST /api/v1/sos/intake` đã có nhưng **đang tắt** cho tới khi đặt `INTAKE_API_KEY`
  và có bên gửi (README 2.1, 6.6). Phản ánh của người dân từ cổng công khai đã vào nhật ký (nhóm "Người dân").
- **Cần:** tài khoản Zalo OA (và mẫu ZNS nếu gửi tin), bên phát triển ứng dụng / dịch vụ trung gian gọi cổng tiếp nhận.
- **Việc lập trình khi có:** cấu hình khoá, kiểm thử luồng tin → phiếu SOS / phản ánh → hiện ở nhật ký và bảng tác chiến.

## 10. Điểm 11 — Ngưỡng sạt lở hiệu chỉnh

- **Hiện trạng:**
  - Biểu đồ "Ngưỡng kích hoạt sạt lở" (mưa tích luỹ 72 giờ – cường độ mưa) dùng đường ngưỡng **minh hoạ**
    `I = a · (R/100)^-0,6`, hệ số `a` trong `THRESHOLD_A` (`backend/app/api/v1/dashboard.py`); giao diện đã ghi chú là minh hoạ.
  - Ngưỡng của cảm biến nghiêng / độ ẩm đất là thuộc tính `alarm_thresholds` của từng trạm (nhập qua `tram_quan_trac`).
- **Cần:** ngưỡng I–D hiệu chỉnh cho Cao Bằng (hệ số theo cấp Vàng / Cam / Đỏ) từ nghiên cứu sạt lở của tỉnh; ngưỡng BĐ I/II/III
  cho từng cảm biến.
- **Việc lập trình khi có:** đưa hệ số ngưỡng I–D ra cấu hình / dữ liệu (không sửa mã mỗi lần đổi), bỏ chữ "minh hoạ"; cập nhật
  ngưỡng cảm biến bằng nhập lại `tram_quan_trac`.

## 11. Việc giao diện G1, G2 (đã làm — PR #50)

- **G1 — Thẻ "Hồ chứa & xả lũ" trong bảng tác chiến** (tab Tổng hợp). Bảng nay có 5 thẻ: Mực nước / Hồ chứa / Sạt lở / SOS /
  Kho.
  - Mỗi hồ một dòng: xã/phường, mực nước / MNDBT, số cửa xả đang mở / tổng số, Q đến / Q xả, giờ số liệu, trạng thái.
  - Màu trạng thái theo thang chung: xả lũ lớn Đỏ, đang xả điều tiết Cam, chưa xả Xanh, chưa có số liệu Xám. Số liệu quá cũ
    ghi "(số liệu cũ)".
  - Tìm, lọc theo mức màu, sắp xếp từng cột (mặc định hồ nặng nhất lên đầu), phân trang; điện thoại hiện mỗi hồ một thẻ.
  - Xuất Excel (thêm MNDBT, chênh so MNDBT, Q đến / Q xả, khuyến cáo hạ du) và PDF.
  - Dữ liệu lấy từ số liệu ô KPI của **vùng đang xem** (cùng nguồn `GET /api/v1/dashboard/reservoirs`), không gọi thêm API.
  - Chọn dòng → "Xuất Excel mục đã chọn". **Không có** nút "Soạn cảnh báo" (giống thẻ Mực nước): xã đặt đập không phải vùng
    hạ du; khuyến cáo hạ du xem ở tab Hồ chứa.
- **G2 — "Xem thêm"** cho danh sách thẻ ở tab Hồ chứa và tab Sạt lở (dùng chung cổng công khai).
  - Hiện 9 thẻ đầu, kèm dòng "Đang hiện 9/N", nút "Xem thêm 9 …" và (khi còn nhiều) "Xem tất cả N". Nút cao 44 px trên điện
    thoại.
  - Thẻ xếp **nặng nhất lên đầu** để mục khẩn không bị ẩn sau "Xem thêm":
    - hồ: xả lũ lớn → đang xả → chưa có số liệu → chưa xả;
    - điểm sạt lở: cấm đường → cảnh báo → chưa có dữ liệu → thông suốt.
  - Đổi bộ lọc / tìm kiếm → về lại 9 thẻ đầu.
  - "Xuất PDF" của Tổng quan ở hai tab này vẫn chụp **đủ mọi thẻ** (tạm mở hết khi chụp, chụp xong trả lại như người dùng đang
    xem).
- **Khi có dữ liệu thật:** xem lại bước 9 thẻ có hợp không (hằng `PAGE` trong `ReservoirMonitor.jsx`, `LandslideMonitor.jsx`).

## 12. Việc chưa làm, không cần dữ liệu thật (V1 – V3)

### V1 — Triển khai, đặt nền tối cho phòng điều hành

- **Hiện trạng:** máy chủ thử chạy v1.0.3 (04/10/2026); `main` đã có PR #36 → #52, gồm migration `0020` (lịch sử vận hành
  hồ). Người dùng trên máy chủ chưa thấy các thay đổi của trang A.
- **Việc làm:**
  - tag phiên bản mới, cập nhật máy chủ theo README mục 10.4 / 10.8 (sao lưu CSDL trước khi cập nhật);
  - kiểm tra theo `docs/GO-LIVE.md`, chạy `UI_READONLY=1 node tests/ui/ui-test.mjs <địa chỉ>`;
  - màn hình lớn phòng điều hành mở `/dashboard?trinh-chieu=1` (luôn nền tối, chữ to, tự xoay chuyên đề); máy tính trực ban
    mở `/dashboard?theme=dark` một lần (trình duyệt nhớ). Lý do: giao diện theo cài đặt Sáng / Tối của hệ điều hành (mục F.3),
    Windows mặc định để Sáng, trong khi thiết kế A.1 / F.2 muốn nền tối cho phòng điều hành.

### V2 — Thử tải lại với đủ API trang A đang gọi

- **Hiện trạng:** `tests/load/load.js` (README mục 12.2), lần đo gần nhất 27/09/2026 — trước PR #36 → #51. Kịch bản "Cán bộ"
  tải lại 9 API mỗi 5 giây: `/dashboard/kpis`, `/stations`, `/dashboard/rainfall`, `/dashboard/landslide-risk`,
  `/dashboard/supplies`, `/dashboard/logs`, `/sos`, `/map/layers`, `/resources/summary`.
- **Lệch so với trang A hiện nay:**
  - thiếu `/dashboard/reservoirs`, `/dashboard/landslides`, `/dashboard/landslide-sensors` (tab Hồ chứa / Sạt lở),
    `/dashboard/reservoir-operations` (biểu đồ vận hành hồ), `/evacuation`, `/admin-units/area`, `/forecast/areas`,
    `/resources/forces`;
  - `/resources/summary` nay thuộc trang Vật tư & Lực lượng, Tổng quan không gọi;
  - `/dashboard/rainfall` nay tính mưa bình quân lưu vực theo đa giác Thiessen, nặng hơn lúc đo.
- **Việc làm:**
  - sửa danh sách API của kịch bản Cán bộ theo trang A hiện nay (`pages/Dashboard.jsx`, `components/dashboard`,
    `components/charts`, hai tab Hồ chứa / Sạt lở), theo đúng tần suất tải lại của từng khối (VD biểu đồ vận hành hồ 60 giây);
  - chạy trên stack thử, rồi trên máy chủ thật (máy riêng chạy k6, trỏ vào máy chủ);
  - đạt ngưỡng của README 12.2 (cán bộ p95 < 1,5 giây, lỗi < 1%), ghi kết quả vào README 12.2;
  - chạy lại sau khi nhập D1: dữ liệu thật nhiều trạm, hồ, phiếu hơn dữ liệu mẫu.

### V3 — Dùng thử với lãnh đạo và trực ban

- **Hiện trạng:** đã kiểm thử tự động (ui-test 83 bước trên máy tính, máy tính bảng, điện thoại; e2e; job Production của CI)
  và rà theo thiết kế; **chưa** có buổi dùng thử với người dùng thật.
- **Việc làm:** một buổi với lãnh đạo BCH và trực ban, mỗi người dùng đúng thiết bị của mình, tốt nhất khi đã có D1:
  - lãnh đạo: nắm tình hình trong khoảng 5 giây từ màn hình đầu (dải tình huống + 6 ô KPI);
  - trực ban: cập nhật vận hành hồ, nhập bản tin dự báo, xuất báo cáo văn bản;
  - cán bộ hiện trường trên điện thoại: đọc ô KPI, nút Báo SOS;
  - màn hình lớn: chế độ trình chiếu.
- Ghi góp ý thành danh sách sửa (câu chữ, thứ tự khối, ngưỡng màu) rồi bổ sung vào tài liệu này.

## 13. Khi có dữ liệu: trình tự đề nghị

1. **Triển khai** bản mới nhất (V1), để có migration `0020` (lịch sử vận hành hồ) và các cải tiến từ PR #36 → #52.
2. **Nhập dữ liệu nền** (mục 2) theo README 2.4; người thứ hai đối chiếu.
3. **Kiểm tra trang A** bằng mắt với dữ liệu thật:
   - 6 ô KPI có số (không còn "chưa có"); ô Mực nước có mức BĐ, mũi tên xu hướng;
   - trên điện thoại vẫn đọc được: mưa lớn nhất, số hộ và số người đã sơ tán, xuồng – xe lội nước đang làm nhiệm vụ;
   - nhập thử một lần "Cập nhật vận hành" có lưu lượng xả → nhật ký ghi "… lưu lượng xả … m³/s";
   - biểu đồ thủy văn có vạch BĐ I–III, tô phần vượt; dưới có vận hành hồ của sông đó (sau khi đã có số liệu vận hành);
   - tab Hồ chứa / Sạt lở đúng vùng đang lọc, mục khẩn ở đầu danh sách; heatmap cảm biến có ô màu;
   - bảng tác chiến, thẻ Hồ chứa: đủ hồ của vùng, file Excel khớp số liệu tab Hồ chứa;
   - báo cáo văn bản (nút "Văn bản") xuất đủ các mục.
4. **Chạy kiểm thử trên máy chủ** (chỉ đọc, không ghi dữ liệu): `UI_READONLY=1 node tests/ui/ui-test.mjs <địa chỉ>`; làm theo
   `docs/GO-LIVE.md`; **chạy lại thử tải** với dữ liệu thật (V2).
5. Làm tiếp các mục D4 → D6, 7 → 11 khi có dữ liệu / thoả thuận tương ứng.
6. **Dùng thử** với lãnh đạo và trực ban (V3) để chỉnh câu chữ, bố cục theo thói quen thực tế.

## 14. Tham chiếu mã nguồn (cho người phát triển)

| Phần | Tệp |
|---|---|
| Trang Tổng quan, các tab | `frontend/src/pages/Dashboard.jsx` |
| 6 ô KPI | `frontend/src/components/dashboard/KpiStrip.jsx`, `StatCard.jsx` (chân ô nhiều dòng: `footerRows`), `RiverKpi.jsx` |
| Ngưỡng màu mưa (theo dõi, không phải cấp độ chính thức) | `frontend/src/utils/risk.js` (`rainLevel`) |
| Cập nhật vận hành hồ + dòng nhật ký | `backend/app/api/v1/dashboard.py` (`update_reservoir_operation`) |
| Bộ nối nguồn ngoài (chưa có cho hồ chứa, bản tin KTTV) | `backend/app/integrations/` |
| Dải tình huống, Việc chờ quyết định | `frontend/src/components/dashboard/SituationBar.jsx`, `DecisionPanel.jsx` |
| Biểu đồ thủy văn, vận hành hồ | `frontend/src/components/charts/Hydrograph.jsx`, `ReservoirOpsChart.jsx` |
| Biểu đồ mưa, ngưỡng sạt lở, cảm biến sạt lở, vật tư | `RainfallChart.jsx`, `LandslideScatter.jsx`, `SensorHeatmap.jsx`, `SuppliesChart.jsx` (cùng thư mục `charts`) |
| Tab Hồ chứa / Sạt lở (dùng chung cổng công khai) | `frontend/src/pages/public/ReservoirMonitor.jsx`, `LandslideMonitor.jsx` |
| Nút "Xem thêm" của danh sách thẻ | `frontend/src/utils/useShowMore.js`, `ShowMore` trong `frontend/src/components/common/ui.jsx` |
| Bảng tác chiến (5 thẻ) | `frontend/src/components/dashboard/OperationsTable.jsx` |
| Xuất PDF ảnh chụp / báo cáo văn bản | `frontend/src/utils/exportPdf.js`, `reportPdf.js`, `components/dashboard/ReportDocModal.jsx` |
| API trang A | `backend/app/api/v1/dashboard.py` (`/dashboard/kpis`, `/stations`, `/dashboard/rainfall`, `/dashboard/reservoirs`, `/dashboard/landslides`, `/dashboard/landslide-sensors`, `/dashboard/reservoir-operations`, `/dashboard/landslide-risk`, `/dashboard/supplies`) |
| Mưa bình quân lưu vực (Thiessen) | `backend/app/area.py` (`thiessen_ctes`), `backend/app/db.py` (`fetch_all_no_jit`) |
| Hạn phản hồi SOS, quy tắc 15 phút | `backend/app/services/sos.py` (`OVERDUE_SQL`, `NO_TEAM_15M_SQL`) |
| Mô hình hồ của bộ mô phỏng (chỉ bản trình diễn) | `backend/app/services/scenario.py` (`reservoir_tick`) |
| Kiểm thử | `tests/ui/ui-test.mjs`, `tests/e2e/smoke.mjs`, `reservoir-test.mjs`, `landslide-test.mjs`, `iot-test.mjs`, `prod-flow.mjs`; thử tải `tests/load/load.js` (README 12.2, V2) |

## 15. Các thay đổi đã làm cho trang A (để tra cứu)

| PR | Nội dung |
|---|---|
| #36 | Tổng quan dùng dữ liệu thật; chỉ còn 56 xã/phường |
| #37 | Thang màu rủi ro dùng chung; trạng thái tải / lỗi / mất mạng; bố cục 360 px |
| #38 | Áp thang màu cho cổng công khai, bản đồ, theo dõi phiếu |
| #39 | Thanh trên cùng không tràn ở máy tính bảng / laptop nhỏ |
| #40 | Bố cục cho lãnh đạo trên laptop / iPad / điện thoại; 6 ô KPI gọn; Việc chờ quyết định |
| #41 | Chế độ trình chiếu; PDF điện thoại theo bố cục laptop; iPad ngang |
| #42 | Mũi tên xu hướng mực nước / mưa; giờ dự báo vượt mức báo động |
| #43 | Mưa trung bình lưu vực theo diện tích (đa giác Thiessen) |
| #44 | Heatmap 48 giờ cảm biến sạt lở + chuỗi thời gian |
| #45 | Báo cáo văn bản PDF định dạng chuẩn (Nghị định 30/2020) |
| #46 | Tab Hồ chứa / Sạt lở: trạng thái tải / lỗi, theo bộ lọc vùng; form cập nhật vận hành báo lỗi khi nhập |
| #47 | Biểu đồ thủy văn tô phần vượt báo động; lịch sử + biểu đồ vận hành hồ chứa |
| #48 | Ô SOS nhấp nháy khi có phiếu chờ quá 15 phút chưa có đội tiếp nhận |
| #49 | Tài liệu này |
| #50 | Thẻ Hồ chứa trong bảng tác chiến (G1); "Xem thêm", mục khẩn lên đầu ở tab Hồ chứa / Sạt lở (G2) |
| #51 | Ô KPI trên điện thoại thấy đủ mưa lớn nhất, số người sơ tán, "xuồng, xe lội nước"; nhật ký vận hành hồ ghi lưu lượng xả; tài liệu thêm D4 – D6 |
| #52 | Tài liệu: bảng đối chiếu từng yêu cầu mục A; việc không cần dữ liệu thật V1 – V3 (triển khai, thử tải, dùng thử) |
| #63 | Vùng chạm ≥ 44 px trên màn cảm ứng ở cả 5 tab (thanh công cụ, tab, bảng tác chiến — ô chọn, tiêu đề cột, phân trang, lọc —, nhật ký, Hồ chứa, Sạt lở, Cấp xã, Hệ thống): trước 78–86 chỗ nhỏ hơn 44 px, nay 0; điện thoại 360×740 vẫn thấy đủ 6 ô KPI. Tiện ích `.tap` / `.tap-sq` (`index.css`); ui-test khối "Tổng quan cảm ứng" |
