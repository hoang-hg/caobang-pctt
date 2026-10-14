import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Home } from 'lucide-react';
import { api } from '../../api/client';
import { useUnits } from '../../api/hooks';
import { useStore } from '../../app/store';
import { EmptyState, ErrorState, Modal, Progress, Section, ShowMore, Skeleton } from '../common/ui';
import OccupancyModal from '../common/OccupancyModal';
import { useAllowedCodes, usePermission } from '../../rbac/usePermission';
import { int, pct, time } from '../../utils/format';
import { occupancyLevel } from '../../utils/risk';
import { useShowMore } from '../../utils/useShowMore';

const EVAC_FIELDS = [
  ['planned_households', 'Hộ phải sơ tán (kế hoạch)'],
  ['evacuated_households', 'Hộ đã sơ tán an toàn'],
  ['planned_persons', 'Nhân khẩu phải sơ tán'],
  ['evacuated_persons', 'Nhân khẩu đã sơ tán'],
];

/** Xã / trực ban cập nhật kế hoạch và tiến độ sơ tán (quyền evacuation.update tại xã đó) → KPI "Sơ tán an toàn" của
 * Dashboard cập nhật ngay. Kết thúc đợt: nhập số đã sơ tán = 0. */
export function EvacuationModal({ row, onClose }) {
  const qc = useQueryClient();
  const toast = useStore((st) => st.toast);
  const { data: units = [] } = useUnits();
  const allowed = useAllowedCodes('evacuation', 'update');
  const choices = units.filter((u) => !allowed || allowed.includes(u.code));
  const [code, setCode] = useState(row?.code || '');
  const [f, setF] = useState(() => Object.fromEntries(EVAC_FIELDS.map(([k]) => [k, row?.[k] ?? ''])));
  const [source, setSource] = useState('');
  const [busy, setBusy] = useState(false);
  const unit = units.find((u) => u.code === code);
  const n = (k) => Number(f[k]);
  const filled = EVAC_FIELDS.every(([k]) => f[k] !== '' && Number.isInteger(n(k)) && n(k) >= 0);
  const problem = !filled
    ? null
    : n('planned_persons') < n('planned_households') || n('evacuated_persons') < n('evacuated_households')
      ? 'Số nhân khẩu không thể ít hơn số hộ'
      : unit?.households && Math.max(n('planned_households'), n('evacuated_households')) > unit.households
        ? `Vượt tổng số hộ của xã (${int(unit.households)})`
        : null;
  const submit = async () => {
    setBusy(true);
    try {
      await api(`/evacuation/${encodeURIComponent(code)}`, {
        method: 'PUT',
        body: { ...Object.fromEntries(EVAC_FIELDS.map(([k]) => [k, n(k)])), source: source || null },
      });
      toast({ tone: 'good', title: `Đã cập nhật sơ tán ${unit?.name || code}` });
      qc.invalidateQueries({ queryKey: ['evacuation'] });
      qc.invalidateQueries({ queryKey: ['kpis'] });
      onClose();
    } catch (e) {
      toast({ tone: 'danger', title: 'Không cập nhật được', body: e.message });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={row ? `Cập nhật sơ tán – ${row.name}` : 'Cập nhật sơ tán'}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>Huỷ</button>
          <button className="btn-primary" disabled={!code || !filled || !!problem || busy} onClick={submit}>Lưu số liệu</button>
        </>
      }
    >
      <div className="grid gap-3 text-sm sm:grid-cols-2">
        {!row && (
          <label className="flex flex-col gap-1 sm:col-span-2">
            Xã / phường *
            <select className="input" value={code} onChange={(e) => setCode(e.target.value)}>
              <option value="">— Chọn xã —</option>
              {choices.map((u) => <option key={u.code} value={u.code}>{u.name}</option>)}
            </select>
          </label>
        )}
        {EVAC_FIELDS.map(([k, label]) => (
          <label key={k} className="flex flex-col gap-1">
            {label} *
            <input className="input" type="number" min="0" step="1" value={f[k]} onChange={(e) => setF((x) => ({ ...x, [k]: e.target.value }))} />
          </label>
        ))}
        <label className="flex flex-col gap-1 sm:col-span-2">
          Nguồn báo cáo
          <input className="input" maxLength={200} placeholder="VD: Báo cáo UBND xã lúc 14h" value={source} onChange={(e) => setSource(e.target.value)} />
        </label>
        {problem && <p className="text-xs text-danger sm:col-span-2">{problem}</p>}
        <p className="text-[11px] text-muted sm:col-span-2">
          {unit?.households ? `Xã có ${int(unit.households)} hộ, ${int(unit.population)} nhân khẩu. ` : ''}
          Kết thúc đợt sơ tán: nhập số đã sơ tán = 0. Thao tác được ghi nhật ký.
        </p>
      </div>
    </Modal>
  );
}

const EDIT = 'tap-sq min-h-[28px] rounded px-1.5 font-semibold text-accent hover:bg-accent/10 disabled:opacity-40';

