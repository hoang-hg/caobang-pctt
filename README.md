# Hệ thống Điều hành PCTT & TKCN tỉnh Cao Bằng

Ứng dụng web điều hành, ứng phó thiên tai cho **Ban Chỉ huy Phòng chống thiên tai & Tìm kiếm cứu nạn tỉnh Cao Bằng**:
màn hình trung tâm (video wall, nền tối), máy tính bảng hiện trường (nền sáng) và **cổng công khai cho người dân**.

Đây là **tài liệu duy nhất** của hệ thống (hướng dẫn cho lập trình viên và trợ lý AI nằm ở [CLAUDE.md](CLAUDE.md)).
Sửa chức năng, cấu hình hay quy trình thì cập nhật đúng mục trong tệp này.

> ⚠️ **Chưa sẵn sàng làm kênh cảnh báo chính thức**: lệnh cảnh báo được soạn, duyệt thật nhưng **chưa gửi tin thật**
> qua SMS / Cell Broadcast / Zalo; dữ liệu trạm, lực lượng, kho, điểm sơ tán, danh bạ hiện là **mẫu minh hoạ**.
> Xem [mục 2 — Hiện trạng](#hien-trang) trước khi dùng thật.

**Đọc theo vai trò**

| Bạn là | Nên đọc |
|---|---|
| Lãnh đạo, cán bộ nghiệp vụ | [1. Tổng quan](#tong-quan) · [2. Hiện trạng](#hien-trang) · [7. Quy trình nghiệp vụ](#quy-trinh) · [8. Phân quyền](#phan-quyen) |
| Người vận hành máy chủ | [2. Hiện trạng](#hien-trang) · [5. Cấu hình](#cau-hinh) · [6. Kết nối dữ liệu thật](#ket-noi-du-lieu) · [10. Triển khai thật](#trien-khai) · [11. Bảo mật](#bao-mat) |
| Lập trình viên | [3. Kiến trúc](#kien-truc) · [4. Chạy thử](#chay-thu) · [12. Kiểm thử](#kiem-thu) · [CLAUDE.md](CLAUDE.md) |

**Mục lục**

1. [Tổng quan phân hệ](#tong-quan)
2. [Hiện trạng chức năng & dữ liệu](#hien-trang)
3. [Kiến trúc](#kien-truc)
4. [Chạy thử trên máy](#chay-thu)
5. [Cấu hình (.env)](#cau-hinh)
6. [Kết nối dữ liệu thật & API key](#ket-noi-du-lieu)
7. [Quy trình nghiệp vụ (SOP)](#quy-trinh)
8. [Phân quyền (RBAC)](#phan-quyen)
9. [Cổng công khai & phản ánh của người dân](#cong-cong-khai)
10. [Triển khai thật (production)](#trien-khai)
11. [Bảo mật & tuân thủ](#bao-mat)
12. [Kiểm thử & CI](#kiem-thu)
13. [Nguồn dữ liệu địa giới & giấy phép](#nguon-dia-gioi)

---

<a id="tong-quan"></a>
## 1. Tổng quan phân hệ

| # | Phân hệ | Trang | Nội dung chính |
|---|---|---|---|
| A | Dashboard tổng quan | `/dashboard` | KPI thời gian thực (mưa lưu vực, mực nước so với BĐ I/II/III, sơ tán, SOS chờ > 15′ nhấp nháy, lực lượng, phương tiện); hydrograph thực đo + dự báo; mưa giờ + tích luỹ + nowcast 3 giờ; ngưỡng sạt lở; vật tư theo kho; dự báo mưa 72 giờ theo xã; nhật ký sự kiện; **xuất PDF báo cáo nhanh** |
| B | Bản đồ giám sát | `/ban-do` | 4 nhóm lớp (thuỷ văn, vùng nguy hiểm, lực lượng – vật tư, SOS), radar mưa, thanh thời gian −12h…+24h, popup có biểu đồ mini, **kéo–thả đội cứu hộ vào điểm SOS**, khoanh vùng → đếm hộ dân → soạn cảnh báo, đo khoảng cách, **tìm đường an toàn A→B** |
| C | Vật tư & Lực lượng | `/nguon-luc` | Lực lượng / Kho vật tư / Phương tiện; cảnh báo kho < 20% định mức, sắp hết hạn; nhiên liệu; điều động nhanh; ra lệnh xuất kho; xuất Excel/PDF |
| D | Điều hành cứu hộ | `/cuu-ho` | Kanban 4 cột, SLA cấp 1/2/3 (3′/15′/60′), tiếp nhận đa kênh + bóc tách tin nhắn, khớp lực lượng gần nhất theo kỹ năng, ETA, theo dõi sơ tán & sức chứa |
| E | Cảnh báo & Hotline | `/canh-bao` | Mẫu tin có tham số, phát theo xã / vùng vẽ, 5 kênh, **Maker–Checker + PIN**, bảng theo dõi giao nhận, danh bạ Tỉnh → Xã → Thôn, IVR, nhật ký pháp lý |
| F | Bộ lọc địa phương & Sáng/Tối | toàn cục | 56 xã/phường (sau 01/07/2025), preset lưu vực, vùng núi cao, biên giới, địa bàn huyện cũ; Omni-search (địa danh, toạ độ, mã SOS); giao diện sáng/tối |
| G | Nguồn dữ liệu & IoT | `/nguon-du-lieu` | Dự báo tổ hợp ECMWF + GFS theo xã; OpenWeather; cổng IoT HTTP / MQTT / LoRaWAN; kiểm tra số đo; cảnh báo mất tín hiệu; giám sát kết nối |
| H | Phản ánh của người dân | `/phan-anh` | Cán bộ đúng địa bàn duyệt / từ chối / chuyển SOS phản ánh có ảnh của người dân |
| I | Phân quyền | `/phan-quyen` | Tài khoản, vai trò, phạm vi toàn tỉnh → cụm → xã; chống leo thang quyền; nhật ký phân quyền |
| — | **Cổng công khai** | `/`, `/cong-khai` | Người dân không cần đăng nhập: cảnh báo đã duyệt, bản đồ vùng nguy hiểm – điểm sơ tán, "Tôi đang ở đâu?", dự báo mưa theo xã, mực nước, hồ chứa, điểm đen sạt lở, đường dây nóng, **gửi phản ánh kèm ảnh**, tra cứu tiến độ phiếu |

Tự động hoá: cảm biến nghiêng / độ ẩm đất vượt BĐ II → tự khoanh vùng nguy cơ 1 km, tạo phiếu SOS nguồn `SENSOR` và
**bản nháp cảnh báo chờ Lãnh đạo duyệt**; dự báo mực nước 3 giờ tới vượt BĐ III hoặc mưa dự báo 24 giờ ≥ 100 mm
→ nháp "Chuẩn bị sơ tán". Hệ thống **không bao giờ tự phát** cảnh báo khi chưa có người duyệt.

---

<a id="hien-trang"></a>
## 2. Hiện trạng chức năng & dữ liệu

Cập nhật lần cuối: 27/09/2026. Đổi trạng thái một chức năng (mô phỏng → thật) phải cập nhật mục này.
Ký hiệu: ✅ chạy thật · 🟡 chạy thật nhưng dựa trên dữ liệu xấp xỉ · 🔶 mô phỏng · ⛔ chưa có

### 2.1. Chức năng

| Phân hệ | Chức năng | Trạng thái | Ghi chú |
|---|---|---|---|
| Cảnh báo | Soạn lệnh từ mẫu, khoanh vùng, Maker–Checker + PIN, nhật ký pháp lý | ✅ | |
| Cảnh báo | **Gửi tin tới người dân** (SMS Brandname, Cell Broadcast, Zalo OA/ZNS, Push, loa) | ⛔ | Chưa có code gửi. `SIMULATOR=true`: số "đã gửi / đã nhận" là **số ngẫu nhiên**; `SIMULATOR=false`: lệnh đã duyệt nằm ở "đang gửi" |
| Cảnh báo | Tổng đài IVR, nút gọi `tel:` | 🔶 / ⛔ | Nhật ký cuộc gọi là mô phỏng; chưa nối tổng đài SIP |
| Cứu hộ | Phiếu SOS, Kanban, SLA, điều động, khớp lực lượng gần nhất | ✅ | Phụ thuộc dữ liệu lực lượng (2.2) |
| Cứu hộ | Bóc tách tin nhắn SOS | ✅ | Bộ luật offline; LLM tuỳ chọn (SĐT được che trước khi gửi) |
| Cứu hộ | Tiếp nhận SOS tự động từ Zalo OA / app (`POST /api/v1/sos/intake`) | ⛔ | Cổng có sẵn, **tắt** tới khi đặt `INTAKE_API_KEY` và có bên gửi |
| Giám sát | Dự báo mưa tổ hợp ECMWF + GFS theo 56 xã (Open-Meteo) | ✅ | Gói miễn phí chỉ cho mục đích phi thương mại ([6.2](#open-meteo)) |
| Giám sát | Nhận số đo IoT (HTTP / MQTT / LoRaWAN), kiểm tra số đo, mất tín hiệu | ✅ | Chưa có trạm thật nào kết nối |
| Giám sát | Số đo trạm, dự báo mực nước (HEC-HMS), nowcast | 🔶 | Sinh bởi bộ mô phỏng khi `SIMULATOR=true` |
| Giám sát | Camera | 🔶 | Hình vẽ; chưa nối media server RTSP/HLS |
| Giám sát | Cảnh báo tự động (vượt báo động, cảm biến sạt lở) | ✅ | Chạy trên số đo thật lẫn mô phỏng |
| Công khai | Cổng thông tin, "Tôi đang ở đâu?", dự báo, chia sẻ cảnh báo | ✅ / 🟡 | Điểm sơ tán, vùng nguy hiểm, đường chia cắt hiện cho dân → **bắt buộc dữ liệu chính thức** |
| Công khai | Điểm đen sạt lở & đường đèo | 🟡 | 12 điểm khai báo trong code (`services/landslides.py`); trạng thái suy ra từ vùng nguy hiểm + cảm biến — **chưa có dữ liệu giám sát thì mọi điểm hiện "bình thường"** |
| Công khai | Chỉ đường an toàn | 🟡 | Mạng đường là các trục chính vẽ xấp xỉ; ngoài mạng đường chỉ hiện hướng chim bay (nét đứt xám) |
| Công khai | Phản ánh kèm ảnh, duyệt theo địa bàn, tra cứu tiến độ | ✅ | |
| Công khai | Bản nhẹ `/ban-nhe` (< 50 KB, không JavaScript), mở lại khi mất mạng (PWA) | ✅ | [9.4](#ban-nhe) |
| Nền tảng | Bản đồ nền tự lưu trữ (OpenStreetMap) | ✅ | Cần chạy `deploy/fetch-basemap.sh` ([6.9](#ban-do-nen)) |
| Nền tảng | Đăng nhập, xác thực 2 lớp (TOTP), RBAC, đổi/quên mật khẩu, nhật ký thao tác, xuất PDF/Excel | ✅ | [11.1](#xac-thuc-2-lop) |

### 2.2. Dữ liệu

`DEMO_MODE=false` (bắt buộc khi chạy thật) chỉ nạp **dữ liệu nền**. Các nhóm còn lại phải lấy từ cơ quan chủ quản
và nhập **trước** khi công bố cổng cho người dân — **không dùng dữ liệu mẫu**: cổng sẽ chỉ người dân tới điểm sơ tán,
vùng nguy hiểm, số điện thoại không có thật.

| Nhóm dữ liệu | Bảng | Khi `DEMO_MODE=false` | Nguồn chính thức |
|---|---|---|---|
| Ranh giới tỉnh | `spatial_admin.administrative_units` (tinh) | ✅ OpenStreetMap | — |
| Ranh giới, dân số 56 xã/phường | `administrative_units` (xa) | ✅ dữ liệu công khai sau sắp xếp (`backend/seed/caobang_communes.geojson`, [13](#nguon-dia-gioi)); số hộ = dân số / 4 (ước tính) | Có shapefile chính thức của Sở NN&MT thì nhập đè bằng loại `ranh_gioi_xa`. Phạm vi RBAC và việc gán SOS/phản ánh vào xã dựa trên ranh giới này |
| Xóm / tổ dân phố | `administrative_units` (thon) | ⛔ 8 xóm **mẫu** | Danh sách sau sắp xếp năm 2026 (nghị quyết HĐND từng xã) — UBND xã / Sở Nội vụ; nhập bằng loại `xom` ([2.4](#nhap-du-lieu)) |
| Địa danh (đèo, di tích, công trình) | `spatial_admin.place_names` | 🟡 mẫu | UBND xã |
| Mạng đường | `operations.road_nodes`, `road_segments` | 🟡 trục chính vẽ tay | Sở Xây dựng / OSM đã hiệu chỉnh |
| Mẫu tin cảnh báo | `communications.message_templates` | ✅ | Rà soát lời văn với Văn phòng BCH |
| Danh mục vật tư | `resources.items` | ✅ | |
| Trạm quan trắc, ngưỡng báo động | `iot_telemetry.monitoring_stations` | ⛔ trống | Đài KTTV Cao Bằng, VRain |
| Hồ chứa, quy trình xả | `iot_telemetry.reservoirs` | ⛔ trống | Chủ đập / Sở Công Thương. Số liệu vận hành (mực nước, cửa xả): trực ban nhập theo báo cáo của hồ ([7.4](#giam-sat-kttv)) tới khi có nguồn tự động |
| Vùng nguy hiểm, điểm sạt lở | `iot_telemetry.hazard_zones`, `hazard_points` | ⛔ trống | Bản đồ phân vùng rủi ro sạt lở, lũ quét |
| Lực lượng, phương tiện | `resources.forces`, `vehicles` | ⛔ trống | BCH Quân sự, Công an, đội xung kích |
| Kho, tồn kho, nhiên liệu | `resources.warehouses`, `inventory`, `fuel_depots` | ⛔ trống | Văn phòng BCH |
| Điểm sơ tán | `resources.evacuation_sites` | ⛔ trống | Phương án ứng phó của từng xã |
| Danh bạ, đường dây nóng tỉnh | `communications.contacts` | ⛔ trống (cổng chỉ hiện 112/113/114/115) | Văn phòng BCH |

Nhập bằng công cụ ở [2.4](#nhap-du-lieu), có người thứ hai đối chiếu với văn bản gốc.

<a id="nhap-du-lieu"></a>
### 2.4. Nhập dữ liệu chính thức

Trang **Nhập dữ liệu** (`/nhap-du-lieu`, quyền `data.import`: Super admin, Lãnh đạo BCH, Admin tỉnh) hoặc dòng lệnh trên
máy chủ. Quy trình: **Tải tệp mẫu** → điền (hoặc **Điền trực tiếp** trên web: từng bản ghi, chọn vị trí / vẽ vùng trên bản
đồ) → **Kiểm tra** (không ghi gì: báo lỗi theo dòng, số bản ghi thêm / cập nhật / xoá, xem trước) → **Nhập** (kiểm tra
lại, ghi toàn bộ trong 1 transaction hoặc không ghi gì; ghi nhật ký pháp lý; mọi màn hình và cổng công khai cập nhật ngay).

**Xã/phường gửi — cấp tỉnh phê duyệt** (quyền `data.submit` theo phạm vi xã, mặc định vai trò Admin xã/phường):

```mermaid
graph LR
    X[Admin xã: điền form / tải tệp] --> K[Kiểm tra: đúng xã, đúng cấp] --> H[Hồ sơ HS-…: chờ duyệt<br/>CHƯA hiển thị ở đâu]
    H --> T[Admin tỉnh: xem thêm / sửa cũ → mới / xoá + bản đồ] -->|Phê duyệt| G[Ghi dữ liệu → hiện trên hệ thống & cổng]
    T -->|Từ chối + lý do| X
```

- Xã chỉ gửi: xóm, điểm sơ tán, điểm & vùng nguy hiểm, danh bạ **cấp xã / thôn**, kho & lực lượng **cấp xã**, tồn kho
  của kho cấp xã, phương tiện của lực lượng cấp xã (`SUBMITTABLE` trong `specs.py`). Ranh giới xã, trạm quan trắc, hồ
  chứa, danh bạ cấp tỉnh, cây xăng: chỉ cấp tỉnh nhập.
- Mọi bản ghi phải thuộc xã người gửi phụ trách (mã xã **và** vị trí / vùng); không sửa được bản ghi đã có của xã khác
  hay cấp tỉnh (cùng mã); "thay toàn bộ" chỉ xoá bản ghi **trong xã mình**. Tệp mẫu tải về đã điền sẵn mã xã, vị trí
  trong xã.
- Hồ sơ lưu tệp gốc (`operations.data_submissions`), **chưa ghi** vào bảng nghiệp vụ → không hiện trên màn hình điều
  hành, cổng công khai. Người duyệt mở hồ sơ: hệ thống **kiểm tra lại với dữ liệu hiện tại** và hiện đúng những gì sẽ
  ghi (thêm mới, giá trị cũ → mới, bản ghi bị xoá, vị trí trên bản đồ).
- **Phê duyệt**: ghi dữ liệu + đổi trạng thái trong 1 transaction, khoá hồ sơ (hai người bấm cùng lúc → ghi 1 lần). Người
  gửi không tự duyệt; **Từ chối** bắt buộc ghi lý do; người gửi **rút** được hồ sơ đang chờ. Tối đa 20 hồ sơ chờ / người.
- Thông báo: số hồ sơ chờ duyệt trên menu + email cho người có `data.import` toàn tỉnh; người gửi nhận email kết quả.
  Mọi bước ghi nhật ký pháp lý (`data.submit`, `data.import` kèm mã hồ sơ, `data.submission.reject` / `.withdraw`).
- Admin tỉnh vẫn nhập thẳng (không qua duyệt) như trên. Tình huống khẩn (sạt lở mới giữa bão) không đi qua luồng này:
  xã dùng SOS, phản ánh, soạn cảnh báo.

| Loại (mã) | Bảng | Định dạng | Khoá | Thay toàn bộ |
|---|---|---|---|---|
| Ranh giới xã/phường (`ranh_gioi_xa`) | `administrative_units` | GeoJSON vùng | mã xã có sẵn — chỉ cập nhật | — |
| Xóm / tổ dân phố (`xom`) | `administrative_units` (cấp thôn) | CSV / Excel | `ma` — trống = tự sinh `<mã xã>-<tên>` | ✓ chỉ xóm của các xã có trong tệp |
| Điểm sơ tán (`diem_so_tan`) 🌐 | `evacuation_sites` | CSV / Excel / GeoJSON điểm | `ma` | ✓ |
| Vùng nguy hiểm (`vung_nguy_hiem`) 🌐 | `hazard_zones` | GeoJSON vùng | `ma` | ✓ (không xoá vùng do cảm biến tạo) |
| Điểm nguy hiểm (`diem_nguy_hiem`) 🌐 | `hazard_points` | CSV / Excel / GeoJSON điểm | `ma` | ✓ |
| Danh bạ & đường dây nóng (`danh_ba`) 🌐 | `contacts` | CSV / Excel | `ma` (+ `ma_cap_tren`) | ✓ |
| Trạm quan trắc (`tram_quan_trac`) | `monitoring_stations` | CSV / Excel / GeoJSON điểm | `ma` | — |
| Hồ chứa (`ho_chua`) 🌐 | `reservoirs` | CSV / Excel / GeoJSON điểm | `ma` | — |
| Kho vật tư (`kho`) | `warehouses` | CSV / Excel / GeoJSON điểm | `ma` | — |
| Tồn kho (`ton_kho`) | `inventory` | CSV / Excel | `ma_kho` + `ma_vat_tu` | — |
| Lực lượng (`luc_luong`) | `forces` | CSV / Excel / GeoJSON điểm | `ma` | — |
| Phương tiện (`phuong_tien`) | `vehicles` | CSV / Excel | `ma` (+ `ma_luc_luong`) | — |
| Điểm cấp nhiên liệu (`cay_xang`) | `fuel_depots` | CSV / Excel / GeoJSON điểm | `ma` | ✓ |

🌐 = hiện trên cổng công khai. Quy tắc:

- **Mã (`ma`)** là định danh ổn định: nhập lại tệp đã sửa → **cập nhật** đúng bản ghi, không nhân đôi. Ô trống ghi
  đè thành trống (tệp là nguồn chính), trừ cột ghi "trống = giữ nguyên".
- **Toạ độ WGS84** (vĩ độ ~22,3–23,1; kinh độ ~105,3–106,9 cho Cao Bằng); điểm ngoài tỉnh bị từ chối. GeoJSON phải là
  WGS84 (EPSG:4326) — tệp VN-2000 phải chuyển hệ trước. Hình học vùng lỗi tự sửa (`ST_MakeValid`) kèm cảnh báo.
- **Xã/phường** tự xác định theo vị trí nếu để trống `ma_xa`. Nhập ranh giới xã mới → mọi đối tượng (SOS, phản ánh,
  điểm sơ tán…) được gán lại xã theo ranh giới mới.
- **Excel**: dùng trang tính đầu tiên, dòng 1 là tên cột; CSV phải là UTF-8 (Excel: Lưu thành → "CSV UTF-8"). Tên cột
  và giá trị liệt kê viết có dấu cũng được ("Vĩ độ", "Trường học"). Tối đa 20 MB, 20.000 dòng.
- **Thay toàn bộ** xoá mọi bản ghi của bảng không có trong tệp (kể cả dữ liệu mẫu) — giao diện báo trước số bản ghi sẽ
  xoá và bắt buộc tích xác nhận. Chỉ có ở bảng không bị bảng khác tham chiếu.
- **Xóm / tổ dân phố** (sau sắp xếp theo nghị quyết HĐND từng xã, 2026): mỗi xã một tệp hoặc gộp nhiều xã; cột bắt buộc
  `ma_xa`, `ten` ("Xóm Nà Pò" hay "Nà Pò" đều được — cùng mã); không cần toạ độ. Chọn **Thay toàn bộ** để bỏ xóm cũ
  đã sáp nhập: chỉ xoá xóm của các xã **có trong tệp**. Dùng cho: người dân **chọn xóm khi gửi phản ánh** (danh sách
  theo xã, [9](#cong-cong-khai)), tìm kiếm địa danh, nhận biết xóm trong tin SOS (tên xóm trùng ở nhiều xã: tin phải
  nhắc cả xã mới gán đúng xóm). Hiện có 8 xóm **mẫu** — thay bằng danh sách chính thức lấy từ UBND các xã / Sở Nội vụ.
- Thứ tự khi nhập lần đầu: ranh giới xã → xóm → kho → tồn kho → lực lượng → phương tiện → phần còn lại.

Dòng lệnh (tệp lớn, người vận hành máy chủ):

```bash
docker compose cp diem_so_tan.csv backend:/tmp/        # chạy thật: dcp cp …
docker compose exec backend python -m app.services.data_import --list
docker compose exec backend python -m app.services.data_import diem_so_tan /tmp/diem_so_tan.csv            # kiểm tra
docker compose exec backend python -m app.services.data_import diem_so_tan /tmp/diem_so_tan.csv --apply    # nhập
```

### 2.3. Việc phải xong trước khi mở cho người dân

Bắt buộc:

1. ⛔ Tích hợp ít nhất một kênh cảnh báo thật có báo cáo giao nhận (SMS Brandname hoặc Cell Broadcast qua nhà mạng)
   và gỡ số liệu giao nhận ngẫu nhiên khỏi giao diện.
2. ⛔ Nhập dữ liệu chính thức mục 2.2 bằng công cụ [2.4](#nhap-du-lieu) (tối thiểu: ranh giới xã, điểm sơ tán, vùng
   nguy hiểm, danh bạ đường dây nóng).
3. ⛔ Bản đồ nền: tải bản đồ tự lưu trữ (`sh deploy/fetch-basemap.sh`); nền ngoài (zoom toàn quốc, Vệ tinh, Địa hình)
   có giấy phép sử dụng ([6.9](#ban-do-nen)).
4. ⛔ Triển khai theo [mục 10](#trien-khai): `APP_ENV=production`, HTTPS, sao lưu ra ngoài máy chủ, đã diễn tập khôi phục.
5. ⛔ Hồ sơ cấp độ an toàn thông tin, kiểm thử xâm nhập, thông báo xử lý dữ liệu cá nhân ([mục 11](#bao-mat)).
6. ⛔ Diễn tập trên một xã thí điểm: soạn → duyệt → phát → người dân nhận được.

Nên có: chính sách xoá SĐT người phản ánh sau thời hạn; máy chủ dự phòng ngoài tỉnh; giám sát số liệu (metrics: tải,
thời gian phản hồi); kiểm thử tải lại trên máy chủ thật ([12.2](#kiem-thu-tai)).

---

<a id="kien-truc"></a>
## 3. Kiến trúc

```
Người dân (không đăng nhập)                Cán bộ (JWT + RBAC theo địa bàn)
        │                                          │
        └──── [Caddy HTTPS — chỉ khi chạy thật] ───┘
                          │
               frontend (nginx) ── React 18 + Vite + Tailwind, react-leaflet, Recharts (mỗi trang một chunk)
                          │  tệp tĩnh nén sẵn (gzip_static) · cache 10 s API công khai (trả bản cũ khi backend lỗi)
                          │  ghi đè X-Forwarded-For = 1 IP · log không chứa query string
                          │  /api/v1/public/*   /api/v1/*   /ws
backend × N (RUN_MODE=api, gunicorn × API_WORKERS, FastAPI async)
   ├── ProxyHeaders (tin TRUSTED_PROXIES) → CORS → RateLimit (Redis) → router
   ├── WebSocket hub ── nhận sự kiện qua Redis pub/sub "pctt:events" (mọi tiến trình đều phát được)
   └── Casbin enforcer ── đồng bộ chính sách giữa tiến trình qua Redis "pctt:casbin"
worker × 1 (RUN_MODE=worker: python -m app.worker)
   ├── simulator (chỉ khi SIMULATOR=true) · runner đồng bộ Open-Meteo / OpenWeather · phát hiện mất tín hiệu
   └── cầu nối MQTT (khi có MQTT_URL)
migrate (chạy thật: 1 lần mỗi lần triển khai) ── alembic upgrade head + seed
db       PostgreSQL 16 + PostGIS + TimescaleDB (timescale/timescaledb-ha:pg16)
redis    giới hạn tần suất · cache · pub/sub sự kiện & chính sách
minio    ảnh phản ánh (bucket riêng tư)          mqtt  Mosquitto (thiết bị IoT)
mailpit  SMTP thử nghiệm (chỉ dev)               backup  pg_dump + ảnh hằng ngày (chỉ chạy thật)
```

- **Khởi động nhiều tiến trình an toàn**: bootstrap vai trò RBAC, nguồn dữ liệu, bucket MinIO chạy trong **advisory
  lock** của Postgres. Trạng thái dùng chung giữa tiến trình nằm ở CSDL hoặc Redis, không nằm trong biến của tiến trình.
- **Kiểm tra cấu hình**: `APP_ENV=staging|production` → backend, worker, seed **dừng khởi động** nếu còn khoá / mật khẩu
  mặc định (`backend/app/preflight.py`).
- **Bộ lọc địa phương**: frontend chỉ gửi `admin_codes`; backend hợp nhất ranh giới xã và lọc bằng `ST_Intersects`.
- **Chịu tải** (đo ở [12.2](#kiem-thu-tai)):
  - Người dân: tệp tĩnh nén sẵn; cổng công khai chỉ tải ~220 KB (gzip) lần đầu; API công khai cache 2 tầng (nginx 10 s +
    Redis); "Tôi đang ở đâu?" làm tròn toạ độ ~11 m và cache.
  - Cán bộ: truy vấn tổng hợp của dashboard / bản đồ dùng chung giữa người cùng phạm vi (`cached_view`). Khoá gồm phiên
    bản dữ liệu (tăng khi có sự kiện nghiệp vụ: SOS, điều động, vùng nguy hiểm, cảnh báo, kho…) và khung 5 giây: sự kiện
    nghiệp vụ hiện ngay, số đo IoT / GPS trễ tối đa 5 giây (không làm cache vô dụng lúc bão). N màn hình cùng tải lại chỉ
    tính 1 lần (gộp yêu cầu trùng trong và giữa các tiến trình).
  - Xử lý ảnh chạy trong thread, không chặn các yêu cầu khác của tiến trình.
- **CSDL**: 5 schema nghiệp vụ `spatial_admin`, `resources`, `operations`, `iot_telemetry` (hypertable
  `sensor_readings`), `communications`, cộng `integrations`, `community` (phản ánh). Cấu trúc: `backend/alembic/sql/`.

| Môi trường | Phát triển / trình diễn | Triển khai thật |
|---|---|---|
| Tệp compose | `docker-compose.yml` | `docker-compose.prod.yml` (project `caobang-pctt-prod`) |
| Cấu hình | `.env` (từ `.env.example`) | `.env.production` (từ `.env.production.example`) |
| `APP_ENV` | `development` | `production` |
| Dữ liệu | `DEMO_MODE=true`: dữ liệu mẫu + tài khoản demo | dữ liệu nền + Superadmin |
| Cổng mở | 8080, 8000, 5433, 9001, 8025, 1883 | chỉ 80/443 (Caddy), 8883 (MQTT TLS nếu dùng) |

**Cấu trúc thư mục**

```
backend/            API + worker (Python, FastAPI) — app/ (api/v1, rbac, services, integrations, infra, ws), alembic/,
                    seed/, tests/ (kiểm thử đơn vị), Dockerfile
frontend/           giao diện (React, Vite) — src/ (pages, components, api, rbac, app), nginx.conf + nginx/ (snippet),
                    scripts/compress.mjs (nén sẵn khi build), Dockerfile
tests/e2e/          kiểm thử API qua HTTP (Node) — cần stack dev chạy với DEMO_MODE=true
tests/load/         kiểm thử tải (k6)
scripts/maintenance/  script bảo trì CSDL máy dev (có chặn production)
deploy/             Caddyfile, backup.sh (chạy thật)
mqtt/  db/init/     cấu hình Mosquitto (dev + thật); extension PostgreSQL khi khởi tạo
docker-compose.yml  dev / trình diễn / CI     docker-compose.prod.yml  chạy thật
.env.example        mẫu dev                    .env.production.example  mẫu chạy thật
README.md           tài liệu duy nhất          CLAUDE.md                hướng dẫn cho lập trình viên / AI
```

---

<a id="chay-thu"></a>
## 4. Chạy thử trên máy

### 4.1. Cài phần mềm

| Phần mềm | Bắt buộc? | Ghi chú |
|---|---|---|
| **Docker Desktop** (https://www.docker.com/products/docker-desktop/) | Có | Windows cần WSL 2. Máy ≥ 8 GB RAM, trống ≥ 6 GB ổ đĩa. Mở Docker Desktop và chờ "Engine running" |
| **Git** (https://git-scm.com/downloads) | Có | |
| **Node.js 20+** (https://nodejs.org/) | Khi sửa giao diện / chạy kiểm thử API | |

### 4.2. Tải mã nguồn & chạy

```bash
git clone https://github.com/hoang-hg/caobang-pctt.git
cd caobang-pctt
cp .env.example .env            # PowerShell: Copy-Item .env.example .env
docker compose up -d --build    # lần đầu 5–10 phút (tải image CSDL ~1 GB)
docker compose ps               # các dịch vụ "Up" / "healthy"
docker compose logs -f backend  # thấy "[seed] Hoàn tất" và "Application startup complete" là xong
```

`.env.example` đặt `DEMO_MODE=true`, `SIMULATOR=true`: dữ liệu mẫu, tài khoản demo và bộ mô phỏng (số đo cảm biến mỗi
4 giây, SOS mới ~3 phút/lần, lực lượng di chuyển sau khi điều động). `DEMO_MODE` chỉ có tác dụng khi CSDL còn trống.

Sửa giao diện (thấy thay đổi ngay):

```bash
docker compose up -d --build db backend worker
cd frontend && npm install && npm run dev      # http://localhost:5173, proxy /api & /ws → localhost:8000
```

### 4.3. Địa chỉ

| Địa chỉ | Nội dung |
|---|---|
| **http://localhost:8080** | Cổng công khai; **Đăng nhập** (góc phải) để vào hệ thống điều hành |
| http://localhost:5173 | Giao diện chế độ phát triển |
| http://localhost:8000/docs | Tài liệu API (Swagger) — chỉ bật ở development |
| http://localhost:8000/health | Trạng thái CSDL, Redis, kho ảnh |
| http://localhost:8025 | Mailpit — xem email "Quên mật khẩu" |
| http://localhost:9001 | MinIO Console (`pctt_minio` / `pctt_minio_dev_password`) |
| `localhost:1883` | Broker MQTT (dev, cho phép ẩn danh) |
| `localhost:5433` | PostgreSQL (`pctt` / `pctt_dev_password`, db `caobang_pctt`) |

### 4.4. Tài khoản demo (chỉ có khi `DEMO_MODE=true`)

Mật khẩu công khai trong mã nguồn (`backend/app/seed_data.py`) — **bị cấm ở production**.

| Tài khoản | Mật khẩu | Vai trò | Phạm vi | PIN |
|---|---|---|---|---|
| `admin` | `admin123` | Super admin | Toàn tỉnh | `0000` |
| `admin.tinh` | `admintinh123` | Admin tỉnh | Toàn tỉnh | – |
| `admin.coba` | `admincoba123` | Admin xã | Xã Cô Ba | – |
| `admin.cathan` | `admincathan123` | Admin xã | Xã Ca Thành | – |
| `admin.thucphan` | `adminthucphan123` | Admin phường | Phường Thục Phán | – |
| `chihuy` | `chihuy123` | Lãnh đạo BCH — phê duyệt (Checker) | Toàn tỉnh | `2468` |
| `trucban` | `trucban123` | Trực ban — soạn lệnh (Maker) | Toàn tỉnh | – |
| `chihuy.baolac` | `baolac123` | Chỉ huy cụm | Cụm Bảo Lạc (8 xã) | `1357` |
| `canbo.coba` | `coba123` | Cán bộ PCTT xã | Xã Cô Ba | – |
| `thukho` | `thukho123` | Thủ kho | Toàn tỉnh | – |
| `xem` | `xem123` | Quan sát (chỉ xem) | Toàn tỉnh | – |

Dùng thử: cổng công khai → **Tôi đang ở đâu?**, **Gửi phản ánh** · đăng nhập `trucban` soạn lệnh cảnh báo → đăng nhập
`chihuy` phê duyệt bằng PIN · `admin.coba` duyệt phản ánh vừa gửi · bản đồ: kéo đội cứu hộ thả vào điểm SOS ·
cứu hộ: dán tin nhắn cầu cứu → **Bóc tách thông tin** · menu tên người dùng → Đổi mật khẩu; "Quên mật khẩu?" → Mailpit.

### 4.5. Lệnh thường dùng

```bash
docker compose logs -f backend worker                  # log API và tiến trình nền
docker compose up -d --build                           # chạy lại sau khi sửa code
docker compose exec backend python -m app.seed --reset # xoá dữ liệu nghiệp vụ, nạp lại (bị chặn ở production)
node scripts/maintenance/clean-simulated-data.mjs --yes  # xoá SOS/phản ánh/cảnh báo/số đo mô phỏng, giữ tài khoản mẫu (chỉ dev)
docker compose restart backend worker
docker compose down                                    # tắt (giữ dữ liệu) · down -v: XOÁ dữ liệu CSDL
docker compose exec redis sh -c "redis-cli --scan --pattern 'rl:*' | xargs -r redis-cli del"   # mở khoá 429 khi thử nghiệm
```

### 4.6. Lỗi thường gặp

| Hiện tượng | Cách xử lý |
|---|---|
| `Cannot connect to the Docker daemon` | Mở Docker Desktop, chờ "Engine running" |
| `port is already allocated` (8080, 8000, 5433) | Tắt chương trình đang dùng cổng, hoặc đổi `POSTGRES_PORT` / cổng trong `docker-compose.yml` |
| **502 Bad Gateway** ngay sau khi chạy | Backend đang migrate / seed → chờ 20–30 giây |
| `pip install … did not complete` khi build | Mạng chập chờn → chạy lại `docker compose up -d --build` |
| "Mất kết nối" góc phải | Backend dừng → `docker compose ps`, `docker compose restart backend` |
| Bản đồ trắng | Máy không có Internet / mạng chặn máy chủ bản đồ → đổi nền bản đồ hoặc kiểm tra mạng |
| Không thấy nút / "Không có quyền" | Tài khoản không có quyền tại địa bàn đó — xem [mục 8](#phan-quyen) |
| Bị đăng xuất ("quyền đã thay đổi") | Quản trị viên vừa đổi quyền / khoá tài khoản → đăng nhập lại |
| **429** / "Đăng nhập sai quá nhiều lần" | Giới hạn tần suất → chờ, hoặc xoá khoá `rl:*` / `loginfail:*` trong Redis (lệnh ở 4.5) |
| Đăng nhập tài khoản demo báo sai | CSDL được tạo với `DEMO_MODE=false` → đặt `true` rồi `python -m app.seed --reset` |
| Không nghe âm báo SOS | Trình duyệt chặn âm thanh khi chưa tương tác → click vào trang một lần |

---

<a id="cau-hinh"></a>
## 5. Cấu hình (.env)

Mọi biến của backend khai báo ở `backend/app/config.py`. Tệp mẫu: `.env.example` (máy dev), `.env.production.example`
(chạy thật). Cột **Chạy thật**: **bắt buộc** — thiếu thì `docker compose` hoặc backend dừng; *khuyến nghị*; tuỳ chọn; ~~cấm~~.

**Môi trường & dữ liệu**

| Biến | Mặc định dev | Chạy thật | Ý nghĩa |
|---|---|---|---|
| `APP_ENV` | `development` | `production` (compose ép) | `staging` / `production` bật kiểm tra cấu hình |
| `DEMO_MODE` | `true` | ~~true~~ | Seed dữ liệu mẫu + tài khoản demo |
| `SIMULATOR` | `true` | ~~true~~ | Bộ mô phỏng số đo, GPS, SOS, tiến độ phát tin |
| `RUN_MODE` | theo service | theo service | `api` / `worker` / `all` |

**Tài khoản quản trị tổng** (chỉ dùng để **tạo** tài khoản lần đầu; sau đó đổi trong giao diện)

| Biến | Mặc định dev | Chạy thật | Ý nghĩa |
|---|---|---|---|
| `SUPERADMIN_USERNAME` / `_FULL_NAME` | `admin` / `Quản trị hệ thống` | tuỳ chọn | |
| `SUPERADMIN_EMAIL` | `admin@caobang-pctt.local` | **bắt buộc** | Email thật (quên mật khẩu) |
| `SUPERADMIN_PASSWORD` | `admin123` | **bắt buộc** | ≥ 12 ký tự, có chữ và số |
| `SUPERADMIN_PIN` | `0000` | **bắt buộc** | Mã ký duyệt cảnh báo, ≥ 6 chữ số, không lặp / liên tiếp |
| `SUPERADMIN_ROLE` / `_DOMAIN` | `super_admin` / `*` | giữ nguyên | |

**Bí mật & CSDL**

| Biến | Mặc định dev | Chạy thật | Ý nghĩa |
|---|---|---|---|
| `JWT_SECRET` | chuỗi mẫu | **bắt buộc** ≥ 32 ký tự ngẫu nhiên | Ký phiên đăng nhập |
| `SECRET_KEY` | trống (dẫn xuất từ JWT_SECRET) | **bắt buộc**, khác JWT_SECRET | Mã hoá API key đối tác và khoá xác thực 2 lớp trong CSDL — đổi khoá = nhập lại key, mọi người cài lại 2 lớp |
| `JWT_EXPIRE_HOURS` | `12` | tuỳ chọn | Thời hạn phiên |
| `TOTP_REQUIRED_ROLES` | trống | `super_admin,truong_ban,admin_tinh,chi_huy_cum` | Vai trò bắt buộc xác thực 2 lớp ([11.1](#xac-thuc-2-lop)); trống → cảnh báo khi khởi động |
| `TOTP_ISSUER` | `BCH PCTT Cao Bằng` | tuỳ chọn | Tên hiện trong ứng dụng xác thực |
| `POSTGRES_USER` / `_DB` | `pctt` / `caobang_pctt` | tuỳ chọn | |
| `POSTGRES_PASSWORD` | `pctt_dev_password` | **bắt buộc** (dùng hex, ghép vào URL) | |
| `POSTGRES_PORT` | `5433` | — | Cổng mở ra máy (chỉ dev) |
| `POSTGRES_MAX_CONNECTIONS` | — | `200` | |
| `POSTGRES_SHARED_BUFFERS` / `_EFFECTIVE_CACHE_SIZE` / `_WORK_MEM` / `_MAINTENANCE_WORK_MEM` | — | `4GB` / `12GB` / `16MB` / `512MB` | Bộ nhớ Postgres cho máy 16 GB (≈ 25% / 75% RAM) |
| `DB_POOL_SIZE` / `DB_MAX_OVERFLOW` | `5` / `5` | tuỳ chọn | Kết nối CSDL mỗi tiến trình ([10.2](#trien-khai-may-chu)); đặt lớn → "too many clients" khi tăng tải |
| `API_WORKERS` | `2` | `4` | Số tiến trình API |
| `REDIS_MAXMEMORY` | — | `512mb` | |
| `DB_STATEMENT_TIMEOUT_MS` | `30000` | `30000` | Câu lệnh SQL chạy quá thời gian này ở tiến trình API bị huỷ (worker, migrate không áp dụng; nhập dữ liệu tự nới 10 phút) |
| `DB_MEM_LIMIT` / `BACKEND_MEM_LIMIT` | — | `12g` / `3g` | Giới hạn RAM container CSDL / mỗi bản backend ([10.2](#trien-khai-may-chu)) |
| `MINIO_ROOT_USER` / `_PASSWORD` | `pctt_minio` / `pctt_minio_dev_password` | **bắt buộc** mật khẩu | Kho ảnh |

**Mạng & truy cập**

| Biến | Mặc định dev | Chạy thật | Ý nghĩa |
|---|---|---|---|
| `DOMAIN` | — | **bắt buộc** | Tên miền công khai (HTTPS) |
| `ACME_EMAIL` | — | **bắt buộc** với profile `caddy` | Email chứng chỉ Let's Encrypt |
| `PUBLIC_BASE_URL` | `http://localhost:8080` | `https://$DOMAIN` (tự suy ra) | Link email, link chia sẻ |
| `CORS_ORIGINS` | `http://localhost:5173,…8080` | `https://$DOMAIN` (tự suy ra) | |
| `TRUSTED_PROXIES` | dải nội bộ | giữ nguyên, **không bao giờ** `*` | Proxy được tin để lấy IP người dùng |
| `RATE_LIMIT_ENABLED` | `true` | luôn `true` (compose ép) | |
| `FRONTEND_BIND` | — | `127.0.0.1:8080` | Nơi nginx nghe |
| `NGINX_REAL_IP_CONF` | — | tuỳ chọn | Tệp `real-ip.conf` riêng (Cloudflare…) |
| `BACKEND_IMAGE` / `FRONTEND_IMAGE` | — | tuỳ chọn | Image dựng sẵn từ CI |
| `API_DOCS` | tự động | tuỳ chọn | Bật Swagger ngoài development |

**Nguồn dữ liệu & tích hợp** (chi tiết: [mục 6](#ket-noi-du-lieu))

| Biến | Mặc định | Chạy thật | Ý nghĩa |
|---|---|---|---|
| `OPEN_METEO_ENABLED` | `true` | `true` | Dự báo tổ hợp ECMWF/GFS |
| `OPEN_METEO_API_KEY` | trống | *khuyến nghị* | Gói thương mại Open-Meteo |
| `OPENWEATHER_API_KEY` | trống | tuỳ chọn | OpenWeather One Call 3.0 (đặt → tự bật nguồn) |
| `MQTT_URL` / `MQTT_TOPIC` | `mqtt://mqtt:1883` / `caobang/pctt/+/readings` | trống = tắt | Cầu nối IoT MQTT |
| `INTAKE_API_KEY` | trống (tắt) | tuỳ chọn, ≥ 32 ký tự | Cổng tiếp nhận SOS tự động |
| `TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET` | trống | *khuyến nghị* (cả hai) | Chống bot form phản ánh |
| `LLM_API_URL` / `_KEY` / `_MODEL` | trống | để trống ([11](#bao-mat)) | Bóc tách tin SOS bằng LLM |
| `SMTP_HOST` / `_PORT` / `_USER` / `_PASSWORD` / `_STARTTLS` / `_FROM` | Mailpit | **bắt buộc** `SMTP_HOST` | Email quên mật khẩu, cảnh báo sự cố |

**Cảnh báo sự cố vận hành** ([10.6](#giam-sat))

| Biến | Mặc định | Chạy thật | Ý nghĩa |
|---|---|---|---|
| `OPS_ALERT_EMAILS` | trống = `SUPERADMIN_EMAIL` | *khuyến nghị* (nhóm vận hành) | Người nhận email sự cố, cách nhau dấu phẩy |
| `OPS_ALERT_WEBHOOK_URL` | trống | *khuyến nghị* | Thêm kênh chat: POST `{"text": …}` (Slack, Mattermost, Google Chat, Telegram) |
| `OPS_ALERT_REPEAT_MIN` | `180` | tuỳ chọn | Còn lỗi → nhắc lại sau bấy nhiêu phút |
| `OPS_DISK_WARN_PCT` | `85` | tuỳ chọn | Báo khi ổ đĩa dữ liệu Docker / thư mục sao lưu dùng từ mức này |
| `OPS_API_URL` | theo service | compose đặt cho worker | Worker gọi kiểm tra API (`http://backend:8000/health`) |

**Sao lưu** (chỉ `docker-compose.prod.yml`): `BACKUP_DIR` (`./backups`), `BACKUP_KEEP_DAYS` (14), `BACKUP_AT` (giờ UTC, mặc định `19:30` = 02:30 giờ VN). Chép ra ngoài máy chủ: `BACKUP_REMOTE`, `OFFSITE_*` ([10.5](#sao-luu)) — trống thì backend cảnh báo khi khởi động.

Thêm biến mới: `config.py` + `docker-compose.yml` + `docker-compose.prod.yml` + hai tệp mẫu + bảng này.

---

<a id="ket-noi-du-lieu"></a>
## 6. Kết nối dữ liệu thật & API key

### 6.1. Danh mục kết nối

Hiện chỉ **Open-Meteo** và **OpenWeather** là nguồn kéo có code sẵn và dùng API key. Các nguồn trong nước và kênh
cảnh báo **chưa có code kết nối** — chưa có key nào dùng được cho tới khi ký thoả thuận và viết bộ nối.

| Kết nối | Dùng để | Code | Cần gì | Đặt ở đâu |
|---|---|---|---|---|
| Open-Meteo (ECMWF IFS + NOAA GEFS) | Dự báo mưa 72 giờ theo 56 xã | ✅ chạy, không key | Gói thương mại: https://open-meteo.com/en/pricing | `OPEN_METEO_API_KEY` hoặc giao diện |
| OpenWeatherMap One Call 3.0 | Dự báo mưa bổ sung tại xã có trạm | ✅ có, tắt tới khi có key | Đăng ký "One Call by Call": https://openweathermap.org/api/one-call-3 | `OPENWEATHER_API_KEY` hoặc giao diện |
| Trạm IoT qua HTTP | Số đo mưa, mực nước, nghiêng, độ ẩm | ✅ | Khoá riêng từng thiết bị (`cbk_…`) | Sinh ở trang **Nguồn dữ liệu → Thiết bị IoT** |
| Nền tảng IoT hãng (HTTP batch) | Nhiều thiết bị một lần | ✅ | Token nguồn `IOT_HTTP` (`cbs_…`) | Hiện / xoay vòng ở trang Nguồn dữ liệu |
| LoRaWAN (ChirpStack, TTN) | Webhook số đo | ✅ | Token nguồn `LORAWAN` | Trang Nguồn dữ liệu |
| Broker MQTT | Thiết bị gửi qua MQTT | ✅ | Tài khoản broker cho worker + từng thiết bị, chứng chỉ TLS | `MQTT_URL`, `mqtt/passwd`, `mqtt/acl` ([6.5](#mqtt)) |
| Webhook SOS (Zalo OA, app) | Tin cầu cứu → phiếu SOS | ✅ cổng, ⛔ bên gửi | `INTAKE_API_KEY` giao cho bên gửi | `.env` ([6.6](#intake)) |
| Đài KTTV Cao Bằng / Cục KTTV | Mực nước, bản tin | ⛔ | Thoả thuận chia sẻ dữ liệu | Đẩy vào `/ingest/batch` hoặc viết bộ nối ([6.7](#nguon-trong-nuoc)) |
| VRain, VNDMS, dữ liệu vận hành hồ chứa, cảnh báo sạt lở theo xã | Đo mưa, giám sát thiên tai, xả lũ | ⛔ | Thoả thuận | như trên |
| SMS Brandname, Cell Broadcast, Zalo ZNS/OA, tổng đài SIP | **Gửi cảnh báo cho dân** | ⛔ (chưa làm) | Hợp đồng nhà mạng / Zalo | Sẽ bổ sung biến khi tích hợp |
| Bản đồ nền tự lưu trữ (OSM, Protomaps) | Nền Địa lý, Ban đêm vùng Cao Bằng | ✅ không key | Chạy `deploy/fetch-basemap.sh` ([6.9](#ban-do-nen)) | `data/tiles/` |
| Bản đồ nền Google / CARTO | Zoom toàn quốc, Vệ tinh, Địa hình, ngoài vùng phủ | ⚠️ | Giấy phép / API key ([6.9](#ban-do-nen)) | Frontend `components/map/MapTools.jsx` |
| Radar mưa RainViewer | Lớp radar | ✅ không key | Tuân thủ điều khoản RainViewer | — |
| Cloudflare Turnstile | Chống bot form phản ánh | ✅ | Site key + secret: https://dash.cloudflare.com → Turnstile | `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET` |
| SMTP | Email quên mật khẩu | ✅ | Tài khoản máy chủ thư của tỉnh | `SMTP_*` |
| LLM (API tương thích OpenAI) | Bóc tách tin SOS | ✅ tuỳ chọn | Đánh giá dữ liệu cá nhân trước ([11](#bao-mat)) | `LLM_*` |

**API key trong `.env` hay trong giao diện?** Đặt `OPEN_METEO_API_KEY` / `OPENWEATHER_API_KEY` trong `.env` → mỗi lần
khởi động hệ thống ghi key đó vào CSDL (mã hoá bằng `SECRET_KEY`); `.env` là nguồn chính, key sửa ở giao diện sẽ bị ghi
đè (giao diện có ghi chú). Để trống → nhập và quản lý key ở trang **Nguồn dữ liệu & IoT → Cấu hình**. Key thiết bị IoT
và token nguồn đẩy luôn quản lý ở giao diện (sinh ngẫu nhiên, chỉ hiện một lần, xoay vòng được).

```
                ┌──────────── Nguồn KÉO (worker gọi theo chu kỳ) ─────────────┐
Open-Meteo ─────┤ ensemble ECMWF (51) + GEFS (31) → P10/P50/P90 theo 56 xã    │
OpenWeather ────┤ One Call 3.0 → mưa theo giờ tại xã có trạm                  │──► iot_telemetry.area_forecasts
                └──────────────────────────────────────────────────────────────┘
                ┌──────────── Nguồn ĐẨY (thiết bị / nền tảng gửi vào) ─────────┐
Thiết bị 4G ────┤ POST /api/v1/ingest/readings  (X-Device-Key)                 │
Nền tảng hãng ──┤ POST /api/v1/ingest/batch     (Bearer token IOT_HTTP)        │──► lõi tiếp nhận: kiểm tra
Broker MQTT ────┤ topic caobang/pctt/<mã thiết bị>/readings                    │    → sensor_readings → WebSocket
ChirpStack/TTN ─┤ POST /api/v1/ingest/lorawan   (Bearer token LORAWAN)         │    → cảnh báo tự động
                └──────────────────────────────────────────────────────────────┘
```

<a id="open-meteo"></a>
### 6.2. Open-Meteo (bật mặc định)

- Một lần gọi cho cả 56 xã (toạ độ tâm xã): `models=ecmwf_ifs025,gfs025`, `hourly=precipitation`, 72 giờ, cộng 1 lần gọi
  dự báo tất định ECMWF (nhiệt độ, gió giật). Chu kỳ 3 giờ.
- Mỗi giờ, mỗi xã: P10 / P50 / P90 / trung bình / xác suất mưa ≥ 5 mm/h cho `ECMWF_ENS`, `GFS_ENS`, `BLEND` (gộp 82
  thành phần) → `iot_telemetry.area_forecasts`. Nowcast 3 giờ của trạm mưa lấy P50 kết hợp của xã chứa trạm.
- **Kích hoạt từ dự báo**: xã có mưa 24 giờ tới (P50) ≥ `alert_24h_mm` (100 mm) → nháp "Chuẩn bị sơ tán" chờ duyệt
  (tối đa 1 lần / 12 giờ).
- Cấu hình JSON (trang Nguồn dữ liệu): `{"models": ["ecmwf_ifs025","gfs025"], "forecast_days": 3, "include_deterministic": true, "heavy_mm_h": 5.0, "alert_24h_mm": 100.0}`.
- **Giấy phép**: gói miễn phí chỉ cho mục đích phi thương mại. Có key → tự chuyển sang máy chủ `customer-*.open-meteo.com`.
- Xem: Dashboard → "Dự báo mưa 72 giờ theo xã"; Bản đồ → lớp "Mưa dự báo 24h theo xã";
  API `GET /api/v1/forecast/areas?hours=24&model=BLEND`, `/forecast/areas/{mã xã}`, `/forecast/models`.

### 6.3. OpenWeatherMap One Call 3.0

Tắt tới khi có key (1.000 lượt/ngày miễn phí). Mặc định chỉ gọi tại xã có trạm mưa (`targets: rain_stations`), mỗi giờ;
ghi vào `area_forecasts` model `OPENWEATHER`.

<a id="thiet-bi-iot"></a>
### 6.4. Thiết bị IoT: đăng ký & gửi số đo

Mỗi thiết bị gắn với **một trạm**. Giá trị lưu = giá trị gửi × `scale` + `offset_value` (VD thước nước báo cm so với mốc
180 m: scale 0,01, offset 180). Trạm nhận số đo thật đầu tiên chuyển `source = 'iot'` → bộ mô phỏng ngừng sinh cho trạm
đó; xoá hết thiết bị → trạm trở lại mô phỏng.

```bash
# HTTP, 1 thiết bị (gửi bù khi mất mạng: "readings":[{"value":3.1,"time":"…"}, …])
curl -X POST https://<máy chủ>/api/v1/ingest/readings -H "Content-Type: application/json" -H "X-Device-Key: cbk_..." \
  -d '{"device_id":"CB-RAIN-TIN-01","value":12.5,"time":"2026-09-26T08:00:00Z"}'
# HTTP batch (≤ 5.000 số đo / lần)
curl -X POST https://<máy chủ>/api/v1/ingest/batch -H "Authorization: Bearer cbs_..." -H "Content-Type: application/json" \
  -d '[{"device_id":"A","value":3.2},{"device_id":"B","value":181.4,"time":1790409600}]'
# MQTT: payload {"value": 0.42}, {"readings": [...]} hoặc số trần
mosquitto_pub -h <broker> -p 8883 --capath /etc/ssl/certs -u CB-TILT-KCC-01 -P <mật khẩu> -t caobang/pctt/CB-TILT-KCC-01/readings -m '{"value":0.42}'
```

LoRaWAN: ChirpStack v4 *Integrations → HTTP* hoặc The Things Network v3 *Webhooks*, URL `https://<máy chủ>/api/v1/ingest/lorawan`,
header `Authorization: Bearer cbs_...`; mã thiết bị = **DevEUI**, giá trị lấy từ trường `value_field` (VD `level_cm`).
`time`: ISO 8601 hoặc epoch (giây / mili-giây); trống = lúc nhận.

| Kiểm tra số đo | Quy tắc |
|---|---|
| Khoảng giá trị | Mưa 0–300 mm/h · Nghiêng ±90° · Độ ẩm 0–100 % · Mực nước BĐ I − 30 m … BĐ III + 30 m |
| Thời gian | Không ở tương lai quá 5 phút, không cũ quá 7 ngày |
| Trùng lặp | Bỏ số đo cùng trạm, cùng thời điểm |
| Mất tín hiệu | Quá 3 × chu kỳ dự kiến không có dữ liệu → thiết bị "mất tín hiệu", trạm `offline`, ghi nhật ký |

Số đo hợp lệ đi qua cùng luồng cảnh báo tự động với dữ liệu mô phỏng. Tab **Giám sát kết nối**: thiết bị trực tuyến /
mất tín hiệu, trạm dùng dữ liệu thật, số đo nhận / bị loại 24 giờ, lỗi đồng bộ, trạng thái MQTT, nhật ký tiếp nhận.

<a id="mqtt"></a>
### 6.5. MQTT khi chạy thật

`docker-compose.prod.yml`, profile `mqtt` (`mqtt/mosquitto.prod.conf`): không cho kết nối ẩn danh, mỗi thiết bị một tài
khoản chỉ được ghi topic của chính mình, thiết bị ngoài Internet bắt buộc TLS cổng **8883**; cổng 1883 chỉ trong mạng
docker cho worker. Dev (`mqtt/mosquitto.conf`) cho phép ẩn danh.

```bash
cp mqtt/acl.example mqtt/acl
docker run --rm -v "$PWD/mqtt:/m" eclipse-mosquitto:2 mosquitto_passwd -c -b /m/passwd pctt-worker "<mật khẩu worker>"
docker run --rm -v "$PWD/mqtt:/m" eclipse-mosquitto:2 mosquitto_passwd -b /m/passwd CB-TILT-KCC-01 "<mật khẩu thiết bị>"
mkdir -p mqtt/certs && cp /etc/letsencrypt/live/<tên miền broker>/{fullchain,privkey}.pem mqtt/certs/
# .env.production: MQTT_URL=mqtt://pctt-worker:<mật khẩu worker>@mqtt:1883 → thêm --profile mqtt khi up
```

Thêm / đổi mật khẩu thiết bị: sửa `mqtt/passwd` rồi `… restart mqtt`. `mqtt/passwd`, `mqtt/acl`, `mqtt/certs/` không đưa lên git.

<a id="intake"></a>
### 6.6. Tiếp nhận SOS tự động (webhook)

`POST /api/v1/sos/intake` cho Zalo OA / app / tổng đài chuyển tin cầu cứu thành phiếu SOS (nguồn `ZALO`, `APP`, `HOTLINE`).
**Tắt** mặc định; bật bằng `INTAKE_API_KEY`, bên gửi đặt header `X-Intake-Key`. Thiếu khoá → 503, sai khoá → 401.

```bash
curl -X POST https://<máy chủ>/api/v1/sos/intake -H "X-Intake-Key: $INTAKE_API_KEY" -H "Content-Type: application/json" \
  -d '{"source":"ZALO","raw_message":"Nhà ngập sâu, có 2 người già","reporter_phone":"09xx","lat":22.66,"lon":106.25}'
```

<a id="nguon-trong-nuoc"></a>
### 6.7. Nguồn trong nước (cần thoả thuận)

VRain, Đài KTTV Cao Bằng / Cục KTTV, VNDMS, dữ liệu vận hành hồ chứa, cảnh báo sạt lở theo xã (hiện chưa có API công khai).
Khi có thoả thuận: đối tác **đẩy** dữ liệu → cấp token nguồn và dùng `/ingest/batch`; đối tác cho **kéo** qua API → viết bộ nối
`backend/app/integrations/adapters/<tên>.py` có `run(source, api_key)` (mẫu `openweather.py`), đăng ký trong `ADAPTERS`
và `DEFAULT_SOURCES` của `runner.py`, thêm biến key vào `env_source_keys()` nếu muốn đặt key trong `.env`.

### 6.8. Kênh cảnh báo (chưa làm)

`backend/app/services/broadcast.py` hiện chỉ ước tính số người nhận và mô phỏng tiến độ. Khi tích hợp: mỗi kênh một bộ
gửi thật có báo cáo giao nhận từ nhà cung cấp, thay `advance_delivery` ngẫu nhiên; biến cấu hình kênh thêm theo [mục 5](#cau-hinh).

<a id="ban-do-nen"></a>
### 6.9. Bản đồ nền

**Bản đồ nền tự lưu trữ** (nền "Bản đồ Địa lý" và "Chế độ ban đêm"): tệp vector `data/tiles/caobang.pmtiles` (~160 MB,
dữ liệu OpenStreetMap theo sơ đồ Protomaps) phủ Cao Bằng, các tỉnh giáp ranh và Quảng Tây, zoom tới 15 (đường thôn, tên
xóm). nginx phục vụ thẳng tệp này tại `/tiles/` (trình duyệt đọc từng ô bằng HTTP Range, không cần máy chủ tile riêng);
trình duyệt tự vẽ bằng `protomaps-leaflet`, nhãn tiếng Việt. Khung nhìn trong vùng phủ **không gọi dịch vụ ngoài nào** →
vẫn có bản đồ khi đứt cáp quang quốc tế, và không vướng điều khoản tải tile trực tiếp của Google.

```bash
sh deploy/fetch-basemap.sh      # cần Internet + Docker; ~1 phút. Chạy lại mỗi quý để cập nhật đường, địa danh
```

Tải xong là dùng ngay, không cần khởi động lại (thư mục `data/tiles` gắn vào nginx ở cả hai tệp compose). Vùng khác:
`BBOX=<tây,nam,đông,bắc>`; bản cố định: `BUILD=<ngày>.pmtiles` (danh sách: https://maps.protomaps.com/builds).

Khi nào vẫn dùng nền ngoài (`components/map/MapTools.jsx`, `BASEMAPS`):

| Trường hợp | Nền hiển thị |
|---|---|
| Zoom ≤ 6 (nhìn toàn quốc, Biển Đông) | Google Maps tiếng Việt, thể hiện đúng **Hoàng Sa, Trường Sa**. Ô zoom thấp của tệp OSM phủ cả Biển Đông nên không được hiện |
| Khung nhìn vượt ra ngoài vùng phủ của tệp | Google (Ban đêm: CARTO) vẽ bên dưới phần ngoài vùng |
| Chưa chạy `fetch-basemap.sh` (máy dev) | Google / CARTO như trước |
| Nền "Vệ tinh", "Địa hình" | Luôn là Google |

Ghi công OpenStreetMap / Protomaps hiện ở góc bản đồ (bắt buộc theo giấy phép ODbL). **Nền ngoài vẫn cần giấy phép khi
dùng thật**: điều khoản Google Maps Platform không cho tải tile trực tiếp không qua API có key (có thể bị chặn bất cứ lúc
nào); CARTO miễn phí có giới hạn sử dụng. Muốn thay: dịch vụ có hợp đồng / API key (Google Map Tiles API, bản đồ nền của
cơ quan nhà nước) — sửa `url` trong `BASEMAPS`, bảo đảm thể hiện đúng chủ quyền lãnh thổ Việt Nam.

---

<a id="quy-trinh"></a>
## 7. Quy trình nghiệp vụ (SOP)

Quy trình phối hợp **Người dân — Cán bộ tác chiến — Lãnh đạo chỉ huy**, phục vụ huấn luyện, diễn tập và vận hành.

### 7.1. Tiếp nhận, phân loại & điều phối cứu hộ (SOS)

```mermaid
sequenceDiagram
    autonumber
    actor Citizen as Người dân / Cảm biến
    participant Intake as Tiếp nhận & bóc tách
    participant Dispatcher as Trực ban tác chiến
    participant Forces as Lực lượng cứu hộ
    Citizen->>Intake: Tin nhắn / cuộc gọi / phản ánh / cảm biến vượt ngưỡng
    Intake->>Intake: Bóc tách địa danh, số người, nhóm yếu thế
    Intake->>Dispatcher: Phiếu SOS-xxxx (moi)
    Note over Dispatcher: SLA: Cấp 1 < 3′, Cấp 2 < 15′, Cấp 3 < 60′
    Dispatcher->>Dispatcher: Khớp lực lượng gần nhất theo kỹ năng + lộ trình tránh vùng nguy hiểm
    Dispatcher->>Forces: Lệnh điều động (dieu_phoi → thuc_thi)
    Forces->>Dispatcher: Báo cáo đưa người về nơi an toàn
    Dispatcher->>Dispatcher: hoan_thanh (lưu nhật ký pháp lý)
```

1. **Tiếp nhận**: cổng công khai (phản ánh chuyển SOS), hotline, cán bộ nhập, cảm biến (`SENSOR`), webhook (khi bật).
   Bộ luật bóc tách địa danh xã/thôn, số người mắc kẹt, nhóm yếu thế (trẻ em, người cao tuổi, phụ nữ mang thai).
2. **Phân cấp & SLA**: **Cấp 1** nguy hiểm tính mạng tức thì (vùi lấp, lũ cuốn, mắc kẹt trên mái) — phản hồi < 3 phút;
   **Cấp 2** nước dâng, cô lập, có người già / trẻ nhỏ — < 15 phút; **Cấp 3** ngập cục bộ, thiếu lương thực — < 60 phút.
3. **Khớp lực lượng & lộ trình**: lọc đơn vị ứng trực gần nhất (dân quân, quân đội, công an PCCC & CNCH), cảnh báo nếu
   lộ trình buộc đi qua vùng nguy hiểm đang hiệu lực.
4. **Thực thi & hoàn tất**: theo dõi vị trí lực lượng trên bản đồ; đưa người về điểm sơ tán rồi đánh dấu **Đã cứu an toàn**.

### 7.2. Phản ánh hiện trường & tra cứu tiến độ

```mermaid
graph TD
    A[Người dân mở cổng công khai] -->|Ảnh + vị trí + mô tả| B[Phản ánh PA-xxxx: cho_duyet]
    B --> D{Cán bộ đúng địa bàn kiểm tra tại /phan-anh}
    D -->|Thông tin chính xác| E[Duyệt: da_duyet + ghi chú công khai]
    D -->|Sai, trùng, tin giả| F[Từ chối: tu_choi + lý do nội bộ]
    D -->|Có người đang gặp nguy hiểm| G[Chuyển thành phiếu SOS]
    E --> H[Hiện trên bản đồ công khai] --> I[Đã xử lý: da_xu_ly]
```

- Ảnh bị xoá EXIF/GPS, họ tên và SĐT người gửi chỉ cán bộ có `report.view` tại địa bàn đó xem được, IP chỉ lưu dạng băm.
- Khi duyệt, cán bộ ghi chú kết quả (VD "Đã cử dân quân cắm biển cảnh báo") để người dân yên tâm.
- **Tra cứu tiến độ** (`/cong-khai`, không cần đăng nhập): nhập mã `SOS-xxxx` / `PA-xxxx` **và** SĐT đã dùng khi gửi.
  Không tìm gần đúng, không tìm chỉ bằng SĐT; sai SĐT trả kết quả như "không tồn tại"; phản ánh ẩn danh chỉ cần mã nhưng
  chỉ xem mốc tiến độ; SOS do cán bộ tạo (không có SĐT người báo) không tra được. Không bao giờ trả ghi chú nội bộ,
  toạ độ, vị trí lực lượng; SĐT hiện dạng che `099***666`. 4 mốc: **Đã tiếp nhận → Đã điều động → Đang trên đường đến
  (ETA, tự làm mới 15 giây) → Đã cứu an toàn / Khắc phục xong** — giảm cuộc gọi dồn dập vào 112/114.

### 7.3. Soạn, duyệt & phát cảnh báo (Maker – Checker)

```mermaid
graph LR
    M[Trực ban: chọn mẫu + khoanh vùng] --> D[Lệnh: cho_duyet] --> AUD[Ước tính thuê bao & hộ dân trong vùng]
    D --> L[Lãnh đạo kiểm tra + nhập PIN] --> BC[Phát đa kênh: SMS · Cell Broadcast · Zalo OA · Push · Loa]
```

> ⚠️ Bước soạn, duyệt bằng PIN, nhật ký chạy thật; bước **phát chưa gửi tin thật** ([2.1](#hien-trang)). Không dùng hệ
> thống làm kênh cảnh báo chính thức cho tới khi tích hợp xong. Khi vận hành thật (`SIMULATOR=false`), lệnh đã duyệt
> được **công bố ngay trên cổng công khai và bản nhẹ**, trạng thái "Đã công bố trên cổng"; bảng giao nhận ghi rõ các kênh
> chưa tích hợp, tin **chưa** tới điện thoại người dân — vẫn phát qua kênh chính thức (loa, nhà mạng) theo quy trình hiện hành.

1. **Không tự duyệt**: người soạn không phê duyệt được lệnh của chính mình (nguyên tắc 4 mắt).
2. **Ký duyệt bằng PIN** cá nhân (lưu dạng băm PBKDF2-SHA256). Sai PIN 5 lần trong 15 phút → tạm khoá phê duyệt 15 phút
   (chống dò PIN khi phiên đăng nhập bị lộ); mỗi lần sai ghi nhật ký `broadcast.approve_failed`.
3. Người duyệt phải có quyền `alert.approve` trên **tất cả** xã nhận tin (chỉ huy cụm không duyệt được lệnh toàn tỉnh).
4. Phát theo ranh giới xã/phường hoặc đa giác khoanh trên bản đồ. Có vùng vẽ thì người soạn phải có quyền trên mọi xã
   vùng vẽ đi qua (không chỉ các xã tự chọn). Mỗi lệnh chỉ được duyệt 1 lần (bấm đúp / hai lãnh đạo cùng duyệt → 1 lần phát).

<a id="giam-sat-kttv"></a>
### 7.4. Giám sát khí tượng thuỷ văn, IoT & bản đồ tác chiến

- Trạm đo mưa, mực nước, cảm biến sạt lở gửi qua HTTP / MQTT / LoRaWAN; số đo dị thường bị loại ([6.4](#thiet-bi-iot)).
- Vượt BĐ I / II / III: trạm đổi màu vàng / cam / đỏ, vào danh sách "Cảm biến vượt ngưỡng"; cảm biến sạt lở vượt BĐ II
  tự khoanh vùng nguy cơ, tạo phiếu SOS nguồn cảm biến và nháp cảnh báo. Âm báo tại trung tâm khi có SOS cấp 1–2.
- Dự báo tổ hợp ECMWF + GEFS mỗi 3 giờ, mưa theo xã 24h / 72h (P10 – P50 – P90).
- Công cụ GIS: thanh thời gian (12 giờ qua, 24 giờ tới), đo khoảng cách, hồ đập xung yếu, sức chứa điểm sơ tán.
- **Hồ chứa**: chưa có nguồn số liệu vận hành tự động ([6](#ket-noi-du-lieu)). Hồ mới nhập danh mục hiện **"Chưa có số
  liệu vận hành"** (cổng công khai không khẳng định "chưa xả tràn" khi không có số liệu). Người có quyền
  `monitoring.update` (trực ban, quản trị tỉnh) bấm **Cập nhật vận hành** ở Dashboard → chuyên đề **Hồ chứa & Xả lũ**, nhập mực nước, số cửa xả đang
  mở, lưu lượng theo báo cáo của đơn vị quản lý hồ (`PATCH /api/v1/reservoirs/{mã}/operation`, ghi nhật ký thao tác) →
  cổng công khai và bản nhẹ cập nhật ngay, kèm thời điểm số liệu; số liệu cũ hơn 6 giờ gắn nhãn **"Số liệu cũ"**.

### 7.5. Kịch bản lũ & ngập lụt

```mermaid
graph TD
    A[Mực nước sông Bằng Giang / sông Gâm tăng] --> B{Cấp báo động}
    B -->|BĐ I| C[Thông báo hộ ven sông kê cao tài sản, neo đậu thuyền bè]
    B -->|BĐ II| D[Cấm đường trũng ven sông, sơ tán đối tượng yếu thế]
    B -->|BĐ III| E[Lệnh sơ tán toàn dân vùng ngập]
    E --> F[Điều xuồng, cano, phao tiếp cận hộ cô lập]
    E --> G[Phối hợp thuỷ điện thượng nguồn điều tiết xả lũ]
```

- **Lưu vực**: sông Bằng Giang qua nội thị Cao Bằng, Hoà An, Quảng Hoà — lũ lên nhanh, thoát chậm qua hẻm núi; sông Gâm
  qua Bảo Lạc, Bảo Lâm — dốc, biên độ lũ lớn, nước xiết.
- **Ngưỡng** (hiện là **minh hoạ**, cấu hình ở `monitoring_stations.alarm_thresholds`, phải thay bằng ngưỡng chính thức
  của Đài KTTV): BĐ I Cao Bằng 180,0 m · Bảo Lạc 212,0 m — trực 24/24, thông báo neo đậu, thu hoạch, di dời tài sản;
  BĐ II 181,0 m · 214,0 m — cấm đường ven sông, sơ tán người yếu thế; BĐ III 182,0 m · 216,0 m — sơ tán khẩn cấp toàn bộ
  vùng ngập, cấm phương tiện qua vùng ngập, kiểm soát hồ chứa thượng nguồn.
- **Phương tiện**: xuồng máy, cano của quân sự và công an PCCC & CNCH; không cho phương tiện thô sơ qua dòng xoáy; chốt
  chặn tại cầu ngầm tràn.

### 7.6. Kịch bản sạt lở & lũ quét

```mermaid
graph TD
    M[Mưa 24h > 100 mm hoặc độ ẩm đất ≥ BĐ II] --> N{Dấu hiệu rủi ro}
    N -->|Nứt taluy, cây nghiêng, nước ngầm đục| O[SƠ TÁN CHỦ ĐỘNG TRƯỚC KHI SẠT LỞ]
    N -->|Sạt lở chia cắt đèo| P[Phong toả: QL34, đèo Khau Liêu, đèo Mã Phục]
    O --> Q[Di dời khẩn cấp hộ dưới chân đồi]
    P --> R[Cảnh báo đỏ trên cổng công khai, chốt chặn 2 đầu đèo]
    Q --> T{Có người bị vùi lấp?}
    T -->|Có| U[Công binh, chó nghiệp vụ, flycam tầm nhiệt]
```

- **Chỉ số kích hoạt**: mưa 24 giờ > 100 mm (hoặc > 50 mm trong 3 giờ); độ ẩm đất BĐ I 38% · II 43% · III 48%; nghiêng
  taluy BĐ I 0,5° · II 1,0° · III 2,0° (giá trị minh hoạ). Vượt BĐ II → khoanh vùng nguy cơ 1 km, SOS nguồn cảm biến,
  nháp cảnh báo. Tuyến xung yếu: QL34 (Bảo Lạc – Bảo Lâm), đèo Khau Liêu, đèo Mã Phục, đường đèo Nguyên Bình, Hà Quảng,
  Thông Nông cũ — theo dõi ở tab **Sạt trượt & Đường đèo** của cổng công khai.
- **Nguyên tắc cốt tử**: phát hiện vết nứt sườn đồi, taluy nứt, cây nghiêng, nước ngầm phụt đục, tiếng nổ / rung trong
  núi → **di dời ngay**, kiên quyết cưỡng chế, không đợi bùn đất trôi xuống.
- **Phong toả**: đoạn đường giao vùng nguy hiểm đang hiệu lực tự hiện **bị chia cắt**, chỉ đường an toàn tự tránh; chốt
  thực địa do lực lượng chức năng làm. *Hạn chế*: chưa có chức năng để cán bộ tự khoanh / đóng một đoạn đường trên giao diện.
- **Thông tuyến**: chỉ cho máy xúc tiếp cận khi đã ngớt mưa và có người cảnh giới sạt lở thứ cấp.
- **Vùi lấp**: công binh quân sự, đội CNCH công an, dân quân tại chỗ; flycam dò nhiệt, máy dò rung, chó nghiệp vụ; trạm
  cấp cứu dã chiến tại chân điểm sạt.

---

<a id="phan-quyen"></a>
## 8. Phân quyền (RBAC)

Casbin `rbac_with_domains`: **quyền** (`obj.act`) gom thành **vai trò**, vai trò được gán cho tài khoản tại một **phạm vi**
(domain) là địa bàn phân cấp. Danh mục quyền là nguồn sự thật duy nhất ở `backend/app/rbac/permissions.py`.

```
*                          Toàn tỉnh Cao Bằng
├── BAOLAC/*               Cụm Bảo Lạc (địa bàn huyện cũ, 8 xã)
│   ├── BAOLAC/CB-COBA     Xã Cô Ba
│   └── BAOLAC/CB-HUNGDAO  Xã Hưng Đạo …
├── TPCAOBANG/*            Cụm TP. Cao Bằng (3 phường)
└── …                      10 cụm = 10 địa bàn huyện/thành phố trước 01/07/2025
```

Mỗi xã có cột `administrative_units.rbac_domain`. Gán ở `BAOLAC/*` khớp mọi `BAOLAC/CB-...`; gán ở `*` khớp mọi nơi.
Yêu cầu ở phạm vi toàn tỉnh **không** khớp phân quyền cấp cụm/xã — quyền "toàn tỉnh" chỉ có hiệu lực khi cấp ở `*`.

### 8.1. Danh mục quyền

| Quyền | Theo phạm vi | Mô tả |
|---|---|---|
| `monitoring.view` | ✓ | Dashboard, bản đồ, số liệu quan trắc |
| `monitoring.update` | toàn tỉnh | Cập nhật số liệu vận hành hồ chứa (mực nước, cửa xả, lưu lượng) theo báo cáo của đơn vị quản lý hồ |
| `sos.view` / `.create` / `.update` / `.resolve` | ✓ | Xem / tiếp nhận / chuyển trạng thái / xác nhận đã cứu |
| `dispatch.create` | ✓ | Điều động (theo xã của điểm SOS; được điều lực lượng ngoài xã) |
| `resource.view` | ✓ | Lực lượng, kho, phương tiện, điểm sơ tán |
| `inventory.issue` | ✓ | Ra lệnh xuất kho (theo xã của kho) |
| `vehicle.update` | ✓ | Đổi trạng thái phương tiện |
| `alert.view` / `.create` / `.approve` | ✓ | Xem / soạn (Maker) / duyệt (Checker) — phải có quyền trên **tất cả** xã nhận tin |
| `contact.view` | ✓ | Danh bạ (cấp tỉnh luôn hiện, cấp xã/thôn theo phạm vi) |
| `hotline.operate` | toàn tỉnh | Tổng đài, phân luồng cuộc gọi |
| `audit.view` | toàn tỉnh | Nhật ký pháp lý |
| `user.view` / `user.manage` | ✓ | Xem / tạo tài khoản con, cấp – thu hồi vai trò, đặt lại xác thực 2 lớp trong phạm vi |
| `report.view` / `report.moderate` | ✓ | Xem (kể cả SĐT người gửi) / duyệt – từ chối – chuyển SOS phản ánh |
| `integration.view` / `integration.manage` | toàn tỉnh | Xem / cấu hình nguồn dữ liệu, thiết bị IoT, cấp khoá |
| `data.import` | toàn tỉnh | Nhập dữ liệu chính thức từ tệp; phê duyệt / từ chối hồ sơ xã gửi ([2.4](#nhap-du-lieu)) |
| `data.submit` | ✓ | Gửi dữ liệu của xã mình chờ cấp tỉnh phê duyệt ([2.4](#nhap-du-lieu)) |
| `rbac.manage` | toàn tỉnh | Tạo / sửa / xoá định nghĩa vai trò |

### 8.2. Vai trò hệ thống (đồng bộ mỗi lần khởi động)

| Vai trò | Uỷ quyền được | Quyền chính |
|---|---|---|
| `super_admin` Quản trị hệ thống | ✗ | Tất cả |
| `truong_ban` Lãnh đạo BCH | ✗ | Tất cả trừ `rbac.manage` |
| `admin_tinh` Quản trị tỉnh | ✗ | Tài khoản, duyệt phản ánh, xử lý SOS và **điều động** toàn tỉnh; xem nguồn lực, cảnh báo, nhật ký, nguồn dữ liệu; **nhập dữ liệu chính thức**; cập nhật vận hành hồ chứa. Không soạn/duyệt cảnh báo, không sửa vai trò |
| `admin_xa` Quản trị xã/phường | ✓ | Tài khoản & duyệt phản ánh trong xã; tiếp nhận – cập nhật SOS của xã; gửi dữ liệu của xã chờ tỉnh duyệt |
| `chi_huy_cum` Chỉ huy cụm | ✓ | Điều hành, xuất kho, soạn + duyệt cảnh báo, tài khoản trong cụm; gửi dữ liệu các xã trong cụm chờ tỉnh duyệt |
| `truc_ban` Trực ban điều hành | ✓ | Tiếp nhận SOS, điều động, soạn cảnh báo (Maker), tổng đài; cập nhật vận hành hồ chứa (khi được giao toàn tỉnh) |
| `can_bo_xa` Cán bộ PCTT xã | ✓ | Tiếp nhận & cập nhật SOS, xem nguồn lực trong xã |
| `thu_kho` Thủ kho | ✓ | Xem & xuất kho |
| `quan_sat` Quan sát | ✓ | Chỉ xem |

Vai trò tuỳ chỉnh do `super_admin` tạo ở **Phân quyền → Vai trò & quyền**.

### 8.3. Uỷ quyền & chống leo thang

1. `super_admin` cấp được mọi vai trò ở mọi phạm vi.
2. Người khác chỉ cấp vai trò **uỷ quyền được** và không phải `super_admin` / `truong_ban` / `admin_tinh` → chuỗi quản trị
   **super admin → admin tỉnh → admin xã → cán bộ**.
3. Phạm vi cấp phải nằm trong phạm vi `user.manage` của người cấp.
4. **Không leo thang**: mọi quyền của vai trò được cấp, người cấp phải đang có ở phạm vi đó.
5. Không sửa / khoá tài khoản có vai trò ngoài phạm vi mình, không tự khoá mình.

Cấp / thu hồi quyền, đổi mật khẩu, khoá tài khoản → `users.token_version` tăng → phiên cũ bị từ chối (401). Mọi thao tác
ghi `communications.rbac_audit_log`. Giao diện chỉ ẩn/hiện; backend mới là nơi chặn thật. WebSocket chỉ đẩy sự kiện SOS /
nhật ký thuộc xã trong phạm vi người dùng.

**Tài khoản khi khởi động**: Superadmin tạo từ `SUPERADMIN_*` **một lần** khi chưa có; tài khoản demo chỉ tạo khi
`DEMO_MODE=true`. Vai trò chỉ được gán **lúc tạo** tài khoản; khởi động lại **không ghi đè** mật khẩu, trạng thái khoá,
vai trò đã chỉnh (gỡ hết vai trò của Superadmin ban đầu thì không bị gán lại). Vô hiệu hoá tài khoản: **khoá** tài khoản.

API quản trị `/api/v1/rbac`: `GET /permissions`, `/roles` (`user.view`) · `GET /scopes` · `POST/PATCH/DELETE /roles…`
(`rbac.manage`) · `GET/POST /users`, `PATCH /users/{id}`, `POST/DELETE /users/{id}/assignments`, `POST /users/{id}/mfa/reset` (`user.manage` + rào chắn
uỷ quyền) · `GET /audit` (`user.view`, lọc theo phạm vi).

---

<a id="cong-cong-khai"></a>
## 9. Cổng công khai & phản ánh của người dân

Người dân mở `/` không cần đăng nhập (đã đăng nhập thì `/` chuyển tới `/dashboard`; vẫn xem cổng ở `/cong-khai`):
băng trạng thái rủi ro toàn tỉnh · **Tôi đang ở đâu?** (GPS → xã, cảnh báo, điểm sơ tán gần nhất còn chỗ, chỉ đường an toàn) ·
bản đồ dự báo mưa, vùng nguy hiểm, đường chia cắt, điểm sơ tán, phản ánh đã xác minh · cảnh báo chính thức (chỉ lệnh
**đã duyệt và phát**, nút chia sẻ Zalo/Facebook, link `?canh-bao=MÃ`) · sông, hồ chứa, điểm đen sạt lở · đường dây nóng
(trực ban tỉnh + 112/113/114/115, không có SĐT cá nhân cán bộ) · gửi phản ánh · tra cứu tiến độ. Mạng yếu: bản nhẹ
`/ban-nhe`; mất mạng: mở lại bằng dữ liệu đã lưu ([9.4](#ban-nhe)).

### 9.1. API công khai `/api/v1/public/*`

Mọi `GET` công khai được nginx cache thêm **10 giây** và trả bản gần nhất khi backend lỗi (`X-Cache-Status`:
MISS / HIT / STALE) — lúc cao điểm, số yêu cầu vào backend gần như không tăng theo số người xem.

| Endpoint | Mô tả | Cache Redis |
|---|---|---|
| `GET /overview` | Mưa, sông, cảnh báo, SOS **chỉ đếm theo xã** | 30 s |
| `GET /map` | GeoJSON vùng nguy hiểm, đường chia cắt, trạm, điểm sơ tán (kèm số trực `hotline`) | 30 s |
| `GET /alerts`, `/alerts/{code}/share` | Cảnh báo đang / đã phát; trang chia sẻ Open Graph | 30 s / – |
| `GET /forecast/areas?hours=24\|72`, `/forecast/areas/{code}` | Dự báo mưa theo xã P10/P50/P90 | 5 phút |
| `GET /locate?lat&lon`, `/route?…` | Xã, cảnh báo, điểm sơ tán gần nhất; đường an toàn | – |
| `GET /reservoirs`, `/landslides` | Hồ chứa & xả lũ; điểm đen sạt lở & đường đèo | 20 s |
| `GET /hotlines` | Đường dây nóng | 1 giờ |
| `GET /lite?xa=` (nginx: `/ban-nhe`) | Trang bản nhẹ HTML < 50 KB ([9.4](#ban-nhe)) | 30 s, xoá khi phát cảnh báo |
| `GET /reports`, `/reports/{id}/photos/{idx}` | Phản ánh **đã duyệt** + ảnh | 30 s |
| `GET /report-categories`, `/config` | Loại sự việc; cấu hình công khai (khoá site Turnstile) | – |
| `GET /hamlets?xa=` | Xóm / tổ dân phố của 1 xã (người dân chọn khi gửi phản ánh) | 1 giờ, xoá khi nhập xóm |
| `POST /reports` | Gửi phản ánh (multipart, ≤ 3 ảnh × 8 MB; `hamlet` = mã xóm, tuỳ chọn) | – |
| `POST /track` `{code, phone}` | Tra cứu tiến độ phiếu (POST để SĐT không nằm trên URL / log) | – |

**Không bao giờ trả ra công khai**: vị trí, quân số lực lượng, kho, phương tiện; nội dung / toạ độ / SĐT trong phiếu SOS;
danh bạ cán bộ; họ tên, SĐT, IP người phản ánh; phản ánh chưa duyệt / bị từ chối; cảnh báo nháp / chờ duyệt.
`tests/e2e/public-test.mjs` quét toàn bộ phản hồi công khai để phát hiện các trường này.

**Công khai có chủ đích**: số điện thoại trực của **điểm sơ tán** (`evacuation_sites.contact_phone`, trả ra với tên
`hotline`) — nút Gọi trên cổng, "Tôi đang ở đâu?" và bản nhẹ. Khi nhập (cột `sdt_lien_he`) chỉ dùng số trực của điểm
hoặc UBND xã, **không dùng số di động cá nhân**. public-test kiểm tra điểm sơ tán chỉ có đúng các trường được phép.

### 9.2. Giới hạn tần suất

Cửa sổ cố định, đếm trong Redis (`backend/app/infra/ratelimit.py`), vượt → **429** kèm `Retry-After`. Nhà mạng di động
dùng chung một IP cho rất nhiều thuê bao (CGNAT — cả huyện có thể ra Internet qua vài IP) nên ngưỡng theo IP cho thao
tác của người dân để đủ cho hàng trăm người sau 1 IP; lạm dụng được chặn bằng khoá phụ (SĐT) và Turnstile. GET công khai
phần lớn do cache nginx 10 giây trả (không tới backend, không bị đếm).

| Quy tắc | Giới hạn |
|---|---|
| Gửi phản ánh | 200 / giờ / IP + 5 phản ánh **thành công** / giờ / SĐT người gửi (gửi lỗi không mất lượt) |
| Chỉ đường · Định vị · Tra cứu tiến độ | 60 · 240 · 120 / phút |
| API công khai khác | 600 / phút |
| Đăng nhập | 30 / phút (+ khoá tài khoản 15′ sau 10 lần sai) |
| Quên mật khẩu · Đặt lại | 5 · 10 / giờ |
| Tiếp nhận SOS tự động | 300 / phút (bắt buộc `X-Intake-Key`) |
| Nhận số đo IoT `/ingest/*` | 1.200 / phút |
| API nội bộ (đã đăng nhập) | 600 / phút **theo phiên** + trần 3.000 / phút / IP |

**IP người dùng**: Caddy đặt IP thật → nginx (`frontend/nginx/real-ip.conf`) chỉ tin proxy trong dải nội bộ rồi **ghi đè**
`X-Forwarded-For` bằng đúng 1 IP → backend chỉ tin header này khi kết nối đến từ `TRUSTED_PROXIES`. Client tự gửi
`X-Forwarded-For` giả không né được giới hạn.

### 9.3. Phản ánh: chống spam & xử lý ảnh

- Vị trí: người dân chấm điểm trên bản đồ; **xã/phường** tự xác định theo điểm chấm (ranh giới xã tải sẵn, tính trên
  trình duyệt) và đổi được; **xóm / tổ dân phố** chọn từ danh sách tên xóm mới của xã (`GET /public/hamlets`, nhập ở
  2.4) hoặc "không rõ". Lưu **tên** xóm kèm xã tại thời điểm gửi (`citizen_reports.hamlet_name`) → xóm sau này sáp nhập /
  đổi tên, phản ánh cũ vẫn đúng. Xã dùng để phân quyền duyệt vẫn lấy theo vị trí điểm chấm.
- Chống spam: honeypot, giới hạn tần suất, vị trí phải trong tỉnh, chỉ JPEG/PNG/WebP, **Cloudflare Turnstile** (đặt cả
  `TURNSTILE_SITE_KEY` và `TURNSTILE_SECRET` → form hiện ô xác minh, không cần build lại giao diện). Backend không gọi
  được Cloudflare (mất kết nối quốc tế) → cho qua và ghi cảnh báo, để người dân vẫn gửi được lúc thiên tai; trình duyệt
  không tải được ô xác minh → form báo lỗi và nhắc gọi 112.
- Phản ánh gán xã theo vị trí → chỉ cán bộ có quyền ở xã / cụm / tỉnh chứa xã đó thấy và duyệt; phản ánh mới đẩy thông
  báo realtime (`report.new`) cho đúng những người đó.
- Ảnh: xoay theo EXIF rồi **xoá toàn bộ EXIF/GPS**, chặn ảnh bomb (> 40 megapixel), mã hoá lại JPEG 1600 px + ảnh nhỏ 400 px,
  lưu MinIO bucket riêng tư. Ảnh chưa duyệt chỉ xem qua link **có chữ ký HMAC, hết hạn sau 1 giờ**.

<a id="ban-nhe"></a>
### 9.4. Mạng yếu & mất mạng: bản nhẹ, PWA

Lúc thiên tai, mạng di động thường chập chờn, tắc nghẽn hoặc mất hẳn. Hai cơ chế bổ trợ cho cổng đầy đủ (~0,22 MB):

**Bản nhẹ `/ban-nhe`** — HTML thuần do backend dựng (`backend/app/services/lite.py`), không JavaScript, không ảnh,
**luôn dưới 50 KB** (thực tế ~7 KB, gzip ~3 KB), mở được trên điện thoại cũ, mạng 2G. Gồm: nút gọi 112/114/115, cảnh báo
đang hiệu lực 48 giờ (tối đa 8, ưu tiên mức đỏ), sông vượt báo động, đường dây nóng; chọn xã (`?xa=<mã xã>`, form GET)
→ mức nguy cơ + lời khuyên, vùng nguy hiểm, mưa dự báo 24 giờ, điểm sơ tán của xã (còn chỗ, chỉ đường, gọi số trực). Chỉ dùng
dữ liệu đã công khai (9.1). nginx đổi `/ban-nhe` → `GET /api/v1/public/lite` và cache như API công khai; cache Redis
30 giây, xoá ngay khi phê duyệt cảnh báo hoặc nhập dữ liệu. Nên in địa chỉ này trong tin nhắn cảnh báo / trên loa
truyền thanh: `https://<tên miền>/ban-nhe`. Cổng đầy đủ gợi ý bản nhẹ khi trình duyệt báo mạng 2G hoặc bật tiết kiệm dữ
liệu, và có link ở chân trang.

**PWA (service worker `frontend/src/sw.js`)** — chỉ bật ở bản build. Lần mở đầu tiên lưu sẵn giao diện cổng công khai;
mỗi lần xem, bản mới nhất của cảnh báo, bản đồ, tổng quan, dự báo, đường dây nóng, hồ chứa, sạt lở và trang bản nhẹ được
lưu trên máy (cùng danh sách, ranh giới xã / tỉnh). Mất mạng / máy chủ không phản hồi (hoặc chậm quá 6 giây) → hiện bản đã lưu kèm dải báo *"đang hiển thị dữ
liệu đã lưu lúc …"*. Cài được lên màn hình chính (`manifest.webmanifest`).

| Không bao giờ lưu trên máy | Lý do |
|---|---|
| Yêu cầu có đăng nhập (header `Authorization`) — mọi trang cán bộ | Dữ liệu nội bộ |
| Tra cứu phiếu, "Tôi đang ở đâu?", chỉ đường, ảnh phản ánh, mọi `POST` | Dữ liệu cá nhân / vị trí |
| `/tiles/` (bản đồ nền, HTTP Range) và nguồn ngoài (Google, radar) | Quá lớn; trình duyệt tự cache |

Mỗi bản build có phiên bản service worker mới (theo mã băm tệp), trình duyệt tự cài và xoá bộ nhớ cũ — không cần làm gì
khi cập nhật. **Tắt khẩn cấp** (service worker lỗi): thay `dist/sw.js` bằng tệp chỉ gồm
`self.addEventListener('install', () => self.skipWaiting()); self.addEventListener('activate', () => self.registration.unregister());`
rồi triển khai lại — trình duyệt tự gỡ ở lần mở sau.

---

<a id="trien-khai"></a>
## 10. Triển khai thật (production)

### 10.1. Kiến trúc triển khai

```
Internet ──► Caddy :443 (HTTPS, Let's Encrypt, HSTS)          ← hoặc proxy / HTTPS của trung tâm dữ liệu
               ▼  bỏ X-Forwarded-For client tự gửi, đặt IP thật
           frontend (nginx) ──► backend × N ──► mạng "data" (internal: không mở cổng, không ra Internet)
           worker × 1         migrate (1 lần)      db · redis · minio · backup ──► backup-offsite ──► kho S3 ngoài máy chủ
Thiết bị IoT ──► mqtt :8883 (TLS, tài khoản + ACL) — profile "mqtt"
```

- Chỉ **một** `worker`. `backend` nhân bản được (`--scale backend=N` hoặc tăng `API_WORKERS`); sau khi đổi số bản:
  `restart frontend` để nginx nhận IP mới.
- `migrate` chạy xong (thành công) thì `backend` mới khởi động; `backup` chạy sau `migrate`.
- Thiếu bí mật → `docker compose` báo lỗi; bí mật yếu → backend dừng kèm danh sách lỗi (`logs migrate backend`).

<a id="trien-khai-may-chu"></a>
### 10.2. Máy chủ

Ước tính cho ~0,55 triệu dân Cao Bằng, giả định lúc cao điểm 10% dân số mở cổng trong 1 giờ:

| Hạng mục | Đề xuất | Ghi chú |
|---|---|---|
| CPU / RAM | 8 vCPU, 16 GB | `API_WORKERS` 4–6. Đo trên máy thử ([12.2](#kiem-thu-tai)): 500 người dân dùng ~2 lõi backend, 60 cán bộ làm mới dashboard liên tục ~1,7 lõi |
| Ổ đĩa | SSD ≥ 200 GB + nơi riêng cho sao lưu | Số đo 200 trạm × 5 phút ≈ vài MB/ngày; ảnh ≈ 0,4 MB/phản ánh |
| Băng thông ra | ≥ 200 Mbps | Lần tải đầu ~0,22 MB giao diện (gzip) + ~0,5 MB bản đồ nền tự lưu trữ (khung nhìn toàn tỉnh) ≈ 0,7 MB × 55.000 người/giờ ≈ 90 Mbps, chưa tính ảnh; lần sau trình duyệt dùng lại bản đã lưu. Nên có CDN cho `/assets/` và `/tiles/` |
| Hệ điều hành | Ubuntu 22.04/24.04 LTS, Docker Engine + Compose v2.24+ | Tường lửa: 22 (giới hạn IP quản trị), 80, 443, (8883) |
| Vị trí | Trung tâm dữ liệu có UPS/máy phát, **ngoài vùng ngập** | Lũ lớn có thể cắt điện, cáp quang tại Cao Bằng; sao lưu và máy dự phòng nên ở ngoài tỉnh |

Mỗi container có giới hạn RAM (`deploy.resources.limits` trong `docker-compose.prod.yml`; CSDL `DB_MEM_LIMIT` 12 GB, mỗi
bản backend `BACKEND_MEM_LIMIT` 3 GB — chỉnh theo RAM máy chủ) → một dịch vụ rò bộ nhớ chỉ tự khởi động lại, không
kéo sập CSDL. Số đo quan trắc cũ hơn 7 ngày tự nén (TimescaleDB, migration 0008 — thường giảm ~10 lần dung lượng),
không tự xoá: thời hạn lưu do đơn vị chủ quản quyết định.

Tổng kết nối CSDL ≈ (`API_WORKERS` × số bản backend + 1) × (`DB_POOL_SIZE` + `DB_MAX_OVERFLOW`) phải nhỏ hơn
`POSTGRES_MAX_CONNECTIONS` (mặc định 6 × 1 + 1 = 7 tiến trình × 10 = 70 < 200). Vượt → Postgres trả "too many clients"
(đã gặp khi kiểm thử tải với pool 10 + 10) → giảm pool hoặc thêm PgBouncer. Bộ nhớ Postgres đặt theo RAM:
`POSTGRES_SHARED_BUFFERS` ≈ 25%, `POSTGRES_EFFECTIVE_CACHE_SIZE` ≈ 75%.

### 10.3. Cài đặt lần đầu

```bash
git clone <kho mã> /opt/caobang-pctt && cd /opt/caobang-pctt
cp .env.production.example .env.production && chmod 600 .env.production
# Điền: DOMAIN, ACME_EMAIL, JWT_SECRET + SECRET_KEY (openssl rand -hex 32, khác nhau), POSTGRES_PASSWORD +
# MINIO_ROOT_PASSWORD (openssl rand -hex 24), SUPERADMIN_*, SMTP_*, TURNSTILE_*, OPEN_METEO_API_KEY…
mkdir -p backups
sh deploy/fetch-basemap.sh              # bản đồ nền tự lưu trữ → data/tiles (mục 6.9)
alias dcp='docker compose -f docker-compose.prod.yml --env-file .env.production'
dcp --profile caddy --profile offsite up -d --build   # offsite: chép sao lưu ra ngoài (10.5) — cấu hình trước
dcp ps                                  # migrate: Exited (0); các service khác healthy / running
dcp logs migrate backend | tail -50     # đọc các dòng "[cấu hình] …" (cảnh báo) nếu có
```

- **HTTPS của trung tâm dữ liệu** (không dùng Caddy): bỏ `--profile caddy`, đặt `FRONTEND_BIND=<IP nội bộ>:8080`; proxy
  phía trước phải chuyển `X-Forwarded-For`, `X-Forwarded-Proto`, hỗ trợ WebSocket (timeout ≥ 1 giờ) và chặn cổng 8080 từ
  Internet. Biết chính xác IP proxy → bản sao `frontend/nginx/real-ip.conf` chỉ tin IP đó, trỏ `NGINX_REAL_IP_CONF` tới.
- **Cloudflare phía trước**: `real-ip.conf` riêng dùng dải IP Cloudflare + `real_ip_header CF-Connecting-IP;`.
- **IoT qua MQTT**: [6.5](#mqtt), thêm `--profile mqtt`.

Kiểm tra:

```bash
curl -sI https://$DOMAIN/ | grep -iE "strict-transport|x-content-type"     # header bảo mật
curl -s https://$DOMAIN/health                                             # "status":"ok"
curl -s https://$DOMAIN/health/full                                        # mọi kiểm tra true (sau ~1 phút) → đặt giám sát ngoài (10.6)
curl -sI https://$DOMAIN/api/v1/public/overview | grep -i x-cache-status    # MISS rồi HIT
curl -s -o /dev/null -w "%{http_code}\n" -H "Range: bytes=0-99" https://$DOMAIN/tiles/caobang.pmtiles   # 206
curl -s -o /dev/null -w "%{http_code} %{size_download}\n" https://$DOMAIN/ban-nhe                      # 200, < 50000
curl -s -o /dev/null -w "%{http_code}\n" https://$DOMAIN/docs              # 404 (Swagger tắt)
```

Sau lần chạy đầu:

1. Đăng nhập Superadmin → cài **xác thực 2 lớp** (bắt buộc, [11.1](#xac-thuc-2-lop)) → **đổi mật khẩu và PIN** ngay.
2. Trang **Phân quyền**: tạo tài khoản đích danh cho từng người; không dùng chung tài khoản; có Superadmin đích danh
   rồi thì **khoá** tài khoản `admin` ban đầu.
3. Nhập dữ liệu chính thức ([2.4](#nhap-du-lieu)) **trước** khi công bố địa chỉ cổng.
4. Trang **Nguồn dữ liệu & IoT**: kiểm tra Open-Meteo chạy "OK", đăng ký thiết bị.
5. Thử "Quên mật khẩu" để xác nhận SMTP.

### 10.4. Cập nhật phiên bản

1. Push `main` → CI xanh. 2. Gắn tag `vX.Y.Z` → `deploy.yml` đẩy `ghcr.io/<owner>/caobang-pctt-backend|frontend:X.Y.Z`.
3. Sao lưu thủ công (10.5) nếu có migration. 4. Trên máy chủ:

```bash
# image dựng sẵn: đặt BACKEND_IMAGE / FRONTEND_IMAGE trong .env.production
dcp pull && dcp up -d          # hoặc build từ mã nguồn: git pull && dcp up -d --build
```

Quay lui: đặt lại tag image cũ; nếu migration đã đổi cấu trúc CSDL thì khôi phục bản sao lưu trước nâng cấp.

**Image dịch vụ** (PostgreSQL, Redis, MinIO, Caddy, Mosquitto) được ghim theo digest (`tag@sha256:…`) trong
`docker-compose.prod.yml` nên mỗi lần triển khai chạy đúng bản đã kiểm thử. Cập nhật bản vá bảo mật định kỳ (hằng quý
hoặc khi có cảnh báo): `docker pull <image:tag>` → `docker image inspect <image:tag> --format "{{index .RepoDigests 0}}"` →
thay digest, chạy thử ở máy staging (kiểm thử API + khôi phục sao lưu) rồi mới triển khai. Image nền trong Dockerfile
(python, node, nginx) theo tag phụ nên mỗi lần build nhận bản vá mới.

<a id="sao-luu"></a>
### 10.5. Sao lưu & khôi phục

Service `backup` chạy khi khởi động (sau `migrate`) và hằng ngày lúc `BACKUP_AT`, giữ `BACKUP_KEEP_DAYS` ngày:
`backups/db/pctt_<ngày_giờ>.dump` (pg_dump -Fc) và `backups/photos/photos_<ngày_giờ>.tar.gz` (ảnh MinIO).

**Bắt buộc chép ra ngoài máy chủ** (hỏng ổ đĩa, cháy, ngập phòng máy là mất cả dữ liệu lẫn bản sao lưu): service
`backup-offsite` (profile `offsite`, `deploy/backup-offsite.sh`, rclone) chép `backups/` lên kho lưu trữ S3 / MinIO ở nơi
khác mỗi giờ (`BACKUP_OFFSITE_EVERY_S`), bỏ qua tệp đang ghi dở; healthy khi chép thành công trong 3 chu kỳ gần nhất.

1. Tạo bucket ở kho ngoài (khác trung tâm dữ liệu / khác tỉnh) + khoá **chỉ có quyền ghi bucket đó**; đặt thời hạn giữ
   (lifecycle, VD 90 ngày) trên kho — dịch vụ dùng `rclone copy`, không xoá gì trên kho.
2. `.env.production`: `BACKUP_REMOTE=offsite:<bucket>/caobang`, `OFFSITE_ENDPOINT`, `OFFSITE_REGION`, `OFFSITE_ACCESS_KEY_ID`,
   `OFFSITE_SECRET_ACCESS_KEY` (kiểu khác S3, VD SFTP: `OFFSITE_TYPE=sftp` + biến `RCLONE_CONFIG_OFFSITE_*` trong `.env.offsite`).
3. `dcp --profile caddy --profile offsite up -d` → `dcp logs --tail 5 backup-offsite` phải có "đã chép".

Lấy bản sao lưu từ kho ngoài về (máy mới): `docker run --rm -v "$PWD/backups:/backups" --env-file .env.production -e
RCLONE_CONFIG_OFFSITE_TYPE=s3 … rclone/rclone copy offsite:<bucket>/caobang /backups` (hoặc tải bằng giao diện của kho).
Sao lưu ngay: `dcp restart backup` rồi `dcp logs --tail 5 backup`.

Khôi phục CSDL (đã thử nghiệm với TimescaleDB):

```bash
dcp stop backend worker
dcp exec -T db psql -U pctt -d postgres -c "DROP DATABASE IF EXISTS caobang_pctt WITH (FORCE)" -c "CREATE DATABASE caobang_pctt"
dcp exec -T db psql -U pctt -d caobang_pctt -c "CREATE EXTENSION IF NOT EXISTS timescaledb" -c "SELECT timescaledb_pre_restore()"
dcp exec -T db pg_restore -U pctt -d caobang_pctt --no-owner < backups/db/pctt_<ngày_giờ>.dump
dcp exec -T db psql -U pctt -d caobang_pctt -c "SELECT timescaledb_post_restore()"
dcp up -d
```

Khôi phục ảnh: `dcp stop minio`, rồi
`docker run --rm -v caobang-pctt-prod_minio_data:/data -v "$PWD/backups/photos:/b" alpine tar -xzf /b/photos_<…>.tar.gz -C /data`,
rồi `dcp up -d minio`. **Diễn tập khôi phục** ít nhất mỗi quý trên máy khác, ghi lại thời gian thực tế.

<a id="giam-sat"></a>
### 10.6. Giám sát & xử lý sự cố

**Tự giám sát, báo qua email** (`backend/app/infra/ops_watch.py`): mỗi phút kiểm tra rồi gửi tới `OPS_ALERT_EMAILS`
(trống = `SUPERADMIN_EMAIL`), thêm webhook chat `OPS_ALERT_WEBHOOK_URL` nếu có.

| Kiểm tra | Báo khi |
|---|---|
| CSDL, Redis | không trả lời trong 10 giây |
| API (worker gọi `/health` của backend) | không trả 200 |
| Worker (các tiến trình API theo dõi ngược) | mất nhịp quá 2 phút — ngừng đồng bộ dự báo, nhận MQTT, phát hiện mất tín hiệu |
| Ổ đĩa `/` của container (ổ dữ liệu Docker: CSDL, ảnh) và `/backups` | đã dùng từ `OPS_DISK_WARN_PCT` (85%) |
| Sao lưu CSDL (`backups/db`) | bản mới nhất quá 26 giờ |
| Chép ra ngoài máy chủ (khi đặt `BACKUP_REMOTE`) | lần chép thành công gần nhất quá 3 chu kỳ; chưa chép lần nào sau 2 giờ |

- Báo khi lỗi **2 lần liên tiếp** (khởi động lại dịch vụ lúc cập nhật không gây báo nhầm); còn lỗi → nhắc lại mỗi
  `OPS_ALERT_REPEAT_MIN` phút, gộp mọi sự cố đang có vào 1 email; hết lỗi → email "ĐÃ KHÔI PHỤC". Khởi động lại worker
  không báo lại sự cố đã báo (trạng thái lưu trong Redis).
- Mọi sự cố đều ghi log worker (`dcp logs worker | grep "[ops]"`). SMTP lỗi thì email không đi → nên có thêm webhook chat.
- Thử sau khi cài: đặt `OPS_DISK_WARN_PCT=1` trong `.env.production`, `dcp up -d worker` → email trong ~2 phút; trả lại
  giá trị cũ, `dcp up -d worker` → email khôi phục.

**Giám sát bên ngoài — vẫn bắt buộc**: máy chủ mất điện, mất mạng, Docker dừng thì không tiến trình nào tự báo được. Dịch
vụ giám sát đặt ở **nơi khác** (Uptime Kuma trên máy khác, UptimeRobot, hệ thống giám sát của trung tâm dữ liệu) gọi
`https://$DOMAIN/health/full` mỗi phút, cảnh báo khi không trả **200**: trả 503 khi bất kỳ kiểm tra nào ở bảng trên đang
lỗi (chỉ tên kiểm tra + đạt / lỗi; chi tiết trong email). `/health` dành cho healthcheck container: luôn 200 khi API chạy,
`"status": "degraded"` khi Redis lỗi hoặc worker mất nhịp.

- Mọi service có healthcheck (`dcp ps` cột STATUS): db, redis, minio, backend (`/health`), worker (nhịp 30 s), frontend,
  caddy, mqtt, backup (có bản sao lưu trong 26 giờ). `unhealthy` kéo dài → xem `dcp logs <service>`.
- Trang **Nguồn dữ liệu**: trạng thái đồng bộ, MQTT, thiết bị mất tín hiệu.
- Log: `dcp logs -f backend worker frontend` (xoay vòng 10 × 20 MB mỗi service; không chứa query string).
- **Giữ nhật ký có thời hạn** (`backend/app/services/retention.py`, worker chạy mỗi giờ, xoá từng lô): nhật ký tiếp nhận
  IoT / đồng bộ `INGEST_LOG_RETENTION_DAYS` (30 ngày — mỗi lần thiết bị gửi là 1 dòng), dòng sự kiện vận hành
  `EVENT_LOG_RETENTION_DAYS` (730 ngày), link đặt lại mật khẩu 30 ngày; `0` = giữ mãi. **Không** xoá nhật ký thao tác
  (audit), phiếu SOS, phản ánh, lệnh cảnh báo, số đo cảm biến.
- **Không chạy pytest trong container production** (kiểm thử ghi vào Redis / CSDL thật).

| Hiện tượng | Kiểm tra |
|---|---|
| `migrate` thoát mã ≠ 0, backend không lên | `dcp logs migrate` — thường là "Cấu hình không an toàn…" (sửa `.env.production`) hoặc lỗi migration |
| Người dân bị 429 hàng loạt | Proxy phía trước không chuyển `X-Forwarded-For` → mọi người chung 1 IP. Kiểm tra `real-ip.conf`, cột IP trong log nginx |
| Cổng hiện dữ liệu cũ khi backend lỗi | Đúng thiết kế (cache stale); sửa backend, dữ liệu tự cập nhật sau 10 giây |
| WebSocket "Mất kết nối" | Proxy phải hỗ trợ Upgrade, timeout đọc ≥ 1 giờ |

### 10.7. Mở rộng

Cổng công khai: nginx cache giữ tải backend gần như không đổi; nút cổ chai tiếp theo là băng thông file tĩnh → CDN.
Cán bộ: tăng `API_WORKERS` / số bản backend. Sẵn sàng cao (RTO < vài giờ): PostgreSQL replica + PITR (WAL-G / pgBackRest),
Redis Sentinel, MinIO phân tán, cân bằng tải nhiều máy.

---

<a id="bao-mat"></a>
## 11. Bảo mật & tuân thủ

**Đã có**: HTTPS + HSTS; kiểm tra cấu hình khi khởi động; mật khẩu và PIN băm PBKDF2, khoá tài khoản sau 10 lần sai;
xác thực 2 lớp TOTP, bắt buộc theo vai trò ([11.1](#xac-thuc-2-lop)); PIN ký duyệt cảnh báo; RBAC theo địa bàn, chống leo thang; nhật ký thao tác & phân quyền; giới hạn tần suất chống giả mạo IP;
ảnh xoá EXIF/GPS, link ảnh có chữ ký; IP người phản ánh chỉ lưu băm; CSDL / Redis / MinIO không mở cổng, không ra
Internet; container backend không chạy root; Swagger tắt ở production; log không chứa token, toạ độ; API key đối tác mã
hoá Fernet (`SECRET_KEY`), khoá thiết bị băm SHA-256, log `httpx` hạ xuống WARNING để không lộ key trong URL; cổng webhook
SOS bắt buộc khoá; SĐT được che trước khi gửi tin SOS cho LLM; font chữ và bản đồ nền tự lưu trữ (không gửi IP người dân
cho Google khi mở trang, vẫn hiển thị khi đứt kết nối quốc tế); câu lệnh SQL ở API giới hạn 30 giây; image ghim mã băm; Content-Security-Policy.

**Content-Security-Policy** (`frontend/nginx/security-headers.conf`): trình duyệt chỉ chạy script của trang (và Cloudflare
Turnstile), chỉ tải ảnh / kết nối tới nguồn liệt kê — nền bản đồ Google / CARTO, radar RainViewer. Mã độc chèn được vào
trang (XSS) cũng không tải thêm script lạ, không chạy `eval`, không gửi dữ liệu ra máy chủ khác. Khi thêm nguồn ngoài mới
(nền bản đồ, API gọi từ trình duyệt, script) phải thêm vào CSP — nếu không, trình duyệt chặn (Console: "Refused to
load…"); thử lại mọi trang bằng Chrome. Script đặt theme nội tuyến trong `index.html` được phép theo mã băm SHA-256: sửa
script thì `npm run build` dừng và in mã băm mới cần thay.

**Việc của đơn vị chủ quản** (xác nhận với Sở Khoa học và Công nghệ):

- **Cấp độ an toàn hệ thống thông tin** (Nghị định 85/2016/NĐ-CP và văn bản hướng dẫn): hồ sơ đề xuất cấp độ (hệ thống
  phục vụ người dân, xử lý dữ liệu cá nhân — dự kiến cấp độ 3 trở lên), kiểm thử xâm nhập độc lập trước khi vận hành.
- **Luật Bảo vệ dữ liệu cá nhân** (hiệu lực 01/01/2026): hệ thống xử lý họ tên, SĐT, vị trí, ảnh, tình trạng sức khoẻ.
  Cần thông báo xử lý dữ liệu trên form phản ánh, đánh giá tác động, thời hạn lưu trữ. **Không bật `LLM_API_URL` tới dịch
  vụ ở nước ngoài** khi chưa đánh giá chuyển dữ liệu ra nước ngoài.
- **Bí mật**: `.env.production` quyền 600, chỉ người vận hành đọc; đổi toàn bộ bí mật khi nhân sự vận hành thay đổi.
- **Bản đồ nền** có giấy phép, thể hiện đúng chủ quyền ([6.9](#ban-do-nen)).

<a id="xac-thuc-2-lop"></a>
### 11.1. Xác thực 2 lớp (TOTP)

Ngoài mật khẩu, đăng nhập cần mã 6 số từ ứng dụng xác thực trên điện thoại (Google Authenticator, Microsoft
Authenticator… — chuẩn TOTP RFC 6238, không cần SMS, không cần Internet trên điện thoại). Lộ mật khẩu vẫn không vào được
tài khoản. Mã nguồn: `backend/app/mfa.py`, `api/v1/mfa.py`, `frontend/src/components/account/Mfa.jsx`.

- **Bắt buộc theo vai trò**: `TOTP_REQUIRED_ROLES` (mặc định production: Quản trị hệ thống, Lãnh đạo BCH, Quản trị tỉnh,
  Chỉ huy cụm — những người quản lý tài khoản hoặc phê duyệt cảnh báo). Người có vai trò này chưa bật → lần đăng nhập sau
  phải cài đặt ngay (quét QR, nhập mã, lưu 10 mã khôi phục) mới vào được; phiên cũ bị từ chối. Superadmin cũng cài ở lần
  đăng nhập đầu tiên sau khi triển khai.
- **Tự bật** (mọi cán bộ): menu tài khoản → **Xác thực 2 lớp**. Tắt cần mật khẩu + mã; vai trò bắt buộc không tự tắt được.
- **Mã khôi phục**: 10 mã `xxxx-xxxx`, mỗi mã dùng 1 lần thay mã 6 số khi mất điện thoại; chỉ hiện một lần — in ra giấy.
  Tạo bộ mới trong menu tài khoản (bộ cũ hết hiệu lực).
- **Mất điện thoại và hết mã khôi phục**: quản trị có quyền quản lý tài khoản đó vào **Phân quyền** → nút đặt lại xác thực
  2 lớp (biểu tượng khiên gạch). **Xác minh đúng người trước khi bấm** (gọi lại số đã biết, gặp trực tiếp). Mọi phiên của
  tài khoản bị đăng xuất; thao tác ghi vào nhật ký phân quyền.
- **An toàn**: mã đúng trong khung ±30 giây, mỗi mã chỉ dùng 1 lần; sai mã tính chung bộ đếm khoá đăng nhập (10 lần / 15
  phút); khoá TOTP mã hoá bằng `SECRET_KEY`, mã khôi phục chỉ lưu HMAC. Giờ điện thoại lệch nhiều → mã luôn sai: bật giờ
  tự động trên điện thoại.

---

<a id="kiem-thu"></a>
## 12. Kiểm thử & CI

### 12.1. Kiểm thử chức năng

```bash
docker compose exec backend ruff format --check app tests alembic && docker compose exec backend ruff check app tests alembic
docker compose exec backend pytest -q        # kiểm thử đơn vị (không cần stack)
cd frontend && npm run lint               # ESLint: biến chưa khai báo, hook React, mã chết (0 cảnh báo)
cd frontend && npm run build              # build + nén sẵn tệp tĩnh (scripts/compress.mjs)
```

Kiểm thử API (cần stack dev đang chạy với `DEMO_MODE=true`; tham số 1 = địa chỉ backend, mặc định `http://localhost:8000`):

| Nghiệp vụ | Lệnh |
|---|---|
| Luồng nghiệp vụ SOS, cảnh báo, nhật ký | `node tests/e2e/smoke.mjs` |
| Phân quyền theo phạm vi | `node tests/e2e/rbac-test.mjs` |
| IoT HTTP / batch / LoRaWAN / MQTT, dự báo | `node tests/e2e/iot-test.mjs` |
| Cổng & API công khai, phản ánh, tài khoản, giới hạn tần suất | `node tests/e2e/public-test.mjs [backend] [mailpit]` |
| Tra cứu tiến độ phiếu | `node tests/e2e/track-test.mjs` |
| Xác thực 2 lớp: bật / đăng nhập 2 bước / mã khôi phục / tắt / đặt lại / khoá; bắt buộc theo vai trò khi backend có `TOTP_REQUIRED_ROLES=kiem_thu_2fa` (~1,5 phút) | `node tests/e2e/totp-test.mjs` |
| Hồ chứa & xả lũ | `node tests/e2e/reservoir-test.mjs` |
| Điểm đen sạt lở & đường đèo | `node tests/e2e/landslide-test.mjs` |
| Nhập dữ liệu (12 loại, kiểm tra lỗi, cập nhật không trùng, thay toàn bộ) | `node tests/e2e/import-test.mjs` |
| Xã gửi – tỉnh duyệt: phạm vi xã, chờ duyệt không hiện, cũ → mới, duyệt / từ chối / rút, email | `node tests/e2e/submission-test.mjs [backend] [mailpit]` |
| Bản nhẹ `/ban-nhe`, service worker, manifest — qua nginx (tham số = địa chỉ frontend, mặc định `http://localhost:8080`) | `node tests/e2e/lite-test.mjs` |
| Tự giám sát: `/health/full`; email cảnh báo sự cố khi backend có `OPS_DISK_WARN_PCT=1` (giả lập ổ đĩa đầy, ~2 phút); dọn nhật ký cũ | `node tests/e2e/ops-test.mjs [backend] [mailpit]` |

**Luồng vận hành thật** (`tests/e2e/prod-flow.mjs`, CI job `prod`): dựng `docker-compose.prod.yml` trên **CSDL trống**
(`DEMO_MODE=false`, `SIMULATOR=false`, bắt buộc xác thực 2 lớp), gọi qua nginx như người dùng thật: CSP & cấu hình an
toàn, mọi API công khai / nội bộ trên dữ liệu rỗng không lỗi 5xx, superadmin cài TOTP, nhập tệp mẫu của mọi loại dữ liệu,
hồ chứa chưa có số liệu → cập nhật vận hành, phản ánh → duyệt → SOS → điều động → tra cứu, cảnh báo Maker–Checker (chốt
"đã công bố", kênh chưa tích hợp), thiết bị IoT, email đặt lại mật khẩu, `/health/full` = 200 (có bản sao lưu).
**Không chạy trên hệ thống đang phục vụ** (nhập dữ liệu mẫu, tạo tài khoản, phát cảnh báo thử):
`SUPERADMIN_PASSWORD=… SUPERADMIN_PIN=… node tests/e2e/prod-flow.mjs http://127.0.0.1:8080 http://127.0.0.1:8025`.

Chạy lại nhiều lần liên tiếp: xoá khoá `rl:*` trong Redis trước (lệnh ở 4.5).

<a id="kiem-thu-tai"></a>
### 12.2. Kiểm thử tải

`tests/load/load.js` (k6) giả lập 3 nhóm, mỗi người dùng ảo một IP riêng (giới hạn tần suất vẫn hoạt động như thật):

- **Người dân**: tăng dần tới `PEAK` (mặc định 500) người cùng mở cổng công khai. 30% là người mới (tải JS/CSS); mỗi
  lượt gọi 9 API công khai + "Tôi đang ở đâu?" với toạ độ khác nhau, nghỉ 8–12 giây.
- **Cán bộ**: `OFFICIALS` (60) người, mỗi 5 giây tải lại cả 9 API dashboard. Mức này nặng hơn thực tế: giao diện chỉ tải
  lại khi có sự kiện, tối đa ~10 giây/lần.
- **Phản ánh** (`REPORTS=1`): 1 phản ánh kèm ảnh 12 MP (~4 MB) mỗi giây.

Ngưỡng đạt: người dân p95 < 1 giây (tra cứu vị trí < 1,5 giây); cán bộ p95 < 1,5 giây; lỗi < 1%.

```bash
# stack cần thử có DEMO_MODE=true (tài khoản demo); tạo ảnh mẫu 1 lần
docker run --rm -u 0 -v "$PWD/tests/load:/out" caobang-pctt-backend python /out/make_photo.py
docker run --rm --network caobang-pctt_default -v "$PWD/tests/load:/load" grafana/k6 run /load/load.js
docker run --rm --network caobang-pctt_default -v "$PWD/tests/load:/load" -e ONLY=officials -e DUR=60s grafana/k6 run /load/load.js
```

Kết quả đo 27/09/2026 trên máy thử: 8 CPU / 8 GB **dùng chung** cho CSDL, nginx, 4 tiến trình API và chính k6.

| Kịch bản | Trước tối ưu | Sau tối ưu |
|---|---|---|
| 500 người dân — API công khai p95 | 2,5 s | **19 ms** |
| 500 người dân — tra cứu vị trí p95 | 10,5 s | **0,53 s** |
| 500 người dân — tệp tĩnh p95 / CPU nginx | 3,3 s / 240–420% | **14 ms / 33–104%** |
| 500 người dân — thông lượng | 274 yêu cầu/s | **447 yêu cầu/s** (lỗi 0%) |
| 60 cán bộ — dashboard p95 / CPU CSDL | 5,5 s / 100–330% | **204 ms / ~25%** |
| 20 cán bộ + 1 ảnh/s — dashboard p99 / tối đa | 1,1 s / 2,2 s | **0,65 s / 0,85 s** |
| Cổng công khai — tải lần đầu (gzip) | 680 KB | **218 KB** |
| 500 người dân **+** 60 cán bộ **cùng lúc** | tệp tĩnh p95 8 s, API công khai 6 s, tra cứu vị trí 31 s, dashboard 27 s | tệp tĩnh 50 ms, API công khai 55 ms; tra cứu vị trí và dashboard p95 ~7 s |

Lượt đo "trước" dùng kịch bản cũ, có một phần yêu cầu bị 403/422 do chính kịch bản (tài khoản không có quyền,
toạ độ ngoài tỉnh) nên không so tỉ lệ lỗi. Hàng cuối: backend cần ~3,7 lõi cho cả hai nhóm (người dân ~2 lõi, cán bộ ~1,7 lõi). Trên máy thử, 8 CPU phải chia cho
CSDL, nginx và k6 nên bị nghẽn CPU; tăng lên 6 tiến trình API không giúp được (còn gây "too many clients" với pool cũ
10 + 10). **Trước khi mở cho người dân, chạy lại kịch bản này trên máy chủ thật** (máy riêng chạy k6, trỏ vào máy chủ), và
tăng CPU nếu kịch bản đồng thời chưa đạt.

### 12.3. CI

**CI** (`.github/workflows/ci.yml`, mỗi push / PR): ruff + pytest; ESLint + build frontend; kiểm tra `docker-compose.prod.yml`
(thiếu bí mật phải báo lỗi, đủ bí mật phải hợp lệ); dựng stack bằng `docker-compose.yml` với `DEMO_MODE=true`,
`SIMULATOR=true`, `TOTP_REQUIRED_ROLES=kiem_thu_2fa`, `OPS_DISK_WARN_PCT=1` và chạy 11 bộ kiểm thử API. **Deploy** (`deploy.yml`): tag `vX.Y.Z` → build & đẩy image lên GitHub
Container Registry.

---

<a id="nguon-dia-gioi"></a>
## 13. Nguồn dữ liệu địa giới & giấy phép

- **Ranh giới tỉnh**: OpenStreetMap relation [1844412](https://www.openstreetmap.org/relation/1844412) (© OpenStreetMap
  contributors, ODbL), diện tích tính được **6.694 km²**. Cao Bằng là 1 trong 11 tỉnh, thành **không sáp nhập** theo
  Nghị quyết 202/2025/QH15. Tệp: `backend/seed/caobang_province.geojson`.
  Bản đồ vẽ ranh giới tỉnh **nguyên bản, không rút gọn** (4.923 đỉnh, ~29 KB gzip) nên trùng đường biên của bản đồ nền
  tự lưu trữ (cùng dữ liệu OSM); ranh giới xã rút gọn ~5 m. Trên nền Google (Vệ tinh, Địa hình) có thể lệch vài chục mét
  vì Google dùng dữ liệu biên giới riêng. Cần độ chính xác pháp lý → thay bằng dữ liệu địa giới chính thức (Sở Nông nghiệp
  và Môi trường) khi có.
- **56 xã/phường** (53 xã, 3 phường): Nghị quyết 1657/NQ-UBTVQH15 (hiệu lực 01/07/2025). Ranh giới, dân số, mã đơn vị
  hành chính 5 số và danh sách xã cũ đã sáp nhập: `backend/seed/caobang_communes.geojson`, chuyển từ dữ liệu công khai
  https://caobang.city.com.vn/data/wards.geojson (lấy ngày 27/09/2026; trang không ghi nguồn gốc số liệu). Đã kiểm tra:
  56 vùng hợp lệ, chồng lấn giữa các xã ~3,5 km², vênh với ranh giới tỉnh OSM ~0,2% diện tích. Số hộ chưa có số liệu →
  ước tính dân số / 4. CSDL đã cài trước đó (ranh giới Voronoi xấp xỉ): nhập tệp này bằng loại `ranh_gioi_xa` (2.4) —
  hệ thống tự gán lại xã cho mọi SOS, phản ánh, điểm sơ tán.
- Dự báo: Open-Meteo (CC BY 4.0, gói miễn phí phi thương mại), dữ liệu ECMWF / NOAA. Radar: RainViewer.
- Bản đồ nền tự lưu trữ: © OpenStreetMap contributors (ODbL), đóng gói theo sơ đồ Protomaps Basemap
  (https://protomaps.com); thư viện `protomaps-leaflet`, `pmtiles` (BSD-3-Clause).
