import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import L from 'leaflet';
import { CircleMarker, GeoJSON, MapContainer, Tooltip, useMap } from 'react-leaflet';
import { AlertTriangle, CheckCircle2, Download, Info, Loader2, ShieldCheck, Undo2 } from 'lucide-react';
import { api, apiDownload } from '../api/client';
import { useStore } from '../app/store';
import { Empty, EmptyState, ErrorState, Skeleton } from '../components/common/ui';
import { BaseLayer, ProvinceMask } from '../components/map/MapTools';
import { dateTime } from '../utils/format';
import { SUBMISSION_STATUS } from '../utils/labels';
import { cardOf, choiceLabel, fieldLabel, fixFor, rowLabel } from './dataImportFacts';

const FILTERS = [
  { value: 'cho_duyet', label: 'Chờ duyệt' },
  { value: 'da_duyet', label: 'Đã duyệt' },
  { value: 'tu_choi', label: 'Đã trả lại' },
  { value: '', label: 'Tất cả' },
];
// Lý do trả lại hay gặp — chạm để điền nhanh, sửa thêm được
const REASONS = ['Thiếu vị trí hoặc vị trí chưa đúng', 'Số liệu chưa khớp phương án của xã', 'Trùng với dữ liệu đã có', 'Thiếu số điện thoại liên hệ'];

const StatusChip = ({ status }) => (
  <span className={clsx('chip text-[11px]', SUBMISSION_STATUS[status]?.cls)}>{SUBMISSION_STATUS[status]?.label || status}</span>
);

/** "2 mới, 1 sửa, 3 xoá" — số thay đổi của hồ sơ bằng lời. */
const counts = (s) =>
  [`${s?.creates ?? 0} mới`, `${s?.updates ?? 0} sửa`, s?.deletes ? `${s.deletes} xoá` : null].filter(Boolean).join(', ');

/**
 * Hồ sơ dữ liệu xã/phường gửi. Cấp tỉnh (`canImport`): xem trước / sau khi thay đổi, "Duyệt" (ghi vào hệ thống) hoặc "Trả
 * lại" kèm lý do (xã đọc được, sửa rồi gửi lại); người gửi: theo dõi, rút hồ sơ đang chờ. `code`: hồ sơ đang mở (?ho-so=HS-…
 * trên URL, link trong email); `datasets`: danh sách loại dữ liệu (tên cột, chữ tiếng Việt của giá trị chọn).
 */
