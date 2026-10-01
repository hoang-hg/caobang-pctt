#!/bin/sh
# Cập nhật máy chủ lên một phiên bản đã phát hành — tag vX.Y.Z, image do .github/workflows/deploy.yml build lên GHCR.
# Chạy TRÊN MÁY CHỦ, trong thư mục cài đặt (README 10.4):
#   cd /opt/caobang-pctt && sh deploy/update.sh 1.0.1
#
#   1. Tải mã nguồn đúng phiên bản (compose, deploy/, cấu hình nginx…) vào thư mục tạm
#   2. Kéo image backend + frontend của phiên bản đó
#   3. Sao lưu CSDL ngay: backups/db/pctt_<thời điểm>_truoc-<phiên bản>.dump
#      — bước 1–3 lỗi thì dừng, hệ thống đang chạy chưa bị đụng tới
#   4. Chép mã nguồn mới đè lên (giữ .env.production, backups/, data/), đặt BACKEND_IMAGE / FRONTEND_IMAGE, khởi động
#      lại (migrate chạy trước backend)
#   5. Kiểm tra /health/full qua tên miền thật: không được phát sinh kiểm tra lỗi mới so với trước khi cập nhật.
#      Lỗi → tự quay lại mã nguồn + image cũ. CSDL KHÔNG tự khôi phục: nếu bản mới đã chạy migration, khôi phục bản sao
#      lưu ở bước 3 theo README 10.5.
#
# Cách vào hệ thống — biến PCTT_PROXY trong .env.production: caddy (mặc định, --profile caddy) · traefik (máy chủ có sẵn
# Traefik / Coolify: thêm -f deploy/docker-compose.traefik.yml) · none (proxy / HTTPS của trung tâm dữ liệu).
# Thêm --profile offsite khi có BACKUP_REMOTE, --profile mqtt khi MQTT_URL trỏ vào broker kèm theo (@mqtt:).
# Biến tuỳ chọn (kiểm thử CI, máy chủ khác): PCTT_REPO, PCTT_IMAGE_REPO, PCTT_ENV_FILE, PCTT_COMPOSE_FILES,
#   PCTT_SOURCE=github|none, PCTT_PULL=1|0, PCTT_HEALTH_URL, PCTT_SKIP_BACKUP=1 (chỉ khi thật cần, ghi rõ lý do)
set -eu

# Chạy từ bản sao tạm: bước 4 chép mã nguồn mới đè lên chính tệp này — shell đọc dở một tệp vừa bị ghi đè (khi bản mới
# của script khác bản đang chạy) có thể chạy sai giữa chừng
if [ -z "${PCTT_UPDATE_SELF:-}" ]; then
	PCTT_UPDATE_SELF=$(mktemp)
	cp "$0" "$PCTT_UPDATE_SELF"
	export PCTT_UPDATE_SELF
	exec sh "$PCTT_UPDATE_SELF" "$@"
fi
trap 'rm -f "$PCTT_UPDATE_SELF"' EXIT

VER="${1:-}"
VER="${VER#v}"
if ! echo "$VER" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$'; then
	echo "Cách dùng: sh deploy/update.sh <phiên bản, VD 1.0.1>"
	exit 2
fi
ENV_FILE="${PCTT_ENV_FILE:-.env.production}"
if [ ! -f docker-compose.prod.yml ] || [ ! -f "$ENV_FILE" ]; then
	echo "Chạy trong thư mục cài đặt (có docker-compose.prod.yml và $ENV_FILE), VD cd /opt/caobang-pctt"
	exit 2
fi

envval() { sed -n "s/^$1=//p" "$ENV_FILE" | tail -1 | sed 's/^"//; s/"$//'; }
setenv() {
	if grep -q "^$1=" "$ENV_FILE"; then
		sed -i "s#^$1=.*#$1=$2#" "$ENV_FILE"
	else
		printf '%s=%s\n' "$1" "$2" >>"$ENV_FILE"
	fi
}

