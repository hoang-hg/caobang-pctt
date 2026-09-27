#!/bin/sh
# Tải bản đồ nền vector (OpenStreetMap, định dạng Protomaps) cho khu vực Cao Bằng về máy chủ: data/tiles/caobang.pmtiles
# nginx phục vụ trực tiếp tệp này (README mục 6.9) → bản đồ nền không phụ thuộc Google / CARTO, vẫn chạy khi mất kết
# nối quốc tế. Cần Internet + Docker khi chạy; chạy lại mỗi quý để cập nhật đường, địa danh.
#
#   sh deploy/fetch-basemap.sh                          # bản build mới nhất
#   BUILD=20260927.pmtiles sh deploy/fetch-basemap.sh   # bản cố định
set -eu

# Cao Bằng + các tỉnh giáp ranh (Tuyên Quang, Thái Nguyên, Lạng Sơn) và Quảng Tây: đủ phủ khung nhìn toàn tỉnh trên
# màn hình rộng (zoom 9). Ngoài vùng này và ở zoom ≤ 6, trình duyệt tự dùng nền ngoài (README 6.9). Tệp ~160 MB.
BBOX="${BBOX:-103.6,21.3,108.5,24.2}"
MAXZOOM="${MAXZOOM:-15}"                 # 15 = đủ đường thôn, tên xóm
OUT_DIR="${OUT_DIR:-$(cd "$(dirname "$0")/.." && pwd)/data/tiles}"
IMAGE="${PMTILES_IMAGE:-protomaps/go-pmtiles@sha256:06574f01f55a78f78f887bc7ebf729a5c093c0d6e17d9876300cfcb0758b59d3}"  # v1.31.2

mkdir -p "$OUT_DIR"
if [ -z "${BUILD:-}" ]; then
	BUILD=$(curl -fsS https://build-metadata.protomaps.dev/builds.json | grep -o '"key":"[0-9]*\.pmtiles"' | tail -1 | cut -d'"' -f4)
fi
echo "Cắt vùng $BBOX (zoom ≤ $MAXZOOM) từ https://build.protomaps.com/$BUILD …"
docker run --rm -v "$OUT_DIR:/out" "$IMAGE" extract "https://build.protomaps.com/$BUILD" /out/caobang.pmtiles.tmp \
	--bbox="$BBOX" --maxzoom="$MAXZOOM"
mv "$OUT_DIR/caobang.pmtiles.tmp" "$OUT_DIR/caobang.pmtiles"
echo "$BUILD" > "$OUT_DIR/caobang.build.txt"
echo "Xong: $OUT_DIR/caobang.pmtiles ($(du -h "$OUT_DIR/caobang.pmtiles" | cut -f1)) — nginx dùng ngay, không cần khởi động lại"
