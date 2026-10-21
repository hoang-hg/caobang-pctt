import { useMemo } from 'react';
import { useProvinceArea, useUnitsGeo } from '../../api/hooks';

/** Đường bao các vòng (Polygon / MultiPolygon) thành lệnh vẽ SVG theo hàm chiếu `px`. */
const geomPath = (g, px) => (g?.type === 'Polygon' ? g.coordinates : g?.type === 'MultiPolygon' ? g.coordinates.flat() : [])
  .map((ring) => `M${ring.map(px).join('L')}Z`)
  .join('');

/**
 * Ranh giới tỉnh Cao Bằng và 56 xã, phường vẽ thành nét mảnh (SVG) từ dữ liệu ranh giới của chính hệ thống — hình nền trang
 * đăng nhập (docs/ke-hoach-lam-moi-giao-dien.md mục 6.2): không dùng ảnh chụp ô Google (giấy phép), không dùng ảnh trên mạng,
 * đổi màu theo chữ (\`currentColor\`). Chiếu phẳng theo vĩ độ giữa tỉnh (đủ đúng cho một tỉnh). Chưa tải được → không vẽ gì.
 */
export default function ProvinceArt({ className }) {
  const { data: geo } = useUnitsGeo();
  const { data: area } = useProvinceArea();
  const art = useMemo(() => {
    if (!area?.bbox || !area.geometry) return null;
    const [x1, y1, x2, y2] = area.bbox;
    const k = Math.cos((((y1 + y2) / 2) * Math.PI) / 180);
    const W = 1000;
    const H = Math.round((W * (y2 - y1)) / ((x2 - x1) * k));
    const px = ([x, y]) => `${(((x - x1) / (x2 - x1)) * W).toFixed(1)},${(((y2 - y) / (y2 - y1)) * H).toFixed(1)}`;
    return {
      W,
      H,
      communes: (geo?.features || []).map((f) => geomPath(f.geometry, px)).join(''),
      province: geomPath(area.geometry, px),
    };
  }, [geo, area]);
  if (!art) return null;
  return (
    <svg viewBox={`0 0 ${art.W} ${art.H}`} className={className} preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">
      <path d={art.communes} fill="none" stroke="currentColor" strokeOpacity="0.28" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      <path d={art.province} fill="rgb(96 165 250 / 0.07)" stroke="#60a5fa" strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
