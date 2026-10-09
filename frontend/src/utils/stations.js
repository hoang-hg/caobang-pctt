import { alarmLevel } from './labels';
import { dateTime } from './format';
import { RISK } from './risk';

const STALE_MS = 60 * 60 * 1000; // như STALE_MINUTES ở backend (app/services/readings.py)
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
