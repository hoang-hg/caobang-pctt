import { useEffect, useRef } from 'react';

const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let loading = null;

function loadTurnstile() {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SCRIPT;
    s.async = true;
    s.onload = () => resolve(window.turnstile);
    s.onerror = () => { loading = null; reject(new Error('Không tải được Turnstile')); };
    document.head.appendChild(s);
  });
  return loading;
}

/**
 * Cloudflare Turnstile chống bot — chỉ dùng khi backend cấu hình TURNSTILE_SITE_KEY (GET /public/config).
 * onToken nhận token ('' khi hết hạn / lỗi) và phải ổn định (VD hàm set của useState). Token chỉ dùng được 1 lần:
 * đổi `key` của component để lấy token mới sau mỗi lần gửi.
 */
export default function Turnstile({ siteKey, onToken, onError }) {
  const ref = useRef(null);
  useEffect(() => {
    let id;
    let cancelled = false;
    loadTurnstile()
      .then((ts) => {
        if (cancelled || !ref.current) return;
        id = ts.render(ref.current, {
          sitekey: siteKey,
          language: 'vi',
          callback: onToken,
          'expired-callback': () => onToken(''),
          'error-callback': () => { onToken(''); onError?.(); },
        });
      })
      .catch(() => { onToken(''); onError?.(); });
    return () => {
      cancelled = true;
      if (id !== undefined) window.turnstile?.remove(id);
    };
  }, [siteKey, onToken, onError]);
  return <div ref={ref} className="min-h-[65px]" />;
}