function EvacuationRow({ r, online, onEdit }) {
  const canEdit = usePermission('evacuation', 'update', r.code);
  const p = pct(r.evacuated_households, r.planned_households);
  return (
    <li className="text-xs">
      <div className="mb-0.5 flex items-center justify-between gap-2">
        <span className="truncate font-medium text-ink">{r.name}</span>
        <span className="flex shrink-0 items-center gap-1.5">
          <span className="font-mono text-muted" title={`Cập nhật ${time(r.updated_at)}`}>{int(r.evacuated_households)}/{int(r.planned_households)} hộ ({p}%)</span>
          {canEdit && <button type="button" className={EDIT} onClick={() => onEdit(r)} disabled={!online} aria-label={`Cập nhật sơ tán ${r.name}`}>Sửa</button>}
        </span>
      </div>
      {/* Tiến độ (cao = tốt) tô màu trung tính — thang Đỏ / Cam / Vàng dành cho mức nguy hiểm */}
      <Progress value={p} tone="accent" />
    </li>
  );
}

function SiteRow({ s, online, onEdit }) {
  const canEdit = usePermission('evacuation', 'update', s.admin_code);
  const p = pct(s.current_occupancy, s.capacity);
  const lv = occupancyLevel(s.current_occupancy, s.capacity);
  return (
    <li className="text-xs">
      <div className="mb-0.5 flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1 text-ink"><Home size={11} className="shrink-0 text-good" aria-hidden="true" /><span className="truncate">{s.name}</span></span>
        <span className="flex shrink-0 items-center gap-1.5">
          <span className={clsx('font-mono font-semibold', lv === 3 && 'text-danger', lv === 2 && 'text-serious')}>
            {int(s.current_occupancy)}/{int(s.capacity)}{lv === 3 ? ' · đầy' : lv === 2 ? ' · sắp đầy' : ''}
          </span>
          {canEdit && <button type="button" className={EDIT} onClick={() => onEdit(s)} disabled={!online} aria-label={`Cập nhật số người ở ${s.name}`}>Sửa</button>}
        </span>
      </div>
      <Progress value={p} level={lv} />
    </li>
  );
}

/**
 * Giám sát sơ tán (thiết kế D.4): tiến độ di dời theo xã (thấp nhất lên đầu) và sức chứa các điểm sơ tán — đầy (≥ 100%) Đỏ,
 * sắp đầy (trên 85%) Cam, cùng thang với biểu tượng điểm sơ tán trên Bản đồ / cổng công khai (occupancyLevel). Đang tải /
 * lỗi (Thử lại) / chưa có số liệu nói rõ; mất mạng → nút "Sửa" tắt.
 */
export default function Evacuation({ query, online, className }) {
  const canUpdate = usePermission('evacuation', 'update');
  const [editing, setEditing] = useState(null); // null | 'new' | dòng tiến độ
  const [site, setSite] = useState(null); // điểm sơ tán đang cập nhật số người
  const data = query.data;
  const totPlanned = data?.progress.reduce((s, r) => s + r.planned_households, 0) || 0;
  const totDone = data?.progress.reduce((s, r) => s + r.evacuated_households, 0) || 0;
  // Hiện dần 6 dòng (máy chủ đã xếp: xã tiến độ thấp nhất, điểm đầy nhất lên đầu) — không cuộn lồng trong trang trên điện thoại
  const prog = useShowMore(data?.progress || [], 6, 'xa');
  const sites = useShowMore(data?.sites || [], 6, 'diem');

  return (
    <Section
      id="so-tan"
      className={clsx('scroll-mt-20', className)}
      title="Giám sát sơ tán nhân dân"
      right={data && <span className="font-mono text-xs font-semibold text-ink">{int(totDone)}/{int(totPlanned)} hộ</span>}
    >
      {query.isLoading ? <Skeleton height={200} />
        : query.isError && !data ? <ErrorState height={160} onRetry={query.refetch}>Không tải được số liệu sơ tán</ErrorState>
          : (
            <div className="flex flex-col gap-3">
              <div>
                <div className="mb-1.5 flex items-center justify-between gap-2 text-[11px] font-semibold uppercase text-muted">
                  Tiến độ di dời theo xã (thấp nhất trước)
                  {canUpdate && (
                    <button type="button" className={clsx(EDIT, 'normal-case')} onClick={() => setEditing('new')} disabled={!online}>+ Cập nhật xã</button>
                  )}
                </div>
                {data.progress.length
                  ? (
                    <>
                      <ul className="flex flex-col gap-2">{prog.visible.map((r) => <EvacuationRow key={r.code} r={r} online={online} onEdit={setEditing} />)}</ul>
                      <ShowMore list={prog} step={6} noun="xã" />
                    </>
                  )
                  : <EmptyState>Chưa có xã nào báo tiến độ sơ tán{canUpdate ? ' — bấm "+ Cập nhật xã"' : ''}</EmptyState>}
              </div>
              <div>
                <div className="mb-1.5 text-[11px] font-semibold uppercase text-muted">Sức chứa các điểm sơ tán (đầy lên đầu)</div>
                {data.sites.length
                  ? (
                    <>
                      <ul className="flex flex-col gap-2">{sites.visible.map((s) => <SiteRow key={s.id} s={s} online={online} onEdit={setSite} />)}</ul>
                      <ShowMore list={sites} step={6} noun="điểm" />
                    </>
                  )
                  : <EmptyState>Chưa có điểm sơ tán trong vùng — nhập bằng loại dữ liệu “Điểm sơ tán”</EmptyState>}
              </div>
            </div>
          )}
      {editing && <EvacuationModal row={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {site && <OccupancyModal site={site} onClose={() => setSite(null)} />}
    </Section>
  );
}
