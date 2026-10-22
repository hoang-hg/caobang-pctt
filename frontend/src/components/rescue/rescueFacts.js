/**
 * Số liệu suy ra của trang Điều hành cứu hộ (thiết kế D) — hàm thuần, không gọi API: tình huống của từng phiếu (quá hạn
 * SLA, chưa có đội, đội cần chi viện…), bộ lọc, cách xếp, dải thông tin khẩn. Dải khẩn, ô chỉ số và kết quả lọc tính từ
 * CÙNG danh sách phiếu đang tải → chạm "3 phiếu quá hạn" mở đúng 3 phiếu.
 */
import { CheckCircle2, Inbox, Navigation, Send } from 'lucide-react';
import { INCIDENT, SOS_STATUS, SOURCE } from '../../utils/labels';
import { occupancyLevel } from '../../utils/risk';
import { hasActiveTeam, slaState } from '../../utils/sla';

// 4 bước của phiếu bằng lời đời thường (thiết kế D.2: Chờ xử lý → Đang điều phối → Đang thực thi → Hoàn thành)
export const COLUMNS = [
  { key: 'moi', title: SOS_STATUS.moi, short: 'Mới báo', hint: 'Tin mới đến — nhận phiếu, điều đội ngay', icon: Inbox },
  { key: 'dieu_phoi', title: SOS_STATUS.dieu_phoi, short: 'Tìm đội', hint: 'Đã nhận phiếu, đang chọn đội và phương tiện', icon: Send },
  { key: 'thuc_thi', title: SOS_STATUS.thuc_thi, short: 'Đang đến', hint: 'Đội đã xuất phát, đang tới hiện trường', icon: Navigation },
  { key: 'hoan_thanh', title: SOS_STATUS.hoan_thanh, short: 'Đã xong', hint: 'Người dân đã tới nơi an toàn, hoặc phiếu đóng không cần cứu (48 giờ qua)', icon: CheckCircle2 },
];
export const COLUMN_KEYS = COLUMNS.map((c) => c.key);

/** Yêu cầu chi viện của xã gửi lên tỉnh (nút "Gửi yêu cầu chi viện lên tỉnh" ở trang Cấp xã — QuickIncidentModal support):
 * phiếu SOS nguồn CAN_BO, nội dung tin mở đầu bằng thẻ này — không cần cột / API mới, tỉnh lọc và nhận biết được trên bảng
 * điều phối. */
export const COMMUNE_SUPPORT_TAG = '[Xã xin chi viện]';
export const isCommuneSupport = (t) => t?.source === 'CAN_BO' && String(t.raw_message || '').startsWith(COMMUNE_SUPPORT_TAG);

/** Thời lượng bằng lời: "chưa tới 1 phút", "5 phút", "2 giờ 14 phút", "1 ngày 3 giờ". */
export const durWords = (sec) => {
  const m = Math.floor(Math.max(0, Math.abs(sec)) / 60);
  if (m < 1) return 'chưa tới 1 phút';
  if (m < 60) return `${m} phút`;
  const h = Math.floor(m / 60);
  if (h < 24) return m % 60 ? `${h} giờ ${m % 60} phút` : `${h} giờ`;
  return h % 24 ? `${Math.floor(h / 24)} ngày ${h % 24} giờ` : `${Math.floor(h / 24)} ngày`;
};

/**
 * Câu chờ của phiếu theo hạn phản hồi (utils/sla.js): "Chờ 5 phút — quá hạn 2 phút", "Chờ 1 phút — còn 2 phút";
 * "Đang tìm đội" mà chưa đội nào đi: "Chờ điều đội 12 phút — …". null khi đồng hồ không chạy (đã có đội, đã xong).
 */
export function waitText(t, sla) {
  if (!sla) return null;
  const what = t.status === 'moi' ? 'Chờ' : 'Chờ điều đội';
  const left = t.sla_minutes * 60 - sla.waitedSec;
  return `${what} ${durWords(sla.waitedSec)} — ${left < 0 ? `quá hạn ${durWords(-left)}` : `còn ${durWords(left)}`}`;
}

