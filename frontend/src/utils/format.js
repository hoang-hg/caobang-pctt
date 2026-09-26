const nf = new Intl.NumberFormat('vi-VN');
export const num = (v, digits = 0) => (v == null || Number.isNaN(v) ? '–' : new Intl.NumberFormat('vi-VN', { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(v));
export const int = (v) => (v == null ? '–' : nf.format(Math.round(v)));
export const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);
export const time = (t) => (t ? new Date(t).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '–');
export const dateTime = (t) => (t ? new Date(t).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : '–');
export const hourLabel = (t) => new Date(t).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
export const minutesSince = (t) => (t ? Math.floor((Date.now() - new Date(t).getTime()) / 60000) : 0);
export const ago = (t) => {
  const m = minutesSince(t);
  if (m < 1) return 'vừa xong';
  if (m < 60) return `${m} phút trước`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h} giờ ${m % 60} phút trước` : `${Math.floor(h / 24)} ngày trước`;
};
