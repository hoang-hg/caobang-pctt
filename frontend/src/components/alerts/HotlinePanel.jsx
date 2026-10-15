import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { PhoneCall } from 'lucide-react';
import { api } from '../../api/client';
import { useStore } from '../../app/store';
import { EmptyState, ErrorState, Section, ShowMore, Skeleton } from '../common/ui';
import { usePermission } from '../../rbac/usePermission';
import { dateTime } from '../../utils/format';
import { useShowMore } from '../../utils/useShowMore';

// Số khẩn cấp quốc gia — hiện cho mọi tài khoản (kể cả không vận hành tổng đài)
const NATIONAL = [['112', 'Tìm kiếm cứu nạn'], ['114', 'Cứu nạn cứu hộ – PCCC'], ['115', 'Cấp cứu y tế'], ['113', 'Công an']];

function Hotlines({ list }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {list.map(([number, name]) => (
        <a key={number} href={`tel:${number}`} className="card tap flex min-h-[56px] items-center gap-2 p-2 hover:border-danger" aria-label={`Gọi ${number} — ${name}`}>
          <PhoneCall size={18} className="shrink-0 text-danger" aria-hidden="true" />
          <span className="min-w-0">
            <span className="block font-mono text-lg font-bold leading-tight text-ink">{number}</span>
            <span className="block text-[11px] leading-tight text-muted">{name}</span>
          </span>
        </a>
      ))}
    </div>
  );
}

/**
 * Đường dây nóng & tổng đài (thiết kế E.3). Mọi tài khoản: số khẩn cấp quốc gia (chạm để gọi). Quyền "Vận hành tổng đài":
 * số của tỉnh, mô phỏng phân luồng phím bấm (IVR — chưa nối tổng đài SIP thật), cuộc gọi gần đây (hiện dần, không cuộn lồng).
 */
export default function HotlinePanel({ online }) {
  const qc = useQueryClient();
  const toast = useStore((s) => s.toast);
  const canHotline = usePermission('hotline', 'operate', '*');
  const query = useQuery({ queryKey: ['hotline'], queryFn: () => api('/alerts/hotline'), refetchInterval: 30_000, enabled: canHotline });
  const [caller, setCaller] = useState('0999 123 456');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const calls = useShowMore(query.data?.calls || [], 6, 'goi');

  const call = async (key) => {
    setBusy(true);
    try {
      const r = await api('/alerts/ivr', { method: 'POST', body: { caller, key, message: msg || null } });
      toast({ tone: 'info', title: `Cuộc gọi phím ${key} → ${r.call.routed_to}`, body: r.ticket ? `Đã tạo phiếu ${r.ticket.code}` : 'Không kèm phiếu SOS' });
      setMsg('');
      qc.invalidateQueries({ queryKey: ['hotline'] });
    } catch (e) {
      toast({ tone: 'danger', title: 'Không mô phỏng được cuộc gọi', body: e.message });
    } finally {
      setBusy(false);
    }
  };

  if (!canHotline) {
    return (
      <Section title="Đường dây nóng">
        <Hotlines list={NATIONAL} />
        <p className="mt-2 text-xs text-muted">Vận hành tổng đài cần quyền “Vận hành tổng đài” (cấp toàn tỉnh).</p>
      </Section>
    );
  }
  if (query.isLoading) return <Skeleton height={260} />;
  if (query.isError && !query.data) {
    return (
      <Section title="Đường dây nóng">
        <Hotlines list={NATIONAL} />
        <ErrorState className="mt-2" height={120} onRetry={query.refetch}>Không tải được số liệu tổng đài</ErrorState>
      </Section>
    );
  }
  const hot = query.data;
  return (
    <div className="flex flex-col gap-3">
      <Section title="Đường dây nóng">
        <Hotlines list={hot.hotlines.map((h) => [h.number, h.name])} />
      </Section>
      <Section title="Mô phỏng phân luồng cuộc gọi SOS (IVR)">
        <div className="flex flex-col gap-2 text-sm">
          <p className="text-[11px] text-muted">Chưa nối tổng đài SIP thật — dùng để tập huấn trực ban: chọn phím như người gọi; có lời nhắn thì tạo phiếu SOS.</p>
          <label className="flex flex-col gap-1 text-xs font-medium">
            Số gọi đến
            <input className="input tap min-h-[40px] font-mono" value={caller} onChange={(e) => setCaller(e.target.value)} inputMode="tel" />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium">
            Lời nhắn thoại (đã chuyển văn bản) — tuỳ chọn
            <input className="input tap min-h-[40px]" placeholder="VD: Nước ngập tới mái nhà ở xóm Pác Bó" value={msg} onChange={(e) => setMsg(e.target.value)} />
          </label>
          <div className="grid grid-cols-2 gap-2">
            {hot.ivr.map((k) => (
              <button
                key={k.key}
                type="button"
                className="btn-ghost tap min-h-[52px] justify-start gap-2 px-2 text-left"
                onClick={() => call(k.key)}
                disabled={busy || !online}
                title={!online ? 'Mất mạng — chưa thực hiện được' : undefined}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-panel2 font-mono text-base font-bold">{k.key}</span>
                <span className="min-w-0 text-xs">{k.label}<span className="block text-muted">→ {k.route}</span></span>
              </button>
            ))}
          </div>
        </div>
      </Section>
      <Section title="Cuộc gọi gần đây">
        {hot.calls.length ? (
          <>
            <ul className="flex flex-col divide-y divide-line/60 text-xs">
              {calls.visible.map((c) => (
                <li key={c.id} className="flex flex-wrap gap-x-2 gap-y-0.5 py-1.5">
                  <span className="font-mono text-muted">{dateTime(c.time)}</span>
                  <span className="font-mono">{c.caller}</span>
                  <span className="w-full sm:ml-auto sm:w-auto sm:text-right">
                    Phím {c.ivr_key} · {c.category} → <span className="text-muted">{c.routed_to}</span>
                    {c.ticket_code && <b className={clsx('ml-1 text-danger')}>phiếu {c.ticket_code}</b>}
                  </span>
                </li>
              ))}
            </ul>
            <ShowMore list={calls} step={6} noun="cuộc gọi" />
          </>
        ) : <EmptyState height={80}>Chưa có cuộc gọi nào</EmptyState>}
      </Section>
    </div>
  );
}
