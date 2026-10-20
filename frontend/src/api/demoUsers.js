/**
 * Tài khoản dùng trong CHẾ ĐỘ GIẢ LẬP (chỉ máy dev — xem app/store.js). Đúng 3 vai trò thật của hệ thống (README 8):
 * admin_tinh (cấp tỉnh, có / không PIN duyệt cảnh báo), admin_xa (xã Cô Ba) và super_admin (Quản trị hệ thống — dùng
 * /auth/me của cấp tỉnh, chỉ thay vai trò: hai vai trò cùng toàn quyền dữ liệu toàn tỉnh, khác ở hướng dẫn xử lý và quyền
 * quản lý tài khoản Cấp 2). Vai trò, phạm vi, danh sách quyền lấy
 * nguyên từ GET /auth/me đã ghi của tài khoản seed (demo/fixtures.json) — giao diện ẩn / hiện đúng như tài khoản thật;
 * tên là nhãn vai trò, không đặt họ tên giả gắn với chức danh lãnh đạo thật. Chỉ nạp qua import động trong nhánh
 * import.meta.env.DEV → không có trong bản build chạy thật.
 */
import fixtures from './demo/fixtures.json';
import { DEMO_TOKEN } from '../app/store';

const recordedMe = (scope) => fixtures.bodies[fixtures[scope]['/auth/me']];
const user = (scope, fields) => ({ ...recordedMe(scope), email: null, must_change_password: false, ...fields });

export const DEMO_ROLES = [
  {
    key: 'tinh_duyet',
    label: 'Cấp tỉnh — có PIN duyệt cảnh báo',
    hint: 'Điều hành toàn tỉnh, ký duyệt lệnh cảnh báo, điều động',
    user: user('tinh', {
      id: 'demo-tinh-duyet', username: 'demo.tinh', full_name: 'Lãnh đạo BCH tỉnh (giả lập)',
      position: 'Lãnh đạo Ban Chỉ huy PCTT & TKCN tỉnh (giả lập)', has_pin: true,
    }),
  },
  {
    key: 'tinh_truc',
    label: 'Cấp tỉnh — trực ban (chưa có PIN)',
    hint: 'Tiếp nhận SOS, điều phối lực lượng, soạn lệnh cảnh báo',
    user: user('tinh', {
      id: 'demo-tinh-truc', username: 'demo.trucban', full_name: 'Trực ban tỉnh (giả lập)',
      position: 'Cán bộ trực ban Văn phòng BCH tỉnh (giả lập)', has_pin: false,
    }),
  },
  {
    key: 'xa',
    label: 'Cấp xã — Xã Cô Ba',
    hint: 'SOS, sơ tán, sự cố, kho của xã; gửi chi viện, dữ liệu lên tỉnh',
    user: user('xa', {
      id: 'demo-xa-coba', username: 'demo.xa', full_name: 'Chỉ huy xã Cô Ba (giả lập)',
      position: 'Chỉ huy BCH PCTT xã Cô Ba (giả lập)', has_pin: false,
    }),
  },
  {
    key: 'quan_tri',
    label: 'Quản trị hệ thống',
    hint: 'Tài khoản, phân quyền, nguồn dữ liệu, danh mục của tỉnh',
    user: user('tinh', {
      id: 'demo-quan-tri', username: 'demo.quantri', full_name: 'Quản trị hệ thống (giả lập)',
      position: 'Kỹ sư vận hành hệ thống (giả lập)', has_pin: false,
      assignments: [{ role: 'super_admin', role_name: 'Quản trị hệ thống', domain: '*', domain_label: 'Toàn tỉnh Cao Bằng' }],
    }),
  },
];

/** Phiên đăng nhập giả lập của một vai trò (mặc định cấp tỉnh có PIN). */
export function demoAuth(key = 'tinh_duyet') {
  const role = DEMO_ROLES.find((r) => r.key === key) || DEMO_ROLES[0];
  return { token: DEMO_TOKEN, user: structuredClone(role.user) };
}
