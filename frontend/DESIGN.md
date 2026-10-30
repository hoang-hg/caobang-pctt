---
version: alpha
name: PCTT Cao Bằng — Sáng thoáng (phương án B)
description: Hệ thống điều hành phòng chống thiên tai tỉnh Cao Bằng — bản đồ là chính, một màu nhấn, màu cảnh báo chỉ ở chỗ mang nghĩa.
colors:
  primary: "#1D5BC7"
  primary-soft: "#EEF3FC"
  ink: "#1E293B"
  ink-2: "#334155"
  muted: "#5A6578"
  ground: "#F1F5FA"
  surface: "#FFFFFF"
  surface-2: "#F4F7FB"
  line: "#E2E8F0"
  night: "#0B1A33"
  risk-red: "#D03B3B"
  risk-orange: "#EC835A"
  risk-yellow: "#F7C800"
  risk-green: "#0CA30C"
  risk-gray: "#64748B"
  red-text: "#C42E2E"
  orange-text: "#C2410C"
  yellow-text: "#8C5304"
  green-text: "#147839"
typography:
  page-title:
    fontFamily: Be Vietnam Pro
    fontSize: 24px
    fontWeight: 700
    lineHeight: 1.2
  section-title:
    fontFamily: Be Vietnam Pro
    fontSize: 15px
    fontWeight: 700
    lineHeight: 1.3
  body:
    fontFamily: Be Vietnam Pro
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: Be Vietnam Pro
    fontSize: 12px
    fontWeight: 600
    lineHeight: 1.3
  number-lg:
    fontFamily: Be Vietnam Pro
    fontSize: 28px
    fontWeight: 700
    lineHeight: 1.1
  code:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: 500
rounded:
  control: 10px
  card: 14px
  floating: 18px
  pill: 999px
spacing:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 20px
  2xl: 24px
  touch: 44px
---

# PCTT Cao Bằng — diện mạo "Sáng thoáng" (phương án B)

Chủ dự án chọn phương án B ngày 29/10/2026 (bảng so sánh 3 phương án: artifact "Phương án diện mạo PCTT Cao Bằng"), sau
khi so với trang Cảnh báo đa thiên tai của Viện Địa công nghệ và Môi trường. Yêu cầu kèm theo: **vẫn thể hiện đủ mọi
thông tin tài liệu thiết kế mô tả** — diện mạo đổi chỗ đặt và cách hiện, không bớt chức năng. Kế hoạch triển khai:
`docs/ke-hoach-lam-moi-giao-dien.md` mục 14.

## Overview

Một phòng điều hành sáng, thoáng: **bản đồ là nhân vật chính**, khung ứng dụng mỏng (một thanh trên cùng, không menu
trái ở máy tính), bảng nổi trắng bo tròn trên bản đồ, một màu nhấn xanh dương. Màu Đỏ / Cam / Vàng / Xanh **chỉ dùng cho
mức rủi ro** (thang chung `frontend/src/utils/risk.js`) — nhờ vậy cái khẩn luôn nổi lên ngay. Ấn tượng đến từ sự rõ ràng:
nhìn là biết chỗ nào nguy hiểm, bấm vào đâu.

## Colors

