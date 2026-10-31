import { FlaskConical } from 'lucide-react';
import { useStore } from '../../app/store';
import { stopSimulation } from '../../api/simulationSwitch';

/** Dải CHẾ ĐỘ GIẢ LẬP trên cùng khi trang đang dùng dữ liệu giả (App.jsx nạp khi bật giả lập). Bản chạy thật: LUÔN hiện —
 * hệ thống đang vận hành, người xem không được nhầm số giả là thật, và trình duyệt này không nhận SOS thật. Máy dev: chỉ khi chọn
 * "Hiện dải giả lập" (menu nút giả lập trên thanh trên; mặc định ẩn cho gọn). */
export default function DemoBanner() {
  const on = useStore((s) => s.simulationMode);
  const full = useStore((s) => s.simulationUiFull);
  const dev = import.meta.env.DEV;
  if (!on || (dev && !full)) return null;
  return (
    <div role="status" className="flex shrink-0 flex-wrap items-center justify-center gap-x-2 gap-y-0.5 bg-warn px-3 py-1 text-center text-xs font-bold text-black print:hidden">
      <FlaskConical size={14} aria-hidden="true" />
      <span>
        {dev
          ? 'CHẾ ĐỘ GIẢ LẬP (máy dev) — số liệu giả, thao tác không lưu lên máy chủ'
          : 'ĐANG XEM SỐ LIỆU GIẢ LẬP trên trình duyệt này — không phải số thật, không nhận SOS thật, thao tác không lưu'}
      </span>
      <button type="button" onClick={stopSimulation} className="tap rounded px-1.5 underline underline-offset-2 hover:bg-black/10">
        Tắt giả lập
      </button>
    </div>
  );
}
