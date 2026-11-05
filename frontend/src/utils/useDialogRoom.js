import { useEffect, useState } from 'react';

const STRIP_ROOM = 44; // Modal chừa 48 px phía trên (`pt-12`) — dải một hàng nằm gọn trong đó
const MIN_SIDE_CARD = 260; // ngăn bên phải: bên trái còn rộng từng này mới đặt được thẻ cạnh ngăn

/**
 * Hộp thoại đang mở (gắn thẳng vào <body>, xem Modal) để thẻ nổi không che tiêu đề, nút đóng, nhãn bước của nó: null = không
 * có; { strip: true } = hộp giữa màn, còn dải trống phía trên; { right, width } = ngăn bên phải cao hết màn, thẻ đứng ngay bên
 * trái ngăn. Chỉ theo dõi khi `watch`. Dùng offset* vì không đổi theo hiệu ứng trượt khi ngăn mở.
 */
export function useDialogRoom(watch) {
  const [room, setRoom] = useState(null);
  useEffect(() => {
    if (!watch) {
      setRoom(null);
      return undefined;
    }
    const measure = () => {
      const open = [...document.querySelectorAll('[role="dialog"][aria-modal="true"]')];
      const drawer = open.find((d) => d.offsetTop < STRIP_ROOM);
      if (!open.length) setRoom(null);
      else if (drawer && drawer.offsetLeft >= MIN_SIDE_CARD) setRoom({ right: window.innerWidth - drawer.offsetLeft + 12, width: Math.min(416, drawer.offsetLeft - 24) });
      else setRoom({ strip: true }); // ngăn phủ gần hết màn: dải trên cùng, che ít nhất có thể và vẫn có nút đóng thẻ
    };
    measure();
    const seen = new MutationObserver(measure);
    seen.observe(document.body, { childList: true });
    window.addEventListener('resize', measure);
    return () => {
      seen.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [watch]);
  return room;
}
