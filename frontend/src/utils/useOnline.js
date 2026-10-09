import { useEffect, useState } from 'react';

/** Trình duyệt có mạng không (sự kiện online / offline). Chỉ biết mất mạng phía máy; máy chủ lỗi khi vẫn có mạng thì
 * từng khối số liệu tự báo lỗi tải. */
export function useOnline() {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine !== false));
  useEffect(() => {
    const update = () => setOnline(navigator.onLine !== false);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  return online;
}
