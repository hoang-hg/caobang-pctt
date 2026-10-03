// Tính toán hình học nhỏ phía trình duyệt (không gọi máy chủ).

/** Điểm (lon, lat) nằm trong vòng (mảng [lon, lat]) — thuật toán tia. */
function inRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Điểm nằm trong Polygon / MultiPolygon GeoJSON (tính cả lỗ). */
export function pointInGeometry(lon, lat, geometry) {
  if (!geometry) return false;
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.type === 'MultiPolygon' ? geometry.coordinates : [];
  return polygons.some(([outer, ...holes]) => inRing(lon, lat, outer) && !holes.some((h) => inRing(lon, lat, h)));
}

/** Mã xã/phường chứa điểm, theo GeoJSON ranh giới xã (GET /admin-units/geojson); null nếu ngoài tỉnh. */
export function communeAt(geo, lat, lon) {
  const f = geo?.features?.find((x) => pointInGeometry(lon, lat, x.geometry));
  return f?.properties?.code || null;
}

/** Khoảng cách đường chim bay (km) giữa hai điểm WGS84 — xếp kho gần điểm sự cố. */
export function distanceKm(lat1, lon1, lat2, lon2) {
  const r = (d) => (d * Math.PI) / 180;
  const a = Math.sin(r(lat2 - lat1) / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lon2 - lon1) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}
