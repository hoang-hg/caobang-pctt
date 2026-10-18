import { ArrowRight, FlaskConical } from 'lucide-react';
import { useStore } from '../../app/store';
import { DEMO_ROLES, demoAuth } from '../../api/demoUsers';

/** Vào nhanh CHẾ ĐỘ GIẢ LẬP — chỉ máy dev (Login nạp lười trong nhánh import.meta.env.DEV): bật giả lập rồi đăng nhập bằng
 * một trong 3 vai trò thật (api/demoUsers.js) — App.jsx chuyển trang như đăng nhập thường (?next= hoặc Tổng quan). Không
 * gửi gì lên máy chủ. */
export default function DemoLoginPanel() {
  const enter = (key) => {
    const { setSimulationMode, setAuth } = useStore.getState();
    setSimulationMode(true);
    setAuth(demoAuth(key));
  };
  return (
    <section aria-label="Chế độ giả lập" className="mt-5 rounded-xl border border-warn/50 bg-warn/10 p-3">
      <div className="mb-1 flex items-center gap-1.5 text-xs font-bold text-warn">
        <FlaskConical size={14} aria-hidden="true" /> Chế độ giả lập — chỉ máy dev
      </div>
      <p className="mb-2 text-[11px] leading-relaxed text-muted">
        Số liệu giả trên trình duyệt để xem giao diện khi chưa có backend. Không gửi gì lên máy chủ; bản chạy thật không có phần này.
      </p>
      <div className="grid gap-1.5">
        {DEMO_ROLES.map((r) => (
          <button key={r.key} type="button" onClick={() => enter(r.key)}
            className="tap flex items-center justify-between gap-2 rounded-lg border border-line bg-panel px-3 py-2 text-left hover:border-warn">
            <span className="min-w-0">
              <span className="block text-xs font-semibold text-ink">{r.label}</span>
              <span className="block text-[11px] text-muted">{r.hint}</span>
            </span>
            <ArrowRight size={14} className="shrink-0 text-muted" aria-hidden="true" />
          </button>
        ))}
      </div>
    </section>
  );
}
