#!/bin/sh
# Kiểm tra Go / No-Go trước khi mở cổng cho người dân (docs/GO-LIVE.md). Chạy TRÊN MÁY CHỦ THẬT, trong thư mục cài đặt:
#   cd /opt/caobang-pctt && sh deploy/golive-check.sh pctt.caobang.gov.vn
#
# 1. Trong máy chủ (container worker, chỉ đọc): cấu hình khởi động sạch cả cảnh báo, dữ liệu chính thức đã nhập / không
#    còn dữ liệu mẫu, tài khoản (2 lớp, admin ban đầu, ≥ 2 người duyệt có PIN), sao lưu + chép ra ngoài, tự giám sát.
# 2. Từ bên ngoài qua tên miền: HTTPS / HSTS / header an toàn, /health/full, Swagger tắt, 5 kịch bản đối kháng T1–T5.
# Mã thoát 0 = GO (còn phải xác nhận các mục THỦ CÔNG), 1 = NO-GO. Máy chủ không gọi được chính tên miền của nó
# (NAT) → chạy phần 2 từ máy khác: docker run --rm <image backend> python -m app.golive_web https://<tên miền>
set -u
[ $# -eq 1 ] || { echo "Cách dùng: sh deploy/golive-check.sh <tên miền>"; exit 2; }
case "$1" in
  http://* | https://*) URL="$1" ;;
  *) URL="https://$1" ;;
esac
# Lệnh compose: mặc định cấu hình production (README 10.3); đặt DCP để dùng cấu hình khác
DCP="${DCP:-docker compose -f docker-compose.prod.yml --env-file .env.production}"

echo "################ Trong máy chủ: cấu hình, dữ liệu, tài khoản, sao lưu, giám sát"
$DCP exec -T worker python -m app.golive
inside=$?
echo
echo "################ Từ bên ngoài: $URL"
$DCP exec -T worker python -m app.golive_web "$URL"
outside=$?

echo
if [ "$inside" -ne 0 ] || [ "$outside" -ne 0 ]; then
  echo "=> NO-GO: sửa các mục LỖI ở trên rồi chạy lại"
  exit 1
fi
echo "=> GO về mặt kỹ thuật — xác nhận các mục THỦ CÔNG và ký biên bản trong docs/GO-LIVE.md trước khi công bố cổng"
