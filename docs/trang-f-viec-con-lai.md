# Trang F – Bộ lọc địa phương & Chế độ Sáng/Tối: đối chiếu thiết kế và việc còn lại

Đối chiếu với mục **F. Thiết kế chi tiết mục Bộ lọc Địa phương & Chế độ Sáng/Tối** (tài liệu thiết kế Part 1) và các yêu
cầu giao diện chung (màu rủi ro thống nhất, thông tin khẩn trên cùng, thao tác chính dễ bấm, bảng có tìm / lọc / phân trang /
xuất Excel – PDF, form chia bước báo lỗi ngay khi nhập, trạng thái tải / trống / lỗi / mất mạng, 360 px, theo phân quyền).
Hai nhóm người dùng: **cán bộ hiện trường** (điện thoại, thao tác nhanh, nút to, ít gõ) và **lãnh đạo / quản lý** (nắm tình
hình trong vài giây qua chỉ số, bản đồ, biểu đồ, cảnh báo nổi bật).

Mục F không phải một trang riêng mà là **phần dùng chung của mọi trang**: nút chọn địa bàn và ô tìm kiếm trên thanh trên
cùng, chế độ Sáng / Tối, lớp phủ vùng đang xem trên các bản đồ.

- Cập nhật: 15/10/2026 — mã nguồn `main` gồm PR #80 (bộ lọc địa phương), #81 (tìm kiếm toàn năng), #82 (Sáng / Tối, tình
  hình từng xã trong hộp chọn địa bàn, tài liệu này).
- Máy chủ thử vẫn chạy **v1.0.3**, **chưa có** các thay đổi trên — xem V1 trong `docs/trang-a-viec-con-lai.md` (triển khai
  chung cho mọi trang).
- **56 xã/phường sau sắp xếp (01/07/2025) đã có đủ**: tên, ranh giới, dân số — dữ liệu công khai
  (`backend/seed/caobang_communes.geojson`). Nếu Sở Nông nghiệp và Môi trường có tệp ranh giới chính thức thì nhập đè (loại
  `ranh_gioi_xa`, README 2.2): phân quyền theo xã và việc gán phiếu SOS vào xã dựa trên ranh giới này.
- Dữ liệu nền dùng chung: README 2.4 (mẫu nhập "Xóm / tổ dân phố", "Nhóm lọc nhanh theo thiên tai"), README 2.2
  (hiện trạng xóm, địa danh).

