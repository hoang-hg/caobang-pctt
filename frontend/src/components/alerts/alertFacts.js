/**
 * Số liệu suy ra của trang Cảnh báo khẩn cấp & Hotline (thiết kế E) — hàm thuần, không gọi API: giai đoạn của lệnh (chờ
 * duyệt, đang hiệu lực, sắp hết hạn…), bộ lọc, cách xếp, dải thông tin khẩn. Dải khẩn, ô chỉ số và bảng lịch sử tính từ CÙNG
 * danh sách lệnh đang tải → chạm "2 lệnh chờ duyệt" mở đúng 2 lệnh.
 */
import { CHANNEL, LEVEL, notIntegrated } from '../../utils/labels';

/** Mức nguy hiểm của lệnh → thang rủi ro chung (Rất cao Đỏ, Cao Cam, Trung bình Vàng). */
export const SEVERITY_LEVEL = { do: 3, cam: 2, vang: 1 };
export const SEVERITY_ORDER = ['do', 'cam', 'vang'];
export const SOON_MS = 2 * 3600e3; // còn dưới 2 giờ hiệu lực → nhắc gia hạn
export const LONG_WAIT_MIN = 10; // lệnh chờ duyệt quá 10 phút: tin cảnh báo tới dân chậm → Đỏ

/** Kênh: tên ngắn cho thẻ / điện thoại. */
export const CHANNEL_SHORT = { SMS: 'SMS', CELL_BROADCAST: 'Tin nhắn vùng', ZALO_OA: 'Zalo', PUSH: 'Ứng dụng', LOA: 'Loa' };

