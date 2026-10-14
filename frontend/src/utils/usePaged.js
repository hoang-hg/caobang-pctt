import { useState } from 'react';

/**
 * Phân trang một danh sách đã lọc / xếp. Đổi bộ lọc, ô tìm, cách xếp (`resetKey` khác) → về trang 1 ngay trong lần vẽ đó.
 * Danh sách ngắn lại (VD vừa xuất kho làm một kho rơi khỏi bộ lọc) → giữ trang cuối còn dữ liệu, không hiện trang trống.
 * `all`: hiện mọi dòng (đang chụp PDF) mà không đổi trang người dùng đang xem.
 */
export function usePaged(rows, size, resetKey, all = false) {
  const [state, setState] = useState({ key: resetKey, page: 1 });
  if (state.key !== resetKey) setState({ key: resetKey, page: 1 });
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const page = Math.min(state.key === resetKey ? state.page : 1, pages);
  return {
    visible: all ? rows : rows.slice((page - 1) * size, page * size),
    page,
    pages,
    from: rows.length ? (page - 1) * size + 1 : 0,
    to: Math.min(page * size, rows.length),
    total: rows.length,
    setPage: (p) => setState({ key: resetKey, page: Math.max(1, Math.min(pages, p)) }),
  };
}