**Kết luận:** phần F đã có đủ những gì mục F mô tả về giao diện: bộ lọc địa phương là trạng thái chung của cả hệ thống, chọn
được ở mọi cỡ màn, nhớ theo tài khoản, bản đồ vừa khít vùng và phủ mờ ngoài vùng (PR #80); tìm kiếm toàn năng có cả trên
điện thoại, chọn xã thì lọc cả hệ thống, mã SOS mở đúng phiếu (PR #81); Sáng / Tối theo máy hoặc tự chọn, đổi tức thì cả
biểu đồ, bản đồ; hộp chọn địa bàn cho lãnh đạo thấy ngay xã nào cần chú ý (PR #82).

**Không còn việc giao diện nào làm được mà không cần dữ liệu mới.** Còn lại (mục 4): ranh giới xóm để lọc tới cấp thôn (CF1),
BCH xác nhận xã nào thuộc nhóm lọc nhanh nào (CF2 — danh sách 56 xã/phường đã có, chỉ còn việc xếp nhóm), danh mục địa danh
chính thức cho tìm kiếm (CF3), thử tải lọc không gian với số liệu thật (CF4 — cùng V2 trang A).

## 1. Đối chiếu với thiết kế mục F (rà ngày 15/10/2026, theo từng ý)

| Yêu cầu của thiết kế | Hiện trạng |
|---|---|
| F.1 Bộ lọc là "Global State": chọn khu vực → Bản đồ, Dashboard, danh sách SOS, Nguồn lực tính lại theo khu vực | Đạt — mọi truy vấn gửi kèm mã xã đang lọc (`useAreaQuery`); nút chọn địa bàn trên thanh trên cùng ở mọi trang, mọi cỡ màn; nhớ theo tài khoản qua tải lại / đăng nhập lại (PR #80). Trang Cảnh báo: danh sách lệnh theo phạm vi được giao (lệnh nhắm nhiều xã), bản đồ vùng cảnh báo có phủ vùng đang lọc |
| F.1 Cây hành chính động Toàn tỉnh → Phường/Xã → Thôn | **Một phần** — Toàn tỉnh → nhóm lọc nhanh → 56 xã/phường (sau 01/07/2025 không còn cấp huyện). Cấp thôn: chưa có ranh giới xóm (8 xóm mẫu, không toạ độ) → tìm xóm bằng ô tìm kiếm, bản đồ bay tới xã chứa xóm (CF1) |
| F.1 Chọn khu vực → bản đồ zoom vừa khít ranh giới, phủ mờ ngoài ranh giới | Đạt — mọi bản đồ (Tổng quan, Bản đồ giám sát, Cứu hộ, Cảnh báo); phủ tối trên nền tối, phủ trắng trên nền sáng; viền vùng màu nhấn — không dùng đỏ của mức Khẩn cấp (PR #80) |
| F.1 Nút lọc nhanh theo đặc thù thiên tai (vùng trũng – hạ lưu; đồi núi – đèo dốc) | Đạt — 3 nhóm cho Cao Bằng: Dải biên giới Việt – Trung, Vùng trũng & hạ lưu sông Bằng Giang – Hiến, Vùng núi cao & đèo dốc phía Tây; mỗi nhóm ghi số xã, mức nặng nhất của các xã trong nhóm. Thiết kế mẫu ghi địa danh Thừa Thiên Huế (sông Hương, Tam Giang, A Lưới…) — đã thay bằng địa danh Cao Bằng; việc xếp xã vào từng nhóm do nhóm phát triển đề xuất, chờ BCH xác nhận (CF2) |
| F.1 Thanh tìm kiếm toàn năng: địa danh, toạ độ GPS, mã SOS; gợi ý từ CSDL địa danh | Đạt — có cả trên điện thoại (trước đây không); địa danh, xã, xóm, trạm, hồ, lực lượng, kho, mã SOS, toạ độ thập phân / độ-phút-giây / link Google Maps; chọn xã → lọc cả hệ thống, mã SOS → mở đúng phiếu (PR #81). Địa danh hiện là dữ liệu mẫu (CF3) |
| F.2 Chế độ Tối mặc định cho Trung tâm điều hành, nền xanh đen `#111827` | Đạt — nền `#111827`; mặc định theo hệ điều hành, máy không đặt thì Tối; màn hình lớn: chế độ trình chiếu luôn Tối; máy trực ban chọn "Tối" trong menu tài khoản (PR #82) hoặc mở `?theme=dark` một lần |
| F.2 Màu cảnh báo Đỏ / Cam / Vàng nổi bật trên nền tối | Đạt — thang chung đã kiểm định độ chênh màu (CD8 trang D); chữ màu dùng sắc chữ riêng cho từng nền, đủ tương phản |
| F.2 Bản đồ nền tối (Dark Matter / ánh sáng ban đêm) | Đạt — nền "Theo giao diện": tối → bản đồ ban đêm (tự lưu trữ PMTiles nếu có, không thì nền ngoài lọc tối) |
| F.2 Chế độ Sáng cho hiện trường & báo cáo: nền `#F9FAFB`, chữ `#1F2937`; đọc rõ dưới nắng; in / PDF nền sáng | Đạt — đúng mã màu; bản đồ phủ trắng ngoài vùng; in và xuất PDF luôn nền sáng |
| F.2 Bản đồ nền sáng: địa hình hoặc đường phố | Đạt — "Theo giao diện": sáng → Địa lý; có nền Địa hình, Vệ tinh |
| F.3 Biến CSS + Tailwind: đổi toàn bộ màu web, biểu đồ, bản đồ tức thì, không tải lại trang | Đạt — biến màu `:root` / `.dark`; biểu đồ đọc màu theo chế độ (`useChartTheme`); nền bản đồ, lớp phủ vùng đổi theo |
| F.3 Đọc `prefers-color-scheme`, lưu lựa chọn thủ công vào Local Storage | Đạt — theo máy (tự đổi khi máy đổi Sáng / Tối) tới khi người dùng chọn; nay chọn lại được "Theo máy" trong menu tài khoản (trước đây bấm đổi một lần là không quay lại theo máy được) (PR #82) |
| F.3 Frontend chỉ gửi mã hành chính; backend lọc bằng `ST_Contains` / `ST_Intersects` | Đạt — `app/area.py`; hiệu năng với hàng vạn điểm: thử tải với số liệu thật (CF4) |
| Chung: màu theo mức rủi ro, thống nhất | Đạt — hộp chọn địa bàn tô chấm từng xã theo thang chung (cảnh báo, vùng nguy hiểm, SOS, trạm vượt ngưỡng, mưa dự báo — cùng ngưỡng nơi khác); viền vùng đang xem không dùng đỏ |
| Chung: thông tin khẩn trên cùng | Đạt — mục "Cần chú ý" (xã Đỏ / Cam, kèm lý do) đứng đầu hộp chọn địa bàn |
| Chung: thao tác chính dễ bấm | Đạt — nút địa bàn, nút tìm kiếm trên thanh trên cùng ở mọi cỡ màn; vùng chạm ≥ 44 px trên màn cảm ứng; ít gõ: chạm chọn xã, "Tìm gần đây" |
| Chung: bảng tìm / lọc / phân trang / Excel – PDF; form chia bước | Không áp dụng — phần F không có bảng / form; hộp chọn địa bàn có tìm không dấu |
| Chung: trạng thái tải / trống / lỗi / mất mạng | Đạt — danh sách xã, nhóm lọc nhanh, tình hình từng xã, kết quả tìm kiếm: đang tải / lỗi (Thử lại) / không khớp / mất mạng nói rõ |
| Chung: 360 px | Đạt — 0 px tràn ngang; thanh trên cùng đủ chỗ cho nút địa bàn + kính lúp (nút âm báo vào menu tài khoản) |
| Chung: theo phân quyền | Đạt — chỉ liệt kê địa bàn được giao (tài khoản một xã thấy tên xã của mình); tình hình từng xã theo phạm vi; tìm kiếm: SOS / kho / lực lượng theo quyền, xã ngoài phạm vi chỉ xem bản đồ |

## 2. Bảng tổng hợp việc còn lại

| # | Việc | Phụ thuộc | Cần ai cung cấp | Ưu tiên |
|---|---|---|---|---|
| GF1 | **Bộ lọc địa phương**: nút ở mọi cỡ màn, hộp chọn 44 px, nhớ theo tài khoản, phủ / viền vùng theo Sáng / Tối | Không đổi API | — | **Đã làm** (PR #80) |
| GF2 | **Tìm kiếm toàn năng**: điện thoại, trạng thái, chọn xã → lọc, mã SOS → mở phiếu, tìm gần đây | API tìm kiếm thêm mã xã cho kết quả SOS (sửa nhỏ) | — | **Đã làm** (PR #81) |
| GF3 | **Sáng / Tối + cho lãnh đạo**: chọn Theo máy / Sáng / Tối; tình hình từng xã, "Cần chú ý" trong hộp chọn địa bàn | API mới `/dashboard/communes` (chỉ đọc) | — | **Đã làm** (PR #82) |
| CF1 | **Ranh giới xóm / tổ dân phố** → lọc tới cấp thôn | Dữ liệu | UBND xã / Sở Nội vụ (mẫu nhập "Xóm / tổ dân phố") | Trung bình |
| CF2 | **Xếp xã vào nhóm lọc nhanh**: BCH xác nhận xã nào thuộc nhóm nào (danh sách 56 xã/phường đã có — không phải việc này) | Xác nhận nghiệp vụ | Văn phòng BCH tỉnh (sửa qua mẫu nhập "Nhóm lọc nhanh theo thiên tai") | Trung bình (trước vận hành — bản chạy thật hiện đúng 3 nhóm đề xuất) |
| CF3 | **Danh mục địa danh chính thức** (chợ, cầu, đập, đèo, công trình) cho tìm kiếm | Dữ liệu | UBND xã, Sở Xây dựng | Trung bình |
| CF4 | **Thử tải lọc không gian** với số liệu thật (hàng vạn điểm) | Dữ liệu thật | — (cùng V2 trang A) | Cao (trước vận hành) |

## 3. Việc giao diện đã làm

### GF1 — Bộ lọc địa phương (PR #80)

- **Nút chọn địa bàn trên thanh trên cùng ở mọi cỡ màn** (`AdminFilter`) — trước đây dưới 1024 px nằm trong menu ☰ (chạm 2 lần,
  bảng chọn tràn ra ngoài menu, ô xã 28 px). Điện thoại / iPad dọc: hộp chọn gần trọn màn, ô xã 44 px, không tự bật bàn phím.
- Tìm xã không dấu; mỗi nhóm lọc nhanh ghi số xã; mục đang chọn có dấu ✓; đang tải / lỗi / không khớp; Esc đóng.
- **Nhớ theo tài khoản** (`app/store.js`): tải lại, đăng nhập lại vẫn đúng vùng; tài khoản khác về Toàn tỉnh; mã ngoài
  phạm vi tự bỏ; xã do thẻ "Cấp xã" tự chọn sẵn chỉ dùng trong phiên.
- **Bản đồ** (`AreaFocus`): viền vùng màu nhấn (Đỏ chỉ là mức Khẩn cấp), phủ mờ theo Sáng / Tối.

### GF2 — Tìm kiếm toàn năng (PR #81)

- **Điện thoại**: nút kính lúp → hộp tìm toàn màn; từ 768 px: ô tìm, phím `/` hoặc Ctrl+K (`OmniSearch`).
- Mỗi kết quả ghi việc sẽ làm: Lọc theo xã / phường · Mở phiếu (mã SOS → Cứu hộ đúng cột, `/cuu-ho?phieu=`) · Xem bản đồ.
- Tìm gần đây; đang tìm / không thấy / máy chủ không trả lời / mất mạng; combobox / listbox cho trình đọc màn hình.
- Sửa lỗi chạm trượt trên điện thoại khi lần chạm đầu mở khoá âm thanh làm thanh trên dồn lại (`utils/audio.js`).

### GF3 — Sáng / Tối và tình hình từng xã (PR #82)

- **Giao diện: Theo máy · Sáng · Tối** trong menu tài khoản (`UserMenu`); nút đổi nhanh trên thanh trên cùng báo trạng thái cho
  trình đọc màn hình (`aria-pressed`).
- **Tình hình từng xã trong hộp chọn địa bàn** (`/dashboard/communes`, `communeStatus.js`): chấm màu theo thang chung cạnh từng
  xã và nhóm lọc nhanh; mục **"Cần chú ý"** đầu hộp chọn — xã Đỏ / Cam, kèm lý do (SOS quá hạn / cấp 1, cảnh báo đang hiệu lực,
  vùng nguy hiểm, trạm vượt ngưỡng, mưa dự báo 24 giờ). Chỉ tải khi mở hộp chọn, 1 phút một lần khi đang mở.

## 4. Việc chờ dữ liệu

### CF1 — Ranh giới xóm / tổ dân phố

- **Hiện trạng:** 8 xóm mẫu, không có ranh giới / toạ độ (README 2.2). Tìm được xóm bằng ô tìm kiếm (bay tới xã chứa xóm);
  bộ lọc dừng ở cấp xã.
- **Cần:** danh sách xóm sau sắp xếp năm 2026 (nghị quyết HĐND từng xã) kèm ranh giới (hoặc ít nhất toạ độ trung tâm).
- **Việc lập trình khi có ranh giới:** thêm cấp thôn vào hộp chọn địa bàn (chạm xã → danh sách xóm của xã); `app/area.py` đã lọc
  theo ranh giới bất kỳ đơn vị nào có mã, không phải sửa API.

### CF2 — Xếp xã vào nhóm lọc nhanh

- **Không thiếu danh sách xã:** 56 xã/phường sau sắp xếp đã có đủ (tên, ranh giới, dân số). Việc còn lại là **xác nhận xã nào
  thuộc nhóm lọc nhanh nào**.
- **Hiện trạng:** 3 nhóm do nhóm phát triển đề xuất theo địa hình Cao Bằng, chưa qua BCH. Đây là dữ liệu nền: **bản chạy thật
  (CSDL trống) cũng hiện đúng 3 nhóm này**, nên cần xác nhận trước khi vận hành.

| Nhóm | Số xã | Xã / phường đang xếp vào | Cách chọn hiện nay | BCH cần |
|---|---|---|---|---|
| Vùng trũng & hạ lưu sông Bằng Giang – Hiến | 9 | Thục Phán, Nùng Trí Cao, Tân Giang, Hòa An, Bạch Đằng, Nam Tuấn, Nguyễn Huệ, Canh Tân, Phục Hòa | Chọn tay: 3 phường nội thị và xã ven sông Bằng Giang, sông Hiến | Đối chiếu bản đồ ngập lụt, thực tế các trận lũ |
| Vùng núi cao & đèo dốc phía Tây | 20 | Nguyên Bình, Tĩnh Túc, Minh Tâm, Phan Thanh, Thành Công, Tam Kim, Ca Thành, Bảo Lạc, Hưng Đạo, Cốc Pàng, Cô Ba, Khánh Xuân, Xuân Trường, Huy Giáp, Bảo Lâm, Lý Bôn, Nam Quang, Quảng Lâm, Yên Thổ, Sơn Lộ | Toàn bộ xã thuộc 3 huyện cũ Bảo Lâm, Bảo Lạc, Nguyên Bình (chỉ dùng để dựng nhóm — giao diện không hiện huyện cũ) | Đối chiếu bản đồ phân vùng nguy cơ sạt lở, lũ quét; bổ sung xã vùng cao nơi khác nếu cần |
| Dải biên giới Việt – Trung | 13 | Cốc Pàng, Xuân Trường, Sơn Lộ, Lũng Nặm, Hà Quảng, Tổng Cọt, Trà Lĩnh, Quang Trung, Đình Phong, Đàm Thủy, Lý Quốc, Phục Hòa, Đức Long | Chọn tay theo mô tả nhóm "xã biên giới có đồn Biên phòng" | Đối chiếu danh sách xã biên giới chính thức của tỉnh |

- **Cách sửa (không phải sửa mã):** Nhập dữ liệu → mẫu "Nhóm lọc nhanh theo thiên tai" (`nhom_loc_nhanh`, README 2.4) — sửa
  danh sách xã của nhóm, thêm nhóm mới (VD lưu vực sông Gâm, sông Quây Sơn). Hoặc gửi danh sách cho nhóm phát triển để cập
  nhật luôn dữ liệu nền (`backend/app/seed_data.py`, `PRESETS`) — cài mới cũng đúng ngay.

### CF3 — Danh mục địa danh chính thức

Ô tìm kiếm tra `spatial_admin.place_names` (địa danh mẫu), cùng xã, xóm, trạm, hồ, lực lượng, kho, mã SOS. Cần danh mục chợ,
cầu, đập, đèo, trường học, trạm y tế… kèm toạ độ để cán bộ gõ tên quen gọi là tìm được.

### CF4 — Thử tải lọc không gian

Cùng V2 trang A: chạy `tests/load/load.js` với số liệu thật, kiểm tra lọc theo xã / nhóm (ST_Intersects) với hàng vạn điểm
(số đo, phiếu SOS). `/dashboard/communes` chỉ gọi khi mở hộp chọn địa bàn (~30 ms, có lưu đệm) — không cần đưa vào kịch bản
tải lại liên tục.

## 5. Kiểm tra khi có dữ liệu thật

1. Triển khai bản mới (V1 của trang A).
2. Trên máy tính trực ban: menu tài khoản → Giao diện **Tối**; màn hình lớn mở `/dashboard?trinh-chieu=1`.
3. Trên iPad / điện thoại ngoài trời: Giao diện **Sáng** (hoặc Theo máy); chọn xã của mình bằng nút địa bàn, tải lại — vẫn
   đúng xã.
4. Mở hộp chọn địa bàn khi có tình huống thật: so mục "Cần chú ý" với dải tình huống của Tổng quan và Điểm nóng của Bản đồ.
5. Tìm thử tên địa danh quen gọi, mã SOS đang xử lý, toạ độ người dân gửi qua Zalo.

## 6. Tham chiếu mã nguồn

| Phần | Tệp |
|---|---|
| Nút chọn địa bàn, hộp chọn, tình hình từng xã | `frontend/src/components/common/AdminFilter.jsx`, `communeStatus.js` |
| Trạng thái chung: bộ lọc (nhớ theo tài khoản), Sáng / Tối | `frontend/src/app/store.js`, `frontend/index.html` (áp chế độ trước khi nạp trang) |
| Tìm kiếm toàn năng | `frontend/src/components/common/OmniSearch.jsx`, `backend/app/api/v1/search.py` |
| Thanh trên cùng, menu tài khoản | `frontend/src/components/layout/Header.jsx`, `components/common/UserMenu.jsx` |
| Lớp phủ / viền vùng đang xem, nền bản đồ theo giao diện | `frontend/src/components/map/MapTools.jsx` (`AreaFocus`, `BaseLayer`) |
| Lọc không gian theo mã hành chính | `backend/app/area.py` |
| Tình hình từng xã (API) | `backend/app/api/v1/dashboard.py` (`/dashboard/communes`) |
| Mở phiếu theo mã | `frontend/src/pages/RescueCenter.jsx` (`?phieu=`) |
| Kiểm thử | `tests/ui/ui-test.mjs` (khối "Bộ lọc địa phương", "Tìm kiếm toàn năng"), `tests/e2e/rbac-test.mjs` (tìm mã SOS, tình hình từng xã theo phạm vi) |

## 7. Các thay đổi đã làm cho phần F (để tra cứu)

| PR | Nội dung |
|---|---|
| #80 | Nút chọn địa bàn ở mọi cỡ màn, hộp chọn 44 px, nhớ theo tài khoản, phủ / viền vùng theo Sáng / Tối, âm báo vào menu tài khoản trên điện thoại, hộp thoại có tên cho trình đọc màn hình |
| #81 | Tìm kiếm toàn năng trên điện thoại, chọn xã → lọc, mã SOS → mở phiếu (`/cuu-ho?phieu=`), trạng thái tìm, tìm gần đây; API tìm kiếm thêm mã xã cho kết quả SOS; sửa chạm trượt khi mở khoá âm thanh |
| #82 | Giao diện Theo máy / Sáng / Tối; tình hình từng xã và "Cần chú ý" trong hộp chọn địa bàn (API `/dashboard/communes`); tài liệu này |