REPO="${PCTT_REPO:-hoang-hg/caobang-pctt}"
IMAGE_REPO="${PCTT_IMAGE_REPO:-ghcr.io/hoang-hg/caobang-pctt}"
NEW_BACKEND="$IMAGE_REPO-backend:$VER"
NEW_FRONTEND="$IMAGE_REPO-frontend:$VER"
PROFILES=""
if [ -n "${PCTT_COMPOSE_FILES:-}" ]; then
	FILES="$PCTT_COMPOSE_FILES"
else
	FILES="-f docker-compose.prod.yml"
	case "$(envval PCTT_PROXY)" in
	traefik) FILES="$FILES -f deploy/docker-compose.traefik.yml" ;;
	none) ;;
	*) PROFILES="--profile caddy" ;;
	esac
	[ -n "$(envval BACKUP_REMOTE)" ] && PROFILES="$PROFILES --profile offsite"
	case "$(envval MQTT_URL)" in *@mqtt:*) PROFILES="$PROFILES --profile mqtt" ;; esac
fi
DCP="docker compose $FILES --env-file $ENV_FILE $PROFILES"
URL="${PCTT_HEALTH_URL:-https://$(envval DOMAIN)/health/full}"
OLD_VER=$(cat .phien-ban 2>/dev/null || true)
OLD="${OLD_VER:+bản $OLD_VER}"
OLD="${OLD:-bản đang chạy}"

LOCK=/tmp/pctt-update.lock
if ! mkdir "$LOCK" 2>/dev/null; then
	echo "Đang có một lần cập nhật khác chạy (xoá $LOCK nếu chắc chắn không còn)"
	exit 1
fi
TMP=$(mktemp -d)
trap 'rm -rf "$LOCK" "$TMP" "$PCTT_UPDATE_SELF"' EXIT

echo "Cập nhật $OLD → v$VER"
echo "Lệnh compose: $DCP"

# Kiểm tra lỗi hiện có TRƯỚC khi cập nhật — sau cập nhật chỉ đòi không phát sinh lỗi MỚI (VD chưa cấu hình sao lưu ngoài
# đã lỗi từ trước thì không phải lý do quay lại)
failing() { grep -o '"[^"]*":false' | sort | tr '\n' ' '; }
BEFORE=$(curl -s --max-time 10 "$URL" | failing || true)
[ -n "$BEFORE" ] && echo "Đang lỗi từ trước khi cập nhật: $BEFORE"

# ---- 1. Mã nguồn
if [ "${PCTT_SOURCE:-github}" = github ]; then
	echo "== 1/5 Tải mã nguồn v$VER"
	if ! curl -fsSL "https://github.com/$REPO/archive/refs/tags/v$VER.tar.gz" -o "$TMP/src.tar.gz"; then
		echo "LỖI: không tải được mã nguồn v$VER — đã gắn tag v$VER chưa? (repo riêng tư: chép bằng git archive)"
		exit 1
	fi
	mkdir "$TMP/src"
	tar -xzf "$TMP/src.tar.gz" -C "$TMP/src" --strip-components=1
	[ -f "$TMP/src/docker-compose.prod.yml" ] || { echo "LỖI: gói mã nguồn thiếu docker-compose.prod.yml"; exit 1; }
else
	echo "== 1/5 Giữ mã nguồn hiện có (PCTT_SOURCE=none)"
fi

# ---- 2. Image
echo "== 2/5 Image $NEW_BACKEND, $NEW_FRONTEND"
if [ "${PCTT_PULL:-1}" = 1 ]; then
	if ! docker pull -q "$NEW_BACKEND" >/dev/null || ! docker pull -q "$NEW_FRONTEND" >/dev/null; then
		echo "LỖI: không kéo được image v$VER — deploy.yml đã chạy xong chưa (tab Actions)? Image riêng tư: docker login ghcr.io"
		exit 1
	fi