/** Giờ đội dự kiến tới (từ lúc phát lệnh + thời gian đường đi): "Dự kiến đến sau 12 phút" / "Quá giờ dự kiến 3 phút". */
export const etaText = (etaSec) => {
  if (Math.abs(etaSec) < 60) return 'Sắp tới nơi';
  return etaSec > 0 ? `Dự kiến đến sau ${durWords(etaSec)}` : `Quá giờ dự kiến ${durWords(-etaSec)}`;
};

/** Tình huống của một phiếu — cùng quy tắc SLA với ô SOS của Tổng quan (utils/sla.js, máy chủ OVERDUE_SQL). */
export function ticketFacts(t, now) {
  const sla = slaState(t, now);
  const open = t.status !== 'hoan_thanh';
  const doing = t.status === 'thuc_thi';
  return {
    sla,
    open,
    overdue: !!sla?.breached,
    noTeam: open && !doing && !hasActiveTeam(t),
    needSupport: doing && t.field_kind === 'need_support',
    rescuedPending: doing && t.field_kind === 'rescued',
    unsafeRoute: doing && t.route_safe === false,
  };
}

/** Bộ lọc của trang (nằm trên địa chỉ: ?muc=1&th=qua_han) — mỗi lựa chọn kèm số phiếu. */
export const FILTERS = [
  { key: 'muc', label: 'Mức ưu tiên', all: 'Mọi mức ưu tiên', options: [['1', 'Cấp 1 · Đỏ'], ['2', 'Cấp 2 · Cam'], ['3', 'Cấp 3 · Vàng']] },
  {
    key: 'th',
    label: 'Cần chú ý',
    all: 'Mọi tình huống',
    options: [
      ['xa_chi_vien', 'Xã xin chi viện'],
      ['qua_han', 'Quá hạn phản hồi'],
      ['chua_doi', 'Chưa có đội'],
      ['chi_vien', 'Đội cần chi viện'],
      ['cho_xac_nhan', 'Đội báo đã cứu — chờ xác nhận'],
      ['lo_trinh', 'Lộ trình qua vùng nguy hiểm'],
    ],
  },
  { key: 'loai', label: 'Loại sự cố', all: 'Mọi loại sự cố', options: Object.entries(INCIDENT) },
  { key: 'nguon', label: 'Kênh tiếp nhận', all: 'Mọi kênh', options: Object.entries(SOURCE) },
];
const TESTS = {
  muc: (t, v) => String(t.priority) === v,
  th: (t, v, x) => ({
    xa_chi_vien: isCommuneSupport(t),
    qua_han: x.overdue,
    chua_doi: x.noTeam,
    chi_vien: x.needSupport,
    cho_xac_nhan: x.rescuedPending,
    lo_trinh: x.unsafeRoute,
  })[v],
  loai: (t, v) => t.incident_type === v,
  nguon: (t, v) => t.source === v,
};

export function matchTicket(t, filters, x) {
  return Object.entries(filters).every(([key, value]) => !value || !TESTS[key] || TESTS[key](t, value, x));
}

/** Số phiếu của từng lựa chọn trong một bộ lọc (các bộ lọc khác giữ nguyên). */
export function optionCounts(rows, filters, key, factsOf) {
  const base = rows.filter((t) => matchTicket(t, { ...filters, [key]: '' }, factsOf(t)));
  return Object.fromEntries(FILTERS.find((f) => f.key === key).options.map(([value]) => [
    value,
    base.filter((t) => TESTS[key](t, value, factsOf(t))).length,
  ]));
}

/** Cách xếp (danh sách và trong mỗi cột): mặc định quá hạn → cấp 1 → nhận sớm trước (chờ lâu nhất lên đầu). */
export const SORTS = [
  ['uu_tien', 'Ưu tiên (quá hạn, cấp 1 trước)'],
  ['cho_lau', 'Chờ lâu nhất'],
  ['moi_nhat', 'Mới nhận trước'],
  ['nhieu_nguoi', 'Nhiều người nhất'],
];
const at = (s) => (s ? new Date(s).getTime() : 0);

