/**
 * Số liệu suy ra của trang Vật tư & Lực lượng (thiết kế C) — hàm thuần, không gọi API: mức màu của kho / phương tiện /
 * điểm nhiên liệu theo thang rủi ro chung (utils/risk.js → stockLevel), bộ lọc từng thẻ, dải thông tin khẩn đầu trang.
 * Dải khẩn, ô chỉ số và kết quả lọc tính từ CÙNG danh sách đang tải → chạm "6 kho cạn kiệt" mở đúng 6 kho.
 */
import { Package, Truck, Users } from 'lucide-react';
import { CATEGORY, RES_STATUS, SKILL, VEHICLE_CAT } from '../../utils/labels';
import { STOCK_LOW, STOCK_WATCH, EXPIRY_DAYS, stockLevel } from '../../utils/risk';

export const TABS = [
  { id: 'luc_luong', label: 'Lực lượng', icon: Users, noun: 'đơn vị' },
  { id: 'vat_tu', label: 'Kho vật tư', short: 'Kho', icon: Package, noun: 'kho' },
  { id: 'phuong_tien', label: 'Phương tiện', icon: Truck, noun: 'phương tiện' },
];
export const TAB_IDS = TABS.map((t) => t.id);

export const WAREHOUSE_LEVEL = { tinh: 'Kho dự trữ tỉnh', cum: 'Kho cụm', xa: 'Kho xã', da_chien: 'Kho dã chiến' };
const FORCE_LEVEL = { tinh: 'Cấp tỉnh', cum: 'Cấp cụm', xa: 'Cấp xã' };
export const forceLevelLabel = (lv) => FORCE_LEVEL[lv] || lv;

/** Mức của một kho: Đỏ — có mặt hàng dưới 20 % định mức; Cam — có hàng sắp hết hạn; Vàng — có mặt hàng dưới 50 %; Xanh —
 * đủ; chưa có tồn kho kèm định mức → null (Xám, không tính là "cạn kiệt"). */
export function warehouseFacts(w) {
  const rated = w.items.filter((i) => i.pct != null);
  const low = rated.filter((i) => stockLevel(i.pct) === 3);
  const watch = rated.filter((i) => stockLevel(i.pct) === 1);
  const expiring = w.items.filter((i) => w.alerts?.expiring?.includes(i.item_code));
  const level = low.length ? 3 : expiring.length ? 2 : watch.length ? 1 : rated.length ? 0 : null;
  return { level, low, watch, expiring, rated };
}

/** % xăng + dầu so với sức chứa của điểm cấp nhiên liệu (không có sức chứa → null). */
export const depotPct = (d) => (d.capacity_l > 0 ? (100 * ((d.gasoline_l || 0) + (d.diesel_l || 0))) / d.capacity_l : null);

/**
 * Bộ lọc của từng thẻ (thanh lọc thiết kế C: Cấp quản lý · Tình trạng, thêm Kỹ năng / Nhóm hàng / Nhiên liệu). Khoá ngắn
 * vì nằm trên địa chỉ trang (?tab=vat_tu&tt=can_kiet) — dải khẩn, ô chỉ số dẫn thẳng tới danh sách đã lọc; nút Quay lại
 * của trình duyệt trả lại bộ lọc cũ.
 */
export const FILTERS = {
  luc_luong: [
    { key: 'cap', label: 'Cấp quản lý', all: 'Mọi cấp quản lý', options: Object.entries(FORCE_LEVEL) },
    { key: 'tt', label: 'Tình trạng', all: 'Mọi tình trạng', options: Object.entries(RES_STATUS).map(([k, v]) => [k, v.label]) },
    { key: 'kn', label: 'Kỹ năng', all: 'Mọi kỹ năng', options: Object.entries(SKILL) },
  ],
  vat_tu: [
    { key: 'cap', label: 'Cấp kho', all: 'Mọi cấp kho', options: Object.entries(WAREHOUSE_LEVEL) },
    {
      key: 'tt',
      label: 'Mức dự trữ',
      all: 'Mọi mức dự trữ',
      options: [
        ['can_kiet', `Cạn kiệt (dưới ${STOCK_LOW}%)`],
        ['het_han', `Sắp hết hạn (${EXPIRY_DAYS} ngày)`],
        ['thieu', `Dưới ${STOCK_WATCH}% định mức`],
        ['du', 'Đủ dự trữ'],
      ],
    },
    { key: 'nhom', label: 'Nhóm hàng', all: 'Mọi nhóm hàng', options: Object.entries(CATEGORY) },
  ],
  phuong_tien: [
    { key: 'nhom', label: 'Nhóm', all: 'Mọi nhóm phương tiện', options: Object.entries(VEHICLE_CAT) },
    { key: 'tt', label: 'Tình trạng', all: 'Mọi tình trạng', options: Object.entries(RES_STATUS).map(([k, v]) => [k, v.label]) },
    {
      key: 'nl',
      label: 'Nhiên liệu',
      all: 'Mọi mức nhiên liệu',
      options: [['duoi20', `Dưới ${STOCK_LOW}% (không gợi ý điều động)`], ['duoi50', `Dưới ${STOCK_WATCH}%`], ['chua_bao', 'Chưa báo']],
    },
  ],
};

