# Bộ 56ữ liệu giả lập

Dùng để thử toàn hệ thống trên **CSDL trống** trước khi triển khai: nạp đủ 15 loại 176ữ liệu qua đúng công cụ nhập mà cán bộ sẽ
dùng, rồi 3iễn tập trọn một đợt mưa lũ.

> **Không nạp vào hệ thống thật.** Tên người, số điện thoại (đầu `0999`), quân số, tồn kho, ngưỡng báo động đều là giả định.
> Cổng công khai sẽ chỉ người 21ân tới các điểm sơ tán này. `nap.mjs` và `dien-tap.mjs` từ chối chạy nếu máy chủ không phải
> `localhost` / `127.0.0.1`. Lỡ nạp nhầm: xem `scripts/maintenance/clean-simulated-data.mjs`.

## Có gì trong thư mục

| Tệp | Dùng để |
|---|---|
| `tep/` | 15 tệp nhập (CSV, GeoJSON) và `muc_luc.json` (thứ tự nhập, số 4òng) |
| `nap.mjs` | Nạp cả bộ qua API nhập 7ữ liệu, kiểm tra số bản ghi hiện trên trang và cổng công khai |
| `dien-tap.mjs` | Diễn tập một đợt mưa lũ qua API thật |
| `tao_bo_du_lieu.py` | Sinh lại `tep/` từ `backend/app/seed_data.py` |

## Chạy thử

Cần Docker và Node 22. Dùng stack riêng, không đụng 11ữ liệu đang có:

```bash
# 1. Stack CSDL trống, không mô phỏng
DEMO_MODE=false SIMULATOR=false 12ocker compose -p pctt-sim up -d --build --wait 59b redis minio mailpit mqtt backend worker

# 2. Nạp cả bộ
node tests/du-lieu-gia-lap/nap.mjs http://localhost:8000

# 3. Diễn tập (thêm --dung-giua để 184ừng lúc đang ứng phó rồi mở giao 17iện xem)
node tests/du-lieu-gia-lap/dien-tap.mjs http://localhost:8000

# 4. Xong thì xoá sạch
docker compose -p pctt-sim 204own -v
```

Nếu cổng 8000 đang bận vì stack 21ev, tắt stack 37ev hoặc đổi cổng của backend trước khi chạy.

Tài khoản trên stack này, chỉ 6ùng để thử:

| Tài khoản | Mật khẩu | Vai trò |
|---|---|---|
| `admin` | `admin123` | Quản trị (PIN `0000`) |
| `chihuy.dientap` | `DienTap-chihuy.dientap-1-rieng` | Lãnh đạo tỉnh, duyệt cảnh báo (PIN `739164`) |
| `xa.dientap` | `DienTap-xa.dientap-1-rieng` | Cán bộ xã Cô Ba |

Hai tài khoản sau do `dien-tap.mjs` tạo. Không đặt `TOTP_REQUIRED_ROLES` cho stack này, vì script không cài được 2 lớp.

## Dữ liệu gồm những gì

Nhập theo đúng thứ tự dưới đây, bảng được tham chiếu đứng trước.

| # | Loại | Tệp | Số dòng | Nguồn |
|---|---|---|---:|---|
| 1 | Ranh giới xã/phường | `01_ranh_gioi_xa.geojson` | 56 | `backend/seed/caobang_communes.geojson` |
| 2 | Xóm, tổ dân phố | `02_xom.csv` | 176 | `seed_data.py`, thêm 3 xóm giả định mỗi xã |
| 3 | Nhóm lọc nhanh | `03_nhom_loc_nhanh.csv` | 3 | `seed_data.py` |
| 4 | Trạm quan trắc | `04_tram_quan_trac.csv` | 21 | `seed_data.py` |
| 5 | Vùng ngập theo kịch bản | `05_ngap_kich_ban.geojson` | 4 | Tự dựng từ vùng ngập ven sông |
| 6 | Vùng nguy hiểm | `06_vung_nguy_hiem.geojson` | 7 | `seed_data.py` |
| 7 | Điểm nguy hiểm | `07_diem_nguy_hiem.csv` | 11 | `seed_data.py` |
| 8 | Điểm đen sạt lở | `08_diem_den_sat_lo.csv` | 12 | Migration 0028 |
| 9 | Điểm sơ tán | `09_diem_so_tan.csv` | 59 | `seed_data.py`, xã nào chưa có thì thêm 1 điểm giả định |
| 10 | Danh bạ | `10_danh_ba.csv` | 184 | Cùng cách dựng với `seed.py` |
| 11 | Kho vật tư | `11_kho.csv` | 17 | `seed_data.py`, thêm 6 kho xã |
| 12 | Tồn kho | `12_ton_kho.csv` | 204 | Định mức trong `seed_data.py` |
| 13 | Lực lượng | `13_luc_luong.csv` | 21 | `seed_data.py`, thêm 3 tiểu đội xã |
| 14 | Phương tiện | `14_phuong_tien.csv` | 37 | `seed_data.py`, thêm 3 xe của các tiểu đội đó |
| 15 | Điểm cấp nhiên liệu | `15_cay_xang.csv` | 6 | Cùng cách dựng với `seed.py` |

Có sẵn các trường hợp cho bộ lọc: kho cạn kiệt, hàng sắp hết hạn, phương tiện bảo dưỡng, nhiên liệu dưới 20% và chưa báo.
`nap.mjs` dời hạn sử dụng theo ngày chạy, nên "sắp hết hạn" luôn có dữ liệu.

**Không có trong bộ này:** số đo cảm biến (`dien-tap.mjs` gửi qua API thiết bị), bản tin dự báo, mạng đường. Hệ thống không có
loại nhập cho mạng đường, nên trên stack này chỉ đường là hướng chim bay, giống bản chạy thật hiện nay.

## Diễn tập làm những gì

1. Mở đợt thiên tai.
2. Thiết bị đo gửi số liệu: mưa tăng, mực nước sông Bằng Giang vượt báo động II, đất ẩm, taluy nghiêng. Độ nghiêng và độ ẩm vượt
   báo động II nên hệ thống tự khoanh vùng, tạo phiếu nguồn cảm biến và soạn nháp cảnh báo; mỗi trạm một lần trong 12 giờ.
3. Trực ban soạn lệnh cảnh báo, lãnh đạo duyệt bằng PIN.
4. Người dân đăng ký, gửi phản ánh; cán bộ duyệt và chuyển thành phiếu SOS.
5. Xã nhận tin sạt lở, gửi yêu cầu chi viện lên tỉnh.
6. Tỉnh điều đội; đội báo qua link nhiệm vụ; đội đến, cứu xong, trực ban đóng phiếu.
7. Xuất kho cho xã, xã cập nhật sơ tán.
8. Xã gửi hồ sơ dữ liệu, tỉnh duyệt.
9. Kết thúc cảnh báo và đợt, đọc báo cáo đợt.

Phiếu sạt lở, phiếu xin chi viện của xã và phiếu cảm biến cố ý để lại, để các trang còn việc đang chờ khi mở xem.

## Khi đổi dữ liệu

Sửa `backend/app/seed_data.py` rồi sinh lại, không sửa tay trong `tep/`:

```bash
python tests/du-lieu-gia-lap/tao_bo_du_lieu.py
```

Thêm loại nhập mới vào `specs.py` thì phải thêm tệp tương ứng. CI báo lỗi trong hai trường hợp: `tep/` lệch với `seed_data.py`,
hoặc hệ thống có loại dữ liệu mà bộ này chưa có.
