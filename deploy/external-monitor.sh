#!/bin/sh
# Giám sát NGOÀI máy chủ (docs/GO-LIVE.md, điều kiện 6) — dùng khi không có UptimeRobot / Uptime Kuma / giám sát của
# trung tâm dữ liệu. Chạy trên MÁY KHÁC (khác nguồn điện, khác mạng nếu được) bằng cron mỗi phút:
#   * * * * * URL=https://pctt.caobang.gov.vn/health/full WEBHOOK=https://… sh /opt/pctt-monitor/external-monitor.sh
#
# Máy chủ mất điện, mất mạng, Docker dừng thì tự giám sát bên trong (email của worker) không gửi được — cần nơi khác gọi
# vào. Báo khi /health/full không trả 200 hai lần liên tiếp; nhắc lại mỗi REPEAT_MIN phút (mặc định 30); báo "đã khôi
# phục" khi trả 200 trở lại. Kênh: WEBHOOK (POST JSON {"text": …} như OPS_ALERT_WEBHOOK_URL — Slack, Mattermost, Google
# Chat…) và/hoặc MAILTO (cần lệnh `mail` của máy). Trạng thái lưu trong STATE (mặc định /tmp/pctt-external-monitor).
# Thử: URL=https://<tên miền>/khong-co WEBHOOK=… sh external-monitor.sh; chạy 2 lần → nhận báo.
set -u
URL="${URL:?Đặt URL=https://<tên miền>/health/full}"
WEBHOOK="${WEBHOOK:-}"
MAILTO="${MAILTO:-}"
REPEAT_MIN="${REPEAT_MIN:-30}"
STATE="${STATE:-/tmp/pctt-external-monitor}"
[ -n "$WEBHOOK" ] || [ -n "$MAILTO" ] || { echo "Đặt WEBHOOK và/hoặc MAILTO"; exit 2; }

code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$URL" || true)
now=$(date +%s)
fails=0
alerted=0
[ -r "$STATE" ] && read -r fails alerted < "$STATE"

send() {
  msg="$1"
  if [ -n "$WEBHOOK" ]; then
    # Không ghi URL webhook ra log (chứa token)
    # Nội dung qua stdin (--data-binary @-): giữ nguyên UTF-8, không qua tham số dòng lệnh
    printf '{"text": "%s"}' "$(printf '%s' "$msg" | sed 's/\\/\\\\/g; s/"/\\"/g')" |
      curl -s -o /dev/null --max-time 15 -H 'Content-Type: application/json; charset=utf-8' --data-binary @- "$WEBHOOK" ||
      echo "$(date) gửi webhook thất bại"
  fi
  if [ -n "$MAILTO" ]; then
    printf '%s\n' "$msg" | mail -s "$(printf '%s' "$msg" | head -1)" "$MAILTO" || echo "$(date) gửi mail thất bại"
  fi
}

if [ "$code" = "200" ]; then
  [ "$alerted" -gt 0 ] && send "[PCTT Cao Bằng] ĐÃ KHÔI PHỤC: $URL trả 200 lúc $(date '+%H:%M %d/%m/%Y')"
  echo "0 0" > "$STATE"
  exit 0
fi

fails=$((fails + 1))
# Báo khi lỗi 2 lần liên tiếp (khởi động lại lúc cập nhật không báo nhầm), nhắc lại mỗi REPEAT_MIN phút
if [ "$fails" -ge 2 ] && { [ "$alerted" -eq 0 ] || [ $((now - alerted)) -ge $((REPEAT_MIN * 60)) ]; }; then
  send "[PCTT Cao Bằng] SỰ CỐ: $URL trả ${code:-không kết nối được} ($fails lần liên tiếp, $(date '+%H:%M %d/%m/%Y')). 000 = không kết nối được: máy chủ mất điện / mất mạng / Docker dừng. 503 = có kiểm tra bên trong lỗi (xem email của worker, dcp logs)."
  alerted=$now
fi
echo "$fails $alerted" > "$STATE"
exit 1
