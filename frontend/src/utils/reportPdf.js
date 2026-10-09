import { jsPDF } from 'jspdf';
import regularUrl from '../assets/fonts/report/Tinos-Regular.ttf?url';
import boldUrl from '../assets/fonts/report/Tinos-Bold.ttf?url';
import italicUrl from '../assets/fonts/report/Tinos-Italic.ttf?url';
import { riverEta, riverName, riverState, riverTrend, ROMAN } from '../components/dashboard/RiverKpi';
import { int, num, pct } from './format';
import { addCanvasPages } from './exportPdf';
import { trendWords } from './stations';

/*
 * Báo cáo nhanh dạng VĂN BẢN (thiết kế A: "PDF định dạng chuẩn … báo cáo nhanh cho UBND tỉnh hoặc Ban Chỉ đạo Quốc gia"):
 * thể thức theo Nghị định 30/2020/NĐ-CP — quốc hiệu, tiêu ngữ, cơ quan ban hành, số / ký hiệu, địa danh – ngày tháng, tên
 * loại văn bản, kính gửi, nội dung, nơi nhận, chức vụ người ký; khổ A4 đứng, lề trái 30 mm, phải 15 mm, trên / dưới 20 mm;
 * chữ Times (font Tinos — jsPDF chỉ nhúng được TTF, font mặc định không có dấu tiếng Việt), cỡ 13. Chữ tìm / sao chép được
 * (khác "Xuất PDF" là ảnh chụp màn hình). Số liệu lấy đúng các khối đang hiện trên Tổng quan — không có số thì ghi "chưa có".
 * Phụ lục (tuỳ chọn): ảnh chụp màn hình điều hành, khổ ngang.
 */

const PT = 0.3528; // mm / pt
const FONT = 'Tinos';
const TZ = 'Asia/Ho_Chi_Minh';
const PLACE = 'Cao Bằng';
let fontCache = null; // base64 của 3 tệp font — tải một lần mỗi phiên