/** "2 giờ 05 phút" / "35 phút". */
export const leftText = (ms) => {
  const m = Math.max(0, Math.round(ms / 60000));
  return m >= 60 ? `${Math.floor(m / 60)} giờ ${String(m % 60).padStart(2, '0')} phút` : `${m} phút`;
};
/** Phút chờ → "12′" / "1h05". */
export const waitText = (min) => {
  const m = Math.max(0, Math.round(min));
  return m < 60 ? `${m}′` : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`;
};

export const PHASES = [
  ['cho_duyet', 'Chờ phê duyệt'],
  ['hieu_luc', 'Đang hiệu lực'],
  ['ket_thuc', 'Đã kết thúc'],
  ['het_han', 'Hết hiệu lực'],
  ['tu_choi', 'Bị từ chối'],
];
export const PHASE_LABEL = Object.fromEntries(PHASES);

/** Tình huống của một lệnh tại thời điểm `now`. */
export function broadcastFacts(b, now) {
  const pending = b.status === 'pending_approval';
  const live = !!b.active;
  const left = b.valid_until ? Date.parse(b.valid_until) - now : null;
  const phase = pending ? 'cho_duyet'
    : b.status === 'rejected' ? 'tu_choi'
      : live ? 'hieu_luc'
        : b.ended_at ? 'ket_thuc'
          : b.status === 'sent' || b.status === 'sending' ? 'het_han' : 'khac';
  return {
    phase,
    pending,
    live,
    left,
    soon: live && left != null && left < SOON_MS,
    waitedMin: pending ? (now - Date.parse(b.created_at)) / 60000 : null,
    // Đã duyệt nhưng kênh SMS / Zalo / Cell Broadcast chưa tích hợp: chỉ công bố trên cổng công khai & bản nhẹ
    portalOnly: live && notIntegrated(b),
    households: b.audience?.households || 0,
  };
}

/** Bộ lọc của bảng lịch sử (nằm trên địa chỉ: ?tt=hieu_luc&muc=do) — mỗi lựa chọn kèm số lệnh. */
export const FILTERS = [
  { key: 'tt', label: 'Trạng thái', all: 'Mọi trạng thái', options: PHASES },
  { key: 'muc', label: 'Mức', all: 'Mọi mức', options: [['do', `${LEVEL.do.label} · Đỏ`], ['cam', `${LEVEL.cam.label} · Cam`], ['vang', `${LEVEL.vang.label} · Vàng`]] },
  { key: 'kenh', label: 'Kênh', all: 'Mọi kênh', options: Object.entries(CHANNEL) },
  { key: 'nguon', label: 'Nguồn', all: 'Mọi nguồn', options: [['tu_dong', 'Tự động (trạm quan trắc)'], ['can_bo', 'Cán bộ soạn']] },
];

export const matchBroadcast = (b, f, x) => (!f.tt || x.phase === f.tt)
  && (!f.muc || b.severity === f.muc)
  && (!f.kenh || (b.channels || []).includes(f.kenh))
  && (!f.nguon || (f.nguon === 'tu_dong') === !!b.auto_generated);

/** Số lệnh của từng lựa chọn trong một bộ lọc, khi các bộ lọc khác giữ nguyên. */
export function optionCounts(rows, filters, key, factsOf) {
  const others = { ...filters, [key]: '' };
  const base = rows.filter((b) => matchBroadcast(b, others, factsOf(b)));
  const field = FILTERS.find((f) => f.key === key);
  return Object.fromEntries(field.options.map(([v]) => [v, base.filter((b) => matchBroadcast(b, { ...others, [key]: v }, factsOf(b))).length]));
}

export const SORTS = [
  ['uu_tien', 'Cần xử lý trước'],
  ['moi_nhat', 'Mới nhất'],
  ['het_han', 'Sắp hết hiệu lực'],
  ['nhieu_ho', 'Nhiều hộ nhất'],
];
const PHASE_RANK = { cho_duyet: 0, hieu_luc: 1, het_han: 2, ket_thuc: 3, tu_choi: 4, khac: 5 };
const created = (b) => Date.parse(b.created_at) || 0;

export function sortBroadcasts(rows, sort, factsOf) {
  const list = [...rows];
  if (sort === 'moi_nhat') return list.sort((a, b) => created(b) - created(a));
  if (sort === 'nhieu_ho') return list.sort((a, b) => factsOf(b).households - factsOf(a).households || created(b) - created(a));
  if (sort === 'het_han') {
    const until = (b) => (factsOf(b).live ? factsOf(b).left : Infinity);
    return list.sort((a, b) => until(a) - until(b) || created(b) - created(a));
  }
  // Cần xử lý trước: chờ duyệt (Rất cao trước, chờ lâu trước) → đang hiệu lực (sắp hết hạn trước) → còn lại mới trước
  return list.sort((a, b) => {
    const [x, y] = [factsOf(a), factsOf(b)];
    return PHASE_RANK[x.phase] - PHASE_RANK[y.phase]
      || (x.pending ? SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity) || created(a) - created(b) : 0)
      || (x.live ? x.left - y.left : 0)
      || created(b) - created(a);
  });
}

/**
 * Dải thông tin khẩn của trang (xếp Đỏ → Cam → Vàng). Mỗi mục: { key, level, text, short, detail, go } — `go` là đích:
 * { tab, anchor } (cuộn tới khối) hoặc { tab: 'lich_su', filter }.
 * - lệnh chờ duyệt: Đỏ khi có lệnh Rất cao hoặc chờ quá LONG_WAIT_MIN phút (tin tới dân chậm), còn lại Cam;
 * - cảnh báo Rất cao đang hiệu lực: Đỏ (tình hình); sắp hết hiệu lực (dưới 2 giờ): Cam — gia hạn nếu còn nguy hiểm;
 * - lệnh đã duyệt mà kênh chưa tích hợp: Vàng — tin chưa tới điện thoại người dân, chỉ có trên cổng công khai;
 * - lệnh BẠN soạn bị từ chối 3 ngày qua: Vàng — sửa theo lý do rồi gửi lại.
 */
export function alertAlerts({ broadcasts = [], factsOf, me, now }) {
  const out = [];
  const pending = broadcasts.filter((b) => factsOf(b).pending);
  if (pending.length) {
    const longest = Math.max(...pending.map((b) => factsOf(b).waitedMin));
    const urgent = pending.some((b) => b.severity === 'do') || longest >= LONG_WAIT_MIN;
    out.push({
      key: 'cho-duyet',
      level: urgent ? 3 : 2,
      text: `${pending.length} lệnh chờ phê duyệt${longest >= 1 ? ` — lâu nhất ${waitText(longest)}` : ''}`,
      short: `${pending.length} chờ duyệt`,
      detail: 'tin cảnh báo chỉ tới người dân sau khi lãnh đạo ký duyệt bằng PIN',
      go: { tab: 'phat', anchor: 'cho-duyet' },
    });
  }
  const live = broadcasts.filter((b) => factsOf(b).live);
  const red = live.filter((b) => b.severity === 'do');
  if (red.length) {
    out.push({
      key: 'rat-cao',
      level: 3,
      text: `${red.length} cảnh báo Rất cao đang hiệu lực`,
      short: `${red.length} cảnh báo Rất cao`,
      detail: red.slice(0, 2).map((b) => b.title).join(' · '),
      go: { tab: 'phat', anchor: 'dang-hieu-luc' },
    });
  }
  const soon = live.filter((b) => factsOf(b).soon);
  if (soon.length) {
    out.push({
      key: 'sap-het',
      level: 2,
      text: `${soon.length} cảnh báo sắp hết hiệu lực (dưới 2 giờ)`,
      short: `${soon.length} sắp hết hạn`,
      detail: 'gia hạn nếu còn nguy hiểm, kết thúc nếu đã an toàn',
      go: { tab: 'phat', anchor: 'dang-hieu-luc' },
    });
  }
  const portal = live.filter((b) => factsOf(b).portalOnly);
  if (portal.length) {
    out.push({
      key: 'chi-cong',
      level: 1,
      text: `${portal.length} cảnh báo mới công bố trên cổng công khai — chưa gửi tới điện thoại người dân`,
      short: `${portal.length} chưa tới điện thoại`,
      detail: 'kênh SMS / Zalo / Cell Broadcast chưa tích hợp: phát qua loa, nhà mạng theo quy trình hiện hành',
      go: { tab: 'phat', anchor: 'dang-hieu-luc' },
    });
  }
  const mine = broadcasts.filter((b) => b.status === 'rejected' && b.created_by === me && now - Date.parse(b.approved_at || b.created_at) < 3 * 86400e3);
  if (mine.length) {
    out.push({
      key: 'bi-tu-choi',
      level: 1,
      text: `${mine.length} lệnh bạn soạn bị từ chối — sửa theo lý do rồi gửi lại`,
      short: `${mine.length} bị từ chối`,
      go: { tab: 'phat', anchor: 'bi-tu-choi' },
    });
  }
  return out.sort((a, b) => b.level - a.level);
}

/** Nhóm thao tác của nhật ký pháp lý — lọc theo nhóm, nhãn tiếng Việt cho từng mã. */
export const AUDIT_GROUPS = [
  ['canh_bao', 'Cảnh báo & bản tin'],
  ['cuu_ho', 'Cứu hộ & phản ánh'],
  ['nguon_luc', 'Nguồn lực'],
  ['du_lieu', 'Dữ liệu & tích hợp'],
  ['tai_khoan', 'Tài khoản & bảo mật'],
];
const AUDIT_ACTION = {
  'broadcast.create': ['canh_bao', 'Soạn lệnh cảnh báo'],
  'broadcast.approve': ['canh_bao', 'Phê duyệt phát lệnh'],
  'broadcast.approve_failed': ['canh_bao', 'Phê duyệt lệnh — sai PIN'],
  'broadcast.reject': ['canh_bao', 'Từ chối lệnh'],
  'broadcast.end': ['canh_bao', 'Kết thúc cảnh báo'],
  'broadcast.end_failed': ['canh_bao', 'Kết thúc cảnh báo — sai PIN'],
  'broadcast.extend': ['canh_bao', 'Gia hạn cảnh báo'],
  'broadcast.extend_failed': ['canh_bao', 'Gia hạn cảnh báo — sai PIN'],
  'broadcast.auto_draft': ['canh_bao', 'Tự sinh bản nháp cảnh báo'],
  'storm.bulletin': ['canh_bao', 'Nhập tin bão / ATNĐ'],
  'storm.bulletin_end': ['canh_bao', 'Kết thúc tin bão / ATNĐ'],
  'forecast.bulletin': ['canh_bao', 'Nhập bản tin dự báo mực nước'],
  'forecast.bulletin_delete': ['canh_bao', 'Xoá bản tin dự báo mực nước'],
  'sos.update': ['cuu_ho', 'Cập nhật phiếu SOS'],
  'dispatch.create': ['cuu_ho', 'Phát lệnh điều động'],
  'dispatch.arrived': ['cuu_ho', 'Đội đã đến hiện trường'],
  'dispatch.cancel': ['cuu_ho', 'Huỷ lệnh điều động'],
  'dispatch.mission_link': ['cuu_ho', 'Tạo link nhiệm vụ'],
  'mission.report': ['cuu_ho', 'Trưởng nhóm báo từ hiện trường'],
  'evacuation.update': ['cuu_ho', 'Cập nhật tiến độ sơ tán'],
  'evacuation.site_occupancy': ['cuu_ho', 'Cập nhật số người ở điểm sơ tán'],
  'incident.create': ['cuu_ho', 'Đánh dấu sự cố trên bản đồ'],
  'incident.close': ['cuu_ho', 'Đóng sự cố trên bản đồ'],
  'event.create': ['canh_bao', 'Mở đợt thiên tai'],
  'event.update': ['canh_bao', 'Sửa đợt thiên tai'],
  'event.end': ['canh_bao', 'Kết thúc đợt thiên tai'],
  'report.approve': ['cuu_ho', 'Duyệt phản ánh của người dân'],
  'report.reject': ['cuu_ho', 'Từ chối phản ánh'],
  'report.resolve': ['cuu_ho', 'Đánh dấu phản ánh đã xử lý'],
  'report.reopen': ['cuu_ho', 'Mở lại phản ánh'],
  'report.edit_public': ['cuu_ho', 'Sửa nội dung công khai của phản ánh'],
  'report.to_sos': ['cuu_ho', 'Chuyển phản ánh thành phiếu SOS'],
  'inventory.issue': ['nguon_luc', 'Xuất kho'],
  'inventory.receive': ['nguon_luc', 'Nhập kho'],
  'vehicle.update': ['nguon_luc', 'Cập nhật phương tiện'],
  'vehicle.status': ['nguon_luc', 'Đổi trạng thái phương tiện'],
  'fuel_depot.update': ['nguon_luc', 'Cập nhật nhiên liệu dự trữ'],
  'reservoir.operation': ['nguon_luc', 'Cập nhật vận hành hồ chứa'], // dòng cũ — hệ thống không còn hồ chứa
  'data.import': ['du_lieu', 'Nhập dữ liệu từ tệp'],
  'data.submit': ['du_lieu', 'Xã gửi dữ liệu chờ duyệt'],
  'data.submission.reject': ['du_lieu', 'Từ chối hồ sơ dữ liệu của xã'],
  'data.submission.withdraw': ['du_lieu', 'Rút hồ sơ dữ liệu'],
  'integration.source.update': ['du_lieu', 'Cấu hình nguồn dữ liệu'],
  'integration.source.run': ['du_lieu', 'Chạy đồng bộ nguồn dữ liệu'],
  'integration.source.rotate_token': ['du_lieu', 'Đổi khoá nguồn dữ liệu'],
  'integration.device.create': ['du_lieu', 'Đăng ký thiết bị IoT'],
  'integration.device.update': ['du_lieu', 'Sửa thiết bị IoT'],
  'integration.device.delete': ['du_lieu', 'Xoá thiết bị IoT'],
  'integration.device.rotate_key': ['du_lieu', 'Đổi khoá thiết bị IoT'],
  'auth.login': ['tai_khoan', 'Đăng nhập'],
  'auth.change_password': ['tai_khoan', 'Đổi mật khẩu'],
  'auth.forgot_password': ['tai_khoan', 'Yêu cầu đặt lại mật khẩu'],
  'auth.reset_password': ['tai_khoan', 'Đặt lại mật khẩu'],
  'auth.mfa_enable': ['tai_khoan', 'Bật xác thực 2 lớp'],
  'auth.mfa_disable': ['tai_khoan', 'Tắt xác thực 2 lớp'],
  'auth.mfa_failed': ['tai_khoan', 'Xác thực 2 lớp thất bại'],
  'auth.mfa_recovery_codes': ['tai_khoan', 'Tạo mã khôi phục 2 lớp'],
  'user.create': ['tai_khoan', 'Tạo tài khoản'],
  'user.mfa_reset': ['tai_khoan', 'Đặt lại xác thực 2 lớp cho tài khoản'],
};
/** { group, label, failed } của một mã thao tác (mã lạ: nhóm theo tiền tố, nhãn là chính mã). */
export function auditAction(code) {
  const hit = AUDIT_ACTION[code];
  const failed = /_failed$|\.failed$/.test(code || '') || code === 'auth.mfa_failed';
  if (hit) return { group: hit[0], label: hit[1], failed };
  const prefix = (code || '').split('.')[0];
  const group = { broadcast: 'canh_bao', storm: 'canh_bao', forecast: 'canh_bao', event: 'canh_bao', sos: 'cuu_ho', dispatch: 'cuu_ho', report: 'cuu_ho', evacuation: 'cuu_ho', incident: 'cuu_ho', mission: 'cuu_ho', inventory: 'nguon_luc', vehicle: 'nguon_luc', fuel_depot: 'nguon_luc', reservoir: 'nguon_luc', data: 'du_lieu', integration: 'du_lieu', auth: 'tai_khoan', user: 'tai_khoan' }[prefix] || 'khac';
  return { group, label: code, failed };
}
/** Chi tiết thao tác → một dòng đọc được ("lý do: sai PIN · kênh: SMS, Zalo"). */
export const auditDetail = (d) => Object.entries(d || {})
  .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v && typeof v === 'object' ? JSON.stringify(v) : v}`)
  .join(' · ');
