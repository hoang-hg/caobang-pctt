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
một hàng cuộn ngang, danh sách lớp thu vào nút — bản đồ từ giữa màn đầu. Còn ở 1.2: menu 5 nhóm thay 8 tab, dải cảnh báo nổi
trên bản đồ ở điện thoại (bản đồ ≥ 60 % màn đầu), trang con cùng kiểu. Thanh thời gian chưa đưa ra cổng (cổng chưa có số liệu
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

- Phủ một lớp mờ lên mọi thứ ngoài ranh giới tỉnh: nền Sáng phủ trắng khoảng 70 %, nền Tối / Vệ tinh phủ tối khoảng 65 %;
  ranh giới tỉnh màu nhấn có viền nền (không dùng đỏ — đỏ chỉ cho mức Khẩn cấp). Đang lọc một xã thì phần ngoài xã cũng mờ
  (như hiện nay).
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
| 11 | Đ1 · 1.2 | Cổng người dân trên điện thoại + menu 5 nhóm + trang con cùng kiểu | `PublicPortal.jsx`, `ReportForm`, `TicketTracker`, `ReservoirMonitor`, `LandslideMonitor`, `MissionPage` | 360 px: bản đồ ≥ 60 % màn đầu, Gọi 112 luôn thấy | Chưa làm |
| 12 | Đ5 · 5.1 | Tài khoản người dân — máy chủ: bảng, đăng ký, đăng nhập, phiên riêng; gửi phản ánh / SOS cần phiên người dân (mục 11) | `backend/app/api/v1/public.py`, bảng mới + migration, kiểm thử | Kiểm thử API: không phiên → từ chối; phiên cán bộ không dùng thay được | Chưa làm |
| 13 | Đ5 · 5.2 | Tài khoản người dân — giao diện: đăng ký, đăng nhập, "Phiếu của tôi"; Gọi 112 luôn mở | `pages/public/*` | Người dân mới đăng ký, gửi được phản ánh không cần gọi hỏi | Chưa làm |
| 14 | Đ5 · 5.3 | Cán bộ quản lý tài khoản người dân: tìm theo số điện thoại, khoá, đặt lại mật khẩu | trang điều hành (quyền cấp tỉnh) | Kiểm thử quyền | Chưa làm |

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
| Dùng thử với người thật | Chưa chốt người tham gia, thời gian |

Còn chờ quyết định: các câu hỏi của Đ5 ở mục 11.3.

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

### 11.3. Cần quyết định trước khi làm Đ5

1. **Xác minh số điện thoại**: chưa có cổng SMS (`docs/trang-b-viec-con-lai.md` BD7) nên chưa gửi được mã OTP. Đề xuất:
   tạm chấp nhận số chưa xác minh (vẫn có chống spam, giới hạn); có hợp đồng SMS thì thêm OTP.
2. **Quên mật khẩu**: chưa có SMS. Đề xuất: người dân gọi đường dây nóng, cán bộ đặt lại; ai có email thì tự lấy lại qua
   email.
3. **Phản ánh "Người mắc kẹt" cũng phải có tài khoản** như yêu cầu — xác nhận lại, vì đây là tình huống tính mạng (Gọi 112
   vẫn luôn mở).
