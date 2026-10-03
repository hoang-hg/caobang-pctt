import { useState } from 'react';
import { Copy, Link2, Loader2, Phone, Send } from 'lucide-react';
import { api } from '../../api/client';
import { useStore } from '../../app/store';
import { dateTime } from '../../utils/format';
import { Modal } from './ui';

function useCopy() {
  const toast = useStore((s) => s.toast);
  return (text, done) => {
    if (!navigator.clipboard) {
      toast({ tone: 'danger', title: 'Không sao chép được — chép tay nội dung trên' });
      return;
    }
    navigator.clipboard.writeText(text).then(
      () => toast({ tone: 'good', title: done }),
      () => toast({ tone: 'danger', title: 'Không sao chép được — chép tay nội dung trên' }),
    );
  };
}

/** Link nhiệm vụ vừa sinh (phát lệnh / cấp lại). Máy chủ chỉ lưu SHA-256 → link chỉ hiện MỘT lần ở đây. */
export function MissionLinkBox({ url, expiresAt }) {
  const copy = useCopy();
  return (
    <div className="rounded-lg border border-accent/40 bg-accent/5 p-3 text-sm">
      <div className="flex items-center gap-1.5 font-semibold text-ink"><Link2 size={15} className="text-accent" /> Link nhiệm vụ cho trưởng nhóm</div>
      <p className="mt-0.5 text-xs text-ink-2">
        Đã kèm trong nội dung lệnh. Trưởng nhóm mở trên điện thoại (không cần đăng nhập) để xem điểm SOS, chỉ đường, báo
        đã đến / đã cứu / cần chi viện. Hết hạn {dateTime(expiresAt)} hoặc khi xác nhận hoàn thành. Link chỉ hiện một lần —
        mất thì bấm “Link” trên thẻ phiếu để cấp link mới.
      </p>
      <div className="mt-2 flex gap-2">
        <input
          readOnly
          aria-label="Link nhiệm vụ"
          className="input min-w-0 flex-1 font-mono text-xs"
          value={url}
          onFocus={(e) => e.target.select()}
        />
        <button type="button" className="btn-ghost shrink-0 px-3 py-1 text-xs" onClick={() => copy(url, 'Đã sao chép link nhiệm vụ')}>
          <Copy size={13} /> Sao chép
        </button>
      </div>
    </div>
  );
}

/** Cấp link nhiệm vụ mới cho lệnh đang thực hiện — link cũ hết hiệu lực ngay. */
export function MissionLinkModal({ ticket, onClose }) {
  const toast = useStore((s) => s.toast);
  const copy = useCopy();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const issue = async () => {
    setBusy(true);
    try {
      setResult(await api(`/dispatch/${ticket.dispatch_id}/mission-link`, { method: 'POST' }));
    } catch (e) {
      toast({ tone: 'danger', title: 'Không cấp được link', body: e.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Link nhiệm vụ – ${ticket.code}`}
      footer={result ? (
        <button className="btn-primary" onClick={onClose}>Đóng</button>
      ) : (
        <>
          <button className="btn-ghost" onClick={onClose}>Huỷ</button>
          <button className="btn-primary" disabled={busy} onClick={issue}>
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Link2 size={15} />} Cấp link mới
          </button>
        </>
      )}
    >
      {result ? (
        <div className="flex flex-col gap-3">
          <MissionLinkBox url={result.mission_url} expiresAt={result.expires_at} />
          <div className="rounded-lg bg-panel2 p-3 text-sm">
            <div className="text-xs text-muted">Nội dung gửi trưởng nhóm{result.to ? ` (${result.to})` : ''} qua Zalo / SMS</div>
            <div className="mt-1 font-mono text-[13px] [overflow-wrap:anywhere]">{result.message}</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {result.to && (
                <a className="btn-primary px-3 py-1 text-xs" href={`tel:${result.to.replace(/\s/g, '')}`}>
                  <Phone size={13} /> Gọi {result.to}
                </a>
              )}
              <button type="button" className="btn-ghost px-3 py-1 text-xs" onClick={() => copy(result.message, 'Đã sao chép nội dung lệnh — dán vào Zalo / SMS')}>
                <Send size={13} /> Sao chép nội dung lệnh
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="text-sm text-ink-2">
          <p>
            Cấp link mới cho <b>{ticket.force_name || 'lực lượng đang làm nhiệm vụ'}</b> khi chưa kịp sao chép link lúc phát
            lệnh, đội đổi trưởng nhóm, hoặc link đã lộ ra ngoài.
          </p>
          <p className="mt-2 font-medium text-warn">Link cũ sẽ không dùng được nữa — nhớ gửi link mới cho trưởng nhóm.</p>
        </div>
      )}
    </Modal>
  );
}