export default function Submissions({ canImport, code, onOpen, datasets = [] }) {
  const [status, setStatus] = useState(canImport ? 'cho_duyet' : '');
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['submissions', status],
    queryFn: () => api('/data-import/submissions', { params: { status: status || undefined, limit: 100 } }),
    refetchInterval: 30_000,
  });
  const items = data?.items || [];
  return (
    <div className="grid gap-3 lg:grid-cols-[340px_minmax(0,1fr)]">
      <div className="card flex min-w-0 flex-col gap-2 p-2">
        {/* Xuống dòng khi hẹp (cột 340 px, điện thoại) — không cắt mất lựa chọn cuối */}
        <div className="flex flex-wrap gap-1" role="group" aria-label="Lọc hồ sơ theo trạng thái">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              aria-pressed={status === f.value}
              onClick={() => setStatus(f.value)}
              className={clsx('tap min-h-[32px] rounded-full px-3 text-sm font-medium', status === f.value ? 'bg-accent text-white' : 'bg-panel2 text-ink-2 hover:text-ink')}
            >
              {f.label}
              {f.value && data?.counts?.[f.value] ? ` (${data.counts[f.value]})` : ''}
            </button>
          ))}
        </div>
        {isLoading ? (
          <div className="flex flex-col gap-2 p-1">{[0, 1, 2].map((i) => <Skeleton key={i} height={56} />)}</div>
        ) : isError && !data ? (
          <ErrorState onRetry={() => refetch()}>Không tải được danh sách hồ sơ</ErrorState>
        ) : !items.length ? (
          <EmptyState art="hop-thu" height={180}>
            {canImport
              ? status === 'cho_duyet' ? 'Không có hồ sơ nào chờ duyệt — xã gửi lên sẽ hiện ở đây.' : 'Không có hồ sơ'
              : 'Bạn chưa gửi hồ sơ nào. Gửi ở thẻ "Gửi dữ liệu".'}
          </EmptyState>
        ) : (
          <ul className="flex flex-col gap-1" aria-label="Danh sách hồ sơ">
            {items.map((s) => (
              <li key={s.id}>
                <button
                  onClick={() => onOpen(s.code)}
                  aria-current={s.code === code ? 'true' : undefined}
                  className={clsx(
                    'tap w-full rounded-lg border p-2.5 text-left text-sm',
                    s.code === code ? 'border-accent bg-accent/10' : 'border-line hover:bg-panel2',
                  )}
                >
                  <div className="flex items-center gap-2">
                    <b className="min-w-0 truncate">{s.dataset_label}</b>
                    <StatusChip status={s.status} />
                    <span className="ml-auto shrink-0 text-xs text-muted">{dateTime(s.submitted_at)}</span>
                  </div>
                  <div className="truncate text-ink-2">{s.admin_names} — {counts(s.summary)}</div>
                  <div className="truncate text-xs text-muted">{s.submitted_by_name} · {s.code}</div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {code ? <SubmissionDetail key={code} code={code} datasets={datasets} canImport={canImport} /> : (
        <div className="card p-3"><Empty>Chọn một hồ sơ để xem chi tiết</Empty></div>
      )}
    </div>
  );
}

function SubmissionDetail({ code, datasets, canImport }) {
  const toast = useStore((s) => s.toast);
  const qc = useQueryClient();
  const { data: s, isLoading, error, refetch } = useQuery({
    queryKey: ['submission', code],
    queryFn: () => api(`/data-import/submissions/${encodeURIComponent(code)}`),
  });
  const [note, setNote] = useState('');
  const [reason, setReason] = useState('');
  const [returning, setReturning] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [busy, setBusy] = useState('');
  if (isLoading) return <div className="card p-3"><Skeleton height={240} /></div>;
  if (error) return <div className="card p-3"><ErrorState onRetry={() => refetch()}>Không tải được hồ sơ: {error.message}</ErrorState></div>;

  const ds = datasets.find((d) => d.name === s.dataset);
  const label = (row) => rowLabel(row, { geojson: /\.geojson$/i.test(s.filename || '') });
  const act = async (action, body, done) => {
    setBusy(action);
    try {
      await api(`/data-import/submissions/${encodeURIComponent(code)}/${action}`, { method: 'POST', body });
      qc.invalidateQueries({ queryKey: ['submissions'] });
      qc.invalidateQueries({ queryKey: ['submission', code] });
      if (action === 'approve') qc.invalidateQueries(); // dữ liệu mới → mọi màn hình tải lại
      toast({ tone: 'good', title: done });
      setNote('');
      setReason('');
      setReturning(false);
    } catch (e) {
      toast({ tone: 'danger', title: 'Không thực hiện được', body: e.message, duration: 9000 });
    } finally {
      setBusy('');
    }
  };
  const check = s.check;
  const changes = s.changes;
  const total = changes
    ? { creates: changes.creates.length, updates: changes.updates.filter((u) => u.changes.length).length, deletes: changes.deletes.length }
    : s.summary;

  return (
    <section className="card flex min-w-0 flex-col gap-3 p-4" aria-label={`Hồ sơ ${s.code}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="flex flex-wrap items-center gap-2 text-lg font-semibold leading-tight">
            {s.dataset_label} — {s.admin_names} <StatusChip status={s.status} />
          </h2>
          <p className="mt-0.5 text-sm text-ink-2">
            {s.submitted_by_name}
            {s.submitted_by_position ? ` (${s.submitted_by_position})` : ''} gửi lúc {dateTime(s.submitted_at)} · mã hồ sơ {s.code}
          </p>
          {s.mode === 'replace' && <p className="mt-1 text-sm font-medium text-danger">Thay toàn bộ danh sách của xã — {cardOf(ds).noun} không có trong hồ sơ sẽ bị xoá</p>}
          {s.note && <p className="mt-1 rounded bg-panel2 p-2 text-sm">Xã ghi chú: {s.note}</p>}
        </div>
        <button
          className="btn-ghost shrink-0 text-sm"
          onClick={() => apiDownload(`/data-import/submissions/${encodeURIComponent(code)}/file`, s.filename).catch((e) =>
            toast({ tone: 'danger', title: 'Không tải được tệp', body: e.message }))}
        >
          <Download size={14} /> Tải tệp gốc
        </button>
      </div>

      {s.status !== 'cho_duyet' && (
        <div className={clsx('rounded-lg p-3 text-sm', s.status === 'da_duyet' ? 'bg-good/10' : 'bg-panel2')} role="status">
          {s.status === 'da_duyet' && (
            <p className="flex items-start gap-2">
              <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-good" aria-hidden="true" />
              <span>{s.reviewed_by_name} đã duyệt lúc {dateTime(s.reviewed_at)} — đã ghi {s.result?.created ?? 0} mới, {s.result?.updated ?? 0} cập nhật, {s.result?.deleted ?? 0} xoá.</span>
            </p>
          )}
          {s.status === 'tu_choi' && (
            <p className="flex items-start gap-2">
              <Undo2 size={16} className="mt-0.5 shrink-0 text-ink-2" aria-hidden="true" />
              <span>{s.reviewed_by_name} đã trả lại lúc {dateTime(s.reviewed_at)}.{!canImport ? ' Sửa theo lý do bên dưới rồi gửi lại ở thẻ "Gửi dữ liệu".' : ''}</span>
            </p>
          )}
          {s.status === 'da_rut' && <p>Người gửi đã rút hồ sơ lúc {dateTime(s.reviewed_at)}.</p>}
          {s.review_note && <p className="mt-1 text-ink-2"><b>{s.status === 'tu_choi' ? 'Lý do' : 'Ghi chú'}:</b> {s.review_note}</p>}
        </div>
      )}

      {s.status === 'cho_duyet' && check && !check.ok && (
        <IssueList
          title="Hồ sơ không còn khớp dữ liệu hiện tại (VD mã đã có người dùng) — trả lại để xã sửa và gửi lại"
          tone="error"
          issues={check.errors || []}
          total={check.error_count || 0}
          ds={ds}
          label={label}
        />
      )}
      {s.status === 'cho_duyet' && check?.warning_count > 0 && (
        <IssueList title="Lưu ý (không chặn việc duyệt)" issues={check.warnings} total={check.warning_count} ds={ds} label={label} />
      )}
      {changes && <ChangesView changes={changes} ds={ds} />}
      {s.status !== 'cho_duyet' && <SummaryPreview summary={s.summary} ds={ds} />}

      {s.can_review && (
        <div className="flex flex-col gap-3 rounded-lg border border-line p-3">
          {returning ? (
            <>
              <h3 className="font-semibold">Trả lại hồ sơ cho xã</h3>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Lý do hay gặp">
                {REASONS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    className="chip tap min-h-[32px] border border-line bg-panel px-3 text-xs hover:border-accent"
                    onClick={() => setReason((v) => (v.trim() ? `${v.trim()}; ${r}` : r))}
                  >
                    {r}
                  </button>
                ))}
              </div>
              <label className="flex flex-col gap-1 text-sm">
                Lý do trả lại — xã đọc được, sửa theo rồi gửi lại
                <textarea className="input min-h-[64px]" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)}
                  placeholder="VD: Điểm sơ tán Trường THCS chưa có vị trí, sức chứa ghi 3000 — kiểm tra lại" />
              </label>
              <div className="flex flex-wrap justify-end gap-2">
                <button type="button" className="btn-ghost" disabled={!!busy} onClick={() => setReturning(false)}>Quay lại</button>
                <button
                  type="button"
                  className="btn-primary"
                  disabled={!!busy || reason.trim().length < 3}
                  title={reason.trim().length < 3 ? 'Ghi lý do trả lại' : undefined}
                  onClick={() => act('reject', { reason: reason.trim() }, `Đã trả lại ${code} cho xã`)}
                >
                  {busy === 'reject' ? <Loader2 size={15} className="animate-spin" /> : <Undo2 size={15} />} Trả lại hồ sơ
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-ink-2">
                {check?.ok
                  ? <>Bấm <b>Duyệt</b> để ghi ngay vào hệ thống — {cardOf(ds).noun}: {counts(total)}{ds?.public ? '; hiện cho người dân' : ''}. Thấy sai thì <b>Trả lại</b> kèm lý do để xã sửa.</>
                  : <>Hồ sơ còn lỗi với dữ liệu hiện tại nên chưa duyệt được — bấm <b>Trả lại</b> kèm lý do để xã sửa, gửi lại.</>}
              </p>
              {check?.ok && (
                <label className="flex flex-col gap-1 text-sm">
                  Ghi chú gửi xã (không bắt buộc)
                  <input className="input" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
                </label>
              )}
              <div className="flex flex-wrap justify-end gap-2">
                <button type="button" className="btn-secondary" disabled={!!busy} onClick={() => setReturning(true)}>
                  <Undo2 size={15} /> Trả lại
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  disabled={!!busy || !check?.ok}
                  onClick={() => act('approve', { note: note.trim() || null }, `Đã duyệt ${code} — dữ liệu đã ghi vào hệ thống`)}
                >
                  {busy === 'approve' ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />} Duyệt
                </button>
              </div>
            </>
          )}
        </div>
      )}
      {s.can_withdraw && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line p-3 text-sm">
          {withdrawing ? (
            <>
              <span>Rút hồ sơ này? Tỉnh sẽ không duyệt nữa — muốn gửi lại phải tải tệp lên lần nữa.</span>
              <span className="flex shrink-0 gap-2">
                <button type="button" className="btn-ghost" disabled={!!busy} onClick={() => setWithdrawing(false)}>Không</button>
                <button type="button" className="btn-secondary" disabled={!!busy} onClick={() => act('withdraw', null, `Đã rút ${code}`)}>
                  <Undo2 size={15} /> Rút hồ sơ
                </button>
              </span>
            </>
          ) : (
            <>
              <span className="text-ink-2">Đang chờ cấp tỉnh duyệt. Dữ liệu chưa hiện trên hệ thống cho tới khi được duyệt.</span>
              <button type="button" className="btn-ghost shrink-0" onClick={() => setWithdrawing(true)}>
                <Undo2 size={15} /> Rút hồ sơ
              </button>
            </>
          )}
        </div>
      )}
    </section>
  );
}

function SummaryPreview({ summary, ds }) {
  if (!summary?.preview?.length) return null;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-ink-2">Hồ sơ gồm {counts(summary)} {cardOf(ds).noun}.</p>
      <PreviewTable rows={summary.preview} ds={ds} title={`Dữ liệu trong hồ sơ (${summary.preview.length} dòng đầu)`} />
    </div>
  );
}

/** Những gì sẽ ghi khi duyệt — tính lại với dữ liệu hiện tại mỗi lần mở: thêm mới, sửa (hiện tại → sau khi duyệt), xoá. */
function ChangesView({ changes, ds }) {
  const { creates, updates, deletes } = changes;
  const changed = updates.filter((u) => u.changes.length);
  const noun = cardOf(ds).noun;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm">
        Khi duyệt: <b>{creates.length} {noun} mới</b>, <b>{changed.length} {noun} được sửa</b>
        {deletes.length > 0 && <>, <b className="text-danger">{deletes.length} {noun} bị xoá</b></>}
        {changes.unchanged ? ` · ${changes.unchanged} không đổi` : ''}.
      </p>
      <ChangesMap creates={creates} updates={updates} />
      {creates.length > 0 && (
        <details open className="text-sm">
          <summary className="tap cursor-pointer font-medium">Thêm mới ({creates.length})</summary>
          <table className="mt-1 w-full text-left text-sm">
            <tbody>
              {creates.map((c) => (
                <tr key={c.dong} className="border-t border-line">
                  <td className="w-16 py-1 text-xs text-muted">Dòng {c.dong}</td>
                  <td className="pr-2">{c.ten}</td>
                  <td className="pr-2 text-xs text-muted">{c.ma}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
      {changed.length > 0 && (
        <details open className="text-sm">
          <summary className="tap cursor-pointer font-medium">Sửa ({changed.length}) — hiện tại → sau khi duyệt</summary>
          <div className="mt-1 flex flex-col gap-2">
            {changed.map((u) => (
              <div key={u.dong} className="overflow-x-auto rounded-lg border border-line">
                <div className="border-b border-line bg-panel2 px-2 py-1 font-medium">{u.ten} <span className="text-xs font-normal text-muted">{u.ma}</span></div>
                <table className="w-full text-left text-sm">
                  <thead className="text-xs text-muted">
                    <tr><th className="px-2 py-1 font-medium">Thông tin</th><th className="px-2 font-medium">Hiện tại</th><th className="px-2 font-medium">Sau khi duyệt</th></tr>
                  </thead>
                  <tbody>
                    {u.changes.map((c) => (
                      <tr key={c.field} className="border-t border-line align-top">
                        <td className="px-2 py-1 text-ink-2">{c.label || fieldLabel(ds, c.field)}</td>
                        <td className="px-2 py-1 text-muted line-through decoration-muted/60">{show(c.old, ds, c.field)}</td>
                        <td className="px-2 py-1 font-semibold">{show(c.new, ds, c.field)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </details>
      )}
      {deletes.length > 0 && (
        <details open className="text-sm">
          <summary className="tap cursor-pointer font-medium text-danger">Sẽ xoá ({deletes.length}) — không có trong hồ sơ "thay toàn bộ"</summary>
          <ul className="mt-1 list-inside list-disc">
            {deletes.map((d) => <li key={d.ma}>{d.ten} <span className="text-xs text-muted">{d.ma}</span></li>)}
          </ul>
        </details>
      )}
      {changes.truncated && <p className="text-xs text-muted">Chỉ hiện 300 {noun} đầu mỗi nhóm.</p>}
    </div>
  );
}

/** Giá trị một ô để đọc: trống → "(trống)"; giá trị chọn → chữ tiếng Việt; có/không. */
const show = (v, ds, field) => {
  if (v === null || v === undefined || v === '') return '(trống)';
  if (Array.isArray(v)) return v.join(', ');
  if (typeof v === 'boolean') return v ? 'có' : 'không';
  const f = ds?.fields.find((x) => x.name === field);
  return f?.choices?.includes(v) ? choiceLabel(f, v) : String(v);
};

function FitAll({ bounds }) {
  const map = useMap();
  useEffect(() => {
    if (bounds?.isValid()) map.fitBounds(bounds, { padding: [24, 24], maxZoom: 15 });
  }, [bounds, map]);
  return null;
}

function ChangesMap({ creates, updates }) {
  const items = useMemo(
    () => [...creates.map((c) => ({ ...c, kind: 'new' })), ...updates.map((u) => ({ ...u, kind: 'upd' }))],
    [creates, updates],
  );
  const bounds = useMemo(() => {
    const b = L.latLngBounds([]);
    items.forEach((i) => {
      if (i.lat != null) b.extend([i.lat, i.lon]);
      if (i.geometry) b.extend(L.geoJSON(i.geometry).getBounds());
    });
    return b;
  }, [items]);
  if (!bounds.isValid()) return null;
  const color = (k) => (k === 'new' ? '#16a34a' : '#d97706');
  return (
    <div className="flex flex-col gap-1">
      <div className="h-64 overflow-hidden rounded-lg border border-line">
        <MapContainer center={[22.75, 106.05]} zoom={9} zoomSnap={0.25} className="h-full w-full" scrollWheelZoom={false}>
          <BaseLayer basemap="auto" />
          <ProvinceMask />
          <FitAll bounds={bounds} />
          {items.filter((i) => i.geometry).map((i) => (
            <GeoJSON key={`g-${i.dong}`} data={i.geometry} style={{ color: color(i.kind), weight: 2, fillOpacity: 0.2 }}>
              <Tooltip>{i.ma} · {i.ten}</Tooltip>
            </GeoJSON>
          ))}
          {items.filter((i) => i.lat != null).map((i) => (
            <CircleMarker key={`p-${i.dong}`} center={[i.lat, i.lon]} radius={7} pathOptions={{ color: '#fff', weight: 2, fillColor: color(i.kind), fillOpacity: 1 }}>
              <Tooltip>{i.kind === 'new' ? 'Thêm mới' : 'Sửa'}: {i.ma} · {i.ten}</Tooltip>
            </CircleMarker>
          ))}
        </MapContainer>
      </div>
      <p className="flex flex-wrap gap-x-4 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#16a34a]" aria-hidden="true" /> Thêm mới</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#d97706]" aria-hidden="true" /> Sửa</span>
      </p>
    </div>
  );
}

/** Xem trước các dòng máy đã đọc được: tiêu đề cột là tên thông tin (`ds`), giá trị chọn ghi bằng chữ. */
export function PreviewTable({ rows, title, ds }) {
  const columns = rows.length ? Object.keys(rows[0]) : [];
  if (!columns.length) return null;
  return (
    <details className="text-sm">
      <summary className="tap cursor-pointer font-medium">{title}</summary>
      <div className="mt-2 max-h-72 overflow-auto rounded-lg border border-line">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-panel text-muted">
            <tr>{columns.map((c) => <th key={c} className="whitespace-nowrap px-2 py-1 font-medium">{c === 'dong' ? 'Dòng' : fieldLabel(ds, c)}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.dong} className="border-t border-line">
                {columns.map((c) => {
                  const v = show(row[c], ds, c);
                  return <td key={c} className="whitespace-nowrap px-2 py-1">{v === '(trống)' ? '' : v}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

/**
 * Danh sách lỗi / lưu ý theo dòng, bằng lời: "Dòng 5 · Sức chứa: Thiếu sức chứa (người)" + "Cách sửa: …" (fixFor).
 * `tone="error"`: lỗi chặn việc ghi (vàng — không phải việc khẩn); không có: lưu ý. `label(row)`: tên dòng ("Dòng 5",
 * "Bản ghi 2"); `viaForm`: lỗi của form điền trực tiếp (cách sửa nói tới ô / nút trên form).
 */
export function IssueList({ title, tone, issues, total, ds, label = (row) => rowLabel(row), viaForm }) {
  const error = tone === 'error';
  return (
    <div className={clsx('rounded-lg border p-3 text-sm', error ? 'border-warn/60 bg-warn/5' : 'border-line bg-panel2/60')}>
      <h4 className="mb-2 flex items-center gap-1.5 font-semibold">
        {error ? <AlertTriangle size={15} className="shrink-0 text-warn" aria-hidden="true" /> : <Info size={15} className="shrink-0 text-muted" aria-hidden="true" />}
        {title}
      </h4>
      <ul className="scroll-thin flex max-h-72 flex-col gap-2 overflow-y-auto" aria-label={title}>
        {issues.map((i, k) => {
          const name = i.field ? fieldLabel(ds, i.field) : '';
          const fix = fixFor(i, ds, viaForm);
          return (
            <li key={k} className="border-t border-line/60 pt-2 first:border-0 first:pt-0">
              <b>{label(i.row)}</b>{name && <> · {name}</>}: {i.message}
              {fix && <span className="mt-0.5 block text-xs text-ink-2">Cách sửa: {fix}</span>}
            </li>
          );
        })}
      </ul>
      {total > issues.length && (
        <p className="mt-2 text-xs text-muted">… và {total - issues.length} mục khác — sửa những mục trên rồi kiểm tra lại để xem tiếp.</p>
      )}
    </div>
  );
}
