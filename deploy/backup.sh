#!/bin/sh
# Sao lưu hằng ngày (service "backup" trong docker-compose.prod.yml):
#   /backups/db/pctt_<thời điểm>.dump      pg_dump định dạng custom (khôi phục: README.md mục 10.5)
#   /backups/photos/photos_<thời điểm>.tar.gz  ảnh phản ánh (dữ liệu MinIO)
# Giữ BACKUP_KEEP_DAYS ngày. Thư mục này PHẢI được chép ra nơi khác (máy chủ khác / kho lưu trữ ngoài tỉnh).
set -eu

KEEP="${BACKUP_KEEP_DAYS:-14}"
AT="${BACKUP_AT:-19:30}"
mkdir -p /backups/db /backups/photos

run_backup() {
	stamp=$(date +%Y-%m-%d_%H%M)
	echo "[backup] $stamp: bắt đầu"
	if pg_dump -Fc -f "/backups/db/pctt_$stamp.dump.part" && mv "/backups/db/pctt_$stamp.dump.part" "/backups/db/pctt_$stamp.dump"; then
		echo "[backup] CSDL: /backups/db/pctt_$stamp.dump ($(du -h "/backups/db/pctt_$stamp.dump" | cut -f1))"
	else
		echo "[backup] LỖI: pg_dump thất bại" >&2
		rm -f "/backups/db/pctt_$stamp.dump.part"
	fi
	if [ -d /minio ] && tar -czf "/backups/photos/photos_$stamp.tar.gz.part" -C /minio . 2>/dev/null; then
		mv "/backups/photos/photos_$stamp.tar.gz.part" "/backups/photos/photos_$stamp.tar.gz"
		echo "[backup] Ảnh: /backups/photos/photos_$stamp.tar.gz"
	else
		echo "[backup] LỖI: nén thư mục ảnh thất bại" >&2
		rm -f "/backups/photos/photos_$stamp.tar.gz.part"
	fi
	find /backups/db /backups/photos -type f -mtime +"$KEEP" -print -delete
}

# Chờ tới giờ BACKUP_AT (giờ của container, UTC nếu không đặt TZ) rồi chạy mỗi 24 giờ.
# Chạy ngay 1 bản khi khởi động để phát hiện sớm lỗi cấu hình.
run_backup
while true; do
	now=$(date +%s)
	next=$(date -d "$AT" +%s)
	[ "$next" -le "$now" ] && next=$((next + 86400))
	sleep $((next - now))
	run_backup
done