elif ! docker image inspect "$NEW_BACKEND" "$NEW_FRONTEND" >/dev/null 2>&1; then
	echo "LỖI: máy chủ chưa có image $NEW_BACKEND / $NEW_FRONTEND"
	exit 1
fi

# ---- 3. Sao lưu
DUMP="pctt_$(date +%Y-%m-%d_%H%M%S)_truoc-$VER.dump"
BDIR=$(envval BACKUP_DIR)
if [ "${PCTT_SKIP_BACKUP:-0}" = 1 ]; then
	echo "== 3/5 BỎ QUA sao lưu (PCTT_SKIP_BACKUP=1)"
else
	echo "== 3/5 Sao lưu CSDL trước khi cập nhật"
	# Cảnh báo quen thuộc của TimescaleDB (circular foreign-key / continuous_agg) chỉ hiện khi pg_dump thật sự lỗi
	if ! $DCP exec -T backup sh -c "pg_dump -Fc -f /backups/db/$DUMP.part 2>/tmp/pg_dump.err && mv /backups/db/$DUMP.part /backups/db/$DUMP || { cat /tmp/pg_dump.err >&2; exit 1; }"; then
		echo "LỖI: sao lưu thất bại — dừng, hệ thống chưa thay đổi (service backup có chạy không? $DCP ps)"
		exit 1
	fi
	echo "Đã sao lưu: ${BDIR:-./backups}/db/$DUMP"
fi

# ---- 4. Áp dụng
echo "== 4/5 Khởi động v$VER"
cp -p "$ENV_FILE" "$TMP/env.before"
if [ -d "$TMP/src" ]; then
	(cd "$TMP/src" && find . -type f) >"$TMP/files"
	while IFS= read -r f; do
		if [ -f "$f" ]; then
			mkdir -p "$TMP/old/$(dirname "$f")"
			cp -p "$f" "$TMP/old/$f"
		fi
	done <"$TMP/files"
	cp -a "$TMP/src/." .
fi
setenv BACKEND_IMAGE "$NEW_BACKEND"
setenv FRONTEND_IMAGE "$NEW_FRONTEND"

# ---- 5. Kiểm tra
health_ok() {
	i=0
	while [ "$i" -lt 30 ]; do
		body=$(curl -s --max-time 10 "$URL" || true)
		if echo "$body" | grep -q '"checks"'; then
			new=""
			for c in $(echo "$body" | failing); do
				case " $BEFORE " in *" $c "*) ;; *) new="$new $c" ;; esac
			done
			[ -z "$new" ] && return 0
		fi
		i=$((i + 1))
		sleep 5
	done
	echo "Kiểm tra sau cập nhật ($URL): ${body:-không trả lời}"
	return 1
}

rollback() {
	echo "!! Cập nhật lỗi — quay lại $OLD"
	[ -d "$TMP/old" ] && cp -a "$TMP/old/." .
	cp -p "$TMP/env.before" "$ENV_FILE"
	if $DCP up -d --no-build --wait --wait-timeout 600; then
		echo "Đã quay lại $OLD."
	else
		echo "!! Quay lại cũng lỗi — xem: $DCP logs --tail=100 migrate backend worker frontend"
	fi
	if [ "${PCTT_SKIP_BACKUP:-0}" != 1 ]; then
		echo "Nếu bản v$VER đã chạy migration làm đổi CSDL: khôi phục ${BDIR:-./backups}/db/$DUMP theo README 10.5."
	fi
	exit 1
}

echo "== 5/5 Kiểm tra $URL"
if $DCP up -d --no-build --wait --wait-timeout 600 && health_ok; then
	echo "$VER" >.phien-ban
	echo "XONG: đang chạy v$VER (trước đó: $OLD)."
	[ "${PCTT_SKIP_BACKUP:-0}" = 1 ] || echo "Bản sao lưu trước cập nhật: ${BDIR:-./backups}/db/$DUMP"
	echo "Quay lại khi cần: sh deploy/update.sh <phiên bản trước> — image cũ vẫn còn trên máy."
else
	rollback
fi
