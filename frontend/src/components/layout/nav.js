import {
  LayoutDashboard, Map, Boxes, Siren, Megaphone, KeyRound, DatabaseZap, Camera, FileUp, CalendarRange, BookOpen,
} from 'lucide-react';

// Menu theo nhóm việc: Điều hành (tác nghiệp hằng ngày) · Dữ liệu & báo cáo · Quản trị · Trợ giúp. Máy tính (≥ 1024 px): menu
// ngang trên thanh trên cùng (TopNav — nhóm Điều hành hiện thẳng, mục không đủ chỗ và các nhóm khác trong "Thêm"); điện
// thoại / máy tính bảng: ngăn menu (nút ☰) — nhãn chữ 14 px kèm số đếm không bị cắt.
// Mục nào tài khoản không có quyền thì ẩn; nhóm hết mục thì ẩn cả nhóm. Mục không ghi `perm` (Hướng dẫn xử lý): mọi tài khoản.
// Biểu tượng của mục cũng là biểu tượng ở đầu trang đó (PageHeader — navItemFor): chuyển trang vẫn thấy cùng một mốc.
export const NAV_GROUPS = [
  {
    title: 'Điều hành',
    items: [
      // `short`: nhãn trên menu ngang của thanh trên cùng (máy tính, DESIGN.md — phương án B)
      { to: '/dashboard', label: 'Tổng quan', short: 'Tổng quan', icon: LayoutDashboard, perm: ['monitoring', 'view'] },
      { to: '/ban-do', label: 'Bản đồ giám sát', short: 'Bản đồ', icon: Map, perm: ['monitoring', 'view'] },
      { to: '/cuu-ho', label: 'Điều hành cứu hộ', short: 'Cứu hộ', icon: Siren, badge: true, perm: ['sos', 'view'] },
      { to: '/canh-bao', label: 'Cảnh báo & Hotline', short: 'Cảnh báo', icon: Megaphone, perm: ['alert', 'view'], badgeKey: 'alerts' },
      { to: '/nguon-luc', label: 'Vật tư & Lực lượng', short: 'Vật tư', icon: Boxes, perm: ['resource', 'view'] },
      { to: '/phan-anh', label: 'Phản ánh người dân', short: 'Phản ánh', icon: Camera, perm: ['report', 'view'], badgeKey: 'reports' },
    ],
  },
  {
    title: 'Dữ liệu & báo cáo',
    items: [
      { to: '/dot-thien-tai', label: 'Đợt thiên tai', icon: CalendarRange, perm: ['monitoring', 'view'] },
      // Cấp tỉnh nhập thẳng + duyệt hồ sơ; xã/phường gửi dữ liệu chờ duyệt
      { to: '/nhap-du-lieu', label: 'Nhập dữ liệu', icon: FileUp, perm: ['data', 'import'], alt: ['data', 'submit'], badgeKey: 'submissions' },
      { to: '/nguon-du-lieu', label: 'Nguồn dữ liệu', icon: DatabaseZap, perm: ['integration', 'view'] },
    ],
  },
  {
    title: 'Quản trị',
    items: [{ to: '/phan-quyen', label: 'Phân quyền', icon: KeyRound, perm: ['user', 'view'] }],
  },
  {
    title: 'Trợ giúp',
    items: [{ to: '/huong-dan', label: 'Hướng dẫn xử lý', icon: BookOpen }],
  },
];

/** Mục menu của một đường dẫn ("/cuu-ho" → Điều hành cứu hộ); trang không có trong menu → undefined. */
export function navItemFor(pathname) {
  for (const g of NAV_GROUPS) {
    const hit = g.items.find((n) => pathname === n.to || pathname.startsWith(`${n.to}/`));
    if (hit) return hit;
  }
  return undefined;
}
