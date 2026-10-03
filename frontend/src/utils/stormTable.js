/** Đọc bảng bản tin bão / ATNĐ dán từ bảng tính: mỗi dòng một mốc, các cột theo thứ tự
 *   thời điểm · vĩ độ · kinh độ · cấp gió · cấp giật · bán kính gió mạnh cấp 6 (km)
 * Cột cách nhau bằng Tab (dán từ Excel) hoặc dấu ;. Hai cột cuối có thể bỏ trống. Thời điểm theo giờ Việt Nam, cùng cách
 * viết với bản tin mực nước (07:00 04/10 · 7h 04/10/2026 · 2026-10-04 07:00). Toạ độ: 20,5 · 20.5 · 20,5N · 108,0E.
 * Dòng không có chữ số (tiêu đề) bị bỏ qua. → { points: [{ time, lat, lon, wind_level, gust_level, radius_km }], errors }
 */
import { parseTime } from './bulletin';

const num = (s) => {
  const t = (s ?? '').trim().replace(/^cấp\s*/i, '').replace(/[°NnEeBbĐđ]/g, '').replace(',', '.').trim();
  return t === '' ? null : Number(t);
};

export function parseStormTable(text, now = new Date()) {
  const points = [];
  const errors = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || !/\d/.test(line)) return;
    const cols = line.split(/\t|;/).map((c) => c.trim());
    const where = `Dòng ${i + 1}`;
    if (cols.length < 3) {
      errors.push(`${where}: cần ít nhất 3 cột (thời điểm, vĩ độ, kinh độ) cách nhau bằng Tab hoặc dấu ;`);
      return;
    }
    const time = parseTime(cols[0], now);
    const [lat, lon, wind = null, gust = null, radius = null] = cols.slice(1).map(num); // cột cuối bỏ trống = không có
    if (!time) errors.push(`${where}: không đọc được thời điểm ("${cols[0]}")`);
    else if (!Number.isFinite(lat) || !Number.isFinite(lon)) errors.push(`${where}: vĩ độ / kinh độ không phải số`);
    else if ([wind, gust, radius].some((v) => v !== null && !Number.isFinite(v))) errors.push(`${where}: cấp gió / bán kính không phải số`);
    else if (points.some((p) => p.time === time)) errors.push(`${where}: trùng thời điểm với dòng trước`);
    else points.push({ time, lat, lon, wind_level: wind, gust_level: gust, radius_km: radius });
  });
  points.sort((a, b) => a.time.localeCompare(b.time));
  return { points, errors };
}

/** Cấp bão theo Quyết định 18/2021/QĐ-TTg — trùng app/services/map_ops.py */
export const stormClass = (level) =>
  level >= 16 ? 'Siêu bão' : level >= 12 ? 'Bão rất mạnh' : level >= 10 ? 'Bão mạnh' : level >= 8 ? 'Bão' : level >= 6 ? 'Áp thấp nhiệt đới' : 'Vùng áp thấp';