export function sortTickets(list, key, factsOf) {
  const out = [...list];
  if (key === 'moi_nhat') return out.sort((a, b) => at(b.received_at) - at(a.received_at));
  if (key === 'nhieu_nguoi') return out.sort((a, b) => (b.trapped_count || 0) - (a.trapped_count || 0) || a.priority - b.priority);
  if (key === 'cho_lau') return out.sort((a, b) => (factsOf(b).sla?.waitedSec ?? -1) - (factsOf(a).sla?.waitedSec ?? -1) || at(a.received_at) - at(b.received_at));
  // Thứ tự cứu nạn giữ nguyên (quá hạn → cấp ưu tiên); cùng mức thì yêu cầu chi viện của xã lên trước
  return out.sort((a, b) => Number(factsOf(b).overdue) - Number(factsOf(a).overdue) || a.priority - b.priority
    || Number(isCommuneSupport(b)) - Number(isCommuneSupport(a)) || at(a.received_at) - at(b.received_at));
}

/**
 * Dải thông tin khẩn đầu trang: phiếu quá hạn phản hồi, cấp 1 chưa có đội, đội cần chi viện (Đỏ); đội đi qua vùng nguy hiểm, điểm
 * sơ tán sắp đầy (Cam); điểm sơ tán quá tải (Đỏ); đội báo đã cứu chờ xác nhận (Vàng). Mỗi mục { key, level, text, short,
 * filter | anchor } — chạm → lọc bảng điều phối (hoặc cuộn tới khối sơ tán).
 */
export function rescueAlerts({ tickets, sites, factsOf }) {
  const items = [];
  const count = (pred) => tickets.filter((t) => pred(factsOf(t), t)).length;
  const communeRequests = count((_, t) => isCommuneSupport(t) && t.status !== 'hoan_thanh');
  if (communeRequests) {
    items.push({
      key: 'xa-chi-vien',
      level: 3,
      text: `${communeRequests} yêu cầu chi viện từ xã/phường`,
      short: `${communeRequests} xã xin chi viện`,
      filter: { th: 'xa_chi_vien' },
    });
  }
  const overdue = count((x) => x.overdue);
  if (overdue) items.push({ key: 'qua-han', level: 3, text: `${overdue} phiếu quá hạn phản hồi`, short: `${overdue} phiếu quá hạn`, filter: { th: 'qua_han' } });
  const p1 = count((x, t) => x.noTeam && t.priority === 1);
  if (p1) items.push({ key: 'cap1', level: 3, text: `${p1} phiếu cấp 1 chưa có đội`, short: `${p1} cấp 1 chưa có đội`, filter: { muc: '1', th: 'chua_doi' } });
  const support = count((x) => x.needSupport);
  if (support) items.push({ key: 'chi-vien', level: 3, text: `${support} đội cần chi viện`, filter: { th: 'chi_vien' } });
  if (sites) {
    const full = sites.filter((s) => occupancyLevel(s.current_occupancy, s.capacity) === 3);
    if (full.length) {
      items.push({
        key: 'so-tan-day', level: 3, text: `${full.length} điểm sơ tán đầy / quá tải`, short: `${full.length} điểm sơ tán đầy`,
        detail: full.slice(0, 2).map((s) => s.name).join(', '), anchor: 'so-tan',
      });
    }
    const near = sites.filter((s) => occupancyLevel(s.current_occupancy, s.capacity) === 2);
    if (near.length) items.push({ key: 'so-tan-gan-day', level: 2, text: `${near.length} điểm sơ tán sắp đầy (trên 85%)`, short: `${near.length} điểm sơ tán sắp đầy`, anchor: 'so-tan' });
  }
  const unsafe = count((x) => x.unsafeRoute);
  if (unsafe) items.push({ key: 'lo-trinh', level: 2, text: `${unsafe} đội đi lộ trình qua vùng nguy hiểm`, short: `${unsafe} lộ trình nguy hiểm`, filter: { th: 'lo_trinh' } });
  const pending = count((x) => x.rescuedPending);
  if (pending) items.push({ key: 'cho-xac-nhan', level: 1, text: `${pending} phiếu đội báo đã cứu — chờ xác nhận`, short: `${pending} chờ xác nhận`, filter: { th: 'cho_xac_nhan' } });
  return items.sort((a, b) => b.level - a.level);
}

