import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import clsx from 'clsx';
import { ChevronLeft, ChevronRight, Home, Loader2, Save, Search } from 'lucide-react';
import { api } from '../../api/client';
import { useUnits } from '../../api/hooks';
import { useStore } from '../../app/store';
import { EmptyState, ErrorState, FieldError, Modal, Progress, Section, ShowMore, Skeleton, StepChips } from '../common/ui';
import QtyStepper from '../common/QtyStepper';
import OccupancyModal from '../common/OccupancyModal';
import { useAllowedCodes, usePermission } from '../../rbac/usePermission';
import { axisProps, useChartTheme } from '../charts/chartTheme';
import { exportExcel } from '../../utils/exportExcel';
import { dateTime, foldVi, int, pct, time, vnFileStamp } from '../../utils/format';
import { occupancyLevel, risk } from '../../utils/risk';
import { useShowMore } from '../../utils/useShowMore';

const STEPS = ['Xã / phường', 'Số liệu sơ tán'];
// Trần như EvacuationIn (backend); máy chủ chặn thêm khi vượt số hộ / dân số của xã (evacuation_problem) — form báo trước
const LIMIT = { planned_households: 200_000, evacuated_households: 200_000, planned_persons: 1_000_000, evacuated_persons: 1_000_000 };
const NUM = 'input tap num min-h-[44px] sm:min-h-[36px]';

/**
 * Xã / trực ban cập nhật kế hoạch và tiến độ sơ tán (quyền evacuation.update tại xã đó) → KPI "Sơ tán an toàn" của
 * Dashboard cập nhật ngay. Chưa chọn xã → 2 bước: (1) chạm chọn xã (tìm không dấu, kèm tiến độ đang có); (2) số liệu — số đã
 * sơ tán bằng nút −/+ (cán bộ báo thêm từng đợt, ít gõ), xem trước tiến độ. Lỗi hiện ngay dưới ô: không phải số nguyên,
 * nhân khẩu ít hơn số hộ, vượt số hộ / dân số của xã; đã sơ tán nhiều hơn kế hoạch chỉ nhắc (không chặn). Kết thúc đợt:
 * nhập số đã sơ tán = 0.
 */