const FORCE_TEST = {
  cap: (f, v) => f.level === v,
  tt: (f, v) => f.status === v,
  kn: (f, v) => (f.skills || []).includes(v),
};
const WAREHOUSE_TEST = {
  cap: (w, v) => w.level === v,
  tt: (w, v, x) => ({ can_kiet: x.low.length > 0, het_han: x.expiring.length > 0, thieu: x.low.length + x.watch.length > 0, du: x.level === 0 })[v],
  nhom: (w, v) => w.items.some((i) => i.category === v),
};
const VEHICLE_TEST = {
  nhom: (v, x) => v.category === x,
  tt: (v, x) => v.status === x,
  nl: (v, x) => (x === 'chua_bao' ? v.fuel_level == null : v.fuel_level != null && v.fuel_level < (x === 'duoi20' ? STOCK_LOW : STOCK_WATCH)),
};
const TESTS = { luc_luong: FORCE_TEST, vat_tu: WAREHOUSE_TEST, phuong_tien: VEHICLE_TEST };

/** Dòng có khớp mọi bộ lọc đang chọn của thẻ không (`facts`: warehouseFacts của kho — chỉ thẻ Vật tư cần). */
export function matchFilters(tab, row, filters, facts) {
  return Object.entries(filters).every(([key, value]) => !value || !TESTS[tab][key] || TESTS[tab][key](row, value, facts));
}

/** Số dòng của từng lựa chọn trong một bộ lọc (các bộ lọc KHÁC giữ nguyên) — "Đang nhiệm vụ (0)" nói rõ không có, khỏi chọn thử. */
export function optionCounts(tab, rows, filters, key, factsOf) {
  const others = { ...filters, [key]: '' };
  const base = rows.filter((r) => matchFilters(tab, r, others, factsOf?.(r)));
  return Object.fromEntries(FILTERS[tab].find((f) => f.key === key).options.map(([value]) => [
    value,
    base.filter((r) => TESTS[tab][key](r, value, factsOf?.(r))).length,
  ]));
}

/** Cách xếp của từng thẻ (lựa chọn đầu = mặc định). Bảng trên máy tính: bấm tiêu đề cột cũng chọn cách xếp tương ứng. */
export const SORTS = {
  luc_luong: [['mac_dinh', 'Cấp tỉnh trước'], ['san_sang', 'Quân số sẵn sàng nhiều nhất'], ['ten', 'Tên A → Z']],
  vat_tu: [['canh_bao', 'Cảnh báo nặng trước'], ['thieu', 'Thiếu nhiều nhất'], ['ten', 'Tên A → Z']],
  phuong_tien: [['mac_dinh', 'Theo nhóm, loại'], ['nhien_lieu', 'Nhiên liệu thấp trước'], ['tinh_trang', 'Sẵn sàng trước'], ['so_hieu', 'Số hiệu A → Z']],
};
const STATUS_ORDER = { san_sang: 0, nhiem_vu: 1, bao_duong: 2 };
const CAT_ORDER = Object.keys(VEHICLE_CAT);
const byName = (a, b) => a.localeCompare(b, 'vi');
const nullsLast = (x, y) => (x == null ? (y == null ? 0 : 1) : y == null ? -1 : x - y);
const minPct = (x) => (x.rated.length ? Math.min(...x.rated.map((i) => i.pct)) : null);

/** Xếp lại (bản sao) — `factsOf`: warehouseFacts của kho (thẻ Vật tư). Cùng hạng giữ thứ tự máy chủ trả. */
export function sortRows(tab, rows, key, factsOf) {
  const list = [...rows];
  if (tab === 'luc_luong') {
    if (key === 'san_sang') list.sort((a, b) => b.personnel_ready - a.personnel_ready);
    if (key === 'ten') list.sort((a, b) => byName(a.name, b.name));
  } else if (tab === 'vat_tu') {
    if (key === 'canh_bao') list.sort((a, b) => (factsOf(b).level ?? -1) - (factsOf(a).level ?? -1));
    if (key === 'thieu') list.sort((a, b) => nullsLast(minPct(factsOf(a)), minPct(factsOf(b))));
    if (key === 'ten') list.sort((a, b) => byName(a.name, b.name));
  } else {
    // Mặc định theo nhóm của thiết kế C.3: đường thủy (xuồng — chủ lực khi lũ) → đường bộ → thiết bị; máy chủ xếp theo mã nhóm ABC
    if (key === 'mac_dinh') list.sort((a, b) => CAT_ORDER.indexOf(a.category) - CAT_ORDER.indexOf(b.category));
    if (key === 'nhien_lieu') list.sort((a, b) => nullsLast(a.fuel_level, b.fuel_level));
    if (key === 'tinh_trang') list.sort((a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9));
    if (key === 'so_hieu') list.sort((a, b) => byName(a.code, b.code));
  }
  return list;
}

