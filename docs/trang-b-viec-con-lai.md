# Trang B – Bản đồ giám sát: đối chiếu thiết kế và việc còn lại

Đối chiếu với mục **B. Thiết kế chi tiết cho Bản đồ Giám sát Tương tác** (tài liệu thiết kế Part 1) và các yêu cầu giao diện
chung (màu rủi ro thống nhất, thông tin khẩn trên cùng, thao tác chính dễ bấm, bảng / form có báo lỗi khi nhập, trạng thái
tải / trống / lỗi / mất mạng, 360 px, theo phân quyền).

- Cập nhật: 10/10/2026 — mã nguồn `main` gồm PR #53 → #62 (bố cục, màu hồ, lọc SOS, form, tài liệu này; mưa dự báo theo
  thanh thời gian — G1 ở PR #57; radar theo thanh thời gian — G2 ở PR #58; bố cục cho người quản lý — G3 ở PR #59 → #62).
- Máy chủ thử vẫn chạy **v1.0.3**, **chưa có** các thay đổi trên — xem V1 trong `docs/trang-a-viec-con-lai.md` (triển khai
  chung cho mọi trang).
- Dữ liệu nền dùng chung với trang A: `docs/trang-a-viec-con-lai.md` mục 2 (D1), 4 (D3), 7 (radar), README 2.2 / 2.4.

