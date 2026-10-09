import L from 'leaflet';
import { NO_DATA, RISK } from '../../utils/risk';

// Đỏ / cam / vàng / xanh / xám lấy từ thang màu rủi ro chung (utils/risk.js) — biểu tượng trên bản đồ cùng màu với chip
const COLORS = { do: RISK[3].hex, cam: RISK[2].hex, vang: RISK[1].hex, good: RISK[0].hex, blue: '#2a78d6', gray: NO_DATA.hex, violet: '#6d5dd3' };

const svg = (path, color, size = 16) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;

const P = {
  hand: '<path d="M18 11V6a2 2 0 0 0-4 0v5"/><path d="M14 10V4a2 2 0 0 0-4 0v2"/><path d="M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/>',
  ship: '<path d="M2 21c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1 .6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M19.38 20A11.6 11.6 0 0 0 21 14l-9-4-9 4c0 2.9.94 5.34 2.81 7.76"/><path d="M12 10v4"/><path d="M12 2v3"/>',
  truck: '<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/>',
  tool: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
  drone: '<circle cx="12" cy="12" r="3"/><path d="M4 4l5 5M20 4l-5 5M4 20l5-5M20 20l-5-5"/>',
  drop: '<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/>',
  rain: '<path d="M4 14.9A7 7 0 1 1 15.7 8h1.8a4.5 4.5 0 0 1 2.5 8.2"/><path d="M16 14v6M8 14v6M12 16v6"/>',
  tilt: '<path d="m8 3 4 8 5-5 5 15H2L8 3z"/>',
  dam: '<path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/><path d="M9 21v-4h6v4"/><path d="M9 9h6M9 13h6"/>',
  box: '<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>',
  home: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
  cam: '<path d="M16.5 7.5 22 5v14l-5.5-2.5"/><rect x="2" y="6" width="14" height="12" rx="2"/>',
  warn: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4M12 17h.01"/>',
  plug: '<path d="M12 22v-5M9 8V2M15 8V2M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z"/>',
  road: '<path d="M4 19 8 5M16 5l4 14M12 6v2M12 11v2M12 16v2"/>',
  msg: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2z"/>',
  storm: '<path d="M21 4H3M18 8H6M19 12H9M16 16h-6M11 20H9"/>',
};

function badge(path, { bg = '#fff', stroke = COLORS.blue, size = 28, ring = stroke, shape = 'circle', extraClass = '', label, dashed = false, opacity = 1 } = {}) {
  const radius = shape === 'square' ? '7px' : '9999px';
  const html = `<div class="${extraClass}" style="width:${size}px;height:${size}px;border-radius:${radius};background:${bg};border:2px ${dashed ? 'dashed' : 'solid'} ${ring};opacity:${opacity};display:flex;align-items:center;justify-content:center;box-shadow:0 1px 4px rgba(0,0,0,.35);position:relative">${svg(path, stroke, size * 0.58)}${
    label ? `<span style="position:absolute;top:-8px;right:-10px;background:${ring};color:#fff;font:600 10px/14px sans-serif;padding:0 4px;border-radius:7px">${label}</span>` : ''
  }</div>`;
  return L.divIcon({ html, className: 'map-icon', iconSize: [size, size], iconAnchor: [size / 2, size / 2], popupAnchor: [0, -size / 2] });
}

const PRI = { 1: COLORS.do, 2: COLORS.cam, 3: COLORS.vang };

export const sosIcon = (priority, status) =>
  badge(P.hand, { bg: PRI[priority], stroke: '#fff', ring: '#fff', size: 32, extraClass: status === 'moi' ? 'sos-pulse' : '' });

export const forceIcon = (status, selected) =>
  badge(P.users, { bg: status === 'nhiem_vu' ? '#fef3c7' : '#dbeafe', stroke: '#1e3a8a', ring: selected ? COLORS.do : '#1e3a8a', size: 30, shape: 'square' });

const VEH_PATH = { duong_thuy: P.ship, duong_bo: P.truck, thiet_bi: P.tool };
export const vehicleIcon = (v) =>
  badge(v.vehicle_type === 'flycam' ? P.drone : VEH_PATH[v.category] || P.truck, {
    bg: '#fff',
    stroke: v.status === 'nhiem_vu' ? '#b45309' : v.status === 'bao_duong' ? COLORS.gray : '#0f766e',
    ring: v.status === 'nhiem_vu' ? '#f59e0b' : v.status === 'bao_duong' ? COLORS.gray : '#0f766e',
    size: 24,
  });

const ALARM_COLOR = [COLORS.good, COLORS.vang, COLORS.cam, COLORS.do];
/** level null = chưa có số liệu / mất tín hiệu → xám (không dùng màu xanh "an toàn"). */
/** stale: mất tín hiệu — viền nét đứt, mờ; vẫn giữ màu báo động nếu số đo cuối đã vượt (level > 0), không ghi số. */
export const stationIcon = (type, level, value, stale = false) => {
  const path = { luong_mua: P.rain, muc_nuoc: P.drop, do_nghieng: P.tilt, do_am_dat: P.drop }[type];
  const ring = level == null ? COLORS.gray : ALARM_COLOR[level];
  return badge(path, { bg: '#fff', stroke: ring === COLORS.good ? COLORS.blue : ring, ring, size: 26, label: value, dashed: stale, opacity: stale ? 0.7 : 1 });
};

/** Phản ánh của người dân: chờ duyệt = nền trắng viền nét đứt; đã duyệt / đã xử lý = nền tím. */
export const reportIcon = (status) =>
  status === 'cho_duyet'
    ? badge(P.msg, { bg: '#fff', stroke: '#7c3aed', ring: '#7c3aed', size: 24, dashed: true })
    : badge(P.msg, { bg: '#7c3aed', stroke: '#fff', ring: '#fff', size: 24 });

export const stormIcon = () => badge(P.storm, { bg: '#a855f7', stroke: '#fff', ring: '#fff', size: 26 });

export const reservoirIcon = (gatesOpen) =>
  badge(P.dam, { bg: '#e0f2fe', stroke: '#075985', ring: gatesOpen ? COLORS.cam : '#075985', size: 28, shape: 'square', label: gatesOpen ? `${gatesOpen} cửa` : undefined });

export const warehouseIcon = (pctValue) =>
  badge(P.box, { bg: '#fff', stroke: '#7c3aed', ring: pctValue == null ? '#7c3aed' : pctValue < 20 ? COLORS.do : pctValue < 50 ? COLORS.cam : '#7c3aed', size: 26, shape: 'square' }); // null = kho chưa có số liệu tồn kho

export const evacIcon = (ratio) =>
  badge(P.home, { bg: '#dcfce7', stroke: '#166534', ring: ratio >= 1 ? COLORS.do : ratio > 0.85 ? COLORS.cam : '#166534', size: 24 });

export const cameraIcon = () => badge(P.cam, { bg: '#111827', stroke: '#fff', ring: '#111827', size: 24, shape: 'square' });

export const hazardIcon = (type, level) =>
  badge(type === 'giao_thong' ? P.road : type === 'ha_tang' ? P.plug : P.warn, {
    bg: COLORS[level] || COLORS.vang,
    stroke: level === 'vang' ? '#111' : '#fff',
    ring: '#fff',
    size: 26,
    shape: 'square',
  });

export const pinIcon = (label, color = COLORS.blue) =>
  L.divIcon({
    html: `<div style="background:${color};color:#fff;font:700 12px/22px sans-serif;width:22px;height:22px;border-radius:50%;text-align:center;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)">${label}</div>`,
    className: 'map-icon',
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });

export { COLORS };