- **Primary — Xanh hoàng gia (#1D5BC7):** màu nhấn DUY NHẤT: nút chính, mục menu đang mở, chọn lọc, thanh thời gian.
  Nền nhạt của mục đang chọn: **Primary soft (#EEF3FC)**.
- **Ink (#1E293B) / Ink-2 (#334155) / Muted (#5A6578):** chữ chính / phụ / chú thích — đều ≥ 4,5 : 1 trên nền.
- **Ground (#F1F5FA), Surface (#FFFFFF), Surface-2 (#F4F7FB), Line (#E2E8F0):** nền trang, thẻ và bảng nổi, ô nhập, đường kẻ.
- **Night (#0B1A33):** chỉ cho khối nổi bật đầu Tổng quan, trình chiếu, nền tối — không còn là menu trái.
- **Thang rủi ro (không dùng cho việc khác):** Đỏ #D03B3B khẩn cấp · Cam #EC835A nguy hiểm · Vàng #F7C800 theo dõi ·
  Xanh #0CA30C dưới ngưỡng · Xám #64748B chưa có số liệu. Chữ mang màu mức dùng bản sắc đậm (*-text) để đủ 4,5 : 1.
- Nền tối dùng các biến `.dark` trong `src/index.css` (giữ nguyên cách tính tương phản đã kiểm).

## Typography

Một họ chữ **Be Vietnam Pro** (dấu tiếng Việt rõ), số dùng `font-variant-numeric: tabular-nums` (lớp `num`); **JetBrains
Mono** chỉ cho mã kỹ thuật (mã phiếu trong trang kỹ thuật, khoá). Tối đa 4 cỡ trên một màn: tiêu đề trang 24 px, tiêu đề
khối 15 px, chữ thường 14 px, nhãn 12 px; số lớn 28 px. Không chữ IN HOA dàn rộng cho câu dài (nhãn nhóm 11 px in hoa
trong bảng lọc là ngoại lệ, chỉ một từ).

## Layout

- **Khung ứng dụng (máy tính ≥ 1024 px):** MỘT thanh trên cùng cao 56 px — biểu trưng · menu các trang (từ 1280 px đủ 6
  mục điều hành; 1024–1279 px 4 mục, còn lại trong "Thêm") · "Thêm ▾" (Dữ liệu & báo cáo, Quản trị, Trợ giúp, 112) ·
  bộ lọc địa bàn · tìm kiếm · Báo cáo nhanh · tài khoản. Không menu trái. Thanh không bao giờ tràn ngang; bộ lọc địa bàn
  luôn trên thanh.
- **Điện thoại / máy tính bảng (< 1024 px):** giữ nguyên — nút ☰ mở ngăn menu, thanh thao tác ở đáy (vùng ngón cái).
- **Dải khẩn:** giữ (quy ước an toàn), một dòng.
- **Trang có bản đồ:** bản đồ tràn hết phần dưới thanh trên cùng; mọi thứ khác là bảng nổi trắng bo 18 px cách mép 20 px.
- **Trang dạng danh sách / biểu mẫu:** lề theo `PAGE` (`components/layout/page.js`), khoảng cách 12–16 px giữa khối.
- Lưới khoảng cách: 4 · 8 · 12 · 16 · 20 · 24 px; vùng chạm cảm ứng ≥ 44 px (`tap`, `tap-sq`, `touch-hit`).

### Bản đồ giám sát — đối chiếu tài liệu thiết kế (mục B) ↔ bố cục B

| Yêu cầu | Đặt ở đâu |
|---|---|
| B.1 bản đồ toàn màn, bảng nổi | Bản đồ tràn dưới thanh trên cùng |
| B.1 bảng lớp dữ liệu (trái) | Bảng **Bộ lọc** trái: chế độ xem (Xem tình hình / Điều hành) · lớp theo 3 nhóm thiên tai (Mưa lớn · Sạt lở, lũ quét · Ngập lụt) · trạm, sự cố, nguồn lực · nền bản đồ · số đối tượng từng lớp |
| B.1 thanh thời gian, radar (đáy) | Đáy trái (nút Phát, −12 h … +24 h); chú giải mưa / radar đáy phải |
| B.1 bảng cảnh báo khẩn cấp (phải) + dòng diễn biến | Nút **Danh mục cảnh báo** mở ngăn phải: Tình hình (6 chỉ số) · Điểm nóng · Diễn biến · Phiếu SOS · Cảm biến |
| Chỉ số khẩn | Chip tròn nổi giữa trên (SOS quá hạn, đèo cấm đường, trạm vượt BĐ, mưa lớn nhất) — bấm mở đúng tab |
| B.1 công cụ: đo, khoanh vùng, đánh dấu sự cố | Cụm nút nhỏ góc phải trên |
| B.2 lớp (trạm, điểm đen, vùng ngập, kho, điểm sơ tán, SOS…) · B.3 popup, camera, khoanh vùng → cảnh báo, tìm đường · B.4 kéo – thả điều động, âm báo SOS | Giữ nguyên |

## Elevation & Depth

Hai mức: **thẻ** (`--shadow-card`, viền 1 px) trên nền trang; **bảng nổi** trên bản đồ (`--shadow-float`
`0 8px 24px rgb(15 23 42 / .12)`). Không bóng cho thứ nằm phẳng trong thẻ. In ra giấy: bỏ bóng.

## Shapes

Ô nhập, nút: bo 10 px. Thẻ: 14 px. Bảng nổi trên bản đồ: 18 px. Chip trạng thái, thanh thời gian: tròn hẳn (999 px).

## Components

- **Nút chính:** nền Primary, chữ trắng; một nút chính tô màu mỗi khối. Nút Báo cáo nhanh / SOS: nền Đỏ (duy nhất được
  tô đỏ vì là hành động khẩn).
- **Chip trạng thái (trên bản đồ):** nền trắng, chấm màu mức + số đậm + nhãn; bấm được (dẫn tới danh sách đã lọc).
- **Thanh thẻ (`Tabs`, thẻ Tổng quan, bảng số liệu):** thanh trắng bo 14 px viền 1 px (lớp `tab-track`), thẻ bo 10 px; thẻ đang mở chữ Primary trên nền Primary soft (`tab-item-on`) — cùng kiểu mục menu trên cùng; không gạch chân.
- **Mục menu trên cùng:** chữ Muted; đang mở: chữ Primary trên nền Primary soft; số đếm khẩn: chip đỏ nhỏ.
- **Gợi ý người mới ("Bắt đầu từ đâu?"):** một nút phụ ở đầu trang (`PageHeader` `tips`), bấm mới mở khung 3 bước nổi —
  không khung gợi ý thường trực giữa trang.
- **Ô chỉ số (`StatCard`):** nền trắng; vạch màu trái CHỈ khi mức ≥ Vàng (quy ước cũ, giữ).
- Thành phần dùng chung giữ nguyên tên, nằm ở `components/common/ui.jsx`.

## Do's and Don'ts

- **Nên:** để bản đồ chiếm chỗ; một bảng nổi mở mỗi lúc; số liệu khẩn ở chip, chi tiết trong ngăn; nói rõ khi thiếu số
  liệu (Xám, "chưa có số liệu" — không bao giờ "an toàn").
- **Không:** dùng Đỏ / Cam / Vàng / Xanh làm màu trang trí hay thương hiệu; thêm màu nhấn thứ hai; đặt chữ hướng dẫn
  thường trực (dùng "?" hoặc gợi ý gập sẵn); bỏ thông tin tài liệu thiết kế yêu cầu để cho gọn — chuyển nó vào ngăn,
  tab, popup.
