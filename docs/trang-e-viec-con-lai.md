# Trang E – Cảnh báo khẩn cấp & Hotline: đối chiếu thiết kế và việc còn lại

Đối chiếu với mục **E. Thiết kế chi tiết mục Cảnh báo Khẩn cấp & Hotline** (tài liệu thiết kế Part 1) và các yêu cầu giao
diện chung (màu rủi ro thống nhất, thông tin khẩn trên cùng, thao tác chính dễ bấm, bảng có tìm / lọc / phân trang / xuất
Excel – PDF, form chia bước báo lỗi ngay khi nhập, trạng thái tải / trống / lỗi / mất mạng, 360 px, theo phân quyền). Hai
nhóm người dùng: **cán bộ hiện trường** (điện thoại, thao tác nhanh, nút to, ít gõ) và **lãnh đạo / quản lý** (nắm tình
hình trong vài giây qua chỉ số, bản đồ, biểu đồ, cảnh báo nổi bật).

- Cập nhật: 15/10/2026 — mã nguồn `main` gồm PR #76 (bố cục, lịch sử lệnh, danh bạ, nhật ký pháp lý), #77 (form chia bước,
  ký duyệt, thanh thao tác nhanh), #78 (bản đồ vùng cảnh báo, chuyển giao theo kênh, tài liệu này).
- Máy chủ thử vẫn chạy **v1.0.3**, **chưa có** các thay đổi trên — xem V1 trong `docs/trang-a-viec-con-lai.md` (triển khai
  chung cho mọi trang).
- Dữ liệu nền dùng chung với trang A: `docs/trang-a-viec-con-lai.md` mục 2 (danh bạ, xóm…), README 2.4 (mẫu nhập "Danh bạ").

