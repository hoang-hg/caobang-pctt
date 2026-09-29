#!/bin/sh
# Diễn tập khôi phục sao lưu (docs/GO-LIVE.md, điều kiện 5). Chạy trên MÁY KHÁC máy chủ đang phục vụ, chỉ cần Docker:
#   sh deploy/restore-drill.sh backups/db/pctt_<ngày_giờ>.dump [backups/photos/photos_<ngày_giờ>.tar.gz]
#
# Dựng CSDL tạm (container riêng, tự xoá khi xong), khôi phục đúng quy trình README 10.5, rồi in: số bản ghi các bảng
# chính, thời điểm dữ liệu mới nhất (so với lúc sao lưu), phiên bản migration, thời gian khôi phục (RTO). Kiểm tra tệp
# ảnh đọc được. KHÔNG đụng tới hệ thống đang chạy. Ghi kết quả vào biên bản docs/GO-LIVE.md.
# DB_IMAGE: image CSDL — phải cùng phiên bản với production (mặc định lấy từ docker-compose.prod.yml).
set -eu
DUMP="${1:?Cách dùng: sh deploy/restore-drill.sh <tệp .dump> [tệp ảnh .tar.gz]}"
PHOTOS="${2:-}"
[ -r "$DUMP" ] || { echo "Không đọc được $DUMP"; exit 1; }
HERE="$(cd "$(dirname "$0")/.." && pwd)"
DEFAULT_IMG="$(sed -n 's/^ *image: \(timescale\/timescaledb-ha:[^ ]*\).*/\1/p' "$HERE/docker-compose.prod.yml" | head -1)"
IMG="${DB_IMAGE:-${DEFAULT_IMG:-timescale/timescaledb-ha:pg16}}"
NAME="pctt-restore-drill-$$"
cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT INT TERM

now() { date +%s; }
t0=$(now)
echo "Tệp sao lưu: $DUMP ($(du -h "$DUMP" | cut -f1)) · image CSDL: $IMG"
docker run -d --name "$NAME" -e POSTGRES_USER=pctt -e POSTGRES_PASSWORD="drill-$$" -e POSTGRES_DB=postgres "$IMG" >/dev/null
i=0
until docker exec "$NAME" pg_isready -U pctt -d postgres >/dev/null 2>&1; do
  i=$((i + 1))
  [ "$i" -le 90 ] || { echo "LỖI: CSDL tạm không khởi động"; docker logs --tail 20 "$NAME"; exit 1; }
  sleep 2
done
sleep 3  # image -ha khởi động lại 1 lần sau lần chạy đầu
until docker exec "$NAME" pg_isready -U pctt -d postgres >/dev/null 2>&1; do sleep 2; done

sql() { docker exec -i -e PGOPTIONS='-c client_min_messages=warning' "$NAME" psql -U pctt -v ON_ERROR_STOP=1 -X -q "$@"; }
t1=$(now)
sql -d postgres -c "CREATE DATABASE caobang_pctt"
sql -d caobang_pctt -c "CREATE EXTENSION IF NOT EXISTS timescaledb" -c "SELECT timescaledb_pre_restore()" >/dev/null
# Như README 10.5: pg_restore --no-owner. Lỗi (không phải cảnh báo) → diễn tập KHÔNG ĐẠT
if ! docker exec -i "$NAME" pg_restore -U pctt -d caobang_pctt --no-owner --exit-on-error < "$DUMP"; then
  echo "LỖI: pg_restore thất bại — bản sao lưu không khôi phục được"
  exit 1
fi
sql -d caobang_pctt -c "SELECT timescaledb_post_restore()" >/dev/null
t2=$(now)

echo
echo "== Dữ liệu sau khôi phục (đối chiếu với máy chủ thật tại thời điểm sao lưu)"
sql -d caobang_pctt -A -F ' | ' -t <<'SQL'
SELECT 'Phiên bản migration', version_num FROM alembic_version
UNION ALL SELECT 'Xã / phường', count(*)::text FROM spatial_admin.administrative_units WHERE level = 'xa'
UNION ALL SELECT 'Tài khoản', count(*)::text FROM communications.users
UNION ALL SELECT 'Phiếu SOS', count(*)::text FROM operations.sos_tickets
UNION ALL SELECT 'Lệnh điều động', count(*)::text FROM operations.dispatch_orders
UNION ALL SELECT 'Phản ánh người dân', count(*)::text FROM community.citizen_reports
UNION ALL SELECT 'Lệnh cảnh báo', count(*)::text FROM communications.alert_broadcasts
UNION ALL SELECT 'Điểm sơ tán', count(*)::text FROM resources.evacuation_sites
UNION ALL SELECT 'Trạm quan trắc', count(*)::text FROM iot_telemetry.monitoring_stations
UNION ALL SELECT 'Số đo cảm biến', count(*)::text FROM iot_telemetry.sensor_readings
UNION ALL SELECT 'Nhật ký thao tác', count(*)::text FROM communications.audit_logs
UNION ALL SELECT 'Phiếu SOS mới nhất', coalesce(max(received_at)::text, '—') FROM operations.sos_tickets
UNION ALL SELECT 'Số đo mới nhất', coalesce(max(time)::text, '—') FROM iot_telemetry.sensor_readings
UNION ALL SELECT 'Thao tác mới nhất', coalesce(max(time)::text, '—') FROM communications.audit_logs;
SQL

if [ -n "$PHOTOS" ]; then
  echo
  # đọc qua stdin: tên tệp có "x:" (VD C:/… trên Windows) tar hiểu nhầm là máy từ xa
  list=$(tar -tzf - < "$PHOTOS" 2>/dev/null) || { echo "LỖI: tệp ảnh $PHOTOS hỏng / không đọc được"; exit 1; }
  n=$(printf '%s\n' "$list" | grep -c '\.jpg$' || true)
  echo "== Ảnh: $PHOTOS đọc được, $n tệp ảnh (khôi phục vào MinIO theo README 10.5)"
fi

echo
echo "ĐẠT: khôi phục CSDL mất $((t2 - t1)) giây (tổng cả dựng CSDL tạm: $((t2 - t0)) giây) — ghi vào biên bản docs/GO-LIVE.md"
