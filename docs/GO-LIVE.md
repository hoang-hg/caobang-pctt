# Kiểm tra trước khi mở cổng cho người dân (Go / No-Go)

Chỉ công bố địa chỉ cổng khi **cả 7 điều kiện** dưới đây đạt và có người ký xác nhận. Chạy lại toàn bộ trước mỗi lần
nâng cấp lớn.

Kiểm tra tự động các điều kiện 2–7 (chạy trên máy chủ thật, trong thư mục cài đặt):

```bash
cd /opt/caobang-pctt && sh deploy/golive-check.sh pctt.caobang.gov.vn
```

Kết quả mỗi dòng mang một trong bốn nhãn:
- **ĐẠT**
- **LỖI**: phải sửa, script kết luận NO-GO
- **CẢNH BÁO**: cần xem xét
- **THỦ CÔNG**: máy không tự kiểm được, cần người xác nhận và ghi vào bảng cuối tài liệu

Script chỉ đọc dữ liệu. Ngoại lệ duy nhất là 2 lần tra cứu sai dùng SĐT giả, và chúng không khoá tra cứu của người thật.

## 1. Mã nguồn

- [ ] Commit sẽ triển khai đã qua CI đủ 4 job (Backend, Frontend, E2E gồm kiểm thử giao diện, Production).
- [ ] Image được build từ đúng commit đó (tag `vX.Y.Z`, README 10.4).

## 2. Cấu hình (tự động: phần "2. Cấu hình")

- Không có lỗi hay **cảnh báo** khởi động: Turnstile, SMTP thật, `BACKUP_REMOTE`, TOTP bắt buộc cho vai trò lãnh đạo.
- `APP_ENV=production`, không bật `DEMO_MODE` / `SIMULATOR`.

## 3. Dữ liệu (tự động: phần "3. Dữ liệu")

- Đã nhập ranh giới xã, điểm sơ tán, vùng nguy hiểm, danh bạ đường dây nóng và trạm quan trắc (README mục 2.4).
- Mọi trạm mực nước có **ngưỡng báo động I/II/III chính thức**.
- Không còn:
  - tài khoản demo;
  - SĐT mẫu `0999 …`;
  - bản ghi của tệp mẫu nhập dữ liệu (mã `…-001`, ví dụ `CB-LL-001`).

## 4. Tài khoản (tự động: phần "4. Tài khoản")

- Superadmin và các vai trò bắt buộc 2 lớp đều đã cài TOTP.
- Tài khoản `admin` ban đầu đã khoá (sau khi đã có Superadmin đích danh).
- Có **ít nhất 2 người duyệt cảnh báo** toàn tỉnh, có PIN, trực 24/7.
- **Thủ công:** Superadmin và người duyệt đã đổi PIN ban đầu (hệ thống không lưu thời điểm đổi PIN).

## 5. Sao lưu (tự động: phần "5. Sao lưu"; diễn tập: thủ công)

- Bản sao lưu CSDL không cũ quá 26 giờ; đã chép ra kho ngoài máy chủ (`backup-offsite`).
- **Diễn tập khôi phục trên một máy khác** (chỉ cần Docker, không đụng hệ thống đang chạy):

  ```bash
  # Lấy bản sao lưu mới nhất từ kho ngoài về máy khác (README 10.5), rồi:
  sh deploy/restore-drill.sh backups/db/pctt_<ngày_giờ>.dump backups/photos/photos_<ngày_giờ>.tar.gz
  ```

  Script in ra số bản ghi của các bảng chính và thời gian khôi phục. Đối chiếu số bản ghi với máy chủ thật tại thời
  điểm sao lưu, rồi ghi vào bảng cuối tài liệu. Diễn tập lại ít nhất mỗi quý.

## 6. Giám sát (tự động: phần "6. Giám sát"; giám sát ngoài: thủ công)

