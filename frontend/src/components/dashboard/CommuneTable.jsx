import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { api } from '../../api/client';
import { useAreaQuery } from '../../api/hooks';
import { communeStatus } from '../common/communeStatus';
import { ErrorState, Skeleton } from '../common/ui';
import { num } from '../../utils/format';
import { risk } from '../../utils/risk';

const fold = (t) => (t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();

/**
 * Thẻ "Cấp xã / phường" của Tổng quan máy tính (bản vẽ desktop, khung A7): bảng mọi xã/phường trong phạm vi — nặng nhất lên
 * đầu; mức theo communeStatus (cùng quy tắc với hộp chọn địa bàn: SOS quá hạn / cấp 1, cảnh báo đang hiệu lực, trạm vượt
 * báo động, mưa dự báo 24 giờ tới), SOS mở (· quá hạn), sơ tán (hộ đã sơ tán / kế hoạch), mưa dự báo 24 giờ tới. Xã chưa
 * có lý do nào ghi "Chưa ghi nhận" (xám) — không nói "an toàn". Bấm một dòng → chi tiết xã đó (onPick).
 * Dữ liệu: /dashboard/communes (cùng khoá với hộp chọn địa bàn), /evacuation (cùng khoá với ô Sơ tán).
 */
export default function CommuneTable({ units, onPick }) {
  const [q, setQ] = useState('');
  const statusQ = useQuery({ queryKey: ['communes-status'], queryFn: () => api('/dashboard/communes'), staleTime: 30_000, refetchInterval: 60_000 });
  const evacQ = useAreaQuery('evacuation', '/evacuation', {}, { refetchInterval: 30_000 });

  const rows = useMemo(() => {
    const byCode = new Map((statusQ.data || []).map((r) => [r.code, r]));
    const evac = new Map((evacQ.data?.progress || []).map((p) => [p.code, p]));
    return units.map((u) => {
      const r = byCode.get(u.code);
      const st = communeStatus(r);
      const ev = evac.get(u.code);
      return {
        u,
        r,
        level: st?.level || 0,
        reason: st?.reasons?.[0]?.text,
        evacPct: ev?.planned_households ? Math.round((100 * ev.evacuated_households) / ev.planned_households) : null,
      };
    }).sort((a, b) => b.level - a.level || (b.r?.sos_open || 0) - (a.r?.sos_open || 0) || a.u.name.localeCompare(b.u.name, 'vi'));
  }, [units, statusQ.data, evacQ.data]);

  const shown = q.trim() ? rows.filter((x) => fold(x.u.name).includes(fold(q.trim()))) : rows;

  return (
    <section className="sheet flex min-h-0 flex-1 flex-col gap-3 p-4" aria-label="Các xã, phường">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[15px] font-bold text-ink">
          <span className="num">{units.length}</span> xã / phường — nặng nhất lên đầu
        </h2>
        <label className="flex h-11 w-56 items-center gap-2 rounded-xl border border-line bg-panel px-3 text-sm focus-within:border-accent">
          <Search size={15} className="shrink-0 text-muted" aria-hidden="true" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm xã…" aria-label="Tìm xã, phường" className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted" />
        </label>
      </div>
      {!units.length ? (
        <Skeleton height={240} /> // danh sách xã / phường (/admin-units) chưa tải xong
      ) : !statusQ.data && statusQ.isError ? (
        <ErrorState onRetry={statusQ.refetch}>Không tải được tình hình các xã</ErrorState>
      ) : !statusQ.data ? (
        <Skeleton height={240} />
      ) : (
        <div className="scroll-thin -mx-1 min-h-0 flex-1 overflow-auto px-1">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-[1] bg-panel">
              <tr className="border-b border-line text-left text-[11px] font-bold uppercase tracking-[.04em] text-muted">
                <th className="px-3 py-2 font-bold">Xã / phường</th>
                <th className="px-3 py-2 font-bold">Mức</th>
                <th className="px-3 py-2 font-bold">SOS mở</th>
                <th className="px-3 py-2 font-bold">Sơ tán</th>
                <th className="px-3 py-2 font-bold">Mưa 24 giờ tới</th>
              </tr>
            </thead>
            <tbody>
              {shown.map(({ u, r, level, reason, evacPct }) => (
                <tr key={u.code} className="group border-b border-line/70 last:border-0 hover:bg-panel2">
                  <td className="px-3 py-2.5">
                    <button type="button" onClick={() => onPick(u.code)} className="tap text-left font-semibold text-ink group-hover:text-accent" title={reason ? `${u.name}: ${reason} — bấm xem chi tiết xã` : `Xem chi tiết ${u.name}`}>
                      {u.name}
                    </button>
                  </td>
                  <td className="px-3 py-2.5">
                    {level > 0
                      ? <span className={clsx('chip', risk(level).chip)} title={reason}>{risk(level).name}</span>
                      : <span className="chip border-line bg-panel2 text-muted">{r ? 'Chưa ghi nhận' : 'Chưa có số liệu'}</span>}
                  </td>
                  <td className="num px-3 py-2.5 text-ink-2">
                    {r ? r.sos_open || 0 : '–'}
                    {r?.sos_overdue > 0 && <span className="font-semibold text-danger"> · {r.sos_overdue} quá hạn</span>}
                  </td>
                  <td className="num px-3 py-2.5 text-ink-2">{evacPct == null ? '–' : `${evacPct}%`}</td>
                  <td className="num px-3 py-2.5 text-ink-2">{r?.rain_24h == null ? '–' : `${num(r.rain_24h, 0)} mm`}</td>
                </tr>
              ))}
              {!shown.length && (
                <tr><td colSpan={5} className="px-3 py-8 text-center text-sm text-muted">Không có xã / phường nào khớp “{q}”</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
