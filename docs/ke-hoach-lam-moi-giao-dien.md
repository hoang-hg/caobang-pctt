# Kế hoạch làm mới giao diện: bắt mắt, gây ấn tượng — chức năng giữ nguyên

Kế hoạch sắp xếp lại bố cục và hình thức của **cổng người dân** và **trang điều hành**, học cách trình bày của 3 trang
tham khảo, **không đổi chức năng**: cùng đường dẫn, cùng số liệu, cùng phân quyền, cùng thao tác.

- Lập: 21/10/2026, sau đợt chỉnh giao diện cho người mới (PR #102 → #108, đã merge). **Chưa làm** phần nào trong kế hoạch
  này — mục 9 theo dõi tiến độ.
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

Làm theo **5 đợt, khoảng 12 PR**: nền móng chung trước để mọi màn cùng đẹp lên (Đ0) → cổng người dân và đăng nhập, bộ mặt
của tỉnh (Đ1) → bản đồ nền địa hình tự lưu trữ (Đ2) → khung ứng dụng, Tổng quan, Bản đồ giám sát (Đ3) → đồng bộ các trang
nghiệp vụ (Đ4). Mục 10 là các việc cần quyết định trước khi bắt đầu.

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

Chữ IN HOA giãn cách; màu chuyển; bóng phát sáng; biểu tượng đặt trong ô vuông màu; viền màu bên trái khắp nơi (chỉ dùng
cho mức rủi ro Vàng / Cam / Đỏ); khung lồng khung; biểu tượng cảm xúc (emoji); phóng to khi rê chuột; chấm nhấp nháy liên
tục; thuật ngữ tiếng Anh, viết tắt chuyên môn trên màn.

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
| Nền địa hình bóng núi | Nền "Địa hình" **tự lưu trữ** từ dữ liệu độ cao mở, thay ô ảnh Google (mục 7) | Đ2 |
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
| Thẻ | Một kiểu: nền `panel`, viền 1 px `line`, bo 12 px, không bóng. Viền màu bên trái **chỉ** khi mức Vàng / Cam / Đỏ | `ui.jsx` (KpiCard, Section), `components/dashboard/StatCard` |
| Lớp nổi trên bản đồ | Một kiểu cho mọi bảng nổi: nền `panel` đục 94 %, làm mờ phía sau 8 px, bo 12 px, một mức bóng mềm (`0 8px 24px rgb(0 0 0 / .12)`; nền tối `.40`) | `index.css` (lớp `.float-panel`), `components/map/*` |
| Ô số | Nhãn 14 · số 30–36 (màn lớn 48) · câu giải thích 14; mức rủi ro bằng chấm màu + chữ, không tô cả ô | `StatCard`, `KpiCard` |
| Bảng | Dòng cao 44–48 px, đầu bảng dính khi cuộn, số canh phải, chữ thường | `index.css` (`.table-base`) |
| Biểu tượng | lucide; nét 1,75 khi ≥ 20 px, nét 2 khi nhỏ hơn; luôn kèm chữ; **không đặt trong ô màu**; màu chữ phụ, hoặc màu nhấn khi là thao tác | rà toàn bộ |
| Chuyển động | 120 ms (bấm) · 200 ms (mở bảng, hộp thoại) · 300 ms (trượt bảng trên điện thoại) · 600–900 ms (bản đồ bay tới); chỉ dùng cho việc có ý nghĩa; máy bật giảm chuyển động → tắt | `tailwind.config.js`, `index.css` |
| Màn trống, lỗi, mất mạng | 6–8 hình nét đơn tự vẽ (SVG viết thẳng trong mã, theo màu chữ, không tải thêm tệp): chưa có phiếu, không có cảnh báo, chưa có dữ liệu, không tìm thấy, mất mạng, máy chủ lỗi — kèm một câu "cần làm gì" | `ui.jsx` (`EmptyState` thêm hình) |
| Biểu đồ | Theo `components/charts/chartTheme`: nét 2 px, lưới mờ, **một trục tung**, nhãn ghi thẳng ở điểm cuối, chú giải phía dưới, ô thông tin khi rê cùng một kiểu; màu theo vai trò (mức rủi ro hoặc thứ tự chuỗi), kiểm cho người mù màu | `charts/chartTheme.jsx` |
| Màu | Giữ biến màu hiện có (tương phản đã kiểm ≥ 4,5 : 1 ở PR #107); chỉ thêm biến nền cho lớp nổi. Không thêm màu mới | `index.css` |

Thêm một trang mẫu **chỉ chạy trên máy dev** (`/mau-giao-dien`, không vào bản chạy thật): bày mọi thành phần ở cả hai nền
để rà nhanh khi sửa. Không phải chức năng mới cho người dùng.

## 5. Khung ứng dụng: thanh trên gọn, thanh trạng thái dưới (máy tính ≥ 1024 px)

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

Phải còn đủ: định vị "Tôi đang ở đâu" và chọn theo 56 xã; điểm sơ tán gần nhất, chỉ đường; đèo dốc và lộ trình tránh; tra
cứu phiếu bằng mã + số điện thoại; hồ chứa, xả lũ; mực nước; đường dây nóng; cẩm nang; gửi phản ánh có ảnh và vị trí; Gọi
112; Bản nhẹ; Sáng / Tối; vào trang điều hành; chỉ hiện cảnh báo đã duyệt.

### 6.2. Đăng nhập (Đ1)

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

- Ảnh nền là ảnh tĩnh chụp từ bản đồ tự lưu trữ của hệ thống — trước Đ2 dùng nền Địa lý đã có, sau Đ2 đổi sang nền Địa
  hình (mục 7); WebP ≤ 150 KB, có ghi nguồn; không dùng ảnh trên mạng.
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

- Giữ **thứ tự nội dung** của PR #100, #101 (câu tóm tắt → việc chờ → 6 ô → bản đồ); chỉ đổi bố cục từ 1440 px trở lên.
  Màn đầu vẫn phải qua bài kiểm thử theo thiết bị (laptop, iPad, điện thoại).
- Ô số: bỏ viền màu khi bình thường; Vàng / Cam / Đỏ có chấm màu + chữ.
- **Chế độ trình chiếu** cho phòng điều hành (`?trinh-chieu=1`, đã có): bản đồ toàn màn, 4 số lớn, dòng diễn biến chạy
  chậm phía dưới, tự chuyển chuyên đề — nền tối.

### 6.4. Bản đồ giám sát (Đ3)

- Nền mặc định: **Địa hình tự lưu trữ** (mục 7); vẫn chọn được Địa lý, Ban đêm.
- Mọi bảng nổi dùng một kiểu `.float-panel`; giờ số liệu, toạ độ con trỏ xuống thanh trạng thái.
- Dải màu mưa liền, chữ "Mưa nhỏ → Mưa rất to" như trang tham khảo.
- Giữ: 2 chế độ xem, 4 nhóm lớp có công tắc, thanh thời gian có Phát, đo, khoanh vùng, kéo – thả điều động.

### 6.5. Trang nghiệp vụ (Đ4)

- Áp nền móng Đ0: tiêu đề 24 px, một kiểu thẻ, bảng dòng 48 px, khoảng cách theo lưới.
- Màn trống, lỗi, mất mạng có hình nét đơn + câu "cần làm gì".
- Chuyển động nhỏ: phiếu mới trượt vào cột (Cứu hộ — đã có đánh dấu phiếu mới), lệnh cảnh báo vừa duyệt chuyển cột, số trên
  ô đổi nhẹ.
- Bỏ chữ IN HOA còn lại: Phản ánh (4 chỗ), hộp thoại kho, menu tài khoản, chú giải bản đồ, bản tin bão.
- Hướng dẫn xử lý: mỗi tình huống một hình nét đơn.

## 7. Bản đồ nền địa hình tự lưu trữ (Đ2)

**Vì sao:** đẹp như trang tham khảo (bóng núi, màu rừng — hợp tỉnh miền núi); **hết rủi ro giấy phép** (điều khoản Google
không cho lấy thẳng ô ảnh như hiện nay ở nền Địa hình, Vệ tinh); chạy được khi mất kết nối quốc tế — như nền Địa lý, Ban
đêm đã tự lưu trữ (`deploy/fetch-basemap.sh`, README 6.9).

**Cách làm (không thêm thư viện):**

1. Lấy dữ liệu độ cao mở cho đúng vùng của `fetch-basemap.sh` (BBOX 103.6,21.3,108.5,24.2): SRTM 30 m (NASA) hoặc
   Copernicus DEM GLO-30 — **kiểm lại điều khoản và câu ghi nguồn** trước khi dùng.
2. Tạo bóng núi bằng GDAL (`gdaldem hillshade`, chạy trong Docker như `fetch-basemap.sh`), cắt ô, đóng gói một tệp PMTiles
   ảnh: `data/tiles/caobang-hillshade.pmtiles` — script mới `deploy/build-hillshade.sh`, chạy một lần (cần Internet,
   Docker).
   Dung lượng ước vài chục đến khoảng 200 MB tuỳ mức zoom tối đa (12 hay 13) — đo khi làm.
3. Giao diện: lớp ảnh PMTiles (`leafletRasterLayer` trong gói `pmtiles` đã có) phủ lên nền vector `light` (nền này vẽ đặc,
   đặt bóng núi bên dưới sẽ bị che): hoà trộn kiểu nhân, độ trong khoảng 40 %, đường và tên xã vẫn đọc rõ — thử, chỉnh khi
   làm → nền "Địa hình" mới. Máy chưa có tệp → tự dùng nền Địa lý như hiện nay.
4. Ghi nguồn trên bản đồ: "© OpenStreetMap · Độ cao: <nguồn đã chọn>".
5. Nền **Vệ tinh**: chưa có nguồn mở đủ chi tiết với điều khoản rõ — **cần quyết định** (mục 10).

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
| Giấy phép bản đồ, ảnh, font | Chỉ dùng nguồn mở có điều khoản rõ và ghi nguồn; không lấy ảnh trên mạng; font Be Vietnam Pro (OFL) |
| Người đã quen giao diện cũ bỡ ngỡ | Gợi ý 3 bước theo vai trò cập nhật cùng PR; đổi theo đợt; ghi thay đổi trong Hướng dẫn xử lý |
| Kiểu "làm cho có" quay lại | Rà theo mục 1.3 trước khi merge; bài quét tự động (mục 8) |

## 9. Lộ trình và theo dõi tiến độ

| Đợt | PR | Nội dung | Tệp chính | Nghiệm thu | Trạng thái |
|---|---|---|---|---|---|
| Đ0 | 0.1 | Nền móng: thang chữ, khoảng cách, thẻ, lớp nổi, ô số, bảng, chuyển động, màn trống có hình, biểu đồ; trang mẫu (máy dev) | `index.css`, `tailwind.config.js`, `ui.jsx`, `StatCard`, `chartTheme.jsx` | Ảnh trước / sau 6 màn; kiểm thử toàn bộ đạt | Chưa làm |
| Đ0 | 0.2 | Dọn kiểu "làm cho có": 41 chữ IN HOA, 16 màu chuyển, biểu tượng trong ô màu, phóng to khi rê; thêm bài quét tự động | rà toàn bộ `frontend/src` | Bài quét đạt; không đổi bố cục | Chưa làm |
| Đ1 | 1.1 | Cổng người dân trên máy tính: bản đồ toàn màn, "Bạn muốn làm gì?", dải cảnh báo, thanh thời gian, thanh trạng thái | `pages/public/PublicPortal.jsx` | Đủ danh sách 6.1; đường dẫn cũ mở được | Chưa làm |
| Đ1 | 1.2 | Cổng người dân trên điện thoại + menu 5 nhóm + trang con cùng kiểu | `PublicPortal.jsx`, `ReportForm`, `TicketTracker`, `ReservoirMonitor`, `LandslideMonitor`, `MissionPage` | 360 px: bản đồ ≥ 60 % màn đầu, Gọi 112 luôn thấy | Chưa làm |
| Đ1 | 1.3 | Đăng nhập 2 cột, ảnh nền địa hình | `pages/Login.jsx` | Đủ chức năng đăng nhập; ảnh ≤ 150 KB | Chưa làm |
| Đ2 | 2.1 | Nền Địa hình tự lưu trữ: script tạo tệp, lớp ảnh, nền mặc định ở cổng và Bản đồ | `deploy/build-hillshade.sh`, `components/map/MapTools.jsx`, README 6.9 | Máy có tệp → nền địa hình; chưa có → nền Địa lý; ghi nguồn đúng | Chưa làm (chờ quyết định mục 10) |
| Đ3 | 3.1 | Thanh trên gọn + thanh trạng thái (máy tính); menu chữ thường | `components/layout/Header.jsx`, `Sidebar.jsx`, khung trang | Không mất nút nào (chỉ chuyển chỗ) | Chưa làm |
| Đ3 | 3.2 | Tổng quan màn lớn 2 cột; chế độ trình chiếu phòng điều hành | `pages/Dashboard.jsx`, `components/dashboard/*` | Bài kiểm thử màn đầu theo thiết bị đạt | Chưa làm |
| Đ3 | 3.3 | Bản đồ giám sát: lớp nổi thống nhất, nền mặc định, dải màu mưa | `pages/MonitoringMap.jsx`, `components/map/*` | Kiểm thử Bản đồ đạt | Chưa làm |
| Đ4 | 4.1 | Cứu hộ, Cảnh báo, Phản ánh theo nền móng; chuyển động nhỏ | `pages/RescueCenter.jsx`, `pages/Alerts.jsx`, `pages/CitizenReports.jsx` | Kiểm thử từng trang đạt | Chưa làm |
| Đ4 | 4.2 | Vật tư, Đợt thiên tai, Nhập dữ liệu, Nguồn dữ liệu, Phân quyền theo nền móng | các trang tương ứng | Kiểm thử từng trang đạt | Chưa làm |
| Đ4 | 4.3 | Hướng dẫn xử lý có hình; rà toàn bộ hai nền, 360 px; dùng thử lần 2 | `pages/Guide.jsx`, `utils/guides.js` | Bài "5 giây" đạt với 3 nhóm người dùng | Chưa làm |

Mỗi PR: một phần, CI xanh mới merge; triển khai lên máy chủ theo đợt, có duyệt.

## 10. Cần quyết định trước khi làm

1. **Thứ tự**: đề xuất Đ0 → Đ1 (cổng người dân — người dân và lãnh đạo thấy đầu tiên) → Đ2 → Đ3 → Đ4. Hay ưu tiên trang
   điều hành (Đ3) trước cổng người dân?
2. **Gom 8 tab cổng người dân thành 5 nhóm** (đủ 8 màn; `?tra-cuu=`, `?canh-bao=` giữ nguyên).
3. **Nền Địa hình tự lưu trữ**: đồng ý chạy script tạo tệp trên máy chủ (một lần, vài chục đến khoảng 200 MB); sau khi nền
   mới đạt thì bỏ nền Địa hình đang lấy ô ảnh Google.
4. **Nền Vệ tinh**: (a) giữ ô ảnh Google — rủi ro giấy phép; (b) chuyển sang nguồn có hợp đồng / khoá truy cập; (c) bỏ nền
   Vệ tinh.
5. **Thanh trạng thái dưới cùng** trên máy tính (chuyển đồng hồ, kết nối, chuông SOS, giờ số liệu xuống dưới).
6. **Dùng thử với người thật**: ai tham gia, khi nào (sau Đ1 và sau Đ3).