export function EvacuationModal({ row, progress = [], onClose }) {
  const qc = useQueryClient();
  const toast = useStore((st) => st.toast);
  const { data: units = [] } = useUnits();
  const allowed = useAllowedCodes('evacuation', 'update');
  const choices = units.filter((u) => !allowed || allowed.includes(u.code)).sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  const [step, setStep] = useState(row ? 1 : 0);
  const [code, setCode] = useState(row?.code || '');
  const [search, setSearch] = useState('');
  const fill = (r) => ({
    planned_households: r?.planned_households != null ? String(r.planned_households) : '',
    evacuated_households: r?.evacuated_households != null ? String(r.evacuated_households) : '',
    planned_persons: r?.planned_persons != null ? String(r.planned_persons) : '',
    evacuated_persons: r?.evacuated_persons != null ? String(r.evacuated_persons) : '',
  });
  const [f, setF] = useState(() => fill(row));
  const [source, setSource] = useState('');
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  const refs = { planned_households: useRef(null), evacuated_households: useRef(null), planned_persons: useRef(null), evacuated_persons: useRef(null) };
  const unit = units.find((u) => u.code === code);
  const name = row?.name || unit?.name || code;
  const v = (k) => Number(f[k]);

  const errors = {};
  for (const [k, max] of Object.entries(LIMIT)) {
    const hh = k.endsWith('households');
    const cap = hh ? unit?.households : unit?.population;
    if (f[k] === '') errors[k] = 'Nhập số (0 nếu chưa có)';
    else if (!Number.isInteger(v(k)) || v(k) < 0) errors[k] = 'Số nguyên từ 0 trở lên';
    else if (cap && v(k) > cap) errors[k] = hh ? `Vượt tổng số hộ của xã (${int(cap)})` : `Vượt dân số của xã (${int(cap)})`;
    else if (v(k) > max) errors[k] = `Tối đa ${int(max)}`;
  }
  for (const [hh, pp] of [['planned_households', 'planned_persons'], ['evacuated_households', 'evacuated_persons']]) {
    if (!errors[hh] && !errors[pp] && v(pp) < v(hh)) errors[pp] = 'Nhân khẩu không thể ít hơn số hộ';
  }
  // Ô đã gõ → báo ngay; ô trống → báo khi bấm Lưu
  const err = (k) => (tried || f[k] !== '' ? errors[k] || null : null);
  const over = !errors.evacuated_households && !errors.planned_households && v('evacuated_households') > v('planned_households');
  const p = !errors.evacuated_households && !errors.planned_households && v('planned_households') > 0
    ? Math.round((100 * v('evacuated_households')) / v('planned_households')) : null;

  const pick = (u) => {
    setCode(u.code);
    setF(fill(progress.find((r) => r.code === u.code)));
    setTried(false);
    setStep(1);
  };
  const submit = async () => {
    const bad = Object.keys(refs).find((k) => errors[k]);
    if (bad) {
      setTried(true);
      refs[bad].current?.focus();
      return;
    }
    setBusy(true);
    try {
      await api(`/evacuation/${encodeURIComponent(code)}`, {
        method: 'PUT',
        body: { ...Object.fromEntries(Object.keys(refs).map((k) => [k, v(k)])), source: source.trim() || null },
      });
      toast({ tone: 'good', title: `Đã cập nhật sơ tán ${name}` });
      qc.invalidateQueries({ queryKey: ['evacuation'] });
      qc.invalidateQueries({ queryKey: ['kpis'] });
      onClose();
    } catch (e) {
      toast({ tone: 'danger', title: 'Không cập nhật được', body: e.message });
    } finally {
      setBusy(false);
    }
  };

  const nq = foldVi(search.trim());
  const shownUnits = nq ? choices.filter((u) => foldVi(u.name).includes(nq)) : choices;
  const big = 'tap min-h-[44px] text-sm sm:min-h-0';
  const field = (k, label, stepper) => (
    <div className="flex flex-col">
      <label htmlFor={`so-tan-${k}`} className="font-medium">{label} *</label>
      {stepper ? (
        <QtyStepper id={`so-tan-${k}`} ref={refs[k]} value={f[k]} onChange={(x) => setF((s) => ({ ...s, [k]: x }))} min={0} steps={[1, 10]} invalid={!!err(k)} describedBy={`loi-so-tan-${k}`} />
      ) : (
        <input
          id={`so-tan-${k}`}
          ref={refs[k]}
          className={clsx(NUM, 'mt-1', err(k) && 'border-danger')}
          type="number"
          inputMode="numeric"
          min="0"
          value={f[k]}
          onChange={(e) => setF((s) => ({ ...s, [k]: e.target.value }))}
          aria-invalid={!!err(k)}
          aria-describedby={`loi-so-tan-${k}`}
        />
      )}
      <FieldError id={`loi-so-tan-${k}`}>{err(k)}</FieldError>
    </div>
  );

  return (
    <Modal
      open
      onClose={onClose}
      title={code ? `Cập nhật sơ tán – ${name}` : 'Cập nhật sơ tán'}
      footer={
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:items-center sm:justify-end">
          {!row && step === 1 && (
            <button type="button" className={clsx('btn-ghost sm:mr-auto', big)} onClick={() => setStep(0)} disabled={busy}><ChevronLeft size={15} /> Quay lại</button>
          )}
          <button type="button" className={clsx('btn-ghost', step === 0 && 'col-span-2', big)} onClick={onClose} disabled={busy}>Huỷ</button>
          {step === 1 && (
            <button type="button" className={clsx('btn-primary font-bold', !row && 'col-span-2', big)} disabled={busy} onMouseDown={(e) => e.preventDefault()} onClick={submit}>
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Lưu số liệu
            </button>
          )}
        </div>
      }
    >
      {!row && <StepChips steps={STEPS} step={step} onStep={setStep} done={[!!code]} disabled={busy} />}
      {step === 0 ? (
        <div className="flex flex-col gap-2 text-sm">
          {choices.length > 6 && (
            <div className="relative">
              <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
              <input className="input tap min-h-[40px] pl-8" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm xã / phường…" aria-label="Tìm xã / phường" />
            </div>
          )}
          {!choices.length && <p className="text-xs text-danger">Tài khoản chưa được giao quyền cập nhật sơ tán ở xã/phường nào.</p>}
          <ul className="flex flex-col gap-1.5" aria-label="Chọn xã / phường">
            {shownUnits.map((u) => {
              const r = progress.find((x) => x.code === u.code);
              return (
                <li key={u.code}>
                  <button type="button" className="card tap flex min-h-[48px] w-full items-center gap-2 px-3 py-2 text-left hover:border-accent" onClick={() => pick(u)}>
                    <span className="min-w-0 flex-1 truncate font-semibold text-ink">{u.name}</span>
                    <span className="num shrink-0 text-xs text-muted">{r ? `${int(r.evacuated_households)}/${int(r.planned_households)} hộ` : 'chưa báo'}</span>
                    <ChevronRight size={16} className="shrink-0 text-muted" aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        // Một cột: ô số giữa 4 nút −/+ cần đủ rộng cho số hộ / nhân khẩu (2 cột ép ô còn ~30 px trên iPad)
        <div className="flex flex-col gap-3 text-sm">
          {field('planned_households', 'Hộ phải sơ tán (kế hoạch)')}
          {field('evacuated_households', 'Hộ đã sơ tán an toàn', true)}
          {field('planned_persons', 'Nhân khẩu phải sơ tán')}
          {field('evacuated_persons', 'Nhân khẩu đã sơ tán', true)}
          <div aria-live="polite">
            {p != null && (
              <>
                <div className="mb-1 flex justify-between text-xs"><span className="text-muted">Tiến độ sơ tán</span><b className="num">{p}%</b></div>
                <Progress value={p} tone="accent" />
              </>
            )}
            {over && <p className="mt-1 text-xs font-semibold text-serious">Số hộ đã sơ tán nhiều hơn kế hoạch — kiểm tra lại, hoặc tăng số hộ phải sơ tán</p>}
          </div>
          <label className="flex flex-col gap-1">
            <span className="font-medium">Nguồn báo cáo</span>
            <input className="input tap min-h-[44px] sm:min-h-0" maxLength={200} placeholder="VD: Báo cáo UBND xã lúc 14h" value={source} onChange={(e) => setSource(e.target.value)} />
          </label>
          <p className="text-[11px] text-muted">
            {unit?.households ? `Xã có ${int(unit.households)} hộ, ${int(unit.population)} nhân khẩu. ` : ''}
            Kết thúc đợt sơ tán: nhập số đã sơ tán = 0. Thao tác được ghi nhật ký.
          </p>
        </div>
      )}
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
          <span className="num text-muted" title={`Cập nhật ${time(r.updated_at)}`}>{int(r.evacuated_households)}/{int(r.planned_households)} hộ ({p}%)</span>
          {canEdit && <button type="button" className={EDIT} onClick={() => onEdit(r)} disabled={!online} aria-label={`Cập nhật sơ tán ${r.name}`}>Sửa</button>}
        </span>
      </div>
      {/* Tiến độ (cao = tốt) tô màu trung tính — thang Đỏ / Cam / Vàng dành cho mức nguy hiểm */}
      <Progress value={p} tone="accent" />
    </li>
  );
}

/** Dòng bảng tiến độ sơ tán (màn Sơ tán máy tính — khung C9). Thanh tiến độ màu trung tính (cao = tốt). */
/**
 * Diễn biến sơ tán của một xã (bản vẽ khung C15): biểu đồ hộ đã sơ tán so với kế hoạch + bảng từng lần số thay đổi, Xuất Excel.
 * Lấy từ GET /evacuation/{code}/history (72 giờ). Máy chủ chưa lưu nguồn báo của từng lần nên bảng không có cột đó.
 */
function EvacuationHistoryModal({ row, onClose }) {
  const c = useChartTheme();
  const toast = useStore((s) => s.toast);
  const q = useQuery({ queryKey: ['evacuation-history', row.code], queryFn: () => api(`/evacuation/${encodeURIComponent(row.code)}/history`, { params: { hours: 72 } }) });
  const rows = q.data || [];
  const series = rows.map((h) => ({ at: dateTime(h.time), done: h.evacuated_households }));
  const planned = rows.at(-1)?.planned_households;
  const excel = async () => {
    try {
      await exportExcel(
        rows.map((h) => ({
          Lúc: dateTime(h.time), 'Hộ đã sơ tán': h.evacuated_households, 'Hộ kế hoạch': h.planned_households,
          'Nhân khẩu đã sơ tán': h.evacuated_persons, 'Nhân khẩu kế hoạch': h.planned_persons, 'Người ghi': h.actor_name || '',
        })),
        { sheet: 'Dien bien so tan', filename: `dien-bien-so-tan-${row.code}-${vnFileStamp(new Date(), true)}.xlsx` },
      );
    } catch (e) {
      toast({ tone: 'danger', title: 'Không xuất được tệp', body: e.message });
    }
  };
  return (
    <Modal
      open
      size="md"
      onClose={onClose}
      title={`Diễn biến sơ tán — ${row.name}`}
      subtitle="72 giờ qua"
      footer={
        <>
          <button type="button" className="btn-secondary" disabled={!rows.length} onClick={excel}>Xuất Excel</button>
          <button type="button" className="btn-primary" onClick={onClose}>Đóng</button>
        </>
      }
    >
      {q.isLoading ? <Skeleton height={220} />
        : q.isError && !q.data ? <ErrorState onRetry={q.refetch}>Không tải được diễn biến sơ tán</ErrorState>
          : !rows.length ? <EmptyState>Xã chưa có lần cập nhật nào trong 72 giờ qua</EmptyState>
            : (
              <div className="flex flex-col gap-3">
                <div className="h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={series} margin={{ top: 12, right: 12, bottom: 0, left: -12 }}>
                      <CartesianGrid stroke={c.grid} vertical={false} />
                      <XAxis dataKey="at" {...axisProps(c)} minTickGap={60} />
                      <YAxis {...axisProps(c)} domain={[0, (m) => Math.max(m, planned || 0)]} />
                      <Tooltip formatter={(v) => [`${int(v)} hộ`, 'Đã sơ tán']} />
                      {planned > 0 && <ReferenceLine y={planned} stroke={c.axis} strokeDasharray="5 4" label={{ value: 'Kế hoạch', position: 'insideTopRight', fontSize: 11, fill: c.axis }} />}
                      <Line type="stepAfter" dataKey="done" stroke={c.s1} strokeWidth={2} dot={{ r: 2.5 }} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs font-bold text-ink-2">
                      <th className="px-3 py-2 font-bold">Lúc</th>
                      <th className="px-3 py-2 font-bold">Hộ đã / kế hoạch</th>
                      <th className="px-3 py-2 font-bold">Nhân khẩu</th>
                      <th className="px-3 py-2 font-bold">Người ghi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice().reverse().map((h) => (
                      <tr key={h.time} className="border-t border-line">
                        <td className="whitespace-nowrap px-3 py-2">{dateTime(h.time)}</td>
                        <td className="num px-3 py-2">{int(h.evacuated_households)}/{int(h.planned_households)} hộ</td>
                        <td className="num px-3 py-2">{int(h.evacuated_persons)}/{int(h.planned_persons)} người</td>
                        <td className="px-3 py-2 text-ink-2">{h.actor_name || 'Hệ thống'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="rounded-[14px] bg-panel2 p-3 text-[13px] leading-normal text-ink-2">Mỗi lần số kế hoạch hoặc số đã sơ tán đổi là một dòng — dùng cho báo cáo đợt thiên tai.</p>
              </div>
            )}
    </Modal>
  );
}

function EvacuationTableRow({ r, online, onEdit, onHistory }) {
  const canEdit = usePermission('evacuation', 'update', r.code);
  const p = pct(r.evacuated_households, r.planned_households);
  return (
    <tr className="border-t border-line">
      <td className="px-3 py-2.5 font-semibold text-ink">{r.name}</td>
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          <Progress value={p} tone="accent" className="flex-1" />
          <span className="num w-10 text-right text-xs font-semibold text-ink">{p}%</span>
        </div>
      </td>
      <td className="num px-3 py-2.5">{int(r.evacuated_households)}/{int(r.planned_households)} hộ</td>
      <td className="px-3 py-2.5 text-ink-2">{r.updated_at ? time(r.updated_at) : '—'}</td>
      <td className="whitespace-nowrap px-3 py-2.5 text-right">
        <button type="button" className="tap mr-1.5 rounded px-1 text-[13px] font-semibold text-accent hover:underline" onClick={() => onHistory(r)} aria-label={`Diễn biến sơ tán ${r.name}`}>Diễn biến</button>
        {canEdit && (
          <button type="button" className="btn-secondary tap h-9 rounded-xl px-3 text-[13px]" onClick={() => onEdit(r)} disabled={!online} aria-label={`Cập nhật sơ tán ${r.name}`}>
            Cập nhật
          </button>
        )}
      </td>
    </tr>
  );
}

/** Thẻ điểm sơ tán (cột phải màn Sơ tán máy tính — khung C9): tên, xã, đang chứa / sức chứa, nhãn Đã đầy / Sắp đầy / Còn chỗ. */
function SiteCard({ s, online, onEdit }) {
  const canEdit = usePermission('evacuation', 'update', s.admin_code);
  const lv = occupancyLevel(s.current_occupancy, s.capacity);
  return (
    <li className="flex items-center gap-2.5 rounded-xl bg-panel2 px-3 py-2.5">
      <span className="min-w-0 flex-1">
        <b className="block text-sm leading-snug text-ink">{s.name}</b>
        <span className="block text-xs text-muted">{s.admin_name}</span>
      </span>
      <b className="num shrink-0 text-ink" title="Đang chứa / sức chứa">{int(s.current_occupancy)}/{int(s.capacity)}</b>
      <span className={clsx('chip shrink-0 py-0.5 text-xs font-semibold', lv >= 2 ? risk(lv).chip : 'bg-good/15 text-good')}>
        {lv === 3 ? 'Đã đầy' : lv === 2 ? 'Sắp đầy' : 'Còn chỗ'}
      </span>
      {canEdit && (
        <button type="button" className="tap-sq h-9 shrink-0 rounded-lg px-2 text-[13px] font-semibold text-accent hover:bg-accent/10 disabled:opacity-40" onClick={() => onEdit(s)} disabled={!online} aria-label={`Cập nhật số người ở ${s.name}`}>
          Sửa
        </button>
      )}
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
          <span className={clsx('num font-semibold', lv === 3 ? 'text-danger' : lv === 2 ? 'text-serious' : 'text-ink-2')} title="Đang chứa / sức chứa">
            {int(s.current_occupancy)} / {int(s.capacity)} người
          </span>
          {lv >= 2 && <span className={clsx('chip py-0 text-[11px] font-bold', risk(lv).chip)}>{lv === 3 ? 'Đã đầy' : 'Sắp đầy'}</span>}
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
/**
 * `wide` (máy tính ≥ 1280 px — bản vẽ desktop khung C9, màn "Sơ tán" của Điều hành cứu hộ): hai khối — bảng tiến độ theo
 * xã (thanh tiến độ, đã / kế hoạch, giờ cập nhật, nút "Cập nhật") và cột điểm sơ tán (đang chứa / sức chứa, nhãn Đã đầy /
 * Sắp đầy / Còn chỗ); hiện đủ, không "Xem thêm".
 */
export default function Evacuation({ query, online, className, wide = false }) {
  const canUpdate = usePermission('evacuation', 'update');
  const [editing, setEditing] = useState(null); // null | 'new' | dòng tiến độ
  const [site, setSite] = useState(null); // điểm sơ tán đang cập nhật số người
  const [history, setHistory] = useState(null); // xã đang xem diễn biến (khung C15)
  const data = query.data;
  const totPlanned = data?.progress.reduce((s, r) => s + r.planned_households, 0) || 0;
  const totDone = data?.progress.reduce((s, r) => s + r.evacuated_households, 0) || 0;
  // Hiện dần 6 dòng (máy chủ đã xếp: xã tiến độ thấp nhất, điểm đầy nhất lên đầu) — không cuộn lồng trong trang trên điện thoại
  const prog = useShowMore(data?.progress || [], 6, 'xa');
  const sites = useShowMore(data?.sites || [], 6, 'diem');
  const modals = (
    <>
      {editing && <EvacuationModal row={editing === 'new' ? null : editing} progress={data?.progress} onClose={() => setEditing(null)} />}
      {site && <OccupancyModal site={site} onClose={() => setSite(null)} />}
      {history && <EvacuationHistoryModal row={history} onClose={() => setHistory(null)} />}
    </>
  );

  if (wide) {
    const body = query.isLoading ? <Skeleton height={240} />
      : query.isError && !data ? <ErrorState height={160} onRetry={query.refetch}>Không tải được số liệu sơ tán</ErrorState> : null;
    return (
      <div id="so-tan" className={clsx('grid scroll-mt-20 grid-cols-[minmax(0,1fr)_380px] items-start gap-5', className)}>
        <section aria-labelledby="so-tan-xa" className="sheet flex min-w-0 flex-col gap-3 p-5">
          <div className="flex flex-wrap items-center gap-3">
            <h2 id="so-tan-xa" className="text-[15px] font-bold text-ink">Tiến độ sơ tán theo xã — thấp nhất lên đầu</h2>
            {data && <span className="num text-sm text-ink-2">{int(totDone)}/{int(totPlanned)} hộ đã sơ tán</span>}
            <span className="flex-1" />
            {canUpdate && (
              <button type="button" className="btn-primary tap h-11 rounded-xl px-4" onClick={() => setEditing('new')} disabled={!online} title={!online ? 'Mất mạng — chưa ghi được' : undefined}>
                + Cập nhật xã
              </button>
            )}
          </div>
          {body || (data.progress.length ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-bold text-ink-2">
                  <th className="px-3 py-2 font-bold">Xã / phường</th>
                  <th className="w-[26%] px-3 py-2 font-bold">Tiến độ</th>
                  <th className="px-3 py-2 font-bold">Đã / kế hoạch</th>
                  <th className="px-3 py-2 font-bold">Cập nhật</th>
                  <th className="px-3 py-2"><span className="sr-only">Thao tác</span></th>
                </tr>
              </thead>
              <tbody>
                {data.progress.map((r) => <EvacuationTableRow key={r.code} r={r} online={online} onEdit={setEditing} onHistory={setHistory} />)}
              </tbody>
            </table>
          ) : <EmptyState>Chưa có xã nào báo tiến độ sơ tán{canUpdate ? ' — bấm "+ Cập nhật xã"' : ''}</EmptyState>)}
        </section>
        <aside aria-labelledby="so-tan-diem" className="sheet sticky top-0 flex flex-col gap-2.5 p-5">
          <h2 id="so-tan-diem" className="text-[15px] font-bold text-ink">Điểm sơ tán: đang chứa / sức chứa (đầy lên đầu)</h2>
          {body || (data.sites.length ? (
            <ul className="scroll-thin flex max-h-[calc(100vh-20rem)] flex-col gap-2 overflow-y-auto">
              {data.sites.map((x) => <SiteCard key={x.id} s={x} online={online} onEdit={setSite} />)}
            </ul>
          ) : <EmptyState>Chưa có điểm sơ tán trong vùng — nhập bằng loại dữ liệu “Điểm sơ tán”</EmptyState>)}
          <p className="rounded-[14px] border border-dashed border-line p-3 text-[13px] leading-normal text-ink-2">
            Cổng người dân hiện chỗ còn trống của từng điểm theo số này — cập nhật ngay khi dân đến / rời điểm.
          </p>
        </aside>
        {modals}
      </div>
    );
  }

  return (
    <Section
      id="so-tan"
      className={clsx('scroll-mt-20', className)}
      title="Sơ tán dân và điểm sơ tán"
      right={data && <span className="num text-xs font-semibold text-ink">{int(totDone)}/{int(totPlanned)} hộ</span>}
    >
      {query.isLoading ? <Skeleton height={200} />
        : query.isError && !data ? <ErrorState height={160} onRetry={query.refetch}>Không tải được số liệu sơ tán</ErrorState>
          : (
            <div className="flex flex-col gap-3">
              <div>
                <div className="mb-1.5 flex items-center justify-between gap-2 text-xs font-semibold text-muted">
                  Tiến độ di dời theo xã (thấp nhất trước)
                  {canUpdate && (
                    <button type="button" className={EDIT} onClick={() => setEditing('new')} disabled={!online}>+ Cập nhật xã</button>
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
                <div className="mb-1.5 text-xs font-semibold text-muted">Điểm sơ tán: đang chứa / sức chứa (đầy lên đầu)</div>
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
      {modals}
    </Section>
  );
}
