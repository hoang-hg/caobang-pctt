import { useEffect, useState } from 'react';

/** Giá trị đổi sau khi `value` đứng yên `ms` mili-giây (VD kéo thanh thời gian: chỉ tải lớp mưa khi đã dừng tay, không
 * gọi máy chủ cho từng nấc giờ đi qua). */
export function useDebounced(value, ms) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return settled;
}
