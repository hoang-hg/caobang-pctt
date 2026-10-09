const nf = new Intl.NumberFormat('vi-VN');
export const num = (v, digits = 0) => (v == null || Number.isNaN(v) ? '–' : new Intl.NumberFormat('vi-VN', { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(v));
export const int = (v) => (v == null ? '–' : nf.format(Math.round(v)));
export const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);
export const time = (t) => (t ? new Date(t).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '–');
export const dateTime = (t) => (t ? new Date(t).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : '–');
export const hourLabel = (t) => new Date(t).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
/** Nhãn trục thời gian nhiều ngày: nửa đêm → ngày ("10/10"), giờ khác → "12:00" — không còn nhiều "00:00" giống nhau. */
export const axisTimeLabel = (t) => {
  const d = new Date(t);
  return d.getHours() === 0 && d.getMinutes() === 0 ? `${d.getDate()}/${d.getMonth() + 1}` : hourLabel(d);
};
export const minutesSince = (t) => (t ? Math.floor((Date.now() - new Date(t).getTime()) / 60000) : 0);
/** Ngày (giờ) Việt Nam cho tên tệp xuất: "2026-10-03" / "2026-10-03-0830". toISOString() là giờ UTC — xuất trước 7 giờ
 * sáng thì tên tệp mang ngày hôm trước. Việt Nam không đổi giờ mùa hè → cộng 7 giờ là đủ. */
export const vnFileStamp = (d = new Date(), withTime = false) => {
  const s = new Date(d.getTime() + 7 * 3600e3).toISOString();
  return withTime ? `${s.slice(0, 10)}-${s.slice(11, 13)}${s.slice(14, 16)}` : s.slice(0, 10);
};
export const ago = (t) => {
  const m = minutesSince(t);
  if (m < 1) return 'vừa xong';
  if (m < 60) return `${m} phút trước`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h} giờ ${m % 60} phút trước` : `${Math.floor(h / 24)} ngày trước`;
};