/** Phút → "12 phút" / "1 giờ 5 phút" (thời gian xử lý của một nửa số phiếu). */
export const dur = (m) => (m == null ? '—' : m < 1 ? 'dưới 1 phút' : durWords(Math.round(m) * 60));

export const TREND_HOURS = 48;
export const TREND_STEP = 3; // giờ mỗi cột

/**
 * Phiếu nhận trong 48 giờ theo khung 3 giờ (mốc 0h, 3h… giờ máy) × mức ưu tiên — cột cuối là khung đang chạy. Danh sách
 * /sos có đủ phiếu nhận trong 48 giờ (phiếu đã xong bị bỏ sau 48 giờ kể từ lúc xong, muộn hơn lúc nhận).
 */
export function sosTrend(tickets, now) {
  const step = TREND_STEP * 3600_000;
  const n = TREND_HOURS / TREND_STEP;
  const d = new Date(now);
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() - (d.getHours() % TREND_STEP));
  const first = d.getTime() - (n - 1) * step;
  const buckets = Array.from({ length: n }, (_, i) => ({ start: first + i * step, p1: 0, p2: 0, p3: 0, total: 0 }));
  for (const t of tickets) {
    const at = new Date(t.received_at).getTime();
    if (!(at >= first && at <= now)) continue;
    const b = buckets[Math.min(n - 1, Math.floor((at - first) / step))];
    if (t.priority >= 1 && t.priority <= 3) b[`p${t.priority}`] += 1;
    b.total += 1;
  }
  return buckets;
}

const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const minutesBetween = (a, b) => (a && b ? (new Date(b) - new Date(a)) / 60000 : null);

/**
 * Thời gian xử lý các phiếu nhận trong 48 giờ (trung vị — một nửa số phiếu nhanh hơn): nhận tin → tiếp nhận, nhận tin → có
 * đội đi, đội đi → đến hiện trường. Tiếp nhận trong SLA (cấp 1 3′, cấp 2 15′, cấp 3 60′ — đồng hồ "Chờ xử lý"): phiếu đã
 * tiếp nhận kịp / (đã tiếp nhận + còn chờ quá SLA); phiếu đang chờ chưa quá SLA chưa tính.
 */
export function responseStats(tickets, now) {
  const since = now - TREND_HOURS * 3600_000;
  const recent = tickets.filter((t) => new Date(t.received_at).getTime() >= since);
  const pick = (from, to) => recent.map((t) => minutesBetween(t[from], t[to])).filter((x) => x != null && x >= 0);
  const ack = pick('received_at', 'acknowledged_at');
  const disp = pick('received_at', 'dispatched_at');
  const reach = pick('dispatched_at', 'arrived_at');
  let inSla = 0;
  let late = 0;
  for (const t of recent) {
    const sla = t.sla_minutes;
    if (!sla) continue;
    if (t.acknowledged_at) {
      if (minutesBetween(t.received_at, t.acknowledged_at) <= sla) inSla += 1;
      else late += 1;
    } else if (t.status === 'moi' && (now - new Date(t.received_at)) / 60000 > sla) late += 1;
  }
  return {
    n: recent.length,
    ack: median(ack), ackN: ack.length,
    disp: median(disp), dispN: disp.length,
    reach: median(reach), reachN: reach.length,
    inSla, late, slaPct: inSla + late ? Math.round((100 * inSla) / (inSla + late)) : null,
  };
}