/**
 * Dải thông tin khẩn đầu trang: chỉ những việc cần xử lý, từ danh sách đang tải. Mỗi mục { key, level, text, short (nhãn
 * ngắn — điện thoại), tab, filter }
 * — chạm → mở thẻ với bộ lọc đó. Mức theo thang chung: kho có hàng dưới 20 % định mức, phương tiện báo nhiên liệu dưới 20 %,
 * điểm nhiên liệu dưới 20 % sức chứa, hết xuồng / hết quân sẵn sàng → Đỏ; hàng sắp hết hạn → Cam; phương tiện hỏng / bảo
 * dưỡng → Vàng. Danh sách chưa tải được thì bỏ qua (dải khẩn nói riêng phần "chưa kiểm tra được").
 */
export function resourceAlerts({ summary, warehouses, vehicles, depots }) {
  const items = [];
  if (warehouses) {
    const facts = warehouses.map((w) => ({ w, x: warehouseFacts(w) }));
    const low = facts.filter(({ x }) => x.low.length);
    if (low.length) {
      const names = low.slice(0, 2).map(({ w }) => w.name.replace(/^Kho (cụm|dã chiến|xã) /, '')).join(', ');
      items.push({
        key: 'kho-can-kiet',
        level: 3,
        text: `${low.length} kho có hàng dưới ${STOCK_LOW}% định mức`,
        short: `${low.length} kho cạn kiệt`,
        detail: `${names}${low.length > 2 ? '…' : ''}`,
        tab: 'vat_tu',
        filter: { tt: 'can_kiet' },
      });
    }
    const expiring = facts.reduce((n, { x }) => n + x.expiring.length, 0);
    if (expiring) {
      items.push({
        key: 'het-han', level: 2, text: `${expiring} mặt hàng sắp hết hạn dùng (${EXPIRY_DAYS} ngày)`, short: `${expiring} hàng sắp hết hạn`, tab: 'vat_tu', filter: { tt: 'het_han' },
      });
    }
  }
  if (vehicles) {
    const fuelLow = vehicles.filter((v) => v.fuel_level != null && v.fuel_level < STOCK_LOW);
    if (fuelLow.length) {
      items.push({
        key: 'nhien-lieu-xe',
        level: 3,
        text: `${fuelLow.length} phương tiện còn dưới ${STOCK_LOW}% nhiên liệu`,
        short: `${fuelLow.length} xe dưới ${STOCK_LOW}% nhiên liệu`,
        detail: 'không được gợi ý điều động',
        tab: 'phuong_tien',
        filter: { nl: 'duoi20' },
      });
    }
    const broken = vehicles.filter((v) => v.status === 'bao_duong');
    if (broken.length) {
      items.push({
        key: 'xe-hong', level: 1, text: `${broken.length} phương tiện hỏng / bảo dưỡng`, short: `${broken.length} xe hỏng / bảo dưỡng`, tab: 'phuong_tien', filter: { tt: 'bao_duong' },
      });
    }
  }
  const boats = summary?.vehicles;
  if (boats?.boats_total > 0 && !boats.boats_free) {
    items.push({ key: 'het-xuong', level: 3, text: 'Không còn xuồng, ca nô sẵn sàng', short: 'Hết xuồng sẵn sàng', tab: 'phuong_tien', filter: { nhom: 'duong_thuy' } });
  }
  const fo = summary?.forces;
  if (fo?.total > 0 && !fo.ready) {
    items.push({ key: 'het-quan', level: 3, text: 'Không còn cán bộ, chiến sĩ sẵn sàng', short: 'Hết quân sẵn sàng', tab: 'luc_luong', filter: {} });
  }
  if (depots) {
    const lowDepots = depots.filter((d) => stockLevel(depotPct(d)) === 3);
    if (lowDepots.length) {
      items.push({
        key: 'diem-nhien-lieu',
        level: 3,
        text: `${lowDepots.length} điểm nhiên liệu dưới ${STOCK_LOW}% sức chứa`,
        short: `${lowDepots.length} điểm xăng dầu dưới ${STOCK_LOW}%`,
        detail: lowDepots.slice(0, 2).map((d) => d.name).join(', '),
        tab: 'phuong_tien',
        filter: {},
        anchor: 'nhien-lieu-du-tru',
      });
    }
  }
  return items.sort((a, b) => b.level - a.level);
}
