# Trang B – Bản đồ giám sát: đối chiếu thiết kế và việc còn lại

Đối chiếu với mục **B. Thiết kế chi tiết cho Bản đồ Giám sát Tương tác** (tài liệu thiết kế Part 1) và các yêu cầu giao diện
chung (màu rủi ro thống nhất, thông tin khẩn trên cùng, thao tác chính dễ bấm, bảng / form có báo lỗi khi nhập, trạng thái
tải / trống / lỗi / mất mạng, 360 px, theo phân quyền).

- Cập nhật: 10/10/2026 — mã nguồn `main` gồm PR #53 → #56 (bố cục, màu hồ, lọc SOS, form, tài liệu này).
- Máy chủ thử vẫn chạy **v1.0.3**, **chưa có** các thay đổi trên — xem V1 trong `docs/trang-a-viec-con-lai.md` (triển khai
  chung cho mọi trang).
- Dữ liệu nền dùng chung với trang A: `docs/trang-a-viec-con-lai.md` mục 2 (D1), 4 (D3), 7 (radar), README 2.2 / 2.4.

**Kết luận:** về chức năng, bản đồ đã có gần đủ những gì mục B mô tả; giao diện đã sửa theo các yêu cầu chung (PR #53 →
#55). Còn lại:

- **Không cần dữ liệu mới** — làm được ngay: G1 mưa dự báo theo thanh thời gian, G2 radar các khung đã qua (mục 3).
- **Chờ dữ liệu hoặc hệ thống bên ngoài**: BD1 → BD7 (mục 4). GPS lực lượng **không làm** theo quyết định ngày
  29/09/2026 (BD8).

## 1. Đối chiếu với thiết kế mục B (rà ngày 10/10/2026)

| Yêu cầu của thiết kế | Hiện trạng |
|---|---|
| B.1 Bản đồ toàn màn, bảng nổi | Đạt — máy tính: bảng nổi thu gọn được; điện thoại: bản đồ toàn màn (360 px thấy ~93%, trước ~3%), bảng trượt từ đáy |
| B.1 Bảng lớp dữ liệu (trái) | Đạt — 4 nhóm lớp, số đối tượng từng lớp, lớp trống ghi "chưa có … (nhập loại …)" |
| B.1 Thanh thời gian & radar (đáy): bão, mưa, ngập 12 giờ qua / 24 giờ tới | Đạt một phần — thanh −12h…+24h đổi trạm (số đo quá khứ / bản tin dự báo), vùng ngập kịch bản, vị trí tâm bão. **Mưa dự báo** chưa theo thanh (đang là tổng 24 giờ — G1); radar chỉ khung mới nhất (G2) |
| B.1 Bảng cảnh báo khẩn cấp (phải): feed SOS + cảnh báo cảm biến | Đạt — cập nhật tức thì (WebSocket); lọc SOS Đỏ / Cam / Vàng, tìm kiếm; trạm vượt báo động, mất tín hiệu |
| B.1 Công cụ (phải trên): nền bản đồ, đo khoảng cách, khoanh vùng | Đạt — nền Địa lý / Vệ tinh / Địa hình / Ban đêm, đo, khoanh đa giác / tròn, đánh dấu sự cố |
| B.2 Trạm mưa, mực nước; bấm xem biểu đồ so với BĐ I–III | Đạt — màu theo báo động, mất tín hiệu xám nét đứt. Cần trạm + ngưỡng thật (BD1) |
| B.2 Hồ chứa: vị trí, lưu lượng xả | Đạt — màu theo trạng thái (Đỏ xả lũ lớn, Cam xả điều tiết, Xám chưa có số liệu), popup có lưu lượng; số liệu vận hành nhập tay (trang A D4) |
| B.2 Radar thời tiết, mây vệ tinh (ảnh mờ) | Đạt một phần — radar RainViewer (chỉ để xem); **chưa có mây vệ tinh**; radar KTTV chưa có nguồn (BD6) |
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
| Yêu cầu giao diện chung (màu rủi ro, khẩn trên cùng, thao tác dễ bấm, form báo lỗi, trạng thái, 360 px, phân quyền) | Đạt — PR #53 → #55 |

## 2. Bảng tổng hợp việc còn lại

| # | Việc | Phụ thuộc | Cần ai cung cấp | Ưu tiên |
|---|---|---|---|---|
| G1 | **Mưa dự báo theo thanh thời gian** (lượng mưa giờ tại thời điểm đang kéo) | Không cần dữ liệu (thêm tham số API) | — | Trung bình |
| G2 | **Radar các khung đã qua** theo thanh thời gian (−2 giờ → hiện tại) | Không cần dữ liệu | — | Thấp |
| BD1 | Dữ liệu nền cho các lớp (trạm, hồ, lực lượng, kho, điểm sơ tán, vùng nguy hiểm) | Dữ liệu | như trang A D1 | **Cao nhất** |
| BD2 | **Camera CCTV thật**: danh sách camera + máy chủ chuyển luồng | Dữ liệu + hạ tầng + lập trình | Đơn vị quản lý camera (giao thông, thủy điện, công an) | Trung bình |
| BD3 | **Mạng đường** (tìm đường an toàn, đoạn bị chặn) | Dữ liệu + lập trình | như trang A D3 | Trung bình |
| BD4 | **Vùng ngập nội suy từ DEM** + mực nước | Dữ liệu + mô hình | Sở NN&MT (DEM), đơn vị thủy văn | Trung bình |
| BD5 | **Dân cư chi tiết** để khoanh vùng đếm đúng số hộ | Dữ liệu | Công an (dân cư), các xã, Sở NN&MT | Trung bình |
| BD6 | **Radar KTTV, mây vệ tinh** | Tích hợp | Đài KTTV (như trang A điểm 8) | Trung bình |
| BD7 | **Gửi cảnh báo SMS / Cell Broadcast thật** cho vùng khoanh | Hợp đồng + tích hợp | Nhà mạng (README mục 6) | Cao (khi vận hành) |
| BD8 | GPS lực lượng / phương tiện trực tiếp | — | — | **Không làm** (quyết định 29/09/2026) |

## 3. Việc giao diện còn lại (không cần dữ liệu mới)

### G1 — Mưa dự báo theo thanh thời gian

- **Hiện trạng:** lớp "Mưa dự báo 24h theo xã" tô tổng 24 giờ tới (`GET /api/v1/forecast/areas?hours=24`), không đổi khi kéo
  thanh thời gian. Thiết kế B.1 muốn kéo thanh để xem lượng mưa theo thời gian.
- **Sẵn có:** bảng dự báo theo xã đã lưu **từng giờ** (`precip_p50`, `precip_p90` theo `time`) — chỉ là API đang cộng dồn.
- **Việc làm:** thêm tham số khung giờ cho `/forecast/areas` (VD mưa trong giờ tại `+N` giờ, hoặc 3 giờ quanh thời điểm đó);
  lớp mưa dự báo đổi theo thanh thời gian (khi kéo về quá khứ thì dùng mưa đo của trạm); chú giải ghi rõ "mưa giờ lúc …".

### G2 — Radar các khung đã qua

- **Hiện trạng:** lớp radar chỉ hiện khung mới nhất của RainViewer (`MapTools.jsx`, `RadarLayer`).
- **Việc làm:** khi kéo thanh về −1 / −2 giờ thì hiện khung radar gần nhất trong quá khứ (RainViewer có sẵn các khung ~2 giờ
  qua); ngoài khoảng đó ghi "không có ảnh radar cho thời điểm này". Giá trị thấp vì chỉ có ~2 giờ.

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

### BD6 — Radar KTTV, mây vệ tinh

Như `docs/trang-a-viec-con-lai.md` mục 7 (điểm 8). Thêm: thiết kế B.2 muốn **lớp mây vệ tinh** — hiện chưa có; cần nguồn ảnh
vệ tinh (Đài KTTV hoặc dịch vụ ảnh mây có điều khoản dùng phù hợp).

### BD7 — Gửi cảnh báo SMS / Cell Broadcast thật cho vùng khoanh

- **Hiện trạng:** khoanh vùng → "Soạn cảnh báo sơ tán vùng này" → khung soạn cảnh báo, qua Lãnh đạo phê duyệt (Maker–Checker
  + PIN). Kênh SMS Brandname / Cell Broadcast / Zalo ZNS **chưa tích hợp** (README mục 6: "⛔ chưa làm").
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
   - tìm đường an toàn khi đã có mạng đường (BD3).
3. Dùng thử với cán bộ hiện trường trên điện thoại (thanh ngón cái, bảng trượt, Báo SOS) và trực ban trên máy tính (kéo –
   thả điều động, lệnh 2 bước).

## 6. Tham chiếu mã nguồn

| Phần | Tệp |
|---|---|
| Trang bản đồ, bố cục máy tính / điện thoại | `frontend/src/pages/MonitoringMap.jsx` |
| Bảng lớp, cảnh báo, thanh thời gian, công cụ, bảng trượt | `frontend/src/components/map/MapPanels.jsx` |
| Các lớp, popup, kéo – thả điều động | `frontend/src/components/map/MapLayers.jsx` |
| Biểu tượng (thang màu chung), chú giải | `frontend/src/components/map/icons.js`, `MapLegend.jsx` |
| Nền bản đồ, radar, đo, khoanh vùng, tìm đường | `frontend/src/components/map/MapTools.jsx` |
| Thanh thao tác điện thoại (dùng chung Dashboard) | `frontend/src/components/common/QuickActionBar.jsx` |
| Form: sự cố, bản tin bão, số người sơ tán, xuất kho, điều động | `components/map/IncidentModal.jsx`, `StormBulletinModal.jsx`, `components/common/OccupancyModal.jsx`, `IssueModal.jsx`, `DispatchModal.jsx` |
| Camera (mô phỏng) | `frontend/src/components/common/CameraModal.jsx` |
| API bản đồ | `backend/app/api/v1/map_layers.py` (`/map/layers`, `/map/timeline`, `/map/area-stats`, `/map/storm-track`, `/map/incidents`) |
| Dự báo mưa theo xã (có số liệu từng giờ) | `backend/app/api/v1/forecast.py` (`/forecast/areas`) |
| Trạng thái hồ (dùng chung Dashboard) | `backend/app/services/reservoirs.py` (`classify_reservoir_status`) |
| Kiểm thử | `tests/ui/ui-test.mjs` (bước "Bản đồ giám sát", "Điều động"), `tests/e2e/prod-flow.mjs` (trạng thái hồ trên bản đồ) |

## 7. Các thay đổi đã làm cho trang B (để tra cứu)

| PR | Nội dung |
|---|---|
| #53 | Bố cục điện thoại / máy tính (bản đồ toàn màn, bảng trượt, thanh ngón cái), dải tình huống trên cùng, chú giải, trạng thái lỗi / mất mạng, số đối tượng từng lớp, ẩn lớp theo quyền, bỏ nhãn "(GPS)" |
| #54 | Biểu tượng hồ theo thang màu chung (API `/map/layers` thêm trạng thái hồ), lọc SOS theo mức Đỏ / Cam / Vàng |
| #55 | Form mở từ bản đồ báo lỗi ngay khi nhập; lệnh điều động 2 bước; xác nhận kết thúc theo dõi bão; quân số tự hạ theo số người sẵn sàng |
| #56 | Tài liệu này |
