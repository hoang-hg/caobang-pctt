import { alarmLevel } from './labels';
import { dateTime, num, time } from './format';
import { RISK } from './risk';

export const STALE_MS = 60 * 60 * 1000; // như STALE_MINUTES ở backend (app/services/readings.py)
// Chữ màu theo thang rủi ro chung — trước đây BĐ I tô cam, BĐ II tô đỏ: lệch với biểu tượng trên bản đồ và chip ALARM
const COLOR = RISK.map((r) => r.text);

/**
 * Hiển thị số liệu một trạm quan trắc. Trạm CHƯA có số đo, hoặc MẤT TÍN HIỆU (số đo cuối cũ hơn 60 phút — cổng công
 * khai: cờ `stale` từ máy chủ; màn hình điều hành: tính từ `time`) không bao giờ hiện "An toàn / Bình thường":
 * `level` = null (biểu tượng xám), nhãn nói rõ tình trạng + thời điểm số đo cuối. Số đo cuối đã vượt báo động thì vẫn
 * báo cấp đó (kèm "mất tín hiệu") — mất tín hiệu không xoá được nguy cơ đã biết.
 * → { level: 0–3 | null, value, status, statusColor, marker }
 */
export function stationView(s) {
  const rain = s.type === 'luong_mua';
  if (s.value == null) {
    return { level: null, value: 'Chưa có số liệu', status: 'Chưa có số liệu', statusColor: 'text-muted', marker: undefined };
  }
  const v = Number(s.value);
  const stale = s.stale ?? (s.time ? Date.now() - new Date(s.time).getTime() > STALE_MS : false);
  let level;
  let status;
  if (rain) {
    level = v >= 100 ? 3 : v >= 50 ? 2 : 0;
    status = v >= 100 ? 'Mưa rất to' : v >= 50 ? 'Mưa to' : 'Mưa nhỏ / không mưa';
  } else {
    level = alarmLevel(v, s.thresholds || {});
    status = ['Dưới BĐ I', 'BĐ I', 'BĐ II', 'BĐ III (Nguy hiểm)'][level];
  }
  const value = rain ? `${Math.round(v)} mm` : `${v.toFixed(2)} ${s.unit || 'm'}`;
  if (stale) {
    const since = `mất tín hiệu từ ${dateTime(s.time)}`;
    return level
      ? { level, value: `${value} (cũ)`, status: `${status} · ${since}`, statusColor: COLOR[level], marker: '?' }
      : { level: null, value: `${value} (cũ)`, status: `Mất tín hiệu · số đo lúc ${dateTime(s.time)}`, statusColor: 'text-muted', marker: '?' };
  }
  return { level, value, status, statusColor: COLOR[level], marker: rain ? String(Math.round(v)) : v.toFixed(1) };
}

/**
 * Xu hướng mực nước (m/giờ) giữa hai số đo cách nhau ≥ 30 phút (backend /stations: prev_value / prev_time ~1 giờ trước).
 * Số đo mới nhất cũ hơn `maxAgeMs` (mặc định 60 phút = mất tín hiệu) → null — không nói "đang lên / xuống" khi không biết.
 * Dưới ±0,02 m/giờ coi là ổn định (dao động của cảm biến). dir: 'len' | 'xuong' | 'on_dinh'.
 */
export function waterTrend(value, at, prevValue, prevAt, maxAgeMs = STALE_MS) {
  if (value == null || prevValue == null || !at || !prevAt) return null;
  const t = new Date(at).getTime();
  const hours = (t - new Date(prevAt).getTime()) / 3_600_000;
  if (!(hours >= 0.5) || Date.now() - t > maxAgeMs) return null;
  const rate = (Number(value) - Number(prevValue)) / hours;
  return { rate, dir: rate >= 0.02 ? 'len' : rate <= -0.02 ? 'xuong' : 'on_dinh' };
}

/** Lời của xu hướng: "đang lên 0,12 m/giờ" / "đang xuống …" / "ổn định". */
export const trendWords = (t) => (t.dir === 'len' ? `đang lên ${num(t.rate, 2)} m/giờ` : t.dir === 'xuong' ? `đang xuống ${num(-t.rate, 2)} m/giờ` : 'ổn định');

/** Props cho <TrendTag>: chữ "0,12 m/giờ" / "ổn định"; `who` (tên trạm) đứng đầu lời đọc. null khi không biết xu hướng. */
export const trendProps = (t, who = 'Mực nước') => t && {
  dir: t.dir,
  text: t.dir === 'on_dinh' ? 'ổn định' : `${num(Math.abs(t.rate), 2)} m/giờ`,
  label: `${who} ${trendWords(t)}`,
};

/** Nguồn đường dự báo mực nước: bản tin KTTV do trực ban nhập, hay đường "HEC-HMS" chỉ bộ mô phỏng sinh. */
export const forecastSource = (model) => (model === 'KTTV' ? 'bản tin KTTV' : 'dự báo mô phỏng');

/** Giờ của một mốc dự báo: hôm nay → "21:00", ngày khác → "01:00 ngày 10/10" (đọc liền sau "lúc …"). */
export function etaWhen(t) {
  const d = new Date(t);
  return d.toDateString() === new Date().toDateString() ? time(d) : `${time(d)} ngày ${d.getDate()}/${d.getMonth() + 1}`;
}