**Kết luận:** về chức năng, bản đồ đã có gần đủ những gì mục B mô tả; giao diện đã sửa theo các yêu cầu chung
(PR #53 → #55); mưa dự báo và radar đã đổi theo thanh thời gian (G1, G2 — PR #57, #58); bố cục cho người quản lý trên
laptop, iPad, điện thoại (G3 — PR #59 → #62): 6 chỉ số "Tình hình", tab Điểm nóng, chế độ xem Tình hình | Tác nghiệp,
vùng chạm ≥ 44 px trên màn cảm ứng. Việc làm được ngay mà không cần dữ liệu mới đã hết. Còn lại:

- **Cần quyết định trước khi vận hành chính thức — giấy phép radar:** điều khoản RainViewer (nguồn radar đang dùng) chỉ
  cho dùng cá nhân / giáo dục (BD6).
- **Chờ dữ liệu hoặc hệ thống bên ngoài**: BD1 → BD7 (mục 4). GPS lực lượng **không làm** theo quyết định ngày
  29/09/2026 (BD8).

## 1. Đối chiếu với thiết kế mục B (rà ngày 10/10/2026)

| Yêu cầu của thiết kế | Hiện trạng |
|---|---|
| B.1 Bản đồ toàn màn, bảng nổi | Đạt — máy tính: bảng nổi thu gọn được; điện thoại: bản đồ toàn màn (360 px thấy ~93%, trước ~3%), bảng trượt từ đáy |
| B.1 Bảng lớp dữ liệu (trái) | Đạt — 4 nhóm lớp, số đối tượng từng lớp, lớp trống ghi "chưa có … (nhập loại …)" |
| B.1 Thanh thời gian & radar (đáy): bão, mưa, ngập 12 giờ qua / 24 giờ tới | Đạt — thanh −12h…+24h đổi trạm (số đo quá khứ / bản tin dự báo), vùng ngập kịch bản, vị trí tâm bão, **mưa dự báo theo xã** (hiện tại: tổng 24 giờ tới; kéo tới +N giờ: mưa trong giờ đó; giờ đã qua: xem trạm mưa — G1), **radar** ảnh ~2 giờ qua (−2h → hiện tại, ghi giờ ảnh — G2) |
| B.1 Bảng cảnh báo khẩn cấp (phải): feed SOS + cảnh báo cảm biến | Đạt — cập nhật tức thì (WebSocket); lọc SOS Đỏ / Cam / Vàng, tìm kiếm; trạm vượt báo động, mất tín hiệu |
| B.1 Công cụ (phải trên): nền bản đồ, đo khoảng cách, khoanh vùng | Đạt — nền Địa lý / Vệ tinh / Địa hình / Ban đêm, đo, khoanh đa giác / tròn, đánh dấu sự cố |
| B.2 Trạm mưa, mực nước; bấm xem biểu đồ so với BĐ I–III | Đạt — màu theo báo động, mất tín hiệu xám nét đứt. Cần trạm + ngưỡng thật (BD1) |
| B.2 Hồ chứa: vị trí, lưu lượng xả | Đạt — màu theo trạng thái (Đỏ xả lũ lớn, Cam xả điều tiết, Xám chưa có số liệu), popup có lưu lượng; số liệu vận hành nhập tay (trang A D4) |
| B.2 Radar thời tiết, mây vệ tinh (ảnh mờ) | Đạt một phần — radar RainViewer: ảnh ~2 giờ qua theo thanh thời gian, ghi giờ ảnh, chú giải màu (G2). **Chưa có mây vệ tinh** (RainViewer đã bỏ từ 01/01/2026); radar KTTV chưa có nguồn; **điều khoản RainViewer chỉ cho dùng cá nhân / giáo dục** (BD6) |
| B.2 Quỹ đạo bão: tâm, đường đi dự kiến, vùng gió mạnh | Đạt — trực ban dán bản tin; nét liền đã qua, nét đứt dự báo, vòng gió mạnh |
| B.2 Vùng ngập (xanh trong suốt, càng đậm càng sâu; nội suy DEM + mực nước) | Đạt một phần — vùng ngập nhập tay / cảm biến, tô đậm theo độ sâu; vùng ngập kịch bản BĐ I–III theo mực nước trạm. **Chưa nội suy từ DEM** (BD4) |
| B.2 Điểm nóng sạt lở (tam giác, Đỏ = rất cao); sự cố giao thông / hạ tầng | Đạt — cán bộ đánh dấu sự cố ngay trên bản đồ, tự ẩn khi hết hạn |
| B.2 Lực lượng cứu hộ (GPS trực tiếp) | **Không làm** GPS (BD8) — hiện vị trí đơn vị đã nhập, ghi rõ trên bảng lớp |
| B.2 Kho vật tư: biểu đồ tròn % hàng còn | Đạt — kèm "Ra lệnh xuất kho" |
| B.2 Điểm sơ tán: sức chứa "Đang chứa a/b" | Đạt — kèm cập nhật số người (nút ±1 / ±10) |
| B.2 SOS: bàn tay nhấp nháy đỏ | Đạt — màu theo cấp, nhấp nháy khi mới; âm thanh khi có SOS cấp 1–2 (nếu bật loa) |
| B.3 Popup thông minh: chi tiết, biểu đồ mini, nút thao tác nhanh | Đạt — gọi chỉ huy / thủ kho, ra lệnh xuất kho, điều phối, cập nhật số người, xem camera |
| B.3 Camera CCTV xem trực tiếp trên bản đồ | **Mô phỏng** — giao diện có, hình là mô phỏng; chưa có nguồn camera, chưa có cách khai báo (BD2) |
| B.3 Khoanh vùng → đếm nhà dân → gửi SMS sơ tán đồng loạt | Đạt một phần — khoanh vùng → **ước tính** dân số / số hộ theo tỉ lệ diện tích xã (BD5) → soạn cảnh báo (qua phê duyệt). Gửi SMS / Cell Broadcast thật chờ hợp đồng nhà mạng (BD7) |
| B.3 Tìm đường an toàn né ngập / sạt lở | Đạt khi có mạng đường — chạy thật chưa nhập mạng đường nên chưa né được (BD3) |
| B.4 SOS nhấp nháy + âm thanh → xem lớp → kéo – thả đội vào SOS → hộp thoại xác nhận → điều động | Đạt — lệnh điều động 2 bước (Lực lượng → Vật tư & xác nhận, có tóm tắt) |
| B.4 Theo dõi đội di chuyển thời gian thực | Không có GPS (BD8): lộ trình chuyển "đã đến" khi trưởng nhóm báo qua link nhiệm vụ |
| B.5 Leaflet, nền OSM / tự lưu trữ, WebSocket, GeoJSON | Đạt |
| Yêu cầu giao diện chung (màu rủi ro, khẩn trên cùng, thao tác dễ bấm, form báo lỗi, trạng thái, 360 px, phân quyền) | Đạt — PR #53 → #55; vùng chạm ≥ 44 px trên màn cảm ứng — PR #61 |
| Lãnh đạo nắm tình hình trong vài giây (KPI, bản đồ, cảnh báo nổi bật) trên laptop, iPad, điện thoại | Đạt — 6 chỉ số "Tình hình" cùng số Tổng quan, tab Điểm nóng, chế độ xem Tình hình / Tác nghiệp (G3, PR #59 → #62) |

## 2. Bảng tổng hợp việc còn lại

| # | Việc | Phụ thuộc | Cần ai cung cấp | Ưu tiên |
|---|---|---|---|---|
| G1 | **Mưa dự báo theo thanh thời gian** (lượng mưa giờ tại thời điểm đang kéo) | Không cần dữ liệu (thêm tham số API) | — | **Đã làm** (PR #57) |
| G2 | **Radar các khung đã qua** theo thanh thời gian (−2 giờ → hiện tại) | Không cần dữ liệu | — | **Đã làm** (PR #58) |
| G3 | **Bố cục cho người quản lý** (laptop, iPad, điện thoại): chỉ số Tình hình, Điểm nóng, chế độ xem, vùng chạm 44 px | Không cần dữ liệu (không đổi API) | — | **Đã làm** (PR #59 → #62) |
| BD1 | Dữ liệu nền cho các lớp (trạm, hồ, lực lượng, kho, điểm sơ tán, vùng nguy hiểm) | Dữ liệu | như trang A D1 | **Cao nhất** |
| BD2 | **Camera CCTV thật**: danh sách camera + máy chủ chuyển luồng | Dữ liệu + hạ tầng + lập trình | Đơn vị quản lý camera (giao thông, thủy điện, công an) | Trung bình |
| BD3 | **Mạng đường** (tìm đường an toàn, đoạn bị chặn) | Dữ liệu + lập trình | như trang A D3 | Trung bình |
| BD4 | **Vùng ngập nội suy từ DEM** + mực nước | Dữ liệu + mô hình | Sở NN&MT (DEM), đơn vị thủy văn | Trung bình |
| BD5 | **Dân cư chi tiết** để khoanh vùng đếm đúng số hộ | Dữ liệu | Công an (dân cư), các xã, Sở NN&MT | Trung bình |
| BD6 | **Radar KTTV, mây vệ tinh**; **giấy phép radar đang dùng** (RainViewer chỉ cho dùng cá nhân / giáo dục) | Tích hợp hoặc thoả thuận | Đài KTTV (như trang A điểm 8); RainViewer | **Cao** (trước khi vận hành chính thức) |
| BD7 | **Gửi cảnh báo SMS / Cell Broadcast thật** cho vùng khoanh | Hợp đồng + tích hợp | Nhà mạng (README mục 6) | Cao (khi vận hành) |
| BD8 | GPS lực lượng / phương tiện trực tiếp | — | — | **Không làm** (quyết định 29/09/2026) |

## 3. Việc giao diện không cần dữ liệu mới

### G1 — Mưa dự báo theo thanh thời gian (đã làm — PR #57)

Trước đây lớp mưa dự báo luôn tô tổng 24 giờ tới, kéo thanh thời gian không đổi. Nay lớp "Mưa dự báo theo xã (ECMWF + GFS)"
đổi theo thanh:

| Thanh thời gian | Lớp mưa dự báo | Thang màu (một sắc xanh, không phải màu rủi ro) |
|---|---|---|
| Hiện tại | Tổng mưa 24 giờ tới (P50) | < 5, 5–20, 20–50, 50–100, ≥ 100 mm |
| Kéo tới +N giờ | Mưa trong **giờ chứa thời điểm đó** (P50) — VD lúc 16:20 kéo +6h (22:20) → "Mưa 22:00–23:00" | < 1, 1–5, 5–10, 10–20, ≥ 20 mm |
| Giờ đã qua | Ẩn lớp, ghi "Thời điểm đã qua: không có dự báo mưa — xem số đo các trạm mưa" (lớp trạm đã hiện số đo lúc đó) | — |

- Chú giải, ghi chú dưới tên lớp, thẻ thang màu ở góc bản đồ (điện thoại: chip góc dưới bên trái) ghi đúng khung giờ đang tô;
  di chuột vào xã xem P10 – P50 – P90 của khung đó.
- Kéo nhanh qua nhiều nấc chỉ tải 1 lần (chờ dừng tay 0,3 giây); trong lúc tải vẫn giữ lớp cũ cùng nhãn của nó, không nhấp
  nháy, không lệch nhãn với màu.
- Không vẽ được thì ghi rõ vì sao: "Đang tải mưa dự báo…", "Không tải được mưa dự báo", "Chưa có số liệu mưa dự báo cho thời
  điểm này" (VD nguồn dự báo chưa đồng bộ).
- **API:** `GET /api/v1/forecast/areas?hours=1&offset_h=N` — khung từ +N tới +N + `hours` giờ; mặc định `offset_h=0`,
  `hours=24` như cũ (Dashboard, biểu đồ 72 giờ không đổi). Trả thêm `window_from` / `window_to` (mốc giờ đầu / cuối có số
  liệu). `hours` 1–240, `offset_h` 0–240, sai → 422.
- **Lưu ý khi dùng:** mưa 1 giờ của dự báo tổ hợp kém chắc chắn hơn tổng 24 giờ — dùng để thấy mưa **dồn vào lúc nào, ở xã
  nào**, không thay bản tin của Đài KTTV. Thang 1 giờ là thang hiển thị, không phải cấp cảnh báo.

### G2 — Radar các khung đã qua theo thanh thời gian (đã làm — PR #58)

Trước đây lớp radar chỉ hiện ảnh mới nhất, không ghi ảnh lúc mấy giờ, tải lỗi thì im lặng; danh sách ảnh chỉ tải một lần nên
mở bản đồ lâu thì ảnh "thời gian thực" đứng yên. Nay:

| Thanh thời gian | Lớp radar |
|---|---|
| Hiện tại | Ảnh mới nhất (thường cách 3–13 phút) |
| −1h, −2h | Ảnh gần thời điểm đó nhất (ảnh cách nhau 10 phút; lệch tối đa nửa nấc thanh — 30 phút) |
| −3h trở về trước | Ẩn lớp, ghi "Không có ảnh radar cho thời điểm này (chỉ lưu khoảng 2 giờ qua)" |
| Giờ tới | Ẩn lớp, ghi "Radar chỉ có ảnh đã qua — giờ tới xem lớp Mưa dự báo theo xã" |

- Giờ ảnh ghi dưới tên lớp, trên thẻ góc trái bản đồ (điện thoại: chip góc dưới bên trái) và trong chú giải; ảnh mới nhất cũ
  hơn 30 phút thì ghi thêm "ảnh cũ, nguồn chậm cập nhật".
- Tự tải lại danh sách ảnh 5 phút một lần khi lớp đang bật; báo rõ "Đang tải ảnh radar…", "Không tải được ảnh radar
  (RainViewer)".
- Chú giải màu radar theo bảng "Universal Blue" của RainViewer: xanh — mưa nhỏ, vừa; vàng → cam — mưa to; đỏ — mưa rất to;
  hồng — dông rất mạnh. Ghi rõ là cường độ mưa lúc chụp, **không phải màu rủi ro** (bảng màu radar trùng sắc vàng / cam / đỏ
  của thang rủi ro).
- Sửa kèm (bố cục máy tính): ở màn ≥ 1440 px (bảng lớp mở sẵn) thẻ thang màu radar / mưa dự báo **đè lên cuối bảng lớp** — các
  lớp Lực lượng, Xuồng – xe… bị che, không bấm được. Nay bảng lớp và các thẻ chung một cột, bảng lớp tự co lại (cuộn) phía
  trên; thanh thời gian dịch sang phải ở màn hẹp để không che góc thẻ chú giải; chip trên điện thoại nâng lên khỏi thước tỉ lệ
  và dòng ghi nguồn.
- **Giới hạn của nguồn** (RainViewer gói miễn phí, từ 01/01/2026): chỉ ảnh ~2 giờ qua, 10 phút / ảnh, phóng tối đa mức 7,
  một bảng màu, 100 lượt tải / phút / IP — nhiều máy chung một IP ở trung tâm điều hành có thể chạm giới hạn; không còn ảnh dự
  báo, ảnh mây vệ tinh. Điều khoản dùng: BD6.

### G3 — Bố cục cho người quản lý: laptop, iPad, điện thoại (đã làm — PR #59 → #62)

Đề xuất duyệt ngày 10/10/2026: mặc định chế độ Tác nghiệp; điện thoại luôn hiện hàng chỉ số. Rà trước khi làm (tài khoản
cấp tỉnh): người quản lý chỉ thấy 1–3 tình huống đầu và "+9 / +11 tình huống"; muốn biết mực nước, hồ xả, sơ tán, lực
lượng phải sang Tổng quan; iPad ngang dùng bố cục cho chuột — 50 nút nhỏ hơn 44 px.

| Thiết bị | Bố cục |
|---|---|
| Laptop, iPad ngang (≥ 1024 px) | 6 chỉ số "Tình hình" (2×3) ở đầu bảng Cảnh báo khẩn cấp — thu gọn được, máy nhớ; tab Điểm nóng · Phiếu SOS · Cảm biến; chế độ xem trên nút "Lớp dữ liệu". Bản đồ không nhỏ đi |
| iPad dọc (768–1023 px) | 1 hàng 6 chỉ số dưới dải khẩn cấp; chế độ xem ở góc trên trái bản đồ; thanh ngón cái như cũ |
| Điện thoại (< 768 px) | 1 hàng chỉ số vuốt ngang, ô 44 px — thấy trọn 3 ô đầu: SOS, Mực nước, Hồ · Sạt lở; chế độ xem trong bảng Lớp |

- **6 chỉ số** cùng số, cùng màu dải KPI ở Tổng quan (công thức dùng chung `kpiFacts.js`), theo vùng đang lọc. Chạm một ô →
  bật lớp liên quan, mở đúng danh sách, đưa bản đồ tới vừa khung các điểm. Số hiện cho mọi tài khoản xem bản đồ; thao tác xem
  SOS / lực lượng / sơ tán cần quyền lớp đó (như ô KPI ở Tổng quan).
- **Điểm nóng:** gộp SOS cấp 1 (một dòng), trạm trên báo động, cảm biến vượt ngưỡng, hồ đang xả, sạt lở cấm đường / cảnh báo,
  trạm mưa 24 giờ lớn nhất từ 50 mm, sự cố mức Cam / Đỏ — xếp Đỏ → Vàng, 10 dòng + "Xem thêm"; chỉ sắp xếp lại số liệu đã
  tải, nói rõ khi số liệu chưa đủ hoặc không có điểm nóng.
- **Chế độ xem:** Tình hình (chỉ lớp rủi ro, mở sẵn Điểm nóng) hoặc Tác nghiệp (như trước — quay về thì trả lại đúng các lớp
  đang bật); mặc định Tác nghiệp, máy nhớ lựa chọn.
- **Màn cảm ứng:** mọi vùng chạm của trang Bản đồ ≥ 44 px — trước: iPad ngang 50 chỗ nhỏ hơn, iPad dọc 14, điện thoại 11;
  nay 0. Đầu trang nới vùng chạm vô hình (`.touch-hit`) để không tràn ở 360 px; laptop dùng chuột giữ cỡ gọn.
- **Không đổi logic, API, luồng dữ liệu:** không thêm API / lượt gọi máy chủ — dùng `/dashboard/kpis`, `/stations`,
  `/map/layers` trang đã tải; chế độ xem chỉ lưu trên máy.
- **Sửa kèm:** chú giải trạm mưa ghi đúng "cường độ mưa đo mới nhất (mm/giờ)" (trước ghi nhầm "mưa 24 giờ"); cụm thẻ góc
  trên trái (điện thoại) không chặn kéo bản đồ; thanh thời gian không đè đáy bảng cảnh báo trên iPad ngang.
- **Kiểm thử:** `tests/ui/ui-test.mjs` khối "Người quản lý" — laptop 1366, iPad ngang, iPad dọc, điện thoại 360.
- **Trang Tổng quan:** cũng đã sửa vùng chạm ≥ 44 px trên màn cảm ứng ở cả 5 tab — PR #63, ghi ở
  `docs/trang-a-viec-con-lai.md` (trước 78–86 chỗ nhỏ hơn 44 px, nay 0).

## 4. Việc chờ dữ liệu / hệ thống bên ngoài

### BD1 — Dữ liệu nền cho các lớp

Như `docs/trang-a-viec-con-lai.md` mục 2 (D1). Trên bản đồ, lớp trống ghi rõ "Chưa có … (nhập loại …)" — không im lặng như
"không có gì". Lực lượng / phương tiện cần **toạ độ nơi đóng quân** đúng (vị trí trên bản đồ là toạ độ đã nhập).

### BD2 — Camera CCTV thật

- **Hiện trạng:** lớp Camera và hộp thoại "Xem trực tiếp" có sẵn nhưng hình là **mô phỏng** (vẽ canvas,
  `components/common/CameraModal.jsx`); chưa có loại dữ liệu nhập camera, chạy thật bảng `iot_telemetry.cameras` trống → lớp
  ghi "Chưa có camera nào được khai báo".
- **Cần:** danh sách camera (tên, toạ độ, đơn vị quản lý), luồng RTSP / HLS / WebRTC được phép xem, quyền truy cập (VPN /
  tài khoản); máy chủ chuyển luồng RTSP → HLS / WebRTC (media server) nếu camera chỉ có RTSP.
- **Việc lập trình khi có:** loại dữ liệu nhập "Camera"; thay hình mô phỏng bằng trình phát video (HLS cần thêm thư viện
  phát trên Chrome, hoặc dùng WebRTC); mở CSP cho địa chỉ máy chủ luồng; ghi nhật ký người xem nếu camera nhạy cảm.

### BD3 — Mạng đường

Như `docs/trang-a-viec-con-lai.md` mục 4 (D3). Khi có: "Tìm đường an toàn A → B" né đúng đoạn ngập / sạt lở; lớp "Mạng đường &
đoạn bị chặn" hết bị khoá.

### BD4 — Vùng ngập nội suy từ DEM

- **Hiện trạng:** vùng ngập là vùng nguy hiểm loại ngập (nhập tay hoặc từ cảm biến, tô đậm theo độ sâu) và **vùng ngập theo
  kịch bản** BĐ I–III (bản đồ ngập lập sẵn, hiện khi mực nước trạm đạt ngưỡng — loại nhập `ngap_kich_ban`). Chưa có nội suy
  theo mô hình số độ cao.
- **Cần:** DEM độ phân giải phù hợp (≤ 10 m vùng đô thị / ven sông), mặt cắt sông hoặc kết quả mô hình thủy lực; hoặc thêm
  bản đồ ngập kịch bản cho nhiều cấp mực nước hơn (cách đơn giản, dùng được ngay).
- **Việc lập trình khi có:** bộ tính vùng ngập theo mực nước dự báo (chạy ngoài, đẩy polygon vào `hazard_zones` nguồn
  `model`) hoặc nhập thêm các lớp kịch bản; giao diện đã phân biệt nguồn "mô hình nội suy DEM" trong popup.

### BD5 — Dân cư chi tiết cho khoanh vùng

- **Hiện trạng:** "Phân tích vùng khoanh" (`POST /api/v1/map/area-stats`) **ước tính** dân số / số hộ bằng tỉ lệ diện tích
  phần xã nằm trong vùng × dân số / số hộ của xã — coi như dân phân bố đều; vùng núi dân ở tập trung theo xóm nên có thể lệch
  nhiều.
- **Cần:** dân số / số hộ theo **xóm, tổ dân phố có toạ độ** (tối thiểu), hoặc vị trí nhà / công trình (bản đồ nhà).
- **Việc lập trình khi có:** đếm theo điểm xóm / nhà nằm trong vùng thay cho tỉ lệ diện tích; ghi rõ "ước tính" hay "đếm" trên
  bảng phân tích.

### BD6 — Radar KTTV, mây vệ tinh; giấy phép radar RainViewer

- Như `docs/trang-a-viec-con-lai.md` mục 7 (điểm 8). Thiết kế B.2 muốn **lớp mây vệ tinh** — chưa có: RainViewer đã bỏ ảnh
  mây vệ tinh từ 01/01/2026 (danh sách ảnh trả về rỗng, kiểm tra 10/10/2026). Cần nguồn ảnh vệ tinh (Đài KTTV hoặc dịch vụ
  ảnh mây có điều khoản dùng phù hợp).
- **Giấy phép radar đang dùng:** theo rainviewer.com/api.html (xem 10/10/2026), API miễn phí "chỉ cho mục đích cá nhân và
  giáo dục" — hệ thống điều hành chính thức của tỉnh không thuộc hai mục đích này. RainViewer không công bố gói cho tổ chức;
  hỏi qua `support@rainviewer.com`. Trước khi vận hành chính thức cần **chọn một**:
  1. có văn bản đồng ý của RainViewer cho trường hợp này;
  2. thay bằng radar của Đài KTTV — lớp radar và thanh thời gian dùng lại được, cần nguồn ảnh dạng ô (tile) kèm danh sách
     khung có giờ;
  3. gỡ lớp radar khỏi bản chạy thật (hiện lớp tắt sẵn nhưng người dùng tự bật được — cần sửa nhỏ).
- RainViewer đề nghị ghi nguồn kèm liên kết: dòng ghi nguồn bản đồ có "Radar © RainViewer" liên kết tới rainviewer.com.

### BD7 — Gửi cảnh báo SMS / Cell Broadcast thật cho vùng khoanh

- **Hiện trạng:** khoanh vùng → "Soạn cảnh báo sơ tán vùng này" → khung soạn cảnh báo, qua Lãnh đạo phê duyệt
  (Maker–Checker + PIN). Kênh SMS Brandname / Cell Broadcast / Zalo ZNS **chưa tích hợp** (README mục 6: "⛔ chưa làm").
- **Cần:** hợp đồng nhà mạng (SMS Brandname, Cell Broadcast theo vùng phủ sóng), tài khoản Zalo OA / ZNS.
- **Việc lập trình khi có:** bộ nối gửi theo kênh; với Cell Broadcast gửi theo đa giác vùng khoanh (không cần danh sách số).

### BD8 — GPS lực lượng / phương tiện (không làm)

Ngày 29/09/2026 chủ dự án quyết định **không làm** chia sẻ vị trí điện thoại của đội cứu hộ; xuồng, xe chưa gắn thiết bị định
vị. Bản đồ hiện **vị trí đơn vị đã nhập** (ghi rõ trên bảng lớp); lộ trình điều động chuyển "đã đến" khi trưởng nhóm báo qua
link nhiệm vụ. Chỉ xem lại nếu có thiết bị định vị gắn trên phương tiện.

## 5. Kiểm tra khi có dữ liệu thật

1. Triển khai bản mới (V1 của trang A).
2. Nhập dữ liệu nền (BD1); mở `/ban-do` trên điện thoại và máy tính:
   - mỗi lớp có số đối tượng, không còn "Chưa có …" ở lớp đã nhập;
   - hồ chưa có số liệu vận hành hiện Xám nét đứt, nhập thử một lần "Cập nhật vận hành" → đổi màu;
   - khoanh thử một vùng đã biết dân số → so ước tính với số thật (BD5);
   - tìm đường an toàn khi đã có mạng đường (BD3);
   - bật lớp "Mưa dự báo theo xã", kéo thanh tới +6h / +12h: khung giờ trên chú giải khớp giờ trên thanh; đợt có mưa, so vài
     xã với bản tin mưa của Đài KTTV (G1);
   - bật lớp "Radar mưa": giờ ảnh trên thẻ cách hiện tại không quá 15 phút; kéo −1h, −2h thấy ảnh cũ hơn, −3h báo không có
     ảnh (G2) — nếu đã chọn nguồn radar khác RainViewer (BD6) thì kiểm tra lại với nguồn đó.
3. Dùng thử với cán bộ hiện trường trên điện thoại (thanh ngón cái, bảng trượt, Báo SOS) và trực ban trên máy tính (kéo –
   thả điều động, lệnh 2 bước).
4. Dùng thử với lãnh đạo (cùng V3 của trang A) trên laptop, iPad, điện thoại: đọc 6 chỉ số "Tình hình" trong vài giây, chạm
   từng ô, tab Điểm nóng, chế độ xem Tình hình — ghi lại chỉ số / loại điểm nóng còn thiếu.

## 6. Tham chiếu mã nguồn

| Phần | Tệp |
|---|---|
| Trang bản đồ, bố cục máy tính / điện thoại | `frontend/src/pages/MonitoringMap.jsx` |
| Bảng lớp, cảnh báo (tab Điểm nóng), thanh thời gian, chế độ xem (`ViewModeSwitch`), công cụ, bảng trượt | `frontend/src/components/map/MapPanels.jsx` |
| Chỉ số "Tình hình" (lưới / hàng / vuốt ngang) — công thức dùng chung dải KPI Tổng quan | `frontend/src/components/map/MapKpis.jsx`, `components/dashboard/kpiFacts.js` |
| Gom điểm nóng (chỉ sắp xếp lại số liệu đã tải) | `frontend/src/components/map/hotspots.js` |
| Vùng chạm 44 px trên màn cảm ứng (`.touch-hit`, phóng to / thu nhỏ Leaflet) | `frontend/src/index.css` |
| Các lớp, popup, kéo – thả điều động | `frontend/src/components/map/MapLayers.jsx` |
| Biểu tượng (thang màu chung), chú giải (gồm thang màu radar `RadarScale`) | `frontend/src/components/map/icons.js`, `MapLegend.jsx` |
| Nền bản đồ, radar (`useRadarFrames`, `radarFrameAt`, bảng màu `RADAR_BINS`), mưa dự báo theo xã (`ForecastChoropleth`, thang `rainScale`), đo, khoanh vùng, tìm đường | `frontend/src/components/map/MapTools.jsx` |
| Chờ dừng tay khi kéo thanh thời gian (lớp mưa dự báo) | `frontend/src/utils/useDebounced.js` |
| Thanh thao tác điện thoại (dùng chung Dashboard) | `frontend/src/components/common/QuickActionBar.jsx` |
| Form: sự cố, bản tin bão, số người sơ tán, xuất kho, điều động | `components/map/IncidentModal.jsx`, `StormBulletinModal.jsx`, `components/common/OccupancyModal.jsx`, `IssueModal.jsx`, `DispatchModal.jsx` |
| Camera (mô phỏng) | `frontend/src/components/common/CameraModal.jsx` |
| API bản đồ | `backend/app/api/v1/map_layers.py` (`/map/layers`, `/map/timeline`, `/map/area-stats`, `/map/storm-track`, `/map/incidents`) |
| Dự báo mưa theo xã (số liệu từng giờ; khung giờ `hours`, `offset_h`) | `backend/app/api/v1/forecast.py` (`/forecast/areas`) |
| Trạng thái hồ (dùng chung Dashboard) | `backend/app/services/reservoirs.py` (`classify_reservoir_status`) |
| Kiểm thử | `tests/ui/ui-test.mjs` (bước "Bản đồ giám sát", "Điều động", khối "Người quản lý" — laptop, iPad ngang / dọc, điện thoại), `tests/e2e/prod-flow.mjs` (trạng thái hồ trên bản đồ), `tests/e2e/iot-test.mjs` (khung giờ mưa dự báo) |

## 7. Các thay đổi đã làm cho trang B (để tra cứu)

| PR | Nội dung |
|---|---|
| #53 | Bố cục điện thoại / máy tính (bản đồ toàn màn, bảng trượt, thanh ngón cái), dải tình huống trên cùng, chú giải, trạng thái lỗi / mất mạng, số đối tượng từng lớp, ẩn lớp theo quyền, bỏ nhãn "(GPS)" |
| #54 | Biểu tượng hồ theo thang màu chung (API `/map/layers` thêm trạng thái hồ), lọc SOS theo mức Đỏ / Cam / Vàng |
| #55 | Form mở từ bản đồ báo lỗi ngay khi nhập; lệnh điều động 2 bước; xác nhận kết thúc theo dõi bão; quân số tự hạ theo số người sẵn sàng |
| #56 | Tài liệu này |
| #57 | Mưa dự báo theo xã đổi theo thanh thời gian (G1): API `/forecast/areas` thêm khung giờ `offset_h`, thang mưa 1 giờ, chú giải / ghi chú lớp ghi đúng khung đang tô, báo rõ đang tải / lỗi / chưa có số liệu |
| #58 | Radar theo thanh thời gian (G2): ảnh ~2 giờ qua, ghi giờ ảnh, tự tải lại 5 phút, báo lỗi, chú giải màu radar; bảng lớp không còn bị thẻ thang màu đè (màn ≥ 1440 px), thanh thời gian không che thẻ chú giải; ghi nguồn RainViewer có liên kết; tài liệu ghi điều khoản RainViewer (BD6) |
| #59 | Người quản lý — bước 1: 6 chỉ số "Tình hình" (cùng số Tổng quan, `kpiFacts.js`) trên laptop / iPad / điện thoại, chạm ô → bản đồ bay tới; sửa chú giải trạm mưa (cường độ mm/giờ) |
| #60 | Người quản lý — bước 2: tab Điểm nóng (xếp Đỏ → Vàng, SOS cấp 1 gộp một dòng), chế độ xem Tình hình / Tác nghiệp (máy nhớ) |
| #61 | Người quản lý — bước 3: vùng chạm ≥ 44 px trên màn cảm ứng (trang Bản đồ, đầu trang, menu, dải khẩn cấp); thanh thời gian không đè bảng cảnh báo trên iPad ngang |
| #62 | Người quản lý — bước 4: khối kiểm thử "Người quản lý" trong ui-test; tài liệu này (G3), README |
