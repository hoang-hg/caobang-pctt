import { useEffect, useRef } from 'react';

/**
 * Mục MỚI xuất hiện khi đang xem (phiếu mới, sự kiện mới, việc mới chờ quyết định) → trả hàm `isNew(key)` để gắn hiệu ứng
 * trượt vào một lần. Lần vẽ đầu (`ready` = đã có dữ liệu) chỉ ghi nhận, không cho cả danh sách cùng trượt.
 */
export function useNewKeys(keys, ready) {
  const seen = useRef(null);
  useEffect(() => {
    if (!ready) return;
    seen.current = new Set([...(seen.current || []), ...keys]);
  });
  return (key) => !!seen.current && !seen.current.has(key);
}
