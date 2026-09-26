# Cổng công khai, API công khai & phản ánh của người dân

## 1. Cổng công khai (`/`, `/cong-khai`)

Người dân mở trang web **không cần đăng nhập** (người đã đăng nhập vào `/` sẽ được chuyển tới `/dashboard`; vẫn xem được cổng ở `/cong-khai`).

| Khối | Nội dung |
|---|---|
| Băng trạng thái | Mức rủi ro chung toàn tỉnh, số cảnh báo đang hiệu lực, lượng mưa 24h |
| **Tôi đang ở đâu?** | Lấy GPS của điện thoại → xã/phường đang đứng, cảnh báo & vùng nguy hiểm liên quan, **điểm sơ tán gần nhất** (còn chỗ), **chỉ đường an toàn** tránh vùng nguy hiểm |
| Bản đồ | Dự báo mưa theo xã (tô màu), vùng nguy hiểm, đường bị chia cắt, trạm đo, điểm sơ tán, phản ánh đã xác minh |
| Cảnh báo chính thức | Chỉ lệnh đã được **duyệt và phát** (Maker–Checker); nút **Chia sẻ** → trang có thẻ Open Graph để hiện đẹp trên Zalo/Facebook; link `?canh-bao=MÃ` mở thẳng cảnh báo |
| Sông, dự báo | Mực nước so với BĐ I/II/III; các xã mưa nhiều nhất 24h/72h tới (ECMWF + GFS) |
| Đường dây nóng | Số trực ban tỉnh / 112 / số chung — không có SĐT cá nhân cán bộ |
| Phản ánh | Danh sách phản ánh **đã được cán bộ xác minh** kèm ảnh và ghi chú xử lý; nút **Gửi phản ánh** |

## 2. API công khai `/api/v1/public/*`

| Endpoint | Mô tả | Cache |
|---|---|---|
| `GET /overview` | Tóm tắt: mưa, sông, cảnh báo, SOS **chỉ đếm theo xã** | 30 s |
| `GET /map` | GeoJSON: vùng nguy hiểm, đường chia cắt, trạm, điểm sơ tán | 30 s |
| `GET /alerts` | Cảnh báo đang phát / đã phát | 30 s |
| `GET /alerts/{code}/share` | Trang HTML chia sẻ (Open Graph) | – |
| `GET /forecast/areas?hours=24\|72`, `/forecast/areas/{code}` | Dự báo mưa theo xã, P10/P50/P90 | 5 phút |
| `GET /locate?lat&lon` | Xã, cảnh báo, điểm sơ tán gần nhất | – |
| `GET /route?from_lat…` | Đường an toàn tới điểm sơ tán | – |
| `GET /hotlines` | Đường dây nóng | 1 giờ |
| `GET /reports`, `/reports/{id}/photos/{idx}` | Phản ánh **đã duyệt** + ảnh | 30 s |
| `GET /report-categories` | Loại sự việc | – |
| `POST /reports` | Gửi phản ánh (multipart, tối đa 3 ảnh × 8 MB) | – |

### Ẩn thông tin nhạy cảm (nguyên tắc)
Không bao giờ trả ra công khai: vị trí và quân số lực lượng, kho, phương tiện; nội dung/toạ độ/số điện thoại trong phiếu SOS;
danh bạ cán bộ; họ tên, SĐT, IP người phản ánh; phản ánh chưa duyệt hoặc bị từ chối; cảnh báo nháp/chờ duyệt.
`scripts/public-test.mjs` quét toàn bộ phản hồi công khai để phát hiện các trường này.

### Giới hạn tần suất (theo IP, cửa sổ cố định, Redis)

| Quy tắc | Giới hạn |
|---|---|
| Gửi phản ánh | 5 / giờ |
| Chỉ đường | 20 / phút |
| Định vị | 30 / phút |
| API công khai khác | 120 / phút |
| Đăng nhập | 30 / phút (+ khoá tài khoản 15′ sau 10 lần sai) |
| Quên mật khẩu / đặt lại | 5 / giờ, 10 / giờ |
| API nội bộ | 600 / phút |

Vượt giới hạn → HTTP **429** kèm `Retry-After`. Sau reverse proxy, IP lấy từ `X-Forwarded-For` (nginx đã cấu hình; gunicorn `--forwarded-allow-ips`).

## 3. Phản ánh của người dân

```
Người dân gửi (ảnh + vị trí + mô tả)          chống spam: honeypot, giới hạn 5/giờ, Turnstile (tuỳ chọn),
        │                                       vị trí phải trong tỉnh, chỉ JPEG/PNG/WebP
        ▼
 cho_duyet ──(admin xã / chỉ huy cụm / admin tỉnh đúng địa bàn: report.moderate)──┐
   │   │                                                                           │
   │   └─ Từ chối (tu_choi, ghi lý do — không công khai)                           │
   ├─ Duyệt (da_duyet, ghi chú công khai) → hiện trên cổng                         │
   │     └─ Đã xử lý (da_xu_ly)                                                    │
   └─ Chuyển thành phiếu SOS (giữ liên kết, không chuyển 2 lần) ◄──────────────────┘
```

- Phản ánh được gán xã theo vị trí → chỉ cán bộ có quyền ở xã đó (hoặc cụm/tỉnh chứa xã) thấy và duyệt được.
  Phản ánh mới đẩy thông báo realtime (`report.new`) cho đúng những người đó.
- **Ảnh**: xoay theo EXIF rồi **xoá toàn bộ EXIF/GPS**, chặn ảnh bomb (> 40 megapixel), mã hoá lại JPEG 1600 px + ảnh nhỏ 400 px,
  lưu MinIO bucket riêng tư (không có MinIO → thư mục cục bộ). Ảnh chưa duyệt chỉ xem được qua link **có chữ ký HMAC, hết hạn sau 1 giờ**.
- Họ tên, SĐT người gửi chỉ cán bộ duyệt thấy; IP chỉ lưu dạng băm (phục vụ chống lạm dụng).
