import { useState } from 'react';

/**
 * Hiện dần một danh sách dài theo từng bước `step` (nút "Xem thêm"). Đổi bộ lọc / tìm kiếm (`resetKey` khác) → về lại bước
 * đầu, kể cả khi quay lại bộ lọc cũ. Danh sách nên xếp mục nặng nhất lên đầu TRƯỚC khi gọi, để mục khẩn không bị ẩn phía sau
 * "Xem thêm". `showAll`: hiện đủ mọi mục (đang chụp PDF) mà không đổi số mục người dùng đã mở.
 */
export function useShowMore(items, step, resetKey, showAll = false) {
  const [state, setState] = useState({ key: resetKey, n: step });
  // Bộ lọc vừa đổi: ghi lại ngay trong lần vẽ này (React vẽ lại tức thì) — không giữ số mục đã mở của bộ lọc trước
  if (state.key !== resetKey) setState({ key: resetKey, n: step });
  const opened = state.key === resetKey ? state.n : step;
  const n = showAll ? items.length : opened;
  return {
    visible: items.slice(0, n),
    shown: Math.min(n, items.length),
    total: items.length,
    more: () => setState({ key: resetKey, n: opened + step }),
    all: () => setState({ key: resetKey, n: items.length }),
  };
}
