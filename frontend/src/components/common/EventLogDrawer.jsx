import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FileSpreadsheet, X } from 'lucide-react';
import { useAreaQuery } from '../../api/hooks';
import { useStore } from '../../app/store';
import { exportExcel } from '../../utils/exportExcel';
import { dateTime, vnFileStamp } from '../../utils/format';
import { useEscapeToClose } from './ui';
import EventLog from './EventLog';

const LIMIT = 300; // máy chủ trả mới nhất trước; ghi rõ khi chạm trần

/**
 * Nhật ký sự kiện đầy đủ dạng ngăn phải (bản vẽ khung A16): tìm, lọc theo loại, theo thời gian, xuất Excel. Cùng nguồn
 * /dashboard/logs với cột nhật ký, tải nhiều dòng hơn. Khác Nhật ký pháp lý (thao tác của từng tài khoản) ở trang Cảnh báo.
 */
export default function EventLogDrawer({ area, onClose }) {
  const toast = useStore((s) => s.toast);
  const panel = useRef(null);
  const q = useAreaQuery('logs', '/dashboard/logs', { limit: LIMIT });
  const [busy, setBusy] = useState(false);
  useEscapeToClose(true, onClose);

  const excel = async () => {
    setBusy(true);
    try {
      const rows = (q.data || []).map((l) => ({ 'Thời gian': dateTime(l.time), 'Loại': l.category, 'Mức': l.severity, 'Sự kiện': l.message }));
      await exportExcel(rows, { sheet: 'Nhat ky', filename: `nhat-ky-su-kien-${vnFileStamp(new Date(), true)}.xlsx` });
    } catch (e) {
      toast({ tone: 'danger', title: 'Không xuất được tệp', body: e.message });
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[1500] flex justify-end bg-black/40" onMouseDown={onClose}>
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label="Nhật ký sự kiện"
        onMouseDown={(e) => e.stopPropagation()}
        className="flex h-full w-[620px] max-w-full flex-col bg-panel shadow-2xl"
      >
        <div className="flex items-start gap-3 border-b border-line px-6 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-bold text-ink">Nhật ký sự kiện</h2>
            <p className="text-[13px] text-ink-2">{area} · tự cập nhật</p>
          </div>
          <button type="button" onClick={onClose} autoFocus className="tap-sq flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-line text-ink-2 hover:text-ink" aria-label="Đóng nhật ký"><X size={16} aria-hidden="true" /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden px-6 py-4">
          <EventLog className="min-h-0" limit={LIMIT} ranged />
        </div>
        <div className="flex flex-col gap-2 border-t border-line px-6 py-3">
          <p className="text-[13px] text-ink-2">Khác Nhật ký pháp lý (thao tác của từng tài khoản) ở trang Cảnh báo.{q.data?.length >= LIMIT ? ` Đang hiện ${LIMIT} sự kiện mới nhất.` : ''}</p>
          <div className="flex items-center gap-2">
            <button type="button" className="btn-secondary tap h-11 rounded-xl px-4" disabled={busy || !q.data?.length} onClick={excel}><FileSpreadsheet size={15} aria-hidden="true" /> Xuất Excel</button>
            <span className="flex-1" />
            <button type="button" className="btn-primary tap h-11 rounded-xl px-5" onClick={onClose}>Đóng</button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