function toBase64(buf) {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

async function loadFonts(pdf) {
  const files = [['Tinos-Regular.ttf', regularUrl, 'normal'], ['Tinos-Bold.ttf', boldUrl, 'bold'], ['Tinos-Italic.ttf', italicUrl, 'italic']];
  if (!fontCache) {
    fontCache = await Promise.all(files.map(async ([name, url]) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Không tải được font báo cáo (${name})`);
      return toBase64(await res.arrayBuffer());
    }));
  }
  files.forEach(([name, , style], i) => {
    pdf.addFileToVFS(name, fontCache[i]);
    pdf.addFont(name, FONT, style);
  });
}

/** Các phần ngày giờ theo giờ Việt Nam (không phụ thuộc múi giờ của máy). */
function vnParts(d) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d);
  const get = (t) => parts.find((p) => p.type === t)?.value;
  return { dd: get('day'), mm: get('month'), yyyy: get('year'), hh: get('hour'), mi: get('minute') };
}

/** "Cao Bằng, ngày 05 tháng 01 năm 2026": ngày < 10 và tháng 1, 2 thêm số 0 (NĐ 30/2020, Phụ lục I). */
export function placeDate(d) {
  const { dd, mm, yyyy } = vnParts(d);
  const m = Number(mm);
  return `${PLACE}, ngày ${dd} tháng ${m <= 2 ? mm : m} năm ${yyyy}`;
}

const stamp = (d) => {
  const { dd, mm, yyyy, hh, mi } = vnParts(d);
  return `${hh} giờ ${mi} phút ngày ${dd}/${mm}/${yyyy}`;
};

const lines = (text) => String(text || '').split(/\r?\n/).map((x) => x.trim()).filter(Boolean);

/* ------------------------------------------------ Nội dung (thuần dữ liệu) ------------------------------------------------ */

/**
 * Nội dung báo cáo từ số liệu đang hiện trên Tổng quan: các mục, đoạn văn, bảng. `k` = /dashboard/kpis, `stations` = trạm
 * mực nước (/stations), `evacSites` = điểm sơ tán (/evacuation). Thiếu số liệu → câu "chưa có", không bỏ trống / không đoán.
 */
export function reportContent({ k, stations = [], evacSites, assessment }) {
  const rain = k?.rain || {};
  const sos = k?.sos || {};
  const ev = k?.evacuation || {};
  const fo = k?.forces || {};
  const ve = k?.vehicles || {};
  const rs = k?.reservoirs || {};
  const ls = k?.landslides || {};

  const rainText = rain.avg_24h != null
    ? `Lượng mưa 24 giờ qua trung bình lưu vực ${num(rain.avg_24h, 1)} mm (${rain.avg_method === 'thiessen'
      ? `bình quân theo diện tích, ${int(rain.stations)} trạm đo` : rain.stations === 1 ? 'số đo của 1 trạm' : `trung bình ${int(rain.stations)} trạm đo`}); lớn nhất ${num(rain.max_24h, 1)} mm${rain.max_station ? ` tại ${rain.max_station.replace(/^Trạm đo mưa\s+/i, 'trạm ')}` : ''}.`
    : 'Chưa có số đo mưa 24 giờ qua trong phạm vi báo cáo.';

  const rows = stations.map((s) => ({ s, st: riverState(s), trend: riverTrend(s), eta: riverEta(s) }));
  const known = rows.filter((r) => r.st.level != null);
  const above = known.filter((r) => r.st.level >= 1);
  const worst = known.reduce((m, r) => (!m || r.st.level > m.st.level ? r : m), null);
  const riverText = !rows.length
    ? 'Chưa có trạm mực nước trong phạm vi báo cáo.'
    : `${above.length}/${rows.length} trạm có mực nước trên mức báo động${worst && worst.st.level >= 1
      ? `; cao nhất ${riverName(worst.s)} ${num(worst.st.value, 2)} m (${worst.st.label.replace(/^./, (c) => c.toLowerCase())})` : ''}.${
      rows.length - known.length ? ` ${rows.length - known.length} trạm chưa đánh giá được (không có số đo, mất tín hiệu hoặc chưa khai báo ngưỡng).` : ''}`;
  const riverTable = rows.length ? {
    cols: [['TT', 9, 'center'], ['Trạm (sông)', 46], ['Mực nước (m)', 21, 'right'], ['Mức báo động', 29], ['Xu hướng', 27], ['Dự báo mức kế tiếp', 33]],
    rows: rows.map((r, i) => [
      String(i + 1),
      riverName(r.s),
      r.st.value == null ? '–' : num(r.st.value, 2),
      r.st.label,
      r.st.stale ? 'số đo cũ' : r.trend ? trendWords(r.trend) : '–',
      r.eta ? `BĐ ${ROMAN[r.eta.level]} lúc ${r.eta.when} (${r.eta.kttv ? 'bản tin KTTV' : 'dự báo mô phỏng'})` : '–',
    ]),
  } : null;

  const reservoirs = rs.reservoirs || [];
  const resShown = reservoirs.length <= 15 ? reservoirs : reservoirs.filter((r) => r.status_code !== 'binh_thuong');
  const resText = rs.total
    ? `${int(rs.spill_count)}/${int(rs.total)} hồ đang xả${rs.emergency_count ? ` (${int(rs.emergency_count)} hồ xả khẩn cấp)` : ''}${
      rs.no_data_count ? `; ${int(rs.no_data_count)} hồ chưa có số liệu vận hành` : ''}.`
    : 'Chưa có số liệu vận hành hồ chứa trong phạm vi báo cáo.';
  const resTable = resShown.length ? {
    cols: [['TT', 9, 'center'], ['Hồ chứa', 42], ['Mực nước / MNDBT (m)', 30, 'right'], ['Q đến / Q xả (m³/s)', 30, 'right'], ['Cửa xả mở', 17, 'center'], ['Trạng thái', 37]],
    rows: resShown.map((r, i) => [
      String(i + 1),
      r.name,
      r.current_level == null ? '–' : `${num(r.current_level, 2)} / ${num(r.normal_level, 2)}`,
      r.inflow_m3s == null ? '–' : `${int(r.inflow_m3s)} / ${int(r.outflow_m3s)}`,
      r.spill_gates ? `${int(r.spill_gates_open)}/${int(r.spill_gates)}` : '–',
      `${r.status_label || '–'}${r.stale ? ' (số liệu cũ)' : ''}`,
    ]),
  } : null;

  const lsPoints = (ls.points || []).filter((p) => ['cam_duong', 'canh_bao'].includes(p.traffic_status))
    .sort((a, b) => (a.traffic_status === 'cam_duong' ? 0 : 1) - (b.traffic_status === 'cam_duong' ? 0 : 1));
  const lsText = ls.total
    ? `${int(ls.blocked_count)} điểm cấm đường, ${int(ls.warning_count)} điểm cảnh báo trên tổng ${int(ls.total)} điểm đen sạt lở, đường đèo đang theo dõi${
      ls.no_data_count ? ` (${int(ls.no_data_count)} điểm chưa có dữ liệu giám sát)` : ''}.`
    : 'Chưa có điểm đen sạt lở, đường đèo trong phạm vi báo cáo.';
  const lsTable = lsPoints.length ? {
    cols: [['TT', 9, 'center'], ['Điểm', 42], ['Tuyến đường', 44], ['Xã / phường', 28], ['Tình trạng', 42]],
    rows: lsPoints.map((p, i) => [String(i + 1), p.name, p.road_name || '–', p.admin_name || '–', p.traffic_label || '–']),
  } : null;

  const sosText = `Đang chờ xử lý ${int(sos.waiting)} phiếu${sos.overdue || sos.critical
    ? ` (${[sos.overdue && `${int(sos.overdue)} phiếu quá hạn phản hồi`, sos.critical && `${int(sos.critical)} phiếu cấp 1 chưa xong`].filter(Boolean).join(', ')})` : ''}; đang xử lý ${int(sos.in_progress)} phiếu; đã hoàn thành trong 24 giờ qua ${int(sos.resolved_24h)} phiếu.`;
  const evacText = ev.planned_households
    ? `Đã sơ tán ${int(ev.evacuated_households)}/${int(ev.planned_households)} hộ (${pct(ev.evacuated_households, ev.planned_households)}% kế hoạch)${
      ev.planned_persons ? `, ${int(ev.evacuated_persons)}/${int(ev.planned_persons)} nhân khẩu` : ''}${Array.isArray(evacSites) ? `; ${int(evacSites.length)} điểm sơ tán trong phạm vi báo cáo` : ''}.`
    : 'Chưa có kế hoạch sơ tán trong phạm vi báo cáo.';
  const forceText = fo.units > 0 || ve.special_total > 0 || ve.heavy_total > 0
    ? `${fo.units > 0 ? `Lực lượng sẵn sàng ${int(fo.ready)}/${int(fo.total)} người (${int(fo.units)} đơn vị), đang làm nhiệm vụ ${int(fo.on_mission)} người` : 'Chưa có dữ liệu lực lượng'}; xuồng, xe lội nước đang hoạt động ${int(ve.special_active)}/${int(ve.special_total)}; máy xúc, máy ủi đang hoạt động ${int(ve.heavy_active)}/${int(ve.heavy_total)}.`
    : 'Chưa có dữ liệu lực lượng, phương tiện.';

  return [
    { heading: 'I. TÌNH HÌNH THIÊN TAI' },
    { sub: '1. Mưa', text: rainText },
    { sub: '2. Mực nước sông', text: riverText, table: riverTable },
    { sub: '3. Hồ chứa', text: resText, table: resTable },
    { sub: '4. Sạt lở, giao thông', text: lsText, table: lsTable },
    { heading: 'II. CÔNG TÁC ỨNG PHÓ' },
    { sub: '1. Tìm kiếm cứu nạn (phiếu SOS)', text: sosText },
    { sub: '2. Sơ tán dân', text: evacText },
    { sub: '3. Lực lượng, phương tiện', text: forceText },
    { heading: 'III. ĐÁNH GIÁ, KIẾN NGHỊ' },
    ...(lines(assessment).length ? lines(assessment).map((t) => ({ text: t })) : [{ text: '(Đơn vị bổ sung đánh giá tình hình và kiến nghị.)', italic: true }]),
  ];
}

/* ------------------------------------------------ Dàn trang (jsPDF) ------------------------------------------------ */

class Writer {
  constructor(pdf) {
    this.pdf = pdf;
    this.left = 30;
    this.right = 15;
    this.top = 20;
    this.bottom = 20;
    this.pageW = pdf.internal.pageSize.getWidth();
    this.pageH = pdf.internal.pageSize.getHeight();
    this.W = this.pageW - this.left - this.right;
    this.y = this.top;
    this.font();
  }

  font(style = 'normal', size = 13) {
    this.pdf.setFont(FONT, style);
    this.pdf.setFontSize(size);
    this.size = size;
  }

  lh(k = 1.32) {
    return this.size * PT * k;
  }

  /** Còn đủ `h` mm trên trang? Không → sang trang mới (khổ đứng). */
  ensure(h) {
    if (this.y + h <= this.pageH - this.bottom) return false;
    this.pdf.addPage('a4', 'portrait');
    this.y = this.top;
    return true;
  }

  /** Chia chữ thành dòng theo bề rộng (dòng đầu có thể thụt vào); từ quá dài thì cắt theo ký tự. */
  wrap(text, width, firstIndent = 0) {
    const out = [];
    let cur = '';
    let limit = width - firstIndent;
    const fits = (t) => this.pdf.getTextWidth(t) <= limit;
    for (const word of String(text).normalize('NFC').split(/\s+/).filter(Boolean)) {
      const test = cur ? `${cur} ${word}` : word;
      if (fits(test)) {
        cur = test;
        continue;
      }
      if (cur) {
        out.push(cur);
        limit = width;
      }
      cur = word;
      while (!fits(cur)) { // từ dài hơn cả dòng
        let n = cur.length - 1;
        while (n > 1 && !fits(cur.slice(0, n))) n -= 1;
        out.push(cur.slice(0, n));
        limit = width;
        cur = cur.slice(n);
      }
    }
    if (cur) out.push(cur);
    return out;
  }

  /** Dòng canh đều hai bên (giãn khoảng cách giữa các từ); dòng cuối đoạn canh trái. */
  justified(line, x, y, width) {
    const words = line.split(' ');
    const free = width - this.pdf.getTextWidth(line.replace(/ /g, ''));
    if (words.length < 2 || free < 0) {
      this.pdf.text(line, x, y);
      return;
    }
    const gap = free / (words.length - 1);
    let cx = x;
    for (const w of words) {
      this.pdf.text(w, cx, y);
      cx += this.pdf.getTextWidth(w) + gap;
    }
  }

  /** Đoạn văn: thụt đầu dòng 10 mm, canh đều hai lề (NĐ 30/2020), cách đoạn 1,5 mm. */
  para(text, { style = 'normal', size = 13, indent = 10, gap = 1.5, justify = true } = {}) {
    this.font(style, size);
    const ls = this.wrap(text, this.W, indent);
    const h = this.lh();
    ls.forEach((line, i) => {
      this.ensure(h);
      const x = this.left + (i === 0 ? indent : 0);
      const width = this.W - (i === 0 ? indent : 0);
      if (justify && i < ls.length - 1) this.justified(line, x, this.y + h * 0.8, width);
      else this.pdf.text(line, x, this.y + h * 0.8);
      this.y += h;
    });
    this.y += gap;
  }

  /** Dòng canh giữa trong một cột [x0, x0 + w]; trả về bề rộng chữ (để gạch chân). */
  center(text, x0, w, { style = 'normal', size = 13 } = {}) {
    this.font(style, size);
    const t = String(text).normalize('NFC');
    const tw = this.pdf.getTextWidth(t);
    this.pdf.text(t, x0 + (w - tw) / 2, this.y + this.lh() * 0.8);
    return tw;
  }

  /** Bảng: hàng tiêu đề đậm nền xám, ô tự xuống dòng; sang trang thì vẽ lại hàng tiêu đề. */
  table({ cols, rows }) {
    const pad = 1.4;
    const size = 11;
    const widths = cols.map(([, w]) => w);
    const total = widths.reduce((a, b) => a + b, 0);
    const scale = this.W / total;
    const ws = widths.map((w) => w * scale);
    const drawRow = (cells, { head = false } = {}) => {
      this.font(head ? 'bold' : 'normal', size);
      const h1 = this.lh(1.22);
      const wrapped = cells.map((c, i) => this.wrap(c ?? '–', ws[i] - 2 * pad));
      const rh = Math.max(...wrapped.map((w) => w.length)) * h1 + 2 * pad;
      const broke = this.ensure(rh);
      if (broke && !head) { // trang mới: lặp lại tiêu đề bảng
        drawRow(cols.map(([t]) => t), { head: true });
        this.font('normal', size);
      }
      let x = this.left;
      if (head) {
        this.pdf.setFillColor(235, 235, 235);
        this.pdf.rect(x, this.y, this.W, rh, 'F');
      }
      this.pdf.setDrawColor(90, 90, 90);
      this.pdf.setLineWidth(0.2);
      wrapped.forEach((ls, i) => {
        this.pdf.rect(x, this.y, ws[i], rh);
        const align = head ? 'center' : cols[i][2] || 'left';
        ls.forEach((line, j) => {
          const ty = this.y + pad + h1 * j + h1 * 0.78;
          const tw = this.pdf.getTextWidth(line);
          const tx = align === 'center' ? x + (ws[i] - tw) / 2 : align === 'right' ? x + ws[i] - pad - tw : x + pad;
          this.pdf.text(line, tx, ty);
        });
        x += ws[i];
      });
      this.y += rh;
    };
    this.ensure(30); // không để tiêu đề bảng trơ trọi cuối trang
    drawRow(cols.map(([t]) => t), { head: true });
    rows.forEach((r) => drawRow(r));
    this.y += 2;
  }
}

/**
 * Dựng báo cáo PDF. `form`: thông tin văn bản người dùng nhập (cơ quan, số ký hiệu, kính gửi, đánh giá, người ký),
 * `scope` = phạm vi đang xem, `at` = thời điểm số liệu, `snapshot` = canvas ảnh chụp màn hình (phụ lục, có thể null).
 */
export async function buildReportPdf({ form, scope, at, k, stations, evacSites, author, snapshot, snapshotLabel }) {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  await loadFonts(pdf);
  pdf.setProperties({ title: `Báo cáo nhanh tình hình thiên tai – ${scope}`, subject: 'Báo cáo nhanh PCTT', creator: 'Hệ thống điều hành PCTT & TKCN tỉnh Cao Bằng', author: author || '' });
  const w = new Writer(pdf);
  const { left, W } = w;

  // ---- Đầu văn bản: cơ quan (trái) · quốc hiệu, tiêu ngữ (phải)
  const colL = 72;
  const colR = W - colL;
  const y0 = w.y;
  let yl = y0;
  if (form.parent?.trim()) {
    w.y = yl;
    w.center(form.parent.trim().toUpperCase(), left, colL, { size: 12.5 });
    yl += w.lh();
  }
  w.font('bold', 12.5);
  const issuer = w.wrap(form.issuer.trim().toUpperCase(), colL);
  issuer.forEach((t) => {
    w.y = yl;
    w.center(t, left, colL, { style: 'bold', size: 12.5 });
    yl += w.lh();
  });
  const ulw = Math.min(colL * 0.45, 32);
  pdf.setLineWidth(0.3);
  pdf.line(left + (colL - ulw) / 2, yl + 1.2, left + (colL + ulw) / 2, yl + 1.2);
  yl += 3.5;
  w.y = yl;
  // "Số:      /BC-BCH": phần số để trống (văn thư điền khi đăng ký văn bản) — giữ khoảng trống, không gộp dấu cách
  const no = String(form.number || '').trim();
  w.center(no.startsWith('/') || !no ? `Số:${'\u00a0'.repeat(12)}${no || '/BC'}` : `Số: ${no}`, left, colL, { size: 13 });
  yl += w.lh();

  let yr = y0;
  w.y = yr;
  w.center('CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM', left + colL, colR, { style: 'bold', size: 12.5 });
  yr += w.lh();
  w.y = yr;
  const mw = w.center('Độc lập - Tự do - Hạnh phúc', left + colL, colR, { style: 'bold', size: 13 });
  yr += w.lh();
  pdf.line(left + colL + (colR - mw) / 2, yr + 0.4, left + colL + (colR + mw) / 2, yr + 0.4);
  yr += 3;
  w.y = yr;
  w.center(placeDate(at), left + colL, colR, { style: 'italic', size: 13 });
  yr += w.lh();
  w.y = Math.max(yl, yr) + 8;

  // ---- Tên loại, trích yếu
  w.center('BÁO CÁO NHANH', left, W, { style: 'bold', size: 14 });
  w.y += w.lh();
  w.center('Tình hình thiên tai và công tác ứng phó', left, W, { style: 'bold', size: 14 });
  w.y += w.lh();
  w.font('italic', 13);
  w.wrap(`(Số liệu đến ${stamp(at)}; phạm vi: ${scope})`, W - 20).forEach((t) => {
    w.center(t, left, W, { style: 'italic', size: 13 });
    w.y += w.lh();
  });
  pdf.line(left + W / 2 - 15, w.y + 2, left + W / 2 + 15, w.y + 2);
  w.y += 8;

  // ---- Kính gửi: một nơi → cùng dòng; nhiều nơi → mỗi nơi một dòng, gạch đầu dòng
  const to = lines(form.recipients);
  w.font('normal', 13);
  const label = 'Kính gửi: ';
  const kx = left + 22;
  const lw = pdf.getTextWidth(label);
  pdf.text(label, kx, w.y + w.lh() * 0.8);
  to.forEach((t, i) => {
    const end = i === to.length - 1 ? '.' : ';';
    const text = `${to.length > 1 ? '- ' : ''}${t.replace(/[.;,]+$/, '')}${end}`;
    w.wrap(text, W - 22 - lw).forEach((part) => {
      w.ensure(w.lh());
      pdf.text(part, kx + lw, w.y + w.lh() * 0.8);
      w.y += w.lh();
    });
  });
  w.y += 3;

  w.para(`${form.issuer.trim().replace(/^./, (c) => c.toUpperCase())} báo cáo nhanh tình hình thiên tai và công tác ứng phó như sau (số liệu tổng hợp tự động từ Hệ thống điều hành phòng, chống thiên tai và tìm kiếm cứu nạn tại thời điểm báo cáo):`);

  // ---- Nội dung
  for (const block of reportContent({ k, stations, evacSites, assessment: form.assessment })) {
    if (block.heading) {
      w.ensure(18);
      w.y += 1.5;
      w.para(block.heading, { style: 'bold', indent: 10, justify: false, gap: 1 });
      continue;
    }
    if (block.sub) {
      w.ensure(14);
      w.para(block.sub, { style: 'bold', indent: 10, justify: false, gap: 0.5 });
    }
    if (block.text) w.para(block.text, { style: block.italic ? 'italic' : 'normal' });
    if (block.table) w.table(block.table);
  }
  w.para('Ghi chú: Mức báo động theo ngưỡng BĐ I – III khai báo cho từng trạm; đây là số liệu tổng hợp tự động, không phải cấp độ rủi ro thiên tai do cơ quan có thẩm quyền công bố. Dự báo ghi rõ nguồn: bản tin của Đài Khí tượng Thủy văn hoặc dự báo mô phỏng.', { style: 'italic', size: 11.5 });

  // ---- Nơi nhận (trái) · chức vụ, chữ ký (phải) — không tách sang hai trang
  const signer = lines(form.signerTitle).map((t) => t.toUpperCase());
  w.ensure(26 + 6 * Math.max(signer.length, 3) + 22);
  w.y += 4;
  const ys = w.y;
  w.font('bold', 12);
  pdf.text('Nơi nhận:', left, w.y + w.lh() * 0.8);
  let yn = w.y + w.lh();
  w.font('normal', 11);
  for (const t of ['- Như trên;', '- Lưu: VT.']) {
    pdf.text(t, left, yn + w.lh() * 0.8);
    yn += w.lh();
  }
  const sx = left + W * 0.42;
  const sw = W * 0.58;
  w.y = ys;
  signer.forEach((t) => {
    w.center(t, sx, sw, { style: 'bold', size: 13 });
    w.y += w.lh();
  });
  w.y += 24; // chỗ ký, đóng dấu
  if (form.signerName?.trim()) {
    w.center(form.signerName.trim(), sx, sw, { style: 'bold', size: 13 });
    w.y += w.lh();
  }
  w.y = Math.max(w.y, yn) + 6;
  w.para(`Lập trên Hệ thống điều hành PCTT & TKCN tỉnh Cao Bằng${author ? ` bởi ${author}` : ''} lúc ${stamp(new Date())}.`, { style: 'italic', size: 10, indent: 0, justify: false });
  const bodyPages = pdf.getNumberOfPages();

  // ---- Phụ lục: ảnh chụp màn hình điều hành (khổ ngang)
  if (snapshot) {
    pdf.addPage('a4', 'landscape');
    const pw = pdf.internal.pageSize.getWidth();
    pdf.setFont(FONT, 'bold');
    pdf.setFontSize(14);
    const t1 = 'PHỤ LỤC';
    pdf.text(t1, (pw - pdf.getTextWidth(t1)) / 2, 14);
    pdf.setFont(FONT, 'italic');
    pdf.setFontSize(12);
    const t2 = `Ảnh chụp màn hình điều hành${snapshotLabel ? ` – ${snapshotLabel}` : ''} – ${scope} – lúc ${stamp(at)}`.normalize('NFC');
    pdf.text(t2, (pw - pdf.getTextWidth(t2)) / 2, 20.5);
    addCanvasPages(pdf, snapshot, { top: 25, margin: 10, newPage: () => pdf.addPage('a4', 'landscape') });
  }

  // ---- Số trang: giữa lề trên, từ trang thứ 2 của văn bản (NĐ 30/2020); phụ lục là phần đính kèm, không đánh số
  for (let i = 2; i <= bodyPages; i += 1) {
    pdf.setPage(i);
    pdf.setFont(FONT, 'normal');
    pdf.setFontSize(12);
    const pw = pdf.internal.pageSize.getWidth();
    const t = String(i);
    pdf.text(t, (pw - pdf.getTextWidth(t)) / 2, 10);
  }
  return pdf;
}

export async function exportReportPdf({ filename, ...opts }) {
  const pdf = await buildReportPdf(opts);
  pdf.save(filename);
  return pdf.getNumberOfPages();
}
