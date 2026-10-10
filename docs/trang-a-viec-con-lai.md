# Trang A – Tổng quan: việc còn lại khi có dữ liệu thật

Đối chiếu với mục **A. Thiết kế chi tiết cho Dashboard Tổng quan & Biểu đồ Dữ liệu** (tài liệu thiết kế Part 1) và các yêu cầu
giao diện bổ sung (màu rủi ro thống nhất, thông tin khẩn trên cùng, bảng có tìm / lọc / phân trang / xuất file, form chia bước
có báo lỗi khi nhập, trạng thái tải / trống / lỗi / mất mạng, 360 px, theo phân quyền).

- Cập nhật: 10/10/2026 — mã nguồn `main` tại `dd6b9bb` (gồm PR #36 → #48).
- Máy chủ thử vẫn chạy **v1.0.3** (04/10/2026), **chưa có** các thay đổi trên. Cần tag + triển khai trước khi kiểm tra với dữ
  liệu thật.
- Hiện trạng từng nhóm dữ liệu: README mục **2.2**. Cách nhập: README mục **2.4**. Kiểm tra trước khi mở cổng: `docs/GO-LIVE.md`.

**Kết luận:** phần chức năng của mục A đã đủ theo thiết kế. Các mục dưới đây còn thiếu vì **chưa có dữ liệu hoặc chưa có hệ
thống bên ngoài để nối**, cộng 2 việc giao diện nhỏ chưa làm. Không điền số mẫu / ngưỡng tự đặt để "lấp chỗ trống".

---

## 1. Bảng tổng hợp

| # | Việc | Phụ thuộc | Cần ai cung cấp | Ưu tiên |
|---|---|---|---|---|
| D1 | Nhập dữ liệu nền cho các khối của trang A (trạm, ngưỡng BĐ, hồ chứa, kế hoạch sơ tán, lực lượng, kho…) | Dữ liệu | Đài KTTV, Sở Công Thương, các xã, BCH | **Cao nhất** — chưa có thì trang A chỉ hiện "chưa có" |
| D2 | Danh mục chính thức **điểm đen sạt lở & đường đèo** (hiện viết cứng 12 điểm trong mã) | Dữ liệu + lập trình | Sở Xây dựng / đơn vị quản lý đường bộ, Sở NN&MT | Cao |
| D3 | **Mạng đường** (xác định đoạn bị chia cắt ở tab Sạt lở, chỉ đường an toàn) | Dữ liệu + lập trình | Sở Xây dựng / OSM đã hiệu chỉnh | Trung bình |
| 7 | **Đánh giá nhanh nguy cơ ngập úng đô thị** trên biểu đồ mưa | Dữ liệu + lập trình | Sở Xây dựng / đơn vị thoát nước TP Cao Bằng | Trung bình |
| 8 | **Dự báo mưa 1–3 giờ từ radar (QPF)** | Tích hợp | Đài KTTV (sản phẩm radar) | Trung bình |
| 9 | **Dự báo mực nước từ mô hình thủy văn (HEC-HMS…)** | Tích hợp | Đài KTTV / đơn vị chạy mô hình | Trung bình |
| 10 | **Báo cáo thiệt hại của người dân qua Zalo OA / ứng dụng** vào nhật ký | Tích hợp | Tài khoản Zalo OA của tỉnh, bên phát triển ứng dụng | Thấp – trung bình |
| 11 | **Ngưỡng sạt lở hiệu chỉnh** (ngưỡng mưa I–D, ngưỡng cảm biến nghiêng / độ ẩm đất) | Dữ liệu | Viện / đơn vị nghiên cứu sạt lở, Sở NN&MT | Trung bình |
| G1 | Thẻ **Hồ chứa** trong bảng tác chiến (tìm, lọc, phân trang, xuất Excel / PDF) | Chỉ giao diện | — | Có thể làm ngay |
| G2 | **"Xem thêm" / phân trang** cho danh sách thẻ ở tab Hồ chứa và tab Sạt lở | Chỉ giao diện | — | Có thể làm ngay |

---

## 2. D1 — Dữ liệu nền cho các khối của trang A

Khi chạy thật (`DEMO_MODE=false`) các bảng dưới đây **đang trống**; trang A đã xử lý đúng trường hợp này (ghi "chưa có", khung
xám, không tô xanh như "an toàn"), nhưng chưa dùng để điều hành được.

| Khối trên trang A | Dữ liệu cần | Loại nhập (README 2.4) | Nguồn |
|---|---|---|---|
| Ô Mưa, biểu đồ mưa, mưa TB lưu vực (đa giác Thiessen) | Trạm đo mưa + số đo tự động | `tram_quan_trac` + kết nối thiết bị (HTTP / MQTT / LoRaWAN, README 6.4–6.5) | Đài KTTV Cao Bằng, VRain |
| Ô Mực nước, biểu đồ thủy văn, dự báo vượt BĐ | Trạm mực nước + **ngưỡng BĐ I / II / III** + số đo | `tram_quan_trac` | Đài KTTV Cao Bằng |
| Tab Hồ chứa, biểu đồ vận hành hồ | Danh mục hồ (MNDBT, số cửa xả, sông) + số liệu vận hành | `ho_chua`; số liệu vận hành: trực ban nhập ở tab Hồ chứa (nút "Cập nhật vận hành") tới khi có nguồn tự động | Chủ đập, Sở Công Thương |
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

## 5. Điểm 7 — Đánh giá nhanh nguy cơ ngập úng đô thị

Thiết kế A.3: phần 1–3 giờ tới của biểu đồ mưa dùng dự báo mưa cực ngắn "để đánh giá nhanh nguy cơ ngập úng đô thị cục bộ".

- **Hiện trạng:** biểu đồ mưa đã có phần 3 giờ tới (nét đứt) nhưng **chưa có ngưỡng ngập úng** nên chưa đánh giá.
- **Cần (đề nghị dạng bảng CSV / Excel):** mã xã/phường (hoặc tên tuyến phố, điểm ngập), ngưỡng mưa gây ngập theo **1 giờ**
  và theo **3 giờ** (mm), văn bản / nguồn của ngưỡng; nếu có: danh sách điểm hay ngập kèm toạ độ.
- **Việc lập trình khi có:** chỗ lưu ngưỡng theo xã/phường (loại dữ liệu nhập hoặc thuộc tính của xã); trên biểu đồ mưa vẽ
  vạch ngưỡng của vùng đang xem; khi mưa giờ vừa qua hoặc dự báo 3 giờ tới vượt ngưỡng → nhãn cảnh báo trên biểu đồ và một chip
  ở dải tình huống ("Nguy cơ ngập úng … theo dự báo …", ghi rõ nguồn dự báo).
- **Kiểm tra:** nhập ngưỡng cho 1 phường, chọn phường đó ở bộ lọc → thấy vạch ngưỡng; dự báo vượt ngưỡng → có cảnh báo.

## 6. Điểm 8 — Dự báo mưa 1–3 giờ từ radar (QPF)

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

## 7. Điểm 9 — Dự báo mực nước từ mô hình thủy văn (HEC-HMS…)

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

## 8. Điểm 10 — Báo cáo của người dân qua Zalo OA / ứng dụng

- **Hiện trạng:** cổng tiếp nhận tự động `POST /api/v1/sos/intake` đã có nhưng **đang tắt** cho tới khi đặt `INTAKE_API_KEY`
  và có bên gửi (README 2.1, 6.6). Phản ánh của người dân từ cổng công khai đã vào nhật ký (nhóm "Người dân").
- **Cần:** tài khoản Zalo OA (và mẫu ZNS nếu gửi tin), bên phát triển ứng dụng / dịch vụ trung gian gọi cổng tiếp nhận.
- **Việc lập trình khi có:** cấu hình khoá, kiểm thử luồng tin → phiếu SOS / phản ánh → hiện ở nhật ký và bảng tác chiến.

## 9. Điểm 11 — Ngưỡng sạt lở hiệu chỉnh

- **Hiện trạng:**
  - Biểu đồ "Ngưỡng kích hoạt sạt lở" (mưa tích luỹ 72 giờ – cường độ mưa) dùng đường ngưỡng **minh hoạ**
    `I = a · (R/100)^-0,6`, hệ số `a` trong `THRESHOLD_A` (`backend/app/api/v1/dashboard.py`); giao diện đã ghi chú là minh hoạ.
  - Ngưỡng của cảm biến nghiêng / độ ẩm đất là thuộc tính `alarm_thresholds` của từng trạm (nhập qua `tram_quan_trac`).
- **Cần:** ngưỡng I–D hiệu chỉnh cho Cao Bằng (hệ số theo cấp Vàng / Cam / Đỏ) từ nghiên cứu sạt lở của tỉnh; ngưỡng BĐ I/II/III
  cho từng cảm biến.
- **Việc lập trình khi có:** đưa hệ số ngưỡng I–D ra cấu hình / dữ liệu (không sửa mã mỗi lần đổi), bỏ chữ "minh hoạ"; cập nhật
  ngưỡng cảm biến bằng nhập lại `tram_quan_trac`.

## 10. Việc giao diện còn lại (không cần dữ liệu, chưa làm)

- **G1 — Thẻ "Hồ chứa" trong bảng tác chiến** (tab Tổng hợp): bảng hiện có 4 thẻ Mực nước / Sạt lở / SOS / Kho nhưng chưa có
  Hồ chứa, nên danh sách hồ chưa xuất được Excel / PDF và chưa phân trang. Làm: thêm thẻ (tìm, lọc theo trạng thái xả / mức màu,
  sắp xếp, phân trang, xuất Excel / PDF), dùng dữ liệu theo vùng có sẵn (`GET /api/v1/dashboard/reservoirs`).
- **G2 — "Xem thêm" / phân trang** cho danh sách thẻ ở tab Hồ chứa và tab Sạt lở (dùng chung cổng công khai): hiện 6 hồ / 12
  điểm thì ổn, dữ liệu thật vài chục mục sẽ rất dài.

## 11. Khi có dữ liệu: trình tự đề nghị

1. **Triển khai** bản mới nhất (tag), để có migration `0020` (lịch sử vận hành hồ) và các cải tiến từ PR #36 → #48.
2. **Nhập dữ liệu nền** (mục 2) theo README 2.4; người thứ hai đối chiếu.
3. **Kiểm tra trang A** bằng mắt với dữ liệu thật:
   - 6 ô KPI có số (không còn "chưa có"); ô Mực nước có mức BĐ, mũi tên xu hướng;
   - biểu đồ thủy văn có vạch BĐ I–III, tô phần vượt; dưới có vận hành hồ của sông đó (sau khi đã có số liệu vận hành);
   - tab Hồ chứa / Sạt lở đúng vùng đang lọc; heatmap cảm biến có ô màu;
   - báo cáo văn bản (nút "Văn bản") xuất đủ các mục.
4. **Chạy kiểm thử trên máy chủ** (chỉ đọc, không ghi dữ liệu): `UI_READONLY=1 node tests/ui/ui-test.mjs <địa chỉ>`; làm theo
   `docs/GO-LIVE.md`.
5. Làm tiếp các mục 7 → 11 khi có dữ liệu tương ứng; G1, G2 làm được bất cứ lúc nào.
6. Một buổi cho lãnh đạo và trực ban dùng thử để chỉnh câu chữ, bố cục theo thói quen thực tế.

## 12. Tham chiếu mã nguồn (cho người phát triển)

| Phần | Tệp |
|---|---|
| Trang Tổng quan, các tab | `frontend/src/pages/Dashboard.jsx` |
| 6 ô KPI | `frontend/src/components/dashboard/KpiStrip.jsx`, `StatCard.jsx`, `RiverKpi.jsx` |
| Dải tình huống, Việc chờ quyết định | `frontend/src/components/dashboard/SituationBar.jsx`, `DecisionPanel.jsx` |
| Biểu đồ thủy văn, vận hành hồ | `frontend/src/components/charts/Hydrograph.jsx`, `ReservoirOpsChart.jsx` |
| Biểu đồ mưa, ngưỡng sạt lở, cảm biến sạt lở, vật tư | `RainfallChart.jsx`, `LandslideScatter.jsx`, `SensorHeatmap.jsx`, `SuppliesChart.jsx` (cùng thư mục `charts`) |
| Tab Hồ chứa / Sạt lở (dùng chung cổng công khai) | `frontend/src/pages/public/ReservoirMonitor.jsx`, `LandslideMonitor.jsx` |
| Bảng tác chiến | `frontend/src/components/dashboard/OperationsTable.jsx` |
| Xuất PDF ảnh chụp / báo cáo văn bản | `frontend/src/utils/exportPdf.js`, `reportPdf.js`, `components/dashboard/ReportDocModal.jsx` |
| API trang A | `backend/app/api/v1/dashboard.py` (`/dashboard/kpis`, `/stations`, `/dashboard/rainfall`, `/dashboard/reservoirs`, `/dashboard/landslides`, `/dashboard/landslide-sensors`, `/dashboard/reservoir-operations`, `/dashboard/landslide-risk`, `/dashboard/supplies`) |
| Mưa bình quân lưu vực (Thiessen) | `backend/app/area.py` (`thiessen_ctes`), `backend/app/db.py` (`fetch_all_no_jit`) |
| Hạn phản hồi SOS, quy tắc 15 phút | `backend/app/services/sos.py` (`OVERDUE_SQL`, `NO_TEAM_15M_SQL`) |
| Mô hình hồ của bộ mô phỏng (chỉ bản trình diễn) | `backend/app/services/scenario.py` (`reservoir_tick`) |
| Kiểm thử | `tests/ui/ui-test.mjs`, `tests/e2e/smoke.mjs`, `reservoir-test.mjs`, `landslide-test.mjs`, `iot-test.mjs`, `prod-flow.mjs` |

## 13. Các thay đổi đã làm cho trang A (để tra cứu)

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
