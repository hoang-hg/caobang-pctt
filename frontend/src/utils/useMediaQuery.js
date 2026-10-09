import { useEffect, useState } from 'react';

/** Khớp media query (VD bảng → thẻ trên điện thoại). Chỉ vẽ MỘT dạng thay vì vẽ cả hai rồi ẩn bằng CSS. */
export function useMediaQuery(query) {
  const [match, setMatch] = useState(() => (typeof window === 'undefined' ? false : window.matchMedia?.(query).matches ?? false));
  useEffect(() => {
    const m = window.matchMedia?.(query);
    if (!m) return undefined;
    const update = () => setMatch(m.matches);
    update();
    m.addEventListener?.('change', update);
    return () => m.removeEventListener?.('change', update);
  }, [query]);
  return match;
}
