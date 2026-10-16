# Mở cổng cho người dân: việc còn lại trên máy chủ thật

Danh sách việc trên **máy chủ thật** (tài khoản, cấu hình, dữ liệu, kiểm tra làm tay) và việc của chủ dự án trước khi công
bố địa chỉ cổng. Điều kiện và cách kiểm từng mục: [GO-LIVE.md](GO-LIVE.md). Điều kiện để thành kênh cảnh báo chính thức:
README [2.3](../README.md#23-việc-phải-xong-trước-khi-mở-cho-người-dân).

- **Trạng thái 16/10/2026** — máy chủ chạy thử chạy **v1.1.0**, `deploy/golive-check.sh`:
  - phần từ bên ngoài (HTTPS, header an toàn, Swagger tắt, 5 kịch bản đối kháng): **0 LỖI → GO**;
  - phần trong máy chủ: **11 LỖI, 5 CẢNH BÁO → NO-GO** — các việc ở mục 1–3.
- Kho mã **công khai**: không ghi vào tệp này địa chỉ máy chủ, tên tài khoản thật, mật khẩu, PIN, khoá, nội dung
  `.env.production`.
- Xong việc nào: đánh dấu `[x]` kèm ngày, chạy lại golive-check (mục 7) để xác nhận. Mục THỦ CÔNG ghi vào bảng biên bản
  cuối [GO-LIVE.md](GO-LIVE.md).

## Bảng tổng hợp

| # | Việc | Golive báo | Ai làm | Ước lượng |
|---|---|---|---|---|
| TK1 | Superadmin đích danh: đổi mật khẩu ban đầu, cài xác thực 2 lớp | LỖI + CẢNH BÁO | Superadmin | 5 phút |
| TK2 | Thêm người duyệt cảnh báo cấp tỉnh có PIN (cần ≥ 2 người trực 24/7) | LỖI | Superadmin | 10 phút |
| TK3 | Khoá tài khoản quản trị ban đầu `admin` | LỖI | Superadmin | 2 phút |
| TK4 | Đổi PIN ban đầu của Superadmin và người duyệt | THỦ CÔNG | Superadmin | 5 phút |
| CH1 | Email: mật khẩu ứng dụng Gmail (`SMTP_PASSWORD`) | LỖI | Quản trị máy chủ | 10 phút |
| CH2 | Chống spam form phản ánh: Cloudflare Turnstile | LỖI | Quản trị máy chủ | 10 phút |
| CH3 | Sao lưu ra ngoài máy chủ (`BACKUP_REMOTE`, profile `offsite`) | LỖI (2 dòng) | Quản trị máy chủ | 30 phút |
| CH4 | Báo sự cố thêm kênh chat (`OPS_ALERT_WEBHOOK_URL`) | CẢNH BÁO | Quản trị máy chủ | 10 phút |
| DL1 | Điểm sơ tán | LỖI | BCH + cán bộ nhập liệu | theo dữ liệu |
| DL2 | Vùng nguy hiểm (bản đồ phân vùng) | LỖI | BCH + cán bộ nhập liệu | theo dữ liệu |
| DL3 | Danh bạ / đường dây nóng | LỖI | BCH + cán bộ nhập liệu | theo dữ liệu |
| DL4 | Trạm quan trắc, kết nối số đo thật | LỖI + CẢNH BÁO | BCH + đơn vị quản lý trạm | theo dữ liệu |
| DL5 | Lực lượng cứu hộ, kho vật tư, phương tiện | CẢNH BÁO | BCH + cán bộ nhập liệu | theo dữ liệu |
| KT1 | Diễn tập khôi phục trên máy khác | THỦ CÔNG | Quản trị máy chủ | 30 phút |
| KT2 | Giám sát đặt ngoài máy chủ | THỦ CÔNG | Quản trị máy chủ | 15 phút |
| KT3 | Thử tải k6 trên máy thật | THỦ CÔNG | Quản trị máy chủ | 1–2 giờ |
| KT4 | Thử giao diện trên máy thật (chỉ xem) | THỦ CÔNG | Quản trị máy chủ | 20 phút |
| KT5 | Văn bản BCH: hệ thống chưa là kênh cảnh báo chính thức | THỦ CÔNG | BCH | — |
| QD1 | Thời hạn lưu dữ liệu cá nhân (`PII_RETENTION_DAYS`) | CẢNH BÁO | Chủ dự án + pháp chế | — |
| QD2 | Giấy phép radar RainViewer | — | Chủ dự án | — |
| QD3 | Tên miền chính thức (đang chạy thử bằng tên miền tạm sslip.io) | — | Chủ dự án | — |
| QD4 | Mẫu thống kê thiệt hại (DB6) | — | BCH | — |

## 1. Tài khoản (Superadmin làm trên giao diện)

- [ ] **TK1** — Đăng nhập bằng Superadmin đích danh → menu tài khoản (góc phải) → **Đổi mật khẩu** → **Xác thực 2 lớp**:
  quét mã bằng ứng dụng xác thực (Google / Microsoft Authenticator…), cất **mã khôi phục** ở nơi an toàn (mất điện thoại
  thì cần mã này).
- [ ] **TK2** — **Phân quyền** → **Tạo tài khoản công vụ** → Cấp 2 (Quản trị tỉnh) cho người duyệt thứ hai (một lãnh đạo
  khác) → điền **PIN phê duyệt cảnh báo (4–8 số)**. Người soạn không tự duyệt lệnh của mình (README 8.2) → cần ít nhất 2
  người duyệt có PIN ngoài người trực soạn tin. Người được tạo đăng nhập, đổi mật khẩu, cài xác thực 2 lớp.
- [ ] **TK3** — Chỉ làm **sau** TK1 (đã đăng nhập Superadmin đích danh, có xác thực 2 lớp): **Phân quyền** → dòng `admin` →
  **Khóa tài khoản này**.
- [ ] **TK4** — PIN ban đầu (đặt lúc cài trong `.env.production` hoặc lúc tạo tài khoản): **Phân quyền** → dòng tài
  khoản → **Đặt lại mật khẩu hoặc PIN**. Báo PIN mới trực tiếp cho người duyệt, không qua chat / email. Hệ thống không lưu
  thời điểm đổi PIN → ghi vào biên bản GO-LIVE.md.

## 2. Cấu hình máy chủ (sửa `.env.production`)

Không dán mật khẩu, khoá vào chat / email / kho mã.

- [ ] **CH1 Email** — hộp Gmail riêng của hệ thống → bật **Xác minh 2 bước** → tạo **mật khẩu ứng dụng** tại
  myaccount.google.com/apppasswords (16 chữ cái, bỏ dấu cách) → `SMTP_PASSWORD`. Kiểm tra lại `SMTP_FROM` (đúng địa chỉ ở
  `SMTP_USER`), `OPS_ALERT_EMAILS` (email người trực). Lệnh gửi thử: README 10.8, đoạn "Email bằng Gmail".
- [ ] **CH2 Turnstile** — dash.cloudflare.com → **Turnstile** → **Add widget** → hostname = tên miền cổng → chế độ
  *Managed* → chép **Site key**, **Secret key** vào `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET` (không cần build lại giao diện).
  Đổi sang tên miền chính thức (QD3) → thêm hostname mới vào widget.
- [ ] **CH3 Sao lưu ra ngoài** — tạo bucket S3 / MinIO ở **nơi khác** (khác trung tâm dữ liệu) + khoá **chỉ có quyền ghi
  bucket đó**, đặt thời hạn giữ trên kho (VD 90 ngày) → `BACKUP_REMOTE=offsite:<bucket>/caobang`, `OFFSITE_ENDPOINT`,
  `OFFSITE_REGION`, `OFFSITE_ACCESS_KEY_ID`, `OFFSITE_SECRET_ACCESS_KEY` (README 10.5). Từ đó `deploy/update.sh` tự bật
  profile `offsite` mỗi lần cập nhật.
- [ ] **CH4 Kênh chat báo sự cố** — `OPS_ALERT_WEBHOOK_URL` (POST `{"text": …}`: Slack, Mattermost, Google Chat, Telegram):
  SMTP lỗi vẫn có người biết.

Áp dụng sau khi sửa (lệnh tắt `dcp` theo README 10.8):

```bash
cd /opt/caobang-pctt
dcp --profile offsite up -d                               # máy sau Traefik (Coolify); máy dùng Caddy: thêm --profile caddy
dcp logs --tail 5 backup-offsite                          # phải có "đã chép"
sleep 20; dcp logs backend --since 2m | grep "cấu hình"   # không còn cảnh báo Turnstile / SMTP / sao lưu
```

## 3. Dữ liệu thật (BCH cung cấp, nhập ở trang **Nhập dữ liệu** — README 2.4)

Trang Nhập dữ liệu có **tệp mẫu** từng loại: tải mẫu → điền → **Kiểm tra tệp** (báo lỗi từng dòng) → **Nhập**. Xã / phường
gửi hồ sơ chờ cấp tỉnh duyệt được. **Không nhập nguyên tệp mẫu**: mã mẫu (VD `CB-LL-001`) bị golive báo LỖI.

- [ ] **DL1 Điểm sơ tán** — vị trí, sức chứa, người phụ trách, SĐT trực (hiện ngay trên cổng công khai).
- [ ] **DL2 Vùng nguy hiểm** — bản đồ phân vùng sạt lở / ngập / lũ quét chính thức.
- [ ] **DL3 Danh bạ / đường dây nóng** — BCH tỉnh, xã / phường, lực lượng; số hiện trên cổng phải là số trực thật.
- [ ] **DL4 Trạm quan trắc** — danh mục trạm + ngưỡng báo động BĐ I–III chính thức; sau đó kết nối thiết bị gửi số đo
  (README 6.4) — golive cảnh báo "chưa trạm nào có số đo trong 24 giờ".
- [ ] **DL5 Lực lượng, kho, phương tiện** — để điều động SOS có đơn vị để chọn.

Chi tiết từng loại và chỗ còn thiếu: D1 trong [trang-a](trang-a-viec-con-lai.md), BC1 trong [trang-c](trang-c-viec-con-lai.md),
CD1 trong [trang-d](trang-d-viec-con-lai.md), CE2 trong [trang-e](trang-e-viec-con-lai.md), CF1 – CF3 trong
[trang-f](trang-f-viec-con-lai.md).

## 4. Kiểm tra làm tay (ghi vào biên bản GO-LIVE.md)

- [ ] **KT1 Diễn tập khôi phục** — chép bản sao lưu mới nhất (`backups/db/pctt_….dump`) sang **máy khác** có Docker →
  `sh deploy/restore-drill.sh pctt_….dump` → ghi thời gian khôi phục.
- [ ] **KT2 Giám sát ngoài máy chủ** — UptimeRobot (miễn phí) hoặc `deploy/external-monitor.sh` trên máy khác gọi
  `https://<tên miền>/health/full` mỗi phút; thử nhận báo một lần.
- [ ] **KT3 Thử tải k6** — README 12.2 (10% dân số trong 1 giờ); chạy giờ vắng, báo trước người dùng các ứng dụng khác trên
  cùng máy.
- [ ] **KT4 Thử giao diện (chỉ xem)** — tạo 1 tài khoản Cấp 3 riêng để thử, khoá sau khi thử:
  `cd tests/ui && UI_READONLY=1 UI_USER=… UI_PASS=… node ui-test.mjs https://<tên miền>`.
- [ ] **KT5 Văn bản BCH** — ghi rõ hệ thống **chưa** là kênh cảnh báo chính thức tới khi tích hợp SMS / Cell Broadcast.

## 5. Quyết định của chủ dự án

- [ ] **QD1 Thời hạn lưu dữ liệu cá nhân** — chọn số ngày N (cùng hồ sơ đánh giá tác động xử lý dữ liệu cá nhân) →
  `PII_RETENTION_DAYS=N` → `dcp up -d worker`. Họ tên, SĐT, tin nhắn, ảnh của người dân ẩn sau N ngày (DB4 trong
  [csdl-viec-con-lai.md](csdl-viec-con-lai.md)).
- [ ] **QD2 Radar RainViewer** — điều khoản chỉ cho dùng cá nhân / giáo dục: xin phép bằng văn bản, đổi sang radar của
  KTTV, hoặc gỡ lớp radar ở bản chạy thật (BD6 trong [trang-b](trang-b-viec-con-lai.md)).
- [ ] **QD3 Tên miền chính thức** (VD `pctt.caobang.gov.vn`) — trỏ DNS về máy chủ → đổi `DOMAIN` → `dcp up -d`; cập nhật
  hostname Turnstile (CH2) và giám sát ngoài (KT2).
- [ ] **QD4 Mẫu thống kê thiệt hại** — BCH xác nhận văn bản áp dụng để làm DB6 (thiệt hại theo đợt × xã × chỉ tiêu).

## 6. Trước khi thành kênh cảnh báo chính thức (README 2.3 — cần đối tác, thời gian)

- [ ] **KC1** — Tích hợp ít nhất một kênh có báo cáo giao nhận: SMS Brandname hoặc Cell Broadcast qua nhà mạng (CE1 trong
  [trang-e](trang-e-viec-con-lai.md)); gỡ số liệu giao nhận mô phỏng khỏi giao diện.
- [ ] **KC2** — Hồ sơ cấp độ an toàn thông tin, kiểm thử xâm nhập, thông báo xử lý dữ liệu cá nhân (README 11).
- [ ] **KC3** — Diễn tập trên một xã thí điểm: soạn → duyệt → phát → người dân nhận được.
- [ ] **KC4** (nên có) — Máy chủ chính thức riêng cho hệ thống + máy dự phòng ngoài tỉnh.

## 7. Kiểm tra lại

```bash
cd /opt/caobang-pctt
DCP="docker compose -f docker-compose.prod.yml -f deploy/docker-compose.traefik.yml --env-file .env.production" \
  sh deploy/golive-check.sh <tên miền>       # máy dùng Caddy: sh deploy/golive-check.sh <tên miền>
```

Mục tiêu: phần trong máy chủ **0 LỖI**, mọi mục THỦ CÔNG có người ký trong biên bản GO-LIVE.md, rồi mới công bố địa chỉ
cổng cho người dân.
