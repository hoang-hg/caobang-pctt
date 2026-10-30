import { FlaskConical } from 'lucide-react';
import { useStore } from '../../app/store';

/** Dải CHẾ ĐỘ GIẢ LẬP trên cùng khi trang đang dùng dữ liệu giả (chỉ máy dev; App.jsx nạp lười trong nhánh
 * import.meta.env.DEV) — chỉ khi chọn "Hiện dải giả lập" (menu nút giả lập trên thanh trên; mặc định ẩn cho gọn, nút giả lập
 * vẫn ở thanh trên). Bật trước khi chụp ảnh gửi người khác: người xem không nhầm số liệu giả là thật. */
export default function DemoBanner() {
  const on = useStore((s) => s.simulationMode);
  const full = useStore((s) => s.simulationUiFull);
  if (!on || !full) return null;
  return (
    <div role="status" className="flex shrink-0 flex-wrap items-center justify-center gap-x-2 gap-y-0.5 bg-warn px-3 py-1 text-center text-xs font-bold text-black print:hidden">
      <FlaskConical size={14} aria-hidden="true" />
      <span>CHẾ ĐỘ GIẢ LẬP (máy dev) — số liệu giả, thao tác không lưu lên máy chủ</span>
      <button type="button" onClick={() => useStore.getState().setSimulationMode(false)} className="tap rounded px-1.5 underline underline-offset-2 hover:bg-black/10">
        Tắt giả lập
      </button>
    </div>
  );
}
