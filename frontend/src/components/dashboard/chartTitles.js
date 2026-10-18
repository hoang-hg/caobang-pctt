import { num } from '../../utils/format';
import { riverEta, riverState, riverTrend, ROMAN, shortName } from './RiverKpi';

/*
 * Tiêu đề biểu đồ của Tổng quan là MỘT câu kết luận (thiết kế A — người xem không phải tự đọc biểu đồ mới biết chuyện gì),
 * ghép từ chính số liệu biểu đồ đó đang vẽ (cùng truy vấn, không gọi thêm). Thiếu số liệu → nói chưa có / chưa đánh giá
 * được, không nói "bình thường". Dự báo mô phỏng luôn ghi "(mô phỏng)". Hàm thuần — không gọi API.
 */

const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);

/** "đang lên 15 cm/giờ" — mực nước sông đọc theo cm/giờ quen hơn m/giờ. */
const trendCm = (t) => {
  const cm = Math.round(Math.abs(t.rate) * 100);
  return t.dir === 'len' ? `đang lên ${cm} cm/giờ` : `đang xuống ${cm} cm/giờ`;
};

/**
 * Trạm mực nước (dòng /stations): "Sông Bằng Giang tại Cao Bằng: Báo động I, đang lên 15 cm/giờ — dự báo lên Báo động II
 * lúc 21:00". Số đo cũ không nói lên / xuống.
 */
export function hydroTitle(s) {
  if (!s) return 'Mực nước sông';
  const where = s.river ? `Sông ${s.river} tại ${shortName(s)}` : shortName(s);
  const st = riverState(s);
  if (st.noData) return `${where}: chưa có số đo trong 2 giờ qua`;
  if (st.level == null) return `${where}: ${st.label.toLowerCase()} — chưa đánh giá được`;
  const now = st.level ? `Báo động ${ROMAN[st.level]}` : 'dưới Báo động I';
  const tr = !st.stale && riverTrend(s);
  const trend = tr && tr.dir !== 'on_dinh' ? `, ${trendCm(tr)}` : '';
  const eta = riverEta(s);
  const fc = eta && eta.level > st.level ? ` — dự báo lên Báo động ${ROMAN[eta.level]} lúc ${eta.when}${eta.kttv ? '' : ' (mô phỏng)'}` : '';
  return `${where}: ${now}${st.stale ? ' (số đo cũ)' : ''}${trend}${fc}`;
}

/** Mưa 24 giờ (KPI) + 3 giờ tới (dữ liệu biểu đồ mưa /dashboard/rainfall). */
export function rainTitle(k, rainfall) {
  const r = k?.rain;
  if (r?.avg_24h == null) return 'Mưa từng giờ: chưa có số đo 24 giờ qua trong vùng đang xem';
  const at = r.max_station ? ` tại ${r.max_station.replace(/^Trạm đo mưa\s+/i, '')}` : '';
  const ahead = rainfall?.nowcast || [];
  const fc = ahead.reduce((n, d) => n + (d.mm || 0), 0);
  const next = !ahead.length ? '' : fc >= 0.5 ? ` — 3 giờ tới dự báo thêm ${num(fc, 1)} mm` : ' — 3 giờ tới dự báo không mưa đáng kể';
  return `Mưa 24 giờ qua trung bình ${num(r.avg_24h, 1)} mm, lớn nhất ${num(r.max_24h, 1)} mm${at}${next}`;
}

/** Dự báo mưa 3 ngày theo xã (/forecast/areas): xã mưa nhiều nhất. */
export function forecastTitle(areas) {
  if (!areas?.length) return 'Dự báo mưa 3 ngày tới theo xã';
  const top = areas.reduce((m, a) => (Number(a.p50) > Number(m.p50) ? a : m));
  return `Mưa 3 ngày tới nhiều nhất ở ${top.name}: khoảng ${num(top.p50)} mm (có thể tới ${num(top.p90)} mm)`;
}

const LS_NAME = { do: 'Đỏ', cam: 'Cam', vang: 'Vàng' };

/** Ngưỡng sạt lở theo mưa (/dashboard/landslide-risk): mức nặng nhất các trạm mưa đã vượt, kèm xã. */
export function landslideTitle(data) {
  const pts = data?.points || [];
  if (!data) return 'Ngưỡng sạt lở theo mưa 3 ngày và cường độ mưa';
  if (!pts.length) return 'Ngưỡng sạt lở: chưa có số đo mưa 3 ngày qua — chưa đánh giá được';
  for (const lv of ['do', 'cam', 'vang']) {
    const hit = pts.filter((p) => p.risk === lv);
    if (hit.length) {
      const where = [...new Set(hit.map((p) => p.admin_name).filter(Boolean))];
      const list = where.length ? ` (${where.slice(0, 2).join(', ')}${where.length > 2 ? ` và ${where.length - 2} xã khác` : ''})` : '';
      return `${hit.length} trạm mưa đã vượt ngưỡng sạt lở mức ${LS_NAME[lv]}${list}`;
    }
  }
  return `Chưa trạm mưa nào vượt ngưỡng sạt lở mức Vàng (${pts.length} trạm có số đo)`;
}

const CAT_NAME = { luong_thuc: 'lương thực', nuoc_uong: 'nước uống', do_dung: 'áo phao, đồ cứu sinh', y_te: 'thuốc, vật tư y tế' };

/** Vật tư cứu trợ theo kho (/dashboard/supplies, % so với định mức): nhóm hàng thấp nhất. */
export function suppliesTitle(rows) {
  if (!rows) return 'Vật tư cứu trợ so với định mức dự trữ';
  const all = rows.flatMap((w) => Object.keys(CAT_NAME).filter((c) => w[c] != null).map((c) => ({ w, c, v: Number(w[c]) })));
  if (!all.length) return 'Vật tư cứu trợ: chưa có kho kèm định mức dự trữ';
  const low = all.reduce((m, x) => (x.v < m.v ? x : m));
  const under = all.filter((x) => x.v < 20).length;
  if (low.v < 20) {
    return `${low.w.name} còn ${num(low.v)}% định mức ${CAT_NAME[low.c]} — cần bổ sung${under > 1 ? ` (cùng ${under - 1} nhóm hàng khác dưới 20%)` : ''}`;
  }
  if (low.v < 50) return `${low.w.name} còn ${num(low.v)}% định mức ${CAT_NAME[low.c]} — cần lên kế hoạch bổ sung`;
  return cap(`các kho đều còn từ ${num(Math.floor(low.v))}% định mức trở lên`);
}
