# Kế hoạch làm mới giao diện: bắt mắt, gây ấn tượng — chức năng giữ nguyên

Kế hoạch sắp xếp lại bố cục và hình thức của **cổng người dân** và **trang điều hành**, học cách trình bày của 3 trang
tham khảo, **không đổi chức năng**: cùng đường dẫn, cùng số liệu, cùng phân quyền, cùng thao tác.

- Lập: 21/10/2026, sau đợt chỉnh giao diện cho người mới (PR #102 → #108, đã merge). Mục 9 theo dõi tiến độ.
- **Quyết định ngày 21/10/2026** (mục 10): ưu tiên trang điều hành; nền Địa hình / Vệ tinh lấy như các trang tham khảo
  (ô Google); bản đồ cổng người dân và trang điều hành chỉ rõ tỉnh Cao Bằng, ngoài tỉnh làm mờ; **thêm yêu cầu mới** —
  người dân phải đăng ký tài khoản mới gửi được phản ánh, yêu cầu cứu hộ (Đ5, mục 11 — đây là thay đổi chức năng).
- Căn cứ: phân tích 3 trang tham khảo ngày 20/10/2026 (đọc mã nguồn, chụp màn máy tính + điện thoại); chụp hiện trạng ngày
  21/10/2026 (chế độ giả lập). Ảnh chỉ để phân tích, **không đưa lên repo** (có số liệu mẫu, repo công khai).
- Ràng buộc như mọi đợt trước (CLAUDE.md): React 18 + Tailwind 3 + lucide-react + Recharts + Leaflet (cùng `pmtiles`,
  `protomaps-leaflet` đã có) — **không thêm thư viện, không đổi API**; thang 4 mức rủi ro (`utils/risk.js`) chỉ dùng cho
  rủi ro, một màu nhấn cho thao tác; điện thoại 360 px không tràn ngang; nền Sáng và Tối; vùng chạm ≥ 44 px; chữ ≥ 4,5 : 1.

**Tóm tắt.** Ba trang tham khảo đẹp nhờ **cách sắp xếp**, không nhờ thư viện lạ — trang Cao Bằng dùng gần đúng bộ thư viện
của hệ thống này. Hệ thống đã làm tốt phần "rõ việc" (mỗi màn trả lời một câu hỏi, nút ghi đúng việc, trạng thái nói bằng
lời); còn thiếu phần **"ấn tượng ngay khi mở"**:

1. Cổng người dân mở ra là dải chữ và 4 thẻ, bản đồ nằm phía dưới; trên điện thoại màn đầu không thấy bản đồ.
2. Bản đồ nền mặc định phẳng; nền Địa hình, Vệ tinh đẹp thì lấy thẳng ô ảnh của Google (rủi ro giấy phép).
3. Còn 41 chỗ chữ IN HOA (lớp `uppercase`) và 16 chỗ màu chuyển trang trí (`bg-gradient`, 6 tệp), biểu tượng đặt trong ô
   màu, phóng to khi rê chuột — dồn ở cổng người dân và trang đăng nhập.
4. Mỗi màn một kiểu thẻ, cỡ tiêu đề, khoảng cách hơi khác nhau; thanh trên cùng của máy tính có khoảng 10 nút nhỏ.

Thứ tự làm (theo quyết định ngày 21/10/2026 — **trang điều hành trước**): nền móng chung (Đ0) → bản đồ nền như trang tham
khảo và làm mờ ngoài tỉnh (Đ2) → khung ứng dụng, đăng nhập, Tổng quan, Bản đồ giám sát (Đ3) → các trang nghiệp vụ (Đ4) →
cổng người dân (Đ1) → tài khoản người dân (Đ5). Khoảng 15 PR.

## 1. Nguyên tắc

### 1.1. "Giữ nguyên chức năng" nghĩa là

- **Cùng đường dẫn**: mọi trang và tham số đang dùng mở được như cũ — `?tab=…`, `?ho-so=…`, `?phieu=…`, `?loai=…`,
  `?trinh-chieu=1`; cổng người dân `/`, `/cong-khai`, `?tra-cuu=…`, `?canh-bao=…`, `/ban-nhe`; link nhiệm vụ `/nhiem-vu#…`.
- **Cùng số liệu, cùng quyền**: không thêm, bớt, đổi API; giữ phân quyền 3 cấp. Chỉ đổi cách bày.
- **Cùng thao tác**: mọi nút, ô nhập, hộp thoại còn nguyên; được đổi chỗ, đổi kiểu. Đổi chữ trên nút thì sửa trong cùng
  PR: `frontend/src/utils/guides.js` (hướng dẫn theo vai trò) và `tests/ui/ui-test.mjs`.
- **Không giấu thông tin đang có**: được gập lại (bấm để mở), chuyển xuống dưới, gom nhóm; không được bỏ.
- Giữ các cam kết đã có: nút "Báo cáo nhanh" cố định trên thanh trên cùng; không hiện dữ liệu mẫu cho người dân như dữ liệu
  thật; không theo dõi GPS lực lượng; in luôn nền sáng; "Bản nhẹ" cho mạng yếu.

### 1.2. "Bắt mắt" với hệ thống này nghĩa là

- **Nội dung thật làm nền**: bản đồ địa hình của tỉnh, mưa, cảnh báo, con số lớn — không trang trí suông.
- **Nhìn 5 giây là hiểu**: mỗi màn một ý chính, chữ to, số to, nhiều khoảng trắng, ít khung.
- **Đồng bộ từ đầu đến cuối**: cùng kiểu thẻ, cùng nhịp khoảng cách, cùng cỡ chữ ở mọi màn và cả hai nền.
- **Chuyển động có ý nghĩa**: phiếu mới trượt vào, số đổi nhẹ, bản đồ bay tới chỗ vừa chọn, thanh thời gian phát mưa theo
  giờ; tắt hết khi máy bật chế độ giảm chuyển động.

### 1.3. Không dùng (dấu hiệu giao diện "làm cho có")

Chữ IN HOA giãn cách; bóng phát sáng; viền màu bên trái khắp nơi (chỉ dùng cho mức rủi ro Vàng / Cam / Đỏ); khung lồng
khung; biểu tượng cảm xúc (emoji); phóng to khi rê chuột; chấm nhấp nháy liên tục; thuật ngữ tiếng Anh, viết tắt chuyên môn
trên màn.

> **Đổi ngày 23/10/2026** (người dùng chọn diện mạo "phòng chỉ huy" — mục 12): được dùng **màu chuyển nhẹ** (dải khẩn,
> biểu tượng thương hiệu, ô gợi ý), **bóng mềm** cho thẻ, **biểu tượng trong ô màu nhấn nhạt** (`.icon-tile`, đầu trang và
> khối). Bóng phát sáng, IN HOA, emoji vẫn không dùng. Chỗ dùng màu chuyển phải đánh dấu `data-mau-chuyen` (ui-test bắt
> mọi màu chuyển không đánh dấu).

## 2. Học gì từ 3 trang tham khảo

| Trang | Thư viện (đọc từ mã nguồn) | Đáng học | Không học theo |
|---|---|---|---|
| Cảnh báo đa thiên tai tỉnh Cao Bằng (caobang.canhbaothientai.org.vn) | Next.js, Tailwind, Leaflet (gom cụm điểm), lucide; font Inter | Mở ra là **bản đồ toàn màn**, nền địa hình bóng núi xanh rừng; **bảng lọc nổi** bên trái — mục đang chọn tô đặc, mục khác chỉ có viền; **thanh thời gian có nút Phát** và **dải màu mưa liền**; **thanh trạng thái dưới cùng** ("Hệ thống đang hoạt động", toạ độ, đồng hồ); menu chỉ 4 mục | Trên điện thoại bảng lọc che gần hết bản đồ ngay khi mở; tiêu đề nhóm IN HOA; lấy thẳng ô ảnh Google |
| Cảnh báo rủi ro thiên tai Vinacomin (vinacomin.canhbaothientai.org.vn) | Laravel, Tailwind, OpenLayers, Chart.js; font SVN‑Gilroy (có bản quyền) | Bản đồ toàn màn; **mưa vẽ thành vùng loang theo dải màu**; công cụ xếp dọc mép phải; menu 6 mục | Gió dạng hạt chuyển động (đẹp nhưng không giúp quyết định khi lũ, sạt lở); font phải mua |
| Quan trắc mực nước – lượng mưa Gia Lai (quantrac.pcttgialai.gov.vn) | React, Vite, Ant Design, Chart.js, Leaflet | Mọi ô chọn, lịch, bảng **cùng một kiểu** (bộ thành phần chuẩn) | Menu 12 mục dồn một hàng, Viết Hoa Mỗi Chữ; "No data" tiếng Anh; trang phân tích mở ra toàn biểu đồ trống, phải bấm "Phân tích" mới có số; viết tắt MNDBT, MNLKT |

Áp dụng cho hệ thống này (không cần thêm thư viện):

| Điều học | Áp dụng ở | Đợt |
|---|---|---|
| Bản đồ toàn màn, bảng nổi | Cổng người dân (màn đầu). Bản đồ giám sát đã có (PR #53 → #62) | Đ1 |
| Nền địa hình bóng núi | Nền như trang tham khảo — ô Google Địa lý / Địa hình / Vệ tinh (quyết định 21/10/2026, mục 7.1) | Đ2 |
| Thanh thời gian có nút Phát, dải màu mưa liền | Bản đồ giám sát đã có (PR #106); mang sang cổng người dân | Đ1 |
| Thanh trạng thái dưới cùng | Máy tính: giờ số liệu, nguồn dữ liệu, kết nối tức thì, đồng hồ (mục 5) | Đ1, Đ3 |
| Ít mục menu | Cổng người dân: 8 tab → 5 nhóm việc (vẫn đủ 8 màn) | Đ1 |
| Một màu nhấn, mục đang chọn tô đặc | Segmented, Tabs, chip lọc dùng chung (đã có) — rà những chỗ còn lệch | Đ0 |
| Bộ thành phần cùng một kiểu | Chuẩn hoá `components/common/ui.jsx`: thẻ, ô số, bảng, màn trống (mục 4) | Đ0 |
| Mưa vùng loang | Đã tô mưa dự báo **theo từng xã** (PR #57) — chỉ làm đẹp dải màu. **Không** nội suy giữa các trạm: dễ "vẽ ra" mưa ở nơi không có trạm đo | Đ3 |

## 3. Hiện trạng sau PR #108

| Màn | Đã ổn | Chưa ấn tượng / còn lệch |
|---|---|---|
| Cổng người dân `/`, `/cong-khai` | Đủ việc: Tôi ở đâu, điểm sơ tán, đèo dốc, tra cứu phiếu, mực nước, hồ chứa, đường dây nóng, cẩm nang; Gọi 112, Gửi phản ánh, Bản nhẹ; thanh đáy điện thoại (Cứu nạn 112, Vị trí của tôi) | Mở ra là dải chữ + 4 thẻ, **bản đồ ở dưới, chiếm nửa màn** (điện thoại: màn đầu không thấy bản đồ); tên "Cổng Cảnh Báo Thiên Tai Tỉnh Cao Bằng" Viết Hoa Mỗi Chữ, trên điện thoại bị cụt còn "C."; nút đầu trang xuống 3 dòng; biểu tượng trong ô màu, viền màu trái, phóng to khi rê; khi chưa có số, dải tóm tắt hiện "TB – mm (cao nhất – mm)"; chú thích "Icon Radar phát sáng có số"; 8 tab xếp ngang |
| Đăng nhập `/dang-nhap` | Đủ: ghi nhớ, quên mật khẩu, xác thực 2 lớp, đổi mật khẩu lần đầu | Trang trắng, một hộp giữa màn; chữ IN HOA ("HỆ THỐNG CHỈ HUY TÁC CHIẾN 24/7", nhãn ô, nút); chữ "tác chiến"; logo màu chuyển kèm huy hiệu nhỏ |
| Tổng quan `/dashboard` | Câu tóm tắt, việc chờ quyết định, 6 ô số, bản đồ điểm nóng (PR #100, #101); màn đầu không phải cuộn (có bài kiểm thử theo thiết bị) | Dày: dải khẩn + câu tóm tắt + 5 tab + việc chờ + 6 ô + bản đồ nhỏ; trên màn lớn phòng điều hành bản đồ chỉ khoảng 1/3; ô số có viền màu trái cả khi bình thường |
| Bản đồ giám sát `/ban-do` | Đúng kiểu tham khảo: bản đồ toàn màn, bảng nổi, thanh thời gian có Phát, 2 chế độ xem (PR #53 → #68, #106) | Nền mặc định phẳng; nền Địa hình, Vệ tinh lấy ô ảnh Google; mỗi bảng nổi một kiểu bóng, độ trong |
| Trang nghiệp vụ: Cứu hộ, Cảnh báo, Vật tư, Phản ánh, Đợt thiên tai, Nhập dữ liệu, Nguồn dữ liệu, Phân quyền, Hướng dẫn | Rõ việc, nút ghi đúng việc, trạng thái bằng lời (PR #102 → #108) | Cỡ tiêu đề, kiểu thẻ, khoảng cách hơi khác nhau giữa các trang; màn trống chỉ có chữ; còn chữ IN HOA ở Phản ánh, hộp thoại kho, menu tài khoản |
| Khung: thanh trên, menu trái | Điện thoại gọn (PR #107); menu nhóm theo việc (PR #102) | Máy tính: thanh trên khoảng 10 nút nhỏ (địa bàn, tìm, Báo cáo nhanh, cổng người dân, kết nối, chuông, loa, Sáng/Tối, đồng hồ, tài khoản); tiêu đề nhóm menu IN HOA |

## 4. Nền móng chung (Đ0) — làm trước, mọi màn cùng đẹp lên

| Thành phần | Quy định | Nơi sửa |
|---|---|---|
| Chữ | Be Vietnam Pro (đã tự lưu trữ, giấy phép OFL). Thang cỡ: 12 · **14 (tối thiểu cho nội dung)** · 16 · 18 · 20 · 24 (tiêu đề trang) · 30 · 36 · 48 (con số chính trên màn lớn). Số dùng lớp `num` (chữ số đều nhau). Tiêu đề đậm 600, con số 700–800. Không IN HOA, trừ mã (SOS-1001, HS-…) | `tailwind.config.js`, `src/index.css` |
| Khoảng cách | Lưới 4 px: trong thẻ 16; giữa các thẻ 12 (điện thoại) / 16 (máy tính); giữa các khối 24 | `components/layout/page.js`, `ui.jsx` |
| Thẻ | Một kiểu: nền `panel`, viền 1 px `line`, bo 14 px, bóng mềm hai lớp `--shadow-card` (từ 23/10/2026 — mục 12; in ra giấy không bóng). Viền màu bên trái **chỉ** khi mức Vàng / Cam / Đỏ | `index.css` (`.card`), `ui.jsx` (KpiCard, Section), `components/dashboard/StatCard` |
| Lớp nổi trên bản đồ | Một kiểu cho mọi bảng nổi: nền `panel` đục 94 %, làm mờ phía sau 8 px, bo 12 px, một mức bóng mềm (`0 8px 24px rgb(0 0 0 / .12)`; nền tối `.40`) | `index.css` (lớp `.float-panel`), `components/map/*` |
| Ô số | Nhãn 14 · số 30–36 (màn lớn 48) · câu giải thích 14; mức rủi ro bằng chấm màu + chữ, không tô cả ô | `StatCard`, `KpiCard` |
| Bảng | Dòng cao 44–48 px, đầu bảng dính khi cuộn, số canh phải, chữ thường | `index.css` (`.table-base`) |
| Biểu tượng | lucide; nét 1,75 khi ≥ 20 px, nét 2 khi nhỏ hơn; luôn kèm chữ; màu chữ phụ, hoặc màu nhấn khi là thao tác. Từ 23/10/2026: biểu tượng đầu trang / khối đặt trong ô màu nhấn nhạt `.icon-tile` (đầu trang lấy đúng biểu tượng của mục menu — `layout/nav.js`) | rà toàn bộ |
| Chuyển động | 120 ms (bấm) · 200 ms (mở bảng, hộp thoại) · 300 ms (trượt bảng trên điện thoại) · 600–900 ms (bản đồ bay tới); chỉ dùng cho việc có ý nghĩa; máy bật giảm chuyển động → tắt | `tailwind.config.js`, `index.css` |
| Màn trống, lỗi, mất mạng | 6–8 hình nét đơn tự vẽ (SVG viết thẳng trong mã, theo màu chữ, không tải thêm tệp): chưa có phiếu, không có cảnh báo, chưa có dữ liệu, không tìm thấy, mất mạng, máy chủ lỗi — kèm một câu "cần làm gì" | `ui.jsx` (`EmptyState` thêm hình) |
| Biểu đồ | Theo `components/charts/chartTheme`: nét 2 px, lưới mờ, **một trục tung**, nhãn ghi thẳng ở điểm cuối, chú giải phía dưới, ô thông tin khi rê cùng một kiểu; màu theo vai trò (mức rủi ro hoặc thứ tự chuỗi), kiểm cho người mù màu | `charts/chartTheme.jsx` |
| Màu | Bảng màu "phòng chỉ huy" từ 23/10/2026 (mục 12): nền trang xám xanh, thẻ trắng, màu nhấn xanh hoàng gia, menu xanh đêm `--nav-*`; nền tối xanh đêm. Mọi màu chữ vẫn ≥ 4,5 : 1 trên 3 nền × 2 giao diện (ui-test "Tương phản chữ"). Thang màu rủi ro không đổi | `index.css`, `tailwind.config.js` |

Thêm một trang mẫu **chỉ chạy trên máy dev** (`/mau-giao-dien`, không vào bản chạy thật): bày mọi thành phần ở cả hai nền
để rà nhanh khi sửa. Không phải chức năng mới cho người dùng.

## 5. Khung ứng dụng: thanh trên gọn, thanh trạng thái dưới (màn ≥ 1024 px, cao ≥ 860 px)

```text
┌──────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ [logo] BCH PCTT & TKCN Cao Bằng │ Đang xem: Toàn tỉnh ▾ │ Tìm tên xóm, mã phiếu…   [Báo cáo nhanh] [Tài khoản ▾] │
├────────────────┬─────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Điều hành      │                                                                                                 │
│   Tổng quan    │                          nội dung trang                                                         │
│   Bản đồ       │                                                                                                 │
│   …            │                                                                                                 │
├────────────────┴─────────────────────────────────────────────────────────────────────────────────────────────────┤
│ ● Đang trực — kết nối tức thì │ Số liệu lúc 19:35 │ 5/5 nguồn đang về │ Chuông SOS: bật │ 19:35:16 · 21/10/2026  │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

- **Thanh trên** còn 4 cụm: tên hệ thống · địa bàn đang xem · tìm kiếm · **Báo cáo nhanh** (nút chính, cố định) + tài
  khoản. Sáng/Tối, link cổng người dân vào menu tài khoản (đã có Theo máy / Sáng / Tối ở đó).
- **Thanh trạng thái** cao 28–32 px: kết nối tức thì, giờ số liệu, số nguồn đang về (chỉ hiện với tài khoản được xem
  nguồn dữ liệu — dùng API sẵn có), chuông SOS (bấm để bật / tắt, giữ lời nhắc "Bấm để bật chuông SOS"), đồng hồ. Trên
  trang Bản đồ thêm toạ độ con trỏ. Nguồn lỗi → chữ đỏ, bấm mở trang Nguồn dữ liệu.
- **Menu trái**: tiêu đề nhóm chữ thường ("Điều hành", "Dữ liệu & báo cáo", "Quản trị", "Trợ giúp").
- Điện thoại: giữ như PR #107 (đã tối ưu); không có thanh trạng thái — chấm kết nối chỉ hiện khi mất kết nối.
- Laptop màn thấp (1366×768) và máy tính bảng: cũng không có thanh trạng thái — các nút ở thanh trên như cũ. Đo khi làm:
  có thanh 32 px thì bản đồ ở màn hình đầu Tổng quan chỉ còn 107 px (bài kiểm thử cần ≥ 120 px). Biến thể `tall:` (cao ≥ 860 px)
  khai báo trong `frontend/tailwind.config.js`, dùng `lg:tall:`.

## 6. Từng màn — bố cục mới, chức năng giữ nguyên

### 6.1. Cổng người dân (Đ1) — bộ mặt của tỉnh

Máy tính:

```text
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ [logo] Cảnh báo thiên tai tỉnh Cao Bằng    Bản đồ · Hồ chứa & sông · Đèo dốc · Sơ tán · Tra cứu    [Gọi 112] [Gửi phản ánh] │
├─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ ┌ Bạn muốn làm gì? ──────────┐   ┌ Cảnh báo đang hiệu lực (đỏ) — hoặc "Hiện không có cảnh báo khẩn cấp" ┐                   │
│ │ Tôi ở đâu? Có an toàn?     │                                                                                              │
│ │ Điểm sơ tán gần nhất       │          BẢN ĐỒ TOÀN MÀN — nền địa hình của tỉnh                                             │
│ │ Đèo dốc, sạt lở            │          vùng nguy hiểm · điểm sơ tán · trạm đo · hồ chứa · mưa                              │
│ │ Tra cứu phiếu đã gửi       │                                                            [Lớp] [Nền]                       │
│ └────────────────────────────┘                                                                                              │
│ ┌ ▶  12 giờ trước ──●── Bây giờ ──── 24 giờ tới ┐                    ┌ Mưa nhỏ ▬▬▬▬▬▬▬▬ Mưa rất to ┐                        │
├─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Số liệu lúc 19:35 · Đường dây nóng BCH: … · Bản nhẹ cho mạng yếu                              19:35 · 21/10/2026            │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

Điện thoại:

```text
┌────────────────────────────────────────────────────────────────────┐
│ [logo] Cảnh báo thiên tai        ≡                                 │
│ ┌ Không có cảnh báo khẩn cấp ┐    ← dải nổi, chạm để xem chi tiết  │
│                                                                    │
│      BẢN ĐỒ (≥ 60 % màn đầu)                                       │
│                                                                    │
│ ▶ ──●── Bây giờ                                                    │
├────────────────────────────────────────────────────────────────────┤
│ Bạn muốn làm gì?               ⌃   ← bảng kéo lên, mặc định 1 dòng │
├────────────────────────────────────────────────────────────────────┤
│ [Cứu nạn 112] [Vị trí của tôi] [Ảnh]  ← thanh đáy giữ nguyên       │
└────────────────────────────────────────────────────────────────────┘
```

- **Bản đồ là màn đầu** (học trang Cao Bằng); trên điện thoại bảng "Bạn muốn làm gì?" **thu gọn** khi mở trang — tránh
  lỗi của chính trang tham khảo (bảng che gần hết bản đồ).
- **Dải cảnh báo** nổi trên bản đồ: đỏ khi có cảnh báo đã duyệt (chạm để xem, `?canh-bao=` giữ nguyên); không có thì một
  câu bình tĩnh kèm mưa 24 giờ. Chưa có số thì nói "Chưa có số liệu mưa — đang cập nhật", không để "TB – mm".
- **Menu 5 nhóm** thay 8 tab — đủ 8 màn như cũ: Bản đồ cảnh báo · Hồ chứa & sông (Hồ chứa & xả lũ, Mực nước sông suối) ·
  Đèo dốc & sạt lở · Sơ tán & đường dây nóng (Điểm sơ tán an toàn, Đường dây nóng) · Tra cứu phiếu; Cẩm nang an toàn ở
  chân trang và menu.
- Tên ngắn "Cảnh báo thiên tai tỉnh Cao Bằng" (điện thoại: "Cảnh báo thiên tai" — không cụt trên 360 px); bỏ ô màu
  quanh biểu tượng, viền màu trái, phóng to khi rê; chú thích viết lại bằng lời ("Số trên vòng tròn: số điểm ở gần nhau —
  chạm để phóng to").
- Trang con (Gửi phản ánh, Tra cứu, Hồ chứa, Sạt lở, Link nhiệm vụ) cùng kiểu mới: bỏ chữ IN HOA (13 chỗ ở các tệp này), màu
  chuyển (8 chỗ).

Đã làm ở 1.1 (máy tính trước): thanh trên gọn, dải tình hình một dòng + chip, bản đồ vừa màn đầu với "Bạn muốn làm gì?" nổi
(căn tỉnh chừa lề trái cho bảng), chân bản đồ dải mưa liền + giờ số liệu + bản nhẹ; điện thoại: bỏ nút trùng thanh đáy, chip
một hàng cuộn ngang, danh sách lớp thu vào nút — bản đồ từ giữa màn đầu. Đã làm ở 1.2: menu 5 nhóm thay 8 tab (máy tính: hàng nhóm +
hàng trang con; điện thoại: menu ≡, bỏ hàng tab), trang con Hồ chứa / Sạt lở / Tra cứu cùng kiểu (chữ thường, bỏ ô màu,
nhấp nháy chỉ khi khẩn thật). Điện thoại: bản đồ khoảng một nửa màn đầu — dải tình hình vẫn nằm trên bản đồ (không nổi đè
lên bản đồ) để không che điểm trên bản đồ; muốn ≥ 60 % thì phải cho dải nổi, để khi dùng thử với người dân. Thanh thời gian chưa đưa ra cổng (cổng chưa có số liệu
theo giờ) — giữ nguyên chức năng.

Phải còn đủ: định vị "Tôi đang ở đâu" và chọn theo 56 xã; điểm sơ tán gần nhất, chỉ đường; đèo dốc và lộ trình tránh; tra
cứu phiếu bằng mã + số điện thoại; hồ chứa, xả lũ; mực nước; đường dây nóng; cẩm nang; gửi phản ánh có ảnh và vị trí; Gọi
112; Bản nhẹ; Sáng / Tối; vào trang điều hành; chỉ hiện cảnh báo đã duyệt.

### 6.2. Đăng nhập (Đ3)

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                                          │ Đăng nhập                        │
│ ảnh nền: bản đồ địa hình Cao Bằng (mờ)   │ Tên đăng nhập hoặc email         │
│                                          │ [                            ]   │
│ BCH PCTT & TKCN tỉnh Cao Bằng            │ Mật khẩu          Quên mật khẩu? │
│ Hệ thống điều hành phòng chống           │ [                            ]   │
│ thiên tai và tìm kiếm cứu nạn            │ [x] Ghi nhớ trên máy này         │
│                                          │ [         Đăng nhập          ]   │
│                                          │ Bạn là người dân? → Cổng cảnh báo│
└─────────────────────────────────────────────────────────────────────────────┘
```

- Hình nền: ranh giới tỉnh và 56 xã vẽ từ dữ liệu ranh giới của chính hệ thống (SVG nét mảnh màu nhấn, đổi theo nền Sáng /
  Tối, rất nhẹ) — không dùng ảnh chụp ô Google (giấy phép), không dùng ảnh trên mạng.
- Chữ thường, bỏ "tác chiến", logo một màu. Điện thoại: chỉ cột đăng nhập.
- Giữ nguyên: ghi nhớ, quên mật khẩu, xác thực 2 lớp, đổi mật khẩu lần đầu, link cổng người dân, khối giả lập chỉ trên
  máy dev.

### 6.3. Tổng quan (Đ3) — màn lớn của lãnh đạo

```text
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Dải khẩn cấp (giữ nguyên)                                                                       │
│ Câu tóm tắt (24 px) …                                                   [Trình chiếu] [Xuất]    │
├────────────────────────────────┬────────────────────────────────────────────────────────────────┤
│ Việc chờ quyết định            │                                                                │
│ 6 ô số (2 × 3, số 36 px)       │       BẢN ĐỒ ĐIỂM NÓNG (khoảng 60 % bề ngang)                  │
│                                │                                                                │
├────────────────────────────────┴────────────────────────────────────────────────────────────────┤
│ Chuyên đề: Tổng hợp · Hồ chứa & xả lũ · Sạt lở & đường đèo · Cấp xã/phường · Hệ thống & dữ liệu │
└─────────────────────────────────────────────────────────────────────────────────────────────────┘
```

- Giữ **thứ tự nội dung** của PR #100, #101 (câu tóm tắt → việc chờ → 6 ô → bản đồ); chỉ đổi bố cục từ **1680 px** trở lên
  (màn rời, TV phòng điều hành). Đã thử 1440 px: cột trái hẹp, chữ trong 6 ô số bị cắt "…" — laptop giữ bố cục cũ. Bản đồ
  giãn cao bằng cột trái (ít nhất 420 px). Màn đầu vẫn phải qua bài kiểm thử theo thiết bị (thêm màn lớn 1920×1080: bản đồ
  phải nằm cạnh "Việc chờ quyết định").
- Ô số: bỏ viền màu khi bình thường; Vàng / Cam / Đỏ có chấm màu + chữ.
- **Chế độ trình chiếu** cho phòng điều hành (`?trinh-chieu=1`, đã có): trên màn lớn cũng 2 cột — 6 ô số chữ to (2 × 3)
  bên trái, bản đồ điểm nóng bên phải, nhật ký sự kiện tự cập nhật ở dưới; tự chuyển chuyên đề, nền tối. Giữ đủ 6 số (không
  rút còn 4) và **không làm dòng chữ chạy**: chữ chạy khó đọc từ xa, người xem không dừng được; diễn biến mới đã có ở nhật ký.

### 6.4. Bản đồ giám sát (Đ3)

- Nền mặc định như trang tham khảo (mục 7.1), ngoài tỉnh làm mờ (mục 7.2); vẫn chọn được Địa hình, Vệ tinh, Ban đêm.
- Mọi bảng nổi dùng một kiểu `.float-panel`; giờ số liệu, toạ độ con trỏ xuống thanh trạng thái.
- Dải màu mưa liền, chữ "Mưa nhỏ → Mưa rất to" như trang tham khảo. Đã làm (3.3): các nấc nối liền nhưng vẫn rời (không
  chuyển màu dần) vì lớp mưa dự báo tô mỗi xã một màu theo khoảng; radar ghi Nhỏ–vừa · To · Rất to · Dông; điện thoại bản
  gọn. Giờ số liệu, toạ độ con trỏ chỉ có ở thanh trạng thái (màn rộng + đủ cao) — màn khác giữ như cũ.
- Giữ: 2 chế độ xem, 4 nhóm lớp có công tắc, thanh thời gian có Phát, đo, khoanh vùng, kéo – thả điều động.

### 6.5. Trang nghiệp vụ (Đ4)

- Áp nền móng Đ0: tiêu đề 24 px, một kiểu thẻ, bảng dòng 48 px, khoảng cách theo lưới.
- Màn trống, lỗi, mất mạng có hình nét đơn + câu "cần làm gì".
- Chuyển động nhỏ: phiếu mới trượt vào cột (Cứu hộ — đã có đánh dấu phiếu mới), lệnh cảnh báo vừa duyệt chuyển cột, số trên
  ô đổi nhẹ.
- Bỏ chữ IN HOA còn lại: Phản ánh (4 chỗ), hộp thoại kho, menu tài khoản, chú giải bản đồ, bản tin bão.
- Hướng dẫn xử lý: mỗi tình huống một hình nét đơn.

## 7. Bản đồ nền như trang tham khảo, làm mờ ngoài tỉnh (Đ2)

Quyết định ngày 21/10/2026: nền Địa hình, Vệ tinh **lấy như các trang tham khảo**; bản đồ ở cổng người dân và trang điều
hành **chỉ rõ tỉnh Cao Bằng, phần xung quanh làm mờ**.

**7.1. Nền bản đồ** — chép cách trang Cảnh báo đa thiên tai Cao Bằng dùng ô ảnh Google (đọc từ mã nguồn của trang):

| Nền | Nguồn | Ghi chú |
|---|---|---|
| Địa lý — **mặc định ở nền Sáng** | ô Google `lyrs=m` (có bóng địa hình ở mức zoom tỉnh) | Thay nền tự lưu trữ đang làm mặc định (phẳng). Nền tự lưu trữ OpenStreetMap (`deploy/fetch-basemap.sh`) **giữ làm dự phòng**: không tải được ô Google (mất kết nối quốc tế) thì tự chuyển sang |
| Địa hình | ô Google `lyrs=p` | Như trang tham khảo |
| Vệ tinh | ô Google `lyrs=y` | Như trang tham khảo, giữ nhãn địa danh để định hướng |
| Ban đêm — mặc định ở nền Tối | giữ như hiện nay | |

- Mẹo của trang tham khảo: dưới zoom 12 lấy ô 128 px của mức zoom kế tiếp — chữ nhỏ, nét, nhiều chi tiết. Chỉ dùng trên màn
  rộng (≥ 1024 px); điện thoại giữ ô 256 px cho đỡ tốn dữ liệu di động.
- **Rủi ro giấy phép:** điều khoản Google không cho lấy thẳng ô ảnh; người dùng đã chọn làm như các trang tham khảo
  (21/10/2026). Phương án tự lưu trữ bóng núi từ dữ liệu độ cao mở (DEM → `gdaldem hillshade` → PMTiles, lớp
  `leafletRasterLayer` của gói `pmtiles` đã có) **giữ lại làm dự phòng** khi cần thay ô Google.

**7.2. Làm mờ ngoài tỉnh** — mọi bản đồ (cổng người dân, Tổng quan, Bản đồ giám sát, Cứu hộ, Cảnh báo…):

- Phủ NHẸ (40 %) ngoài ranh giới tỉnh — tỉnh nổi, vẫn thấy địa hình xung quanh như trang tham khảo của Viện ĐCN&MT
  (quyết định của chủ dự án 28/10/2026, lần 2: 100 % làm tỉnh như mẩu giấy cắt dán; trước đó 85 %): nền Sáng phủ trắng,
  nền Tối / Vệ tinh phủ tối. Ranh giới tỉnh **nét đen đậm** trên viền nền tương phản (nền tối: viền sáng bên dưới để nét
  đen không chìm). Ranh giới **xã** nét xám mảnh 1 px trên viền nền mỏng (trước nét gần đen 1,5 px trên viền trắng 3,5 px —
  56 xã như kính ghép chì, lấn ô nền và điểm số liệu). Đang lọc một xã thì phần ngoài xã trong tỉnh mờ nhẹ 30 %, xã đang xem viền màu
  nhấn (không dùng đỏ — đỏ chỉ cho mức Khẩn cấp).
- Lớp mờ nằm trên ô nền, dưới mọi lớp số liệu: điểm, đường quỹ đạo bão, cảnh báo vẫn rõ dù ở ngoài tỉnh.
- **Không khoá** kéo bản đồ ra ngoài tỉnh: bão, mưa lớn từ ngoài vào vẫn phải xem được.
- Thay đường viền tỉnh màu đỏ nét đứt đang có ở cổng người dân.

## 8. Kiểm thử và nghiệm thu chung

- **Chức năng giữ nguyên**: toàn bộ `tests/ui/ui-test.mjs` và kiểm thử API đạt như trước mỗi PR; đường dẫn cũ ở mục 1.1
  mở được; danh sách "phải còn đủ" ở mục 6 kiểm từng mục trước khi merge.
- **Đo được, đã có bài kiểm thử**: tương phản chữ ≥ 4,5 : 1 hai nền; vùng chạm ≥ 44 px; 360 px không tràn ngang; màn đầu
  theo thiết bị.
- **Thêm bài kiểm thử**: (a) quét các trang chính — không còn chữ IN HOA dài hơn 3 ký tự (trừ mã), không còn màu chuyển
  (trừ dải màu chú giải); (b) cổng người dân trên điện thoại 360 px: màn đầu thấy bản đồ ≥ 60 %, nút Gọi 112 luôn thấy;
  (c) máy bật giảm chuyển động → không có chuyển động.
- **Hiệu năng**: gói tải lần đầu không tăng quá 5 %; ảnh nền đăng nhập ≤ 150 KB; lớp bản đồ tải lười; đo Lighthouse chế
  độ điện thoại — không kém bản hiện tại.
- **Ảnh trước / sau** mỗi PR để rà (không đưa lên repo).
- **Dùng thử với người thật** sau Đ1 và Đ3: mỗi nhóm 3–5 người (người dân; lãnh đạo, trực ban; cán bộ xã). Bài "5 giây":
  nhìn màn đầu 5 giây rồi nói tình hình; làm 3 việc chính không cần hỏi. Ghi lại, sửa ở PR kế tiếp.

Rủi ro và cách tránh:

| Rủi ro | Cách tránh |
|---|---|
| Sắp xếp lại làm mất chức năng | Kiểm thử toàn bộ mỗi PR; danh sách "phải còn đủ" từng màn; đổi chữ trên nút thì sửa hướng dẫn + kiểm thử cùng PR |
| Đẹp trên máy tính nhưng chậm trên điện thoại yếu, mạng yếu | Ít chuyển động, ảnh WebP, tải lười; giữ "Bản nhẹ"; đo trên điện thoại tầm trung |
| Giấy phép bản đồ, ảnh, font | Ô Google dùng như trang tham khảo theo quyết định 21/10/2026 — rủi ro đã ghi nhận, có phương án dự phòng (mục 7.1); không lấy ảnh trên mạng; font Be Vietnam Pro (OFL) |
| Người đã quen giao diện cũ bỡ ngỡ | Gợi ý 3 bước theo vai trò cập nhật cùng PR; đổi theo đợt; ghi thay đổi trong Hướng dẫn xử lý |
| Kiểu "làm cho có" quay lại | Rà theo mục 1.3 trước khi merge; bài quét tự động (mục 8) |

## 9. Lộ trình và theo dõi tiến độ

Thứ tự theo quyết định ngày 21/10/2026: trang điều hành trước, cổng người dân sau.

| Thứ tự | Đợt · PR | Nội dung | Tệp chính | Nghiệm thu | Trạng thái |
|---|---|---|---|---|---|
| 1 | Đ0 · 0.1 | Nền móng: thẻ (bỏ bóng), lớp nổi `.float-panel`, ô số (vạch màu chỉ từ Vàng), bảng, màn trống có hình nét đơn (`EmptyArt`); trang mẫu `/mau-giao-dien` (máy dev); cập nhật tài liệu này | `index.css`, `ui.jsx`, `EmptyArt.jsx`, `StatCard`, `StyleGuide.jsx` | Ảnh trước / sau; kiểm thử toàn bộ đạt | Xong — PR #110 |
| 2 | Đ0 · 0.2 | Dọn kiểu "làm cho có": chữ IN HOA, màu chuyển, biểu tượng trong ô màu, phóng to khi rê; thêm bài quét tự động | rà toàn bộ `frontend/src` | Bài quét đạt; không đổi bố cục | Xong — PR #111 |
| 3 | Đ2 · 2.1 | Nền như trang tham khảo (mục 7.1) + làm mờ ngoài tỉnh mọi bản đồ (mục 7.2) | `components/map/MapTools.jsx`, các bản đồ | Nền mặc định đúng; ngoài tỉnh mờ ở mọi bản đồ; mất ô Google → nền dự phòng | Xong — PR #112 |
| 4 | Đ3 · 3.1 | Thanh trên gọn + thanh trạng thái (máy tính); menu chữ thường; trang đăng nhập 2 cột | `Header.jsx`, `Sidebar.jsx`, `Login.jsx` | Không mất nút nào (chỉ chuyển chỗ); đủ chức năng đăng nhập | Xong — PR #113 |
| 5 | Đ3 · 3.2 | Tổng quan màn lớn 2 cột; chế độ trình chiếu phòng điều hành | `pages/Dashboard.jsx`, `components/dashboard/*` | Bài kiểm thử màn đầu theo thiết bị đạt | Xong — PR #114 |
| 6 | Đ3 · 3.3 | Bản đồ giám sát: lớp nổi thống nhất, dải màu mưa | `pages/MonitoringMap.jsx`, `components/map/*` | Kiểm thử Bản đồ đạt | Xong — PR #115 |
| 7 | Đ4 · 4.1 | Cứu hộ, Cảnh báo, Phản ánh theo nền móng; chuyển động nhỏ | `RescueCenter.jsx`, `Alerts.jsx`, `CitizenReports.jsx` | Kiểm thử từng trang đạt | Xong — PR #116 |
| 8 | Đ4 · 4.2 | Vật tư, Đợt thiên tai, Nhập dữ liệu, Nguồn dữ liệu, Phân quyền theo nền móng | các trang tương ứng | Kiểm thử từng trang đạt | Xong — PR #117 |
| 9 | Đ4 · 4.3 | Hướng dẫn xử lý có hình; rà toàn bộ hai nền, 360 px | `Guide.jsx`, `utils/guides.js` | Rà ảnh hai nền đạt | Xong — PR #118 |
| 10 | Đ1 · 1.1 | Cổng người dân trên máy tính: bản đồ toàn màn, "Bạn muốn làm gì?", dải cảnh báo, thanh thời gian, thanh trạng thái | `pages/public/PublicPortal.jsx` | Đủ danh sách 6.1; đường dẫn cũ mở được | Xong — PR #119 |
| 11 | Đ1 · 1.2 | Cổng người dân trên điện thoại + menu 5 nhóm + trang con cùng kiểu | `PublicPortal.jsx`, `ReportForm`, `TicketTracker`, `ReservoirMonitor`, `LandslideMonitor`, `MissionPage` | 360 px: bản đồ ≥ 60 % màn đầu, Gọi 112 luôn thấy | Xong — PR #120 |
| 12 | Đ5 · 5.1 | Tài khoản người dân — máy chủ: bảng, đăng ký, đăng nhập, phiên riêng; gửi phản ánh / SOS cần phiên người dân (mục 11) | `backend/app/api/v1/public.py`, bảng mới + migration, kiểm thử | Kiểm thử API: không phiên → từ chối; phiên cán bộ không dùng thay được | Xong — PR #121 (bắt buộc đăng nhập bật ở 5.2) |
| 13 | Đ5 · 5.2 | Tài khoản người dân — giao diện: đăng ký, đăng nhập, "Phiếu của tôi"; Gọi 112 luôn mở | `pages/public/*` | Người dân mới đăng ký, gửi được phản ánh không cần gọi hỏi | Xong — PR #122 (bật bắt buộc đăng nhập) |
| 14 | Đ5 · 5.3 | Cán bộ quản lý tài khoản người dân: tìm theo số điện thoại, khoá, đặt lại mật khẩu | trang điều hành (quyền cấp tỉnh) | Kiểm thử quyền | Xong — API + quyền `citizen.*` ở PR #121 (Cấp 3 bị từ chối — citizen-test), giao diện tab Phân quyền › Tài khoản người dân ở PR #122 |

Mỗi PR: một phần, CI xanh mới merge; triển khai lên máy chủ theo đợt, có duyệt. Dùng thử với người thật sau thứ tự 6 và 11.

## 10. Quyết định

| Câu hỏi | Quyết định ngày 21/10/2026 |
|---|---|
| Thứ tự | **Trang điều hành trước** (Đ0 → Đ2 → Đ3 → Đ4), cổng người dân sau (Đ1 → Đ5) |
| Gom 8 tab cổng người dân thành 5 nhóm | Theo đề xuất (làm cùng Đ1) |
| Nền Địa hình | **Như các trang tham khảo** — ô Google (mục 7.1); không tự lưu trữ bóng núi (giữ làm dự phòng) |
| Nền Vệ tinh | **Như các trang tham khảo** — ô Google (mục 7.1) |
| Thanh trạng thái dưới cùng trên máy tính | Theo đề xuất (Đ3 · 3.1) |
| Bản đồ chỉ rõ tỉnh Cao Bằng | **Có** — ngoài tỉnh làm mờ ở mọi bản đồ (mục 7.2) |
| Tài khoản người dân | **Yêu cầu mới**: phải đăng ký, đăng nhập mới gửi được phản ánh, yêu cầu cứu hộ (Đ5, mục 11) |
| Đ5 — xác minh số điện thoại (22/10/2026) | **Tạm chưa xác minh** (chưa có cổng SMS); vẫn Turnstile + giới hạn theo IP / số; có SMS thì thêm OTP |
| Đ5 — quên mật khẩu (22/10/2026) | **Gọi đường dây nóng, cán bộ tỉnh đặt mật khẩu tạm**; ai khai email thì tự lấy lại qua email |
| Đ5 — "Người mắc kẹt" (22/10/2026) | **Cũng phải đăng nhập** như yêu cầu; Gọi 112, đường dây nóng luôn mở, màn đăng nhập có "Đang nguy hiểm? Gọi ngay 112" |
| Dùng thử với người thật | Chưa chốt người tham gia, thời gian |

Còn chờ quyết định: dùng thử với người thật.

## 11. Tài khoản người dân (Đ5) — thay đổi chức năng

Yêu cầu ngày 21/10/2026: **cổng người dân phải đăng ký tạo tài khoản mới gửi được phản ánh hay yêu cầu cứu hộ (SOS).** Khác
với các đợt khác, đây là **thay đổi chức năng** (thêm API, thêm bảng dữ liệu) — làm sau cùng, có kiểm thử riêng.

### 11.1. Cách làm đề xuất

- **Không cần tài khoản**: xem bản đồ, cảnh báo, mưa, mực nước, hồ chứa, đèo dốc, điểm sơ tán, đường dây nóng, cẩm nang,
  "Bản nhẹ", tra cứu phiếu bằng mã + số điện thoại.
- **Cần tài khoản**: gửi phản ánh (kể cả "Người mắc kẹt" — báo như SOS), gửi yêu cầu cứu hộ trên cổng.
- **Gọi 112 và đường dây nóng luôn bấm được, không cần tài khoản** — người đang gặp nạn không bị kẹt ở bước đăng ký. Màn
  đăng ký có dòng "Đang nguy hiểm? Gọi ngay 112".
- Đăng ký: họ tên, số điện thoại (dùng để đăng nhập), mật khẩu, xã / phường đang ở (không bắt buộc), đồng ý cho cơ quan
  dùng thông tin để liên hệ xử lý (Nghị định 13/2023/NĐ-CP về bảo vệ dữ liệu cá nhân). Chống đăng ký ảo: xác minh chống
  spam (Turnstile) và giới hạn theo IP / số điện thoại — đã có ở form phản ánh.
- Tài khoản người dân **tách hẳn** tài khoản cán bộ: bảng riêng, phiên đăng nhập riêng — phiên người dân không gọi được API
  điều hành, phiên cán bộ không thay được phiên người dân.
- Đã đăng nhập: form phản ánh / SOS điền sẵn họ tên, số điện thoại; "Phiếu của tôi" xem tiến độ không cần nhập mã.
- Cán bộ cấp tỉnh: tìm tài khoản theo số điện thoại, khoá tài khoản phá rối, đặt lại mật khẩu khi người dân gọi đường dây
  nóng; nhật ký thao tác như tài khoản cán bộ.

### 11.2. API thêm (không đổi API cũ, trừ việc gửi phản ánh cần phiên người dân)

`POST /public/account/register` · `POST /public/account/login` · `GET /public/account/me` · `GET /public/account/reports` ·
`POST /public/reports` (thêm yêu cầu phiên người dân); trang điều hành: `GET /citizens`, `PATCH /citizens/{id}`.

### 11.3. Đã quyết định ngày 22/10/2026 (cả 3 theo đề xuất — xem mục 10)

1. **Xác minh số điện thoại**: chưa có cổng SMS (`docs/trang-b-viec-con-lai.md` BD7) nên chưa gửi được mã OTP. Đề xuất:
   tạm chấp nhận số chưa xác minh (vẫn có chống spam, giới hạn); có hợp đồng SMS thì thêm OTP.
2. **Quên mật khẩu**: chưa có SMS. Đề xuất: người dân gọi đường dây nóng, cán bộ đặt lại; ai có email thì tự lấy lại qua
   email.
3. **Phản ánh "Người mắc kẹt" cũng phải có tài khoản** như yêu cầu — xác nhận lại, vì đây là tình huống tính mạng (Gọi 112
   vẫn luôn mở).

## 12. Diện mạo "phòng chỉ huy" (23/10/2026)

Yêu cầu ngày 22/10/2026: rà từng trang của nhà quản lý, làm giao diện **bắt mắt, ấn tượng, hình ảnh và màu sắc như các
trang điều hành lớn trên thế giới**. Rà 11 trang (nền Sáng + Tối, 1440×900): chức năng rõ, chữ thống nhất — nhưng trang nào
cũng nền trắng, thẻ trắng viền xám, không chiều sâu; menu và thanh trên trắng trơn, không nhận diện; đỏ phủ khắp nơi (dải
khẩn, nút, logo, viền thẻ); nền tối xám phẳng.

Người dùng chọn (23/10/2026): hướng **"phòng chỉ huy hiện đại"** (kiểu Stripe, Linear, Palantir), **khiên xanh** thay khiên
đỏ — đỏ chỉ dành cho báo động. Nới mục 1.3 (màu chuyển nhẹ, bóng mềm, biểu tượng trong ô màu nhạt).

Nguyên tắc giữ nguyên: mục 1.1 (cùng đường dẫn, số liệu, thao tác), thang màu rủi ro chỉ cho rủi ro, chữ ≥ 4,5 : 1 ở cả hai
nền, vùng chạm 44 px, màn hình đầu theo thiết bị (mục 8), in ra giấy nền sáng không bóng. Mỗi đợt một PR, có ảnh trước / sau.

| Đợt | Việc | Trạng thái |
|---|---|---|
| 1 | Nền móng + khung: bảng màu mới (nền trang `#F1F5FA`, màu nhấn `#1D5BC7`; nền tối xanh đêm `#09101E`), thẻ bo 14 px bóng mềm, khung chữ L xanh đêm (menu trái + góc logo, thu gọn cùng menu), khiên xanh (thanh trên, đăng nhập), ô biểu tượng đầu trang theo mục menu (`layout/nav.js`), ô gợi ý nền xanh nhạt, dải khẩn đỏ chuyển nhẹ, thanh trạng thái xanh đêm | Xong — PR #127 |
| 2 | Tổng quan: khối tóm tắt nền xanh đêm có hình bóng tỉnh, ô chỉ số có ô biểu tượng màu, "Việc chờ quyết định" có biểu tượng; biểu tượng đầu tiêu đề khối (`.card-title`) trong ô màu nhạt cùng màu — áp mọi trang | Xong — PR #128 |
| 3 | Điều hành cứu hộ: bảng điều phối kiểu Kanban — thân cột lõm (màu nền trang) để thẻ phiếu trắng nổi lên, đầu cột trắng có ô biểu tượng và vạch màu nhấn (cột đã xong: xanh lá), không dùng màu rủi ro cho cột; 4 ô chỉ số có ô biểu tượng theo mức (đợt 2) | Xong — PR #129 |
| 4 | Cảnh báo & Hotline: thanh tiến trình nối liền cho mọi biểu mẫu nhiều bước (`StepChips` — soạn lệnh, nhập kho, xuất kho, đợt thiên tai, sơ tán), thẻ mẫu tin có ô biểu tượng; ô chỉ số có ô biểu tượng (đợt 2) | Xong — PR #130 |
| 5 | Vật tư & Lực lượng: "Cần bổ sung / cần sửa" — mỗi việc có ô biểu tượng loại việc (kho thiếu, sắp hết hạn, xe hỏng, thiếu nhiên liệu) màu theo mức, thanh "thấp nhất x% định mức" / nhiên liệu còn lại; ô chỉ số có ô biểu tượng (đợt 2) | Xong — PR #131 |
| 6 | Bản đồ giám sát: bảng nổi bo 14 px như thẻ (`.float-panel`), bảng "Cảnh báo khẩn cấp" có ô biểu tượng đỏ nhạt (trang đã theo kiểu bản đồ toàn màn + bảng nổi — chỉ chỉnh cho đồng bộ khung mới) | Xong — PR #132 |
| 7 | Các trang còn lại: biểu tượng trơn bên trái thẻ thành ô biểu tượng (Nhập dữ liệu — thẻ loại dữ liệu, Nguồn dữ liệu, Hướng dẫn, Phân quyền), ô số dùng chung `KpiCard` (Đợt thiên tai…) có ô biểu tượng như ô chỉ số Tổng quan; Phản ánh dùng thẻ, tab chung (đợt 1) | Xong — PR #133 |
| 8 | Đăng nhập: cột trái nền xanh đêm có chiều sâu (màu chuyển, lưới chấm mờ, quầng sáng sau hình tỉnh), thêm 3 việc chính của hệ thống, dính đỉnh cao đúng 1 màn hình; biểu mẫu trong thẻ; điện thoại: dải xanh đêm, thẻ đè mép dưới. Trang tài khoản (quên / đặt lại / đổi mật khẩu lần đầu) cùng khung, bỏ khiên đỏ; biểu trưng dùng chung `BrandMark` | Xong — PR #134 |

## 13. Giảm rối các trang ban quản lý (28/10/2026)

Người dùng thấy các trang điều hành "rối" so với trang Cảnh báo đa thiên tai của Viện Địa công nghệ và Môi trường (một bảng
lọc, bản đồ, thanh thời gian, chú giải; một màu thương hiệu, không chữ giải thích thường trực). Áp dụng hướng dẫn `distill`
và `mode-operate` của skill impeccable: mỗi màn một mục tiêu chính, ẩn bớt tới khi cần, không lặp thông tin, màu trạng thái
chỉ ở chỗ mang nghĩa — **không** bỏ chức năng, không đổi quy ước an toàn (44 px, không báo "an toàn" khi thiếu số liệu,
dải khẩn Đỏ / Cam, lối tắt SOS quá hạn ở mọi trang, 112 luôn thấy).

Chụp 6 trang ở 1440 px: phần rối lớn nhất là thành phần **dùng chung** lặp ở mọi trang (gợi ý "Bắt đầu từ đâu?" mở sẵn 3
cột chữ ở chỗ đẹp nhất — trang Cứu hộ đẩy bảng điều phối xuống; hàng chú giải màu thường trực ở Tổng quan lặp nút "?").

| Đợt | Nội dung | Trạng thái |
|---|---|---|
| 1 | Gợi ý "Bắt đầu từ đâu?" gập sẵn một dòng (Mở rộng · Hướng dẫn đầy đủ · Đã hiểu); Tổng quan: thang màu thường trực chỉ khi trình chiếu (màn thường: nút "?"), lưới cột phải không còn khoảng trống dưới gợi ý; Bản đồ giám sát: bỏ chip "N SOS" lặp ô SOS, tiêu đề bảng chữ thường (biểu tượng giữ đỏ), bảng chừa chỗ nút phóng to / thu nhỏ (trước bị che nút "+") | Xong |
| 2 | Bản đồ giám sát: câu giải thích chế độ xem gọn lại / gập được; bảng phải mở một khối mỗi lúc (Tình hình hoặc Danh mục) | Kế tiếp |
| 3 | Tổng quan: bớt tầng (khối đầu trang, Việc chờ quyết định, 6 ô số, điểm nóng) — một khối dẫn đầu | Kế tiếp |
| 4 | Cứu hộ, Cảnh báo, Vật tư: ô số chỉ viền màu khi ≥ Cam, bớt chip đỏ lặp (ô số + thẻ + dải khẩn) | Kế tiếp |

## 14. Diện mạo "Sáng thoáng" — phương án B (29/10/2026)

Chủ dự án xem 3 phương án cho Bản đồ giám sát (A phòng chỉ huy gọn · B sáng thoáng, bản đồ là chính · C tương phản cao cho
phòng trực — artifact "Phương án diện mạo PCTT Cao Bằng") và **chọn B**, kèm yêu cầu: **vẫn thể hiện đủ mọi thông tin tài
liệu thiết kế mô tả**. Chuẩn diện mạo: `frontend/DESIGN.md` (token màu, chữ, bo góc, khoảng cách; quy tắc dùng màu cảnh
báo; bảng đối chiếu mục B ↔ bố cục B). Mục 13 (giảm rối) gộp vào lộ trình này.

| Bước | Nội dung | Trạng thái |
|---|---|---|
| 1 | `frontend/DESIGN.md`; khung ứng dụng: máy tính **bỏ menu trái**, menu ngang trên thanh trên cùng (`TopNav`) — mục không đủ chỗ tự dồn vào "Thêm" (đo bề rộng thật: thanh không tràn ở 1024 / 1280 / 1440 px), "Thêm" có Dữ liệu & báo cáo, Quản trị, Trợ giúp, cổng người dân, 112; chuông SOS, Sáng / Tối trong menu tài khoản; tên cơ quan, tên tài khoản từ 1536 px. Điện thoại / máy tính bảng giữ ngăn menu ☰ và thanh đáy | Xong |
| 2 | Bản đồ giám sát theo bố cục B: bảng **Bộ lọc** trái (nền bản đồ chuyển từ thanh "Nền & Công cụ" vào đây, lớp theo 3 nhóm thiên tai, số đối tượng; mở sẵn từ 1536 px, laptop gập sẵn — chế độ xem + câu giải thích luôn thấy), **chip chỉ số khẩn** giữa trên (chỉ số từ mức Vàng, nặng nhất trước, ≤ 4, bấm = như ô Tình hình; từ 1536 px — laptop đã có 6 chỉ số ở bảng phải), góc phải trên chỉ còn **Công cụ** (đo, khoanh, dò đường, sự cố), bảng Cảnh báo khẩn cấp giữ đủ 6 chỉ số + Điểm nóng · Diễn biến · Phiếu SOS · Cảm biến; bảng nổi bo 18 px | Xong |
| 3 | Tổng quan, Cứu hộ, Cảnh báo, Vật tư, các trang còn lại theo DESIGN.md (một khối dẫn đầu, màu cảnh báo chỉ ở chỗ mang nghĩa) — chia 3a · 3b · 3c dưới đây | Xong |
| 3a | Gợi ý "Bắt đầu từ đâu?" (8 trang): không còn khung chiếm cả hàng giữa trang — một nút nhỏ ở đầu trang (cạnh "Làm mới"; điện thoại chỉ biểu tượng 💡), bấm mới mở khung 3 bước nổi trên trang (Hướng dẫn đầy đủ · Đã hiểu; Esc / bấm ra ngoài đóng). Tổng quan: một nút cho mọi thẻ (cấp tỉnh / cấp xã theo vai trò), lưới bản đồ – nhật ký bỏ hàng dành cho gợi ý | Xong |
| 3b | Tổng quan — một khối dẫn đầu: "Việc chờ quyết định" vào trong khối đầu trang xanh đêm (hàng nút việc: số · việc · thao tác, Đỏ chỉ cho việc khẩn) ở 640 – 1679 px — bớt một tầng, bản đồ điểm nóng lên cao ~50 px. Màn lớn ≥ 1680 px giữ 2 cột (việc chờ + 6 ô số cạnh bản đồ); điện thoại giữ khối riêng ngay sau 6 ô số (thiết kế A) | Xong |
| 3c | Cảnh báo: câu quy tắc soạn – duyệt thường trực ở đầu trang thành "Hai người: soạn · duyệt" + nút "?"; tên trùng vai trò ghi một lần. Nguồn dữ liệu: "Nâng cao — dành cho kỹ thuật viên" là dòng chữ nhỏ (khung chỉ khi mở). Giữ có chủ ý: viền đỏ ô SOS quá hạn (thiết kế A.2), nhãn "Quá hạn" nhấp nháy trên thẻ phiếu (thiết kế D), 3 ô giải thích cấp tài khoản (thiết kế G) — màu / chữ mang nghĩa | Xong |
| 3d | Thanh thẻ mọi trang (Tabs dùng chung, thẻ Tổng quan, bảng số liệu chi tiết) theo bản mẫu B: thanh trắng bo 14 px, thẻ đang mở chữ màu nhấn trên nền nhấn nhạt (như menu trên cùng) thay kiểu gạch chân — lớp `tab-track` / `tab-item` / `tab-item-on` (index.css) | Xong |
| 3e | Thanh trên cùng như bản mẫu B: mục menu chỉ chữ (biểu tượng chỉ trong "Thêm"), biểu trưng khiên + "ĐIỀU HÀNH PCTT / Tỉnh Cao Bằng" từ 1440 px, nút tài khoản là vòng tròn chữ viết tắt (VD QT). Menu đủ chỗ hơn: 1280 px 4 mục, 1366 px 5 mục (trước 3 / 4); không tràn ở 1024 – 1920 px | Xong |

## 15. Bản vẽ desktop mọi trang (03/11/2026)

Chủ dự án vẽ giao diện máy tính cho **tất cả các trang** (artifact Design "Phương án diện mạo PCTT Cao Bằng" — 15 nhóm, ~160
khung 1440 × 900) và yêu cầu làm đúng theo bản vẽ, **dùng luồng dữ liệu sẵn có** (không thêm API chỉ để vẽ cho giống). Phần
khung bản vẽ ghi "theo code main hiện tại" là gốc; khung con (bước form, hộp thoại, trạng thái) là chi tiết của trang đó.

Quyết định của chủ dự án (03/11/2026), thay quy ước cũ "Dải khẩn: giữ": máy tính ≥ 1024 px **bỏ hẳn dải "Khẩn cấp"** dưới thanh
trên và **bỏ số đếm cạnh mục menu**; thanh trên có nút viền đỏ "Báo cáo nhanh" + nút đỏ "N SOS chờ xử lý" (mở Điều hành cứu
hộ). Việc khẩn khác: "Việc chờ quyết định" (Tổng quan), chip trên Bản đồ. Điện thoại / máy tính bảng giữ dải khẩn + ngăn ☰.

Mỗi nhóm một PR (lint + build + ảnh chụp đối chiếu bản vẽ ở 1280 / 1440 / 1920 px, bản tối).

| Nhóm | Nội dung | Trạng thái |
|---|---|---|
| Khung | Thanh trên 68 px, nút 44 px; "Báo cáo nhanh" viền đỏ + "N SOS chờ xử lý"; menu không số đếm; địa bàn nhãn gọn "Toàn tỉnh" tới 1535 px | Xong (A1) |
| A | Tổng quan ≥ 1280 px: 3 cột vừa một màn hình — cột **Tình hình** xanh đêm (câu tóm tắt, Nguy hiểm nhất, Việc chờ quyết định, Trình chiếu · Xuất) · cột giữa (thẻ chỉ chữ + chấm mức, 6 ô số 3 × 2, khối **Điểm nóng · Biểu đồ · Bảng số liệu** với lọc Tất cả / Cam trở lên / Đỏ) · **Nhật ký sự kiện**; thẻ "Hệ thống & dữ liệu" → "Hệ thống" | Xong (A1) |
| A2 | Hàng 3 ô số riêng thẻ Mưa lớn (mưa trung bình 24 giờ · xã có thể mưa rất to · dự báo 3 ngày) và Sạt lở, lũ quét (điểm cấm đường · cảm biến vượt ngưỡng · xã vượt ngưỡng mưa sạt lở) — A4, A5; thẻ Cấp xã của cấp tỉnh = bảng các xã nặng nhất lên đầu, tìm xã, bấm dòng vào chi tiết xã (A7) | Xong (A2) |
| A (tiếp) | Tổng quan của cán bộ xã (A11); nhật ký đầy đủ dạng ngăn phải (A16); trình chiếu (A2); menu Xuất, báo cáo văn bản, báo cáo nhanh 3 bước, chọn địa bàn, kết quả tìm địa điểm | Kế tiếp |
| B1 | Bản đồ ≥ 1280 px (khung B, B2, B6): bỏ dải khẩn; bảng **Bộ lọc** mở sẵn — chế độ xem, 3 nút thiên tai (bật / tắt cả nhóm lớp), nền bản đồ, "Lớp dữ liệu chi tiết" gập sẵn; chip chỉ số khẩn gọn giữa trên; bảng cảnh báo gập thành nút "Danh mục cảnh báo" (mở ra vẫn đủ 6 chỉ số Tình hình + Điểm nóng · Diễn biến · Phiếu SOS · Cảm biến); thanh thời gian trái dưới, chú giải phải dưới. 1024 – 1279 px giữ bố cục cũ | Xong (B1) |
| B (tiếp) | Khung con: khoanh vùng → cảnh báo (B3), đánh dấu / kết thúc sự cố (B4, B10), bản tin bão (B5), tìm đường (B7), chi tiết trạm (B8), bấm điểm (B9), nền tối (B-tối) | Kế tiếp |
| Dải khẩn | Dải khẩn dùng chung (UrgentStrip — Cứu hộ, Cảnh báo, Vật tư) ẩn ở ≥ 1024 px; ui-test bỏ kiểm dải ở máy tính | Xong (C1) |
| C1 | Cứu hộ ≥ 1280 px (khung C): hàng chip 4 chỉ số (phiếu đang mở · quá hạn · người cần cứu · sơ tán — vẫn là nút lọc) + "Bản đồ cứu hộ ›" (mở bản đồ & diễn biến 48 giờ), gợi ý, làm mới; bỏ tiêu đề trang và thanh gập thường trực | Xong (C1) |
| C2 | Cứu hộ ≥ 1280 px: bảng điều phối cột nền xám (vòng số bước, "n quá hạn", câu giải thích), thẻ gọn trắng — quá hạn viền đỏ, một nút chính trọn bề ngang, việc phụ (chuyển cột, bản đồ, gọi, link nhiệm vụ, huỷ lệnh, sửa, không cần cứu) gom vào menu "⋯" (khung C, C13); hàng lọc một dòng + đổi cách xem cuối hàng, Excel / PDF vào menu "Xuất" cạnh "Bản đồ cứu hộ". Điều đội 3 bước mọi cỡ màn (C2 – C2c): "Điều đội cho SOS-…" + "Bước n/3", thanh bước vòng số, tóm tắt phiếu vạch màu mức, 3 đội gần nhất trước (xem thêm), bước 2 sửa số lượng từng mặt hàng + "kho còn" theo kho chọn | Xong (C2) |
| C3 | Cứu hộ ≥ 1280 px: bỏ cột Tiếp nhận & Sơ tán thường trực — bảng điều phối trọn bề ngang; "Nhận tin báo cứu hộ" thành hộp thoại 2 bước mở từ đầu cột Mới báo (khung C6, C6b); "Sơ tán" là cách xem thứ ba (?xem=so_tan, chip Sơ tán mở thẳng) — bảng tiến độ theo xã + cột điểm sơ tán Đã đầy / Sắp đầy / Còn chỗ (khung C9); ngăn chi tiết phiếu bên phải khi bấm thẻ / mã phiếu / "Mở phiếu" của thẻ SOS mới (khung C3) — người báo, vị trí + bản đồ, đội, trưởng nhóm, vật tư, diễn biến dựng từ các mốc giờ của phiếu; "Đội đã đến" hỏi lại trước khi ghi (khung C7); tiêu đề hộp thoại đóng / sửa / huỷ lệnh / link nhiệm vụ theo bản vẽ. Dưới 1280 px giữ như cũ | Xong (C3) |
| C (tiếp) | Danh sách gọn (C4), xã xin chi viện dạng bảng (C11), bản đồ 48 giờ thẻ lớp (C12), diễn biến sơ tán của xã (C15), ô ghi chú khi báo đội đã đến (cần API nhận ghi chú) | Kế tiếp |
| D1 | Cảnh báo ≥ 1280 px (khung D): cột trái "Cảnh báo khẩn cấp & Hotline" — các phần (Phát cảnh báo · Lịch sử lệnh · Danh bạ & Tổng đài · Nhật ký pháp lý), "Bản đồ vùng cảnh báo", quy tắc hai người, gợi ý, làm mới; bên phải hàng chip 4 chỉ số (StatCard chip — dùng chung) rồi nội dung phần: soạn lệnh giữa, chờ duyệt / đang hiệu lực cột phải 380 px | Xong (D1) |
| D2 | Cảnh báo ≥ 1280 px: lệnh chờ duyệt thẻ gọn (mã · mức, tiêu đề, "Vùng nhận: tên xã · hộ · kênh", "chờ … · soạn: …", Duyệt bằng PIN màu chính + Trả lại cao 44 px), 3 lệnh cũ nhất trước + "Xem thêm n lệnh" (khung D); hộp duyệt "Soạn: … · giờ", tóm tắt vạch màu mức, quyết định hai ô có dấu chọn "Ký duyệt & phát" · "Trả lại người soạn", nút màu chính (D4, D4b); mẫu tin 3 cột chỉ chữ, nút "Tiếp: chọn vùng nhận" / "Tiếp: kênh & gửi" / "Gửi đi duyệt"; hàng chip chỉ ở phần Phát cảnh báo (D5, D7, D9); Danh bạ + tổng đài 2 cột (D7); cột trái nói rõ "Chưa gửi tin thật" khi kênh chưa nối | Xong (D2) |
| D3 | Cảnh báo ≥ 1280 px: Lịch sử lệnh một khối (khung D5) — hàng thẻ trạng thái kèm số lệnh, ô tìm + lọc mức / kênh / nguồn + menu Xuất, bảng gọn 6 cột (vùng nhận · kênh, tình trạng kèm "còn …" / lý do, soạn · duyệt; PDF vẫn đủ cột), dòng "CB-… sắp hết hiệu lực" có Gia hạn… / Kết thúc…; hộp gia hạn / kết thúc đổi việc ngay trong hộp, ghi "Hạn mới" (D6, mọi cỡ màn); Nhật ký pháp lý một khối, hàng lọc một dòng + Xuất, câu "không sửa / xoá được" (D9) | Xong (D3) |
| D (tiếp) | Mẫu tin có chỗ trống (D8), bản đồ vùng + bảng chuyển giao (D10), mã PIN ô từng số | Kế tiếp |
| E1 | Vật tư ≥ 1280 px (khung E): 2 cột — nội dung (4 ô chỉ số, thẻ Lực lượng / Kho / Phương tiện + gợi ý, làm mới, danh sách) · "Cần bổ sung / cần sửa" dính cột phải (xếp dọc từng việc); bỏ tiêu đề trang | Xong (E1) |
| E2 | Vật tư ≥ 1440 px (khung E): 3 cột — "Bộ lọc" dọc dính bên trái (cấp quản lý, tình trạng dạng nút kèm số dòng; kỹ năng / nhóm dạng ô chọn; "Xếp"; gợi ý + làm mới + giờ số liệu ở đáy — FilterPanel dùng chung) · nội dung (ô số; hàng thẻ + ô tìm + menu "Xuất"; biểu đồ gập sẵn; danh sách) · "Cần bổ sung / cần sửa". 1280 – 1439 px giữ 2 cột của E1 (cột giữa quá hẹp cho bảng); FilterToolbar inline có `searchMin` | Xong (E2) |
| E3 | Vật tư: thẻ Kho ≥ 1280 px là bảng gọn (khung E4) — Lương thực · Nước uống · Cứu hộ, y tế theo % mặt hàng thiếu nhất, tình trạng, Xuất kho / Nhập hàng; mở từng dòng xem đủ mặt hàng, gọi thủ kho, bản đồ, sổ; hộp xuất kho, nhập kho, báo tình trạng xe, nhiên liệu cỡ vừa có phụ đề (E3, E5, E6b, E7) | Xong (E3) |
| E (tiếp) | Điều động nhanh (E2), thẻ Phương tiện (E6), sổ kho (E8) | Kế tiếp |
| G1 | Đợt thiên tai ≥ 1280 px (khung G): cột trái "Các đợt thiên tai" + nút "Mở đợt thiên tai" ở đáy cột, báo cáo đợt bên phải; bỏ tiêu đề trang và dải "Đang diễn ra" (đợt đang diễn ra đã đánh dấu trong danh sách) | Xong (G1) |
| G2 | Đợt thiên tai — hộp thoại (khung G2, G3, G4): mở / sửa đợt cỡ vừa có phụ đề nói rõ việc ("Gom phiếu SOS, lệnh điều động, cảnh báo, vật tư theo đợt để báo cáo" / tên đợt); kết thúc đợt — tiêu đề dạng câu hỏi "Kết thúc đợt DT-…?", 3 ô tóm tắt kết quả (phiếu SOS · người được cứu · cảnh báo đã phát, cùng số báo cáo đợt), câu "sau khi kết thúc… báo cáo vẫn xuất được" | Xong (G2) |
| F1 | Phản ánh người dân ≥ 1280 px (khung F): danh sách – chi tiết — cột trái thẻ trạng thái (nhãn ngắn + số), tìm, danh sách gọn (ảnh nhỏ, mã, chấm khẩn, thời gian, nội dung một dòng, xã · số ảnh); bên phải chi tiết phản ánh đang chọn (ảnh lớn, nội dung gốc, người gửi, nút 44 px); bỏ tiêu đề trang | Xong (F1) |
| F2 | Phản ánh ≥ 1280 px: phản ánh chờ duyệt — ô chi tiết 2 cột (khung F, F4): ảnh lớn, "Nội dung gốc — chỉ cán bộ thấy", người gửi (không bao giờ công khai) · "Phần công khai" soạn ngay tại chỗ (nội dung gợi ý sẵn đã che SĐT / email / giấy tờ, vị trí Làm tròn ~150 m / Vị trí chính xác, công khai ảnh, ghi chú công khai); chân ô Từ chối… · Chuyển thành phiếu SOS · Duyệt và công khai (gửi luôn, không qua hộp thoại) | Xong (F2) |
| F · G (tiếp) | Phản ánh: đã duyệt — bảng phần công khai + Sửa / Đánh dấu đã xử lý (F5), hộp từ chối / chuyển SOS / điểm sự cố (F2, F3, F6 khung) · Đợt thiên tai khung con (G2–G4) | Kế tiếp |
| H1 | Nhập dữ liệu ≥ 1280 px (khung H): danh sách loại dữ liệu luôn ở cột trái (nhóm theo cụm, loại đang chọn tô nhấn, biểu tượng "hiện cho người dân"), quy trình nhập ở giữa; bỏ tiêu đề trang, gợi ý ở hàng thẻ | Xong (H1) |
| I1 | Nguồn dữ liệu ≥ 1280 px (khung I): bỏ tiêu đề trang — hàng thẻ + "Chỉ Cấp 1 — Quản trị hệ thống" + gợi ý; thẻ nguồn 3 cột | Xong (I1) |
| H2 | Nhập dữ liệu ≥ 1280 px (khung H): cột phải "Hồ sơ xã gửi chờ duyệt" (cấp tỉnh) — tối đa 5 hồ sơ, nút "Xem & duyệt" mở thẳng hồ sơ; câu "chưa ghi vào hệ thống cho tới khi cấp tỉnh duyệt" | Xong (H2) |
| I2 | Nguồn dữ liệu ≥ 1280 px (khung I): cột phải "Thiết bị đo" — số đăng ký, đang gửi / im lặng, từng thiết bị (cách gửi · câu trạng thái, chấm màu), nút "Quản lý thiết bị đo" | Xong (I2) |
| H · I (tiếp) | Nhập dữ liệu: khung con H2–H8 · Nguồn dữ liệu: khung con I2–I8 | Kế tiếp |
| J1 | Phân quyền ≥ 1280 px (khung J): 3 ô giải thích cấp xếp dọc ở cột trái ("Cấp N" + tên, ô cấp của bạn viền nhấn, câu "chỉ cấp trên…"), bảng tài khoản bên phải; bỏ tiêu đề trang — "Bạn: …" + gợi ý ở hàng thẻ | Xong (J1) |
| K1 | Hướng dẫn xử lý ≥ 1280 px (khung K): cột trái dính — vai trò + "Bạn đang gặp việc gì?" dạng danh sách; các bước từng việc ở cột phải (đủ mọi việc để in, chạm việc thì cuộn tới), nút In ở đầu cột phải; bỏ tiêu đề trang | Xong (K1) |
| J2 | Phân quyền: tạo tài khoản 4 bước cỡ vừa "Bước n/4", chọn cấp gọn ở máy tính, Xem lại dạng bảng + ghi chú (J2 – J4); đổi cấp, khoá, đặt lại 2 lớp có phụ đề (J7 – J9); mật khẩu / PIN chọn việc Đặt lại mật khẩu · Đổi mã PIN · Cả hai, "Tạo ngẫu nhiên" mật khẩu tạm (J5, J10); nhật ký thao tác có ô tìm + lọc việc (J6); 3 cấp & quyền hạn ≥ 1280 px là bảng việc × 3 cấp dựng từ danh mục quyền của máy chủ (J11) | Xong (J2) |
| J · K (tiếp) | Khoá tài khoản ghi lý do (J8 — API chưa nhận lý do), tài khoản người dân dạng bảng (J12) · Hướng dẫn cấp xã (K2) | Kế tiếp |
| L1 | Đăng nhập ≥ 1280 px (khung L1): biểu trưng "ĐIỀU HÀNH PCTT / Tỉnh Cao Bằng" (cùng chữ thanh trên — mọi trang dùng BrandLockup), tiêu đề + việc chính ngay dưới, hình ranh giới tỉnh mờ phía dưới; bỏ "hồ" khỏi câu giới thiệu (ngoài phạm vi theo dõi) | Xong (L1) |
| M1 | Trạng thái chung: "SOS mới" khi đang ở trang khác thành thẻ nổi góc phải trên (dưới thanh trên) — Mở phiếu (mở thẳng phiếu ở Điều hành cứu hộ) · Để sau · đóng, giữ 20 giây (khung M1); dải mất kết nối có nút "Thử lại" (khung M2, giữ màu trung tính — mất mạng không phải mức nguy hiểm) | Xong (M1) |
| L2 | Đăng nhập & tài khoản: cột trái xanh đêm dùng chung (AuthAside) cho đổi / quên / đặt lại mật khẩu — thẻ giữa cột phải (L4, L5, L8); tiêu đề theo bước "Xác thực 2 lớp" / "Cài xác thực 2 lớp", "‹ Đăng nhập lại" · "Mất điện thoại? Dùng mã khôi phục" (L2); cài bắt buộc: mã QR hiện ngay, các bước đánh số cạnh mã (L3); liên kết hết hạn: báo rõ + "Gửi lại yêu cầu" (L8b); "✓ Mật khẩu đủ mạnh" | Xong (L2) |
| L (tiếp) | Menu tài khoản gọn (L6), quản lý xác thực 2 lớp (L7), mã 2 lớp 6 ô từng số | Kế tiếp |
| N1 | Cổng người dân ≥ 1280 px (khung N1): trang trải hết bề ngang; chuyên mục lên thanh trên (tên cổng 2 dòng, Gọi 112 viền đỏ + Gửi yêu cầu 44 px, Bản nhẹ dạng chữ); Bản đồ cảnh báo 3 cột — "Bạn muốn làm gì?" + ô cứu nạn khẩn cấp · bản đồ · bảng chú thích / cảnh báo / mưa | Xong (N1) |
| O1 | Nhiệm vụ trưởng nhóm ≥ 1280 px (khung O1): thanh trên tối (tên, hiệu lực tới, Gọi trực ban), 2 cột — lệnh, chỉ đường, liên lạc · lực lượng (trái) · Báo cáo về trung tâm, đã báo (phải, dính); điện thoại giữ một cột | Xong (O1) |
| O2 | Nhiệm vụ trưởng nhóm (mọi cỡ màn): "Đã cứu an toàn…" viền xanh lá, "Cần chi viện…" viền đỏ, nền nhạt cùng màu khi đang mở biểu mẫu (khung O2, O3); mất mạng khi gửi → dải "Mất kết nối mạng" trên đầu trang, giữ nguyên báo cáo — Thử lại (gửi lại đúng nội dung) · Sao chép nội dung (khung O4, màu trung tính như M2); link hết hiệu lực → "Link nhiệm vụ không còn hiệu lực", câu đời thường + "Gọi trực ban" (số trực ban 24/7 của tỉnh từ danh bạ công khai), máy tính có thanh trên tối (khung O5) | Xong (O2) |
| N2 | Cổng người dân: thanh trên vừa một hàng ở 1280 – 1440 px (sửa N1 — "Tra cứu phiếu" bị cắt): Cẩm nang an toàn chỉ ở chân trang, "n điểm cấm" trên menu từ 1536 px, dưới 1440 px bỏ nút đổi nền / chữ "Bản nhẹ" / chữ tài khoản (tên người dân từ 1536 px); "Gửi yêu cầu" từ 768 px: dải đỏ nhạt "Đang nguy hiểm… Gọi ngay 112" + 3 thẻ lớn nằm ngang (khung N6); Tra cứu phiếu ≥ 1280 px: cột trái 380 px dính — tra cứu xếp dọc + "Phiếu của tôi" dạng nút gọn (phiếu đang xem viền nhấn, kể cả mã tra cứu có đuôi) — kết quả / chưa chọn phiếu bên phải (khung N10, N10b) | Xong (N2) |
| N1 · N3 · N4 · N5 (≥ 1280 px) | Lớp bản đồ dạng chip (vẫn là ô chọn thật). Sạt lở: 4 ô số thấp, tìm + lọc một hàng (tuyến đường thành ô chọn), thẻ gọn bấm mở xem đủ — giữ dải đỏ "Cấm lưu thông" và kỹ năng qua đèo (thông tin an toàn, bản vẽ không có). Ngập lụt: bảng trạm + bản đồ, không có cột "Xu thế" vì máy chủ chưa trả số đó. Sơ tán + đường dây nóng một màn, lọc theo xã | Xong |
| N17 · N18 · N19 | Mưa dự báo theo xã: bản đồ + bảng, 24 giờ / 3 ngày; "Mức" theo thang chung, chỉ áp cho 24 giờ; không có cột "Nguồn" vì máy chủ chỉ trả số tổng hợp. Phản ánh công khai: danh sách + bản đồ + thẻ chi tiết. Thông tin tài khoản: sửa họ tên, email, xã qua API sẵn có. Bỏ câu "Địa bàn tỉnh ổn định" | Xong |
| N2b · N16 | "Tôi đang ở đâu?" ≥ 1280 px nằm trong cột trái cạnh bản đồ, ẩn cột phải khi đang xem kết quả (giữ đủ nội dung cũ). Hộp chi tiết cảnh báo mở từ "Xem cảnh báo" và liên kết ?canh-bao=. Bỏ chữ "Tình hình an toàn" | Xong |
| N (tiếp) | Cổng người dân: bản tin + 3 chuyên đề cột phải, các màn N7 – N9, N11 – N15 | Kế tiếp |
