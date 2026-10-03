/** Đọc bản tin dự báo mực nước dán từ bảng tính / văn bản KTTV: mỗi dòng "thời điểm   mực nước".
 *
 * Cột cách nhau bằng Tab (dán từ Excel), dấu ; hoặc khoảng trắng (số cuối dòng là mực nước). Thời điểm theo giờ Việt Nam:
 *   07:00 04/10   ·   7h 04/10/2026   ·   04/10 07:00   ·   2026-10-04 07:00
 * Thiếu năm → năm gần thời điểm hiện tại nhất (bản tin cuối tháng 12 sang tháng 1). Mực nước viết 180,45 hoặc 180.45.
 * Dòng không có chữ số (tiêu đề cột) bị bỏ qua. → { points: [{ time ISO +07:00, value }], errors: ["Dòng 3: …"] }
 */

const pad = (n) => String(n).padStart(2, '0');

const TIME = String.raw`(\d{1,2})[:hg](\d{2})?`; // 07:00 · 7h · 7h30 · 7g
const DATE = String.raw`(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?`;
const TIME_FIRST = new RegExp(`^${TIME}\\s+${DATE}$`, 'i');
const DATE_FIRST = new RegExp(`^${DATE}\\s+${TIME}$`, 'i');
const ISO = /^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{2})$/;

function pickYear(day, month, now) {
  // Năm làm thời điểm gần "bây giờ" nhất (giờ VN)
  const y = now.getUTCFullYear();
  const cands = [y - 1, y, y + 1].map((yy) => ({ yy, d: Math.abs(Date.UTC(yy, month - 1, day) - now.getTime()) }));
  return cands.sort((a, b) => a.d - b.d)[0].yy;
}

function toIso(y, mo, d, h, mi) {
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  const date = new Date(Date.UTC(y, mo - 1, d, h - 7, mi)); // giờ VN = UTC+7, không đổi giờ theo mùa
  const back = new Date(date.getTime() + 7 * 3600e3);
  if (back.getUTCDate() !== d || back.getUTCMonth() !== mo - 1) return null; // 31/09 → không tồn tại
  return `${y}-${pad(mo)}-${pad(d)}T${pad(h)}:${pad(mi)}:00+07:00`;
}

export function parseTime(text, now = new Date()) {
  const s = text.trim().replace(/,$/, '').replace(/\s+/g, ' ');
  let m = s.match(ISO);
  if (m) return toIso(+m[1], +m[2], +m[3], +m[4], +m[5]);
  let h, mi, d, mo, y;
  if ((m = s.match(TIME_FIRST))) [, h, mi, d, mo, y] = m;
  else if ((m = s.match(DATE_FIRST))) [, d, mo, y, h, mi] = m;
  else return null;
  [h, mi, d, mo] = [+h, +(mi || 0), +d, +mo];
  y = y ? (y.length === 2 ? 2000 + +y : +y) : pickYear(d, mo, now);
  return toIso(y, mo, d, h, mi);
}

export function parseBulletin(text, now = new Date()) {
  const points = [];
  const errors = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || !/\d/.test(line)) return;
    const parts = /[\t;]/.test(line) ? line.split(/[\t;]+/).map((x) => x.trim()).filter(Boolean) : line.split(/\s+/);
    const value = Number((parts.at(-1) || '').replace(',', '.'));
    const time = parseTime(parts.slice(0, -1).join(' '), now);
    if (parts.length < 2 || !Number.isFinite(value)) errors.push(`Dòng ${i + 1}: không đọc được mực nước ("${line}")`);
    else if (!time) errors.push(`Dòng ${i + 1}: không đọc được thời điểm ("${line}")`);
    else if (points.some((p) => p.time === time)) errors.push(`Dòng ${i + 1}: trùng thời điểm với dòng trước`);
    else points.push({ time, value });
  });
  points.sort((a, b) => a.time.localeCompare(b.time));
  return { points, errors };
}