- Tự giám sát bên trong đạt; có SMTP và người nhận email sự cố. Nên có thêm `OPS_ALERT_WEBHOOK_URL`.
- **Giám sát ngoài máy chủ** gọi `https://<tên miền>/health/full` mỗi phút và báo khi không trả 200. Chọn một trong các cách:
  - UptimeRobot;
  - Uptime Kuma chạy trên máy khác;
  - hệ thống giám sát của trung tâm dữ liệu;
  - `deploy/external-monitor.sh` chạy bằng cron trên máy khác:

  ```bash
  * * * * * URL=https://pctt.caobang.gov.vn/health/full WEBHOOK=https://… sh /opt/pctt-monitor/external-monitor.sh
  ```

- **Thủ công:** đã thử và nhận được báo. Có hai cách thử:
  - đặt `OPS_DISK_WARN_PCT=1` rồi `dcp up -d worker`: phải nhận email trong ~2 phút;
  - dừng mạng máy chủ (hoặc trỏ `URL` tới đường dẫn sai): giám sát ngoài phải báo.

## 7. Kiểm thử trên máy thật

- **Tự động:** HTTPS / HSTS / header an toàn, `/health/full`, Swagger tắt, `/ban-nhe` < 50 KB, và 5 kịch bản đối kháng:

  | Kịch bản | Nội dung |
  |---|---|
  | T1 | Phản ánh công khai không lộ người báo |
  | T2 | Bản đồ công khai không có lực lượng, kho, phương tiện |
  | T3 | Tra cứu sai SĐT không xác nhận mã có thật |
  | T4 | Ảnh: chưa duyệt không xem được, link nội bộ phải có chữ ký, không còn EXIF |
  | T5 | API nội bộ đóng với người chưa đăng nhập |

  Máy chủ không gọi được chính tên miền của nó (NAT) thì chạy phần này từ máy khác:
  `docker run --rm <image backend> python -m app.golive_web https://<tên miền>`.
- **Thủ công, giao diện chỉ xem** trên máy thật (khổ máy tính và điện thoại; không gửi, không điều động, không duyệt):
  `cd tests/ui && npm ci && npx playwright install chromium && UI_READONLY=1 UI_USER=… UI_PASS=… node ui-test.mjs https://<tên miền>`.
  Dùng tài khoản xem riêng, khoá sau khi thử.
- **Thủ công, kiểm thử tải k6** (README 12.2) trên máy chủ thật, mức 10% dân số trong 1 giờ.
- **Thủ công, văn bản của BCH**, nêu rõ tới khi tích hợp SMS / Cell Broadcast / Zalo:
  - hệ thống **chưa phải kênh cảnh báo chính thức**;
  - lệnh cảnh báo chỉ công bố trên cổng;
  - lệnh điều động không tự gửi tới đội.

  Nội dung gợi ý:

  > Cổng thông tin PCTT & TKCN tỉnh Cao Bằng cung cấp thông tin tham khảo (bản đồ nguy cơ, mực nước, điểm sơ tán, tiếp
  > nhận phản ánh). Cảnh báo chính thức vẫn phát qua kênh hiện hành của BCH (phát thanh, loa, tin nhắn nhà mạng, chính
  > quyền cơ sở). Khi gặp nguy hiểm đến tính mạng, gọi ngay 112.

## Biên bản

| Điều kiện | Kết quả | Người kiểm tra | Ngày |
|---|---|---|---|
| 1. Mã nguồn: CI đạt, commit / tag | | | |
| 2. Cấu hình | | | |
| 3. Dữ liệu chính thức | | | |
| 4. Tài khoản, đổi PIN | | | |
| 5. Sao lưu + diễn tập khôi phục: máy ___, bản sao lưu ___, khôi phục mất ___ giây, số bản ghi khớp: có / không | | | |
| 6. Giám sát ngoài: dịch vụ ___, đã nhận báo thử lúc ___ | | | |
| 7. HTTPS + T1–T5, giao diện chỉ xem, k6 (___ người / giờ), văn bản BCH số ___ | | | |

**Quyết định:** ☐ GO ☐ NO-GO · Người quyết định: ______________ · Ngày: __________