**Kết luận:** trang E đã có đủ những gì mục E mô tả về giao diện: dải thông tin khẩn (lệnh chờ duyệt, cảnh báo Rất cao,
sắp hết hiệu lực, chưa tới điện thoại người dân), 4 ô chỉ số, lịch sử lệnh, danh bạ, nhật ký pháp lý tra cứu / lọc /
xuất được, trạng thái tải / lỗi / mất mạng (PR #76); soạn lệnh 3 bước có mẫu tin, chọn vùng bằng chạm hoặc vẽ trên bản đồ,
ký duyệt / gia hạn / kết thúc bằng PIN báo lỗi ngay, thanh thao tác dưới đáy điện thoại (PR #77); bản đồ vùng đang có cảnh
báo, biểu đồ chuyển giao theo kênh (PR #78).

**Việc còn lại hầu hết là tích hợp bên ngoài** (mục 4): **các kênh gửi tin tới điện thoại người dân** (CE1 — SMS Brandname,
Cell Broadcast, Zalo OA / ZNS, thông báo đẩy, loa thông minh; hiện lệnh đã duyệt chỉ công bố trên cổng công khai và bản
nhẹ — giao diện nói thẳng điều này); danh bạ thật (CE2); tổng đài SIP / WebRTC, ghi âm, IVR thật (CE3); số thuê bao / người
theo dõi Zalo / loa thật theo vùng (CE4); mô hình dự báo lũ quét – sạt lở 3 giờ tới (CE5). Ký duyệt bằng sinh trắc học (CE6)
chờ quyết định.

## 1. Đối chiếu với thiết kế mục E (rà ngày 15/10/2026, theo từng ý)

| Yêu cầu của thiết kế | Hiện trạng |
|---|---|
| E.1 Zalo OA API: tin đa phương tiện (ảnh vùng ngập, bản đồ sơ tán, hướng dẫn) tới người theo dõi Zalo OA tỉnh | **Chưa** — kênh có trong form, số người theo dõi ước tính, nhưng chưa nối Zalo OA của tỉnh (CE1); tin chỉ văn bản |
| E.1 Push Notification (Critical Alerts) qua ứng dụng | **Chưa** — chưa có ứng dụng / FCM nối với hệ thống (CE1) |
| E.1 SMS Brandname & Cell Broadcast tới thuê bao trong vùng | **Chưa** — cần hợp đồng nhà mạng (CE1); hiện ước tính số thuê bao theo dân số vùng (CE4) |
| E.1 Mẫu tin dựng sẵn có tham số, thao tác dưới 10 giây | Đạt — chạm chọn mẫu (chấm màu theo mức), tham số có nhãn (số phải là số), nội dung tự điền, mức theo mẫu; xem lại trước khi gửi |
| E.2 Khoanh vùng: vẽ đa giác trên bản đồ hoặc chọn các xã ven sông | Đạt — "Vẽ vùng trên bản đồ" mở sẵn công cụ khoanh của Bản đồ giám sát (`?cong-cu=khoanh`) → "Soạn cảnh báo"; lưu vực chọn nhanh; chạm chọn xã (tìm không dấu) |
| E.2 Lọc danh sách thuê bao, tài khoản Zalo, loa trong vùng | **Một phần** — ước tính hộ / thuê bao / người theo dõi Zalo / người dùng ứng dụng / loa theo diện tích giao cắt từng xã; danh sách thật cần nhà mạng, Zalo, hệ thống loa (CE4) |
| E.2 Kích hoạt từ cảm biến (độ nghiêng, mưa vượt ngưỡng) → bản nháp sơ tán chờ Trưởng ban duyệt | Đạt — độ nghiêng / độ ẩm đất vượt BĐ II → vùng nguy cơ 1 km, phiếu SOS, bản nháp "Di dời khẩn cấp" (thẻ "Tự động", lọc nguồn "tự động" trong lịch sử), thư báo người duyệt. Chạy với **số đo thật** gửi qua MQTT / API nhận số liệu (theo ngưỡng khai báo của từng thiết bị) lẫn trạm mô phỏng ở máy thử; thiết bị gửi lặp không tạo trùng. Mưa vượt ngưỡng: xem dòng dưới |
| E.2 Kích hoạt từ mô hình dự báo (3 giờ tới nguy cơ cao → "Chuẩn bị sơ tán") | **Một phần** — mưa dự báo 24 giờ (Open-Meteo, kết hợp mô hình) vượt ngưỡng → bản nháp "Chuẩn bị sơ tán" (12 giờ / lần); dự báo mực nước 3 giờ tới (HEC-HMS) mới chạy ở bộ mô phỏng (CE5) |
| E.3 Danh bạ phân cấp Tỉnh → Xã → Thôn: tên, chức vụ, SĐT, bộ đàm, trạng thái | Đạt — trạng thái trực bằng chữ, tìm không dấu, lọc cấp / trạng thái, Excel / PDF làm bản dự phòng; số liệu mẫu (CE2) |
| E.3 Tổng đài web (WebRTC / SIP): bấm số trên màn hình để gọi, ghi âm | **Chưa** — nút "Gọi" mở cuộc gọi của điện thoại / phần mềm gọi (`tel:`), chưa ghi âm (CE3, = BC3 trang C) |
| E.3 Phân luồng cuộc gọi SOS theo phím bấm (IVR) | **Một phần** — mô phỏng IVR để tập huấn (phím 1 ngập, 2 sạt lở, 3 y tế, 0 trực ban; có lời nhắn → phiếu SOS), ghi rõ chưa nối tổng đài thật (CE3) |
| E.4 Maker – Checker: người soạn ≠ người duyệt, xác nhận PIN hoặc sinh trắc học | Đạt (PIN) — máy chủ chặn tự duyệt, khoá PIN 15 phút sau 5 lần sai; lỗi hiện ngay dưới ô PIN. Sinh trắc học: chưa (CE6) |
| E.4 Bảng giám sát tỷ lệ chuyển giao theo thời gian thực | **Một phần** — biểu đồ theo kênh (đã nhận / đã gửi / chưa gửi), từng lệnh có thanh giao nhận, cập nhật tức thì; số liệu chỉ có khi kênh tích hợp — hiện ghi "chỉ trên cổng", không vẽ tỉ lệ giả (CE1) |
| E.4 Nhật ký pháp lý: ai tạo, ai duyệt, nội dung, giờ gửi | Đạt — mọi thao tác ghi máy chủ (cả sai PIN); tra theo khoảng ngày, lọc nhóm / kết quả / người, Excel / PDF |
| Chung: màu theo mức rủi ro, thống nhất | Đạt — Rất cao Đỏ, Cao Cam, Trung bình Vàng ở thẻ lệnh, chip, bản đồ vùng, ô chỉ số; chip "Đã phát" chữ đen đủ tương phản |
| Chung: thông tin khẩn trên cùng | Đạt — dải khẩn dính trên cùng (lệnh chờ duyệt lâu, cảnh báo Rất cao, sắp hết hạn, chưa tới điện thoại, lệnh bị từ chối) |
| Chung: thao tác chính dễ bấm | Đạt — "Phê duyệt" trọn hàng trên điện thoại; thanh dưới đáy Chờ duyệt · Soạn lệnh · Báo SOS · Danh bạ · Gọi 112; vùng chạm ≥ 44 px |
| Chung: bảng tìm / lọc / phân trang / Excel – PDF | Đạt — lịch sử lệnh, danh bạ, nhật ký pháp lý |
| Chung: form chia bước, báo lỗi ngay | Đạt — soạn lệnh 3 bước; ký duyệt, gia hạn, kết thúc: lỗi dưới ô, con trỏ về ô lỗi |
| Chung: trạng thái tải / trống / lỗi / mất mạng | Đạt — API lỗi → "không có nghĩa là không có lệnh chờ duyệt" (trước đây hiện "Không có lệnh chờ duyệt"); mất mạng → nút ghi tắt |
| Chung: 360 px | Đạt — 0 px tràn ngang, 0 vùng chạm < 44 px (trước: danh bạ tràn 270 px, 146 vùng chạm nhỏ) |
| Chung: theo phân quyền | Đạt — soạn: quyền soạn trong phạm vi xã được giao; duyệt / gia hạn: máy chủ trả từng lệnh; nhật ký: quyền xem nhật ký; tài khoản xã chỉ xem cảnh báo trong xã |

## 2. Bảng tổng hợp việc còn lại

| # | Việc | Phụ thuộc | Cần ai cung cấp | Ưu tiên |
|---|---|---|---|---|
| GE1 | **Bố cục, danh sách, trạng thái**: dải khẩn, ô chỉ số, thẻ lệnh, lịch sử lệnh, danh bạ, nhật ký pháp lý (tra theo ngày), tải / lỗi / mất mạng, 360 px | API nhật ký thêm khoảng ngày (sửa nhỏ) | — | **Đã làm** (PR #76) |
| GE2 | **Thao tác**: soạn lệnh 3 bước, ký duyệt / gia hạn / kết thúc báo lỗi ngay, thanh thao tác nhanh, vẽ vùng từ form | Không đổi API | — | **Đã làm** (PR #77) |
| GE3 | **Cho lãnh đạo**: bản đồ vùng đang có cảnh báo, chuyển giao theo kênh | Không đổi API | — | **Đã làm** (PR #78) |
| CE1 | **Kênh gửi tin tới người dân**: SMS Brandname, Cell Broadcast, Zalo OA / ZNS, thông báo đẩy, loa thông minh | Hợp đồng + tích hợp | Nhà mạng, Zalo OA của tỉnh, đơn vị làm ứng dụng / hệ thống loa (= BD10 trang B, BC4 trang C, CD3 trang D) | **Cao nhất** (khi vận hành) |
| CE2 | **Danh bạ thật**: cán bộ PCTT các cấp, SĐT, tần số bộ đàm, trạng thái trực | Dữ liệu | Văn phòng BCH tỉnh, các xã (mẫu nhập "Danh bạ") | Cao |
| CE3 | **Tổng đài SIP / WebRTC**: gọi từ màn hình, ghi âm, IVR phân luồng thật | Tích hợp tổng đài | Đơn vị cung cấp tổng đài (= BC3 trang C) | Trung bình |
| CE4 | **Người nhận thật theo vùng**: số thuê bao, người theo dõi Zalo, loa | Dữ liệu từ nhà mạng / Zalo / hệ thống loa | như CE1 | Trung bình |
| CE5 | **Dự báo lũ quét – sạt lở 3 giờ tới** cho kích hoạt tự động | Mô hình / bản tin | Đài KTTV, cơ quan địa chất (cùng CD6 trang D, BD6 trang B) | Trung bình |
| CE6 | Ký duyệt bằng sinh trắc học (vân tay / khuôn mặt trên điện thoại) | Quyết định + WebAuthn | Chủ dự án | Thấp |

## 3. Việc giao diện đã làm

### GE1 — Bố cục, danh sách, trạng thái (PR #76)

- **Dải thông tin khẩn** (`UrgentStrip`): lệnh chờ phê duyệt (Đỏ khi Rất cao hoặc chờ quá 10 phút), cảnh báo Rất cao đang
  hiệu lực, sắp hết hiệu lực (Cam), lệnh chỉ công bố trên cổng, lệnh bạn soạn bị từ chối (Vàng).
- **4 ô chỉ số** (`AlertKpis`): đang hiệu lực, chờ phê duyệt (nhấp nháy khi chờ lâu), người nhận tin, chuyển giao.
- **Thẻ lệnh** (`BroadcastCards`), **lịch sử lệnh** (`BroadcastHistory`), **danh bạ** (`ContactDirectory`), **tổng đài**
  (`HotlinePanel`), **nhật ký pháp lý** (`AuditLog`; API `/alerts/audit?since=&until=`, tối đa 5.000 dòng).

### GE2 — Thao tác (PR #77)

- **Soạn lệnh 3 bước** (`Composer`): mẫu tin → vùng nhận (lưu vực, xã, vùng vẽ) → kênh & gửi (xem lại).
- **Ký duyệt** (`ApproveModal`), **gia hạn / kết thúc** (`ManageModal`): ô PIN to, lỗi dưới ô (cả lỗi máy chủ), lý do chọn
  nhanh.
- **Thanh thao tác dưới đáy điện thoại**; Bản đồ giám sát mở sẵn công cụ khoanh với `?cong-cu=khoanh`.

### GE3 — Cho lãnh đạo (PR #78)

- **Bản đồ vùng đang có cảnh báo** (`AlertMap`): xã tô theo cảnh báo nặng nhất đang hiệu lực, vùng vẽ tay nét đứt, rê / chạm
  xã → các lệnh; danh sách xã theo mức (không chỉ dựa vào màu).
- **Chuyển giao theo kênh** (`DeliveryChart`): một trục 0–100%, đã nhận / đã gửi / chưa gửi, số tuyệt đối trong hộp chú thích;
  kênh chưa tích hợp → nói rõ, không vẽ tỉ lệ giả.
- Khối "Bản đồ vùng cảnh báo & chuyển giao" ở đầu thẻ Phát cảnh báo (các thẻ tra cứu — lịch sử, danh bạ, nhật ký — không bị
  đẩy xuống): laptop / iPad mở sẵn, điện thoại thu gọn (không tải ranh giới xã khi chưa mở).

## 4. Việc chờ dữ liệu / hệ thống bên ngoài

### CE1 — Kênh gửi tin tới người dân

- **Hiện trạng:** lệnh đã duyệt được **công bố trên cổng công khai và bản nhẹ** (người dân mở trang thấy ngay); SMS / Cell
  Broadcast / Zalo / thông báo đẩy / loa **chưa gửi thật**. Giao diện ghi rõ "chưa tới điện thoại người dân" ở dải khẩn, ô
  chỉ số, thẻ lệnh, biểu đồ chuyển giao. Chế độ mô phỏng (`SIMULATOR=true`, máy thử) sinh số liệu giao nhận giả để tập huấn.
- **Cần:** hợp đồng SMS Brandname / Cell Broadcast với nhà mạng; Zalo OA + ZNS của Ban Chỉ huy; ứng dụng di động có thông báo
  đẩy; hệ thống loa thông minh có giao diện lập trình.
- **Việc lập trình khi có:** thay bộ mô phỏng (`services/broadcast.py: advance_delivery`) bằng cổng gửi + báo cáo trạng thái
  từ nhà cung cấp; giao diện không phải sửa (số liệu chuyển giao tự hiện).

### CE2 — Danh bạ thật

- **Hiện trạng:** máy thử dùng danh bạ mẫu; bản chính thức (CSDL trống) chưa có danh bạ — cổng công khai chỉ hiện 112 / 113 /
  114 / 115. Nhập bằng mẫu "Danh bạ & đường dây nóng" (`danh_ba`, README 2.4); xã gửi danh bạ cấp xã / thôn qua "Gửi dữ liệu
  chờ duyệt", tỉnh duyệt.
- **Cần:** danh sách cán bộ PCTT các cấp theo quyết định kiện toàn BCH; cập nhật khi thay đổi nhân sự.

### CE3 — Tổng đài SIP / WebRTC

Giống BC3 trang C: tổng đài có giao diện lập trình (gọi ra, ghi âm, trạng thái cuộc gọi, IVR). Khi có: nút "Gọi qua tổng đài"
cạnh nút gọi trực tiếp, nhật ký cuộc gọi thật thay khối mô phỏng IVR.

### CE4 — Người nhận thật theo vùng

Số thuê bao / người theo dõi Zalo / người dùng ứng dụng / loa hiện **ước tính** theo dân số và diện tích giao cắt từng xã
(`estimate_audience`). Khi tích hợp kênh (CE1), lấy số thật từ nhà mạng / Zalo / hệ thống loa — form soạn và biểu đồ chuyển
giao dùng ngay.

### CE5 — Dự báo lũ quét – sạt lở 3 giờ tới

Kích hoạt tự động theo mưa dự báo 24 giờ đã chạy với nguồn Open-Meteo. Dự báo mực nước 3 giờ tới (HEC-HMS) mới có trong bộ
mô phỏng; cần bản tin / mô hình chính thức (Đài KTTV) và ngưỡng mưa gây lũ quét – sạt lở theo vùng.

### CE6 — Ký duyệt bằng sinh trắc học

PIN 4–8 số + xác thực 2 lớp khi đăng nhập đang dùng. Sinh trắc học (WebAuthn: vân tay / khuôn mặt trên điện thoại của lãnh đạo)
làm được về kỹ thuật — chờ chủ dự án quyết định (thiết bị, quy trình khi mất máy).

## 5. Kiểm tra khi có dữ liệu thật

1. Triển khai bản mới (V1 của trang A).
   - Khi lắp trạm thật: khai báo ngưỡng BĐ cho từng thiết bị. Gửi thử một số đo độ nghiêng / độ ẩm đất vượt BĐ II, kiểm tra
     đủ ba thứ: vùng nguy cơ trên Bản đồ, phiếu SOS ở trang Cứu hộ, bản nháp "Di dời khẩn cấp" chờ ký trên trang này
     (luồng có sẵn; `tests/e2e/iot-test.mjs` kiểm tra bước vùng nguy cơ). Bản nháp luôn phải được lãnh đạo ký PIN mới phát.
2. Nhập danh bạ thật (CE2); mở `/canh-bao` trên máy tính, iPad, điện thoại:
   - dải khẩn / ô chỉ số khớp danh sách lệnh; chạm ô "Chờ phê duyệt" ra đúng các lệnh;
   - danh bạ: tìm vài cán bộ theo tên không dấu, gọi thử; xuất Excel làm bản dự phòng.
3. Diễn tập Maker – Checker: trực ban soạn lệnh (mẫu tin, vùng vẽ trên bản đồ), lãnh đạo duyệt bằng điện thoại (PIN), gia hạn
   / kết thúc; kiểm tra nhật ký pháp lý ghi đủ, xuất PDF.
4. Khi có kênh gửi tin (CE1): theo dõi biểu đồ chuyển giao trong đợt diễn tập, đối chiếu báo cáo của nhà mạng / Zalo.

## 6. Tham chiếu mã nguồn

| Phần | Tệp |
|---|---|
| Trang Cảnh báo khẩn cấp & Hotline (thẻ trên địa chỉ, dải khẩn, thanh thao tác nhanh) | `frontend/src/pages/Alerts.jsx` |
| Số liệu suy ra: giai đoạn của lệnh, bộ lọc, xếp, dải khẩn, nhãn nhật ký | `frontend/src/components/alerts/alertFacts.js` |
| Ô chỉ số, thẻ lệnh, lịch sử lệnh | `components/alerts/AlertKpis.jsx`, `BroadcastCards.jsx`, `BroadcastHistory.jsx` |
| Soạn lệnh, ký duyệt / gia hạn / kết thúc | `components/alerts/Composer.jsx`, `AlertModals.jsx` |
| Danh bạ, tổng đài, nhật ký pháp lý | `components/alerts/ContactDirectory.jsx`, `HotlinePanel.jsx`, `AuditLog.jsx` |
| Bản đồ vùng cảnh báo, chuyển giao theo kênh | `components/alerts/AlertMap.jsx`, `DeliveryChart.jsx` |
| API cảnh báo, danh bạ, tổng đài, nhật ký | `backend/app/api/v1/alerts.py` |
| Ước tính người nhận, mô phỏng giao nhận, điều kiện "đang hiệu lực" | `backend/app/services/broadcast.py` |
| Kích hoạt tự động (cảm biến, dự báo), thư báo người duyệt | `backend/app/integrations/ingest.py` (`ingest_readings` → `check_triggers`: số đo thật), `services/simulator.py` (`check_triggers`, `sensor_hotspot`, `auto_draft`), `integrations/runner.py` (`forecast_alerts`), `services/alert_watch.py` |
| Kiểm thử | `tests/ui/ui-test.mjs` (khối "Cảnh báo khẩn cấp"), `tests/e2e/rbac-test.mjs` (nhật ký theo khoảng ngày), `tests/e2e/prod-flow.mjs` (Maker – Checker), `tests/e2e/iot-test.mjs` (số đo thật vượt BĐ II → vùng nguy cơ tự động) |

## 7. Các thay đổi đã làm cho trang E (để tra cứu)

| PR | Nội dung |
|---|---|
| #76 | Dải thông tin khẩn, 4 ô chỉ số; 4 thẻ trên địa chỉ trang; thẻ lệnh gọn trên 360 px; lịch sử lệnh (tìm, lọc, Excel / PDF); danh bạ không tràn ngang, nút Gọi, Excel / PDF; nhật ký pháp lý theo khoảng ngày (API thêm since / until, tối đa 5.000 dòng); API lỗi không còn ghi "không có lệnh chờ duyệt"; tách trang thành `components/alerts/*` |
| #77 | Soạn lệnh 3 bước; ký duyệt / gia hạn / kết thúc: PIN và lý do báo lỗi dưới ô (cả lỗi máy chủ); thanh thao tác dưới đáy điện thoại; Bản đồ mở sẵn công cụ khoanh (`?cong-cu=khoanh`) |
| #78 | Bản đồ vùng đang có cảnh báo, biểu đồ chuyển giao theo kênh; tài liệu này |
