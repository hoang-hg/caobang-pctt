#!/bin/sh
# Chép thư mục sao lưu (/backups, do service "backup" tạo) ra nơi lưu trữ NGOÀI máy chủ bằng rclone — service
# "backup-offsite" (profile "offsite") trong docker-compose.prod.yml, README.md mục 10.5.
#   BACKUP_REMOTE=offsite:<bucket>/<thư mục>   remote "offsite" cấu hình qua biến RCLONE_CONFIG_OFFSITE_* (S3, SFTP…)
# Dùng "copy" (không "sync"): bản đã chép lên không bị xoá khi máy chủ xoá bản cũ → nơi lưu trữ ngoài tự đặt thời hạn
# giữ (lifecycle). Chạy mỗi BACKUP_OFFSITE_EVERY_S giây. Lần chép thành công gần nhất ghi "<thời điểm> <chu kỳ>" vào
# /state/offsite-ok (volume offsite_state) → healthcheck + worker báo sự cố khi quá 3 chu kỳ (app/infra/ops_watch.py).
set -eu
: "${BACKUP_REMOTE:?Đặt BACKUP_REMOTE, VD offsite:pctt-sao-luu/caobang}"
EVERY="${BACKUP_OFFSITE_EVERY_S:-3600}"
STATE="${OFFSITE_STATE_DIR:-/state}"
mkdir -p "$STATE"

while true; do
	# *.part = bản đang ghi dở của service backup; --min-age tránh chép tệp vừa đổi tên xong
	if rclone copy /backups "$BACKUP_REMOTE" --exclude '*.part' --min-age 2m \
		--transfers 2 --retries 5 --low-level-retries 10 --stats-one-line -v; then
		echo "$(date +%s) $EVERY" > "$STATE/offsite-ok"
		echo "[offsite] đã chép /backups lên $BACKUP_REMOTE"
	else
		echo "[offsite] LỖI: chép lên $BACKUP_REMOTE thất bại — thử lại sau ${EVERY}s" >&2
	fi
	sleep "$EVERY"
done
