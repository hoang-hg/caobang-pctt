import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import L from 'leaflet';
import { CircleMarker, GeoJSON, MapContainer, Tooltip, useMap } from 'react-leaflet';
import { AlertTriangle, CheckCircle2, Download, Loader2, ShieldCheck, Undo2, XCircle } from 'lucide-react';
import { api, apiDownload } from '../api/client';
import { useStore } from '../app/store';
import { Empty, KpiCard } from '../components/common/ui';
import { BaseLayer } from '../components/map/MapTools';
import { dateTime } from '../utils/format';
import { SUBMISSION_STATUS } from '../utils/labels';

const FILTERS = [
  { value: 'cho_duyet', label: 'Chờ duyệt' },
  { value: 'da_duyet', label: 'Đã duyệt' },
  { value: 'tu_choi', label: 'Từ chối' },
  { value: '', label: 'Tất cả' },
];

const StatusChip = ({ status }) => (
  <span className={clsx('chip text-[11px]', SUBMISSION_STATUS[status]?.cls)}>{SUBMISSION_STATUS[status]?.label || status}</span>
);

const counts = (s) =>
  [`${s?.creates ?? 0} mới`, `${s?.updates ?? 0} cập nhật`, s?.deletes ? `${s.deletes} xoá` : null].filter(Boolean).join(' · ');

/**
 * Hồ sơ dữ liệu xã/phường gửi. Cấp tỉnh (`canImport`): duyệt / từ chối; người gửi: theo dõi, rút hồ sơ đang chờ.
 * `code`: hồ sơ đang mở (?ho-so=HS-… trên URL, link trong email).
 */
export default function Submissions({ canImport, code, onOpen }) {
  const [status, setStatus] = useState(canImport ? 'cho_duyet' : '');
  const { data, isLoading } = useQuery({
    queryKey: ['submissions', status],
    queryFn: () => api('/data-import/submissions', { params: { status: status || undefined, limit: 100 } }),
    refetchInterval: 30_000,
  });
  const items = data?.items || [];
  return (
    <div className="grid gap-3 lg:grid-cols-[340px_minmax(0,1fr)]">
      <div className="card flex min-w-0 flex-col gap-2 p-2">
        <div className="flex flex-wrap gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setStatus(f.value)}
              className={clsx('chip px-2.5 py-1', status === f.value ? 'bg-accent text-white' : 'bg-panel2')}
            >
              {f.label}
              {f.value && data?.counts?.[f.value] ? ` (${data.counts[f.value]})` : ''}
            </button>
          ))}
        </div>
        {isLoading ? (
          <Empty>Đang tải…</Empty>
        ) : !items.length ? (
          <Empty>{canImport ? 'Không có hồ sơ' : 'Bạn chưa gửi hồ sơ nào'}</Empty>
        ) : (
          <ul className="flex flex-col gap-1">
            {items.map((s) => (
              <li key={s.id}>
                <button
                  onClick={() => onOpen(s.code)}
                  className={clsx(
                    'w-full rounded-lg border p-2 text-left text-sm',
                    s.code === code ? 'border-accent bg-accent/10' : 'border-line hover:bg-panel2',
                  )}
                >
                  <div className="flex items-center gap-2">
                    <b>{s.code}</b>
                    <StatusChip status={s.status} />
                    <span className="ml-auto text-[11px] text-muted">{dateTime(s.submitted_at)}</span>
                  </div>
                  <div className="truncate font-medium">{s.dataset_label}</div>
                  <div className="truncate text-xs text-muted">
                    {s.admin_names} · {s.submitted_by_name} · {counts(s.summary)}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {code ? <SubmissionDetail key={code} code={code} /> : (
        <div className="card p-3"><Empty>Chọn một hồ sơ để xem chi tiết</Empty></div>
      )}
    </div>
  );
}

function SubmissionDetail({ code }) {
  const toast = useStore((s) => s.toast);
  const qc = useQueryClient();
  const { data: s, isLoading, error } = useQuery({
    queryKey: ['submission', code],
    queryFn: () => api(`/data-import/submissions/${encodeURIComponent(code)}`),
  });
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState('');
  if (isLoading) return <div className="card p-3"><Empty>Đang tải…</Empty></div>;
  if (error) return <div className="card p-3"><Empty>{error.message}</Empty></div>;

  const act = async (action, body, done) => {
    setBusy(action);
    try {
      await api(`/data-import/submissions/${encodeURIComponent(code)}/${action}`, { method: 'POST', body });
      qc.invalidateQueries({ queryKey: ['submissions'] });
      qc.invalidateQueries({ queryKey: ['submission', code] });
      if (action === 'approve') qc.invalidateQueries(); // dữ liệu mới → mọi màn hình tải lại
      toast({ tone: 'good', title: done });
      setNote('');
    } catch (e) {
      toast({ tone: 'danger', title: 'Không thực hiện được', body: e.message, duration: 9000 });
    } finally {
      setBusy('');
    }
  };
  const check = s.check;
  const changes = s.changes;

  return (
    <section className="card flex min-w-0 flex-col gap-3 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="flex flex-wrap items-center gap-2 font-semibold">
            {s.code} · {s.dataset_label} <StatusChip status={s.status} />
            {s.mode === 'replace' && <span className="chip bg-danger/15 text-[11px] text-danger">Thay toàn bộ trong xã</span>}
          </h2>
          <p className="text-xs text-ink-2">
            {s.admin_names} · gửi bởi {s.submitted_by_name}
            {s.submitted_by_position ? ` (${s.submitted_by_position})` : ''} lúc {dateTime(s.submitted_at)}
          </p>
          {s.note && <p className="mt-1 rounded bg-panel2 p-2 text-xs">Ghi chú: {s.note}</p>}
        </div>
        <button
          className="btn-ghost shrink-0 text-xs"
          onClick={() => apiDownload(`/data-import/submissions/${encodeURIComponent(code)}/file`, s.filename).catch((e) =>
            toast({ tone: 'danger', title: 'Không tải được tệp', body: e.message }))}
        >
          <Download size={14} /> Tệp gốc
        </button>
      </div>

      {s.status !== 'cho_duyet' && (
        <div
          className={clsx(
            'rounded-lg p-3 text-sm',
            s.status === 'da_duyet' ? 'bg-good/10 text-good' : s.status === 'tu_choi' ? 'bg-danger/10 text-danger' : 'bg-panel2 text-muted',
          )}
        >
          {s.status === 'da_duyet' && (
            <>
              <CheckCircle2 size={16} className="mr-1 inline" /> {s.reviewed_by_name} phê duyệt lúc {dateTime(s.reviewed_at)}:{' '}
              {s.result?.created ?? 0} mới, {s.result?.updated ?? 0} cập nhật, {s.result?.deleted ?? 0} xoá.
            </>
          )}
          {s.status === 'tu_choi' && (
            <>
              <XCircle size={16} className="mr-1 inline" /> {s.reviewed_by_name} từ chối lúc {dateTime(s.reviewed_at)}
            </>
          )}
          {s.status === 'da_rut' && <>Người gửi đã rút hồ sơ lúc {dateTime(s.reviewed_at)}</>}
          {s.review_note && <div className="mt-1 text-ink-2">{s.status === 'tu_choi' ? 'Lý do' : 'Ghi chú'}: {s.review_note}</div>}
        </div>
      )}

      {s.status === 'cho_duyet' && check && !check.ok && (
        <IssueTable
          title="Hồ sơ không còn hợp lệ với dữ liệu hiện tại (VD mã đã được dùng) — từ chối để xã sửa và gửi lại"
          tone="danger"
          issues={check.errors || []}
          total={check.error_count || 0}
        />
      )}
      {s.status === 'cho_duyet' && check?.warning_count > 0 && (
        <IssueTable title={`${check.warning_count} cảnh báo`} tone="warn" issues={check.warnings} total={check.warning_count} />
      )}
      {changes && <ChangesView changes={changes} />}
      {s.status !== 'cho_duyet' && <SummaryPreview summary={s.summary} />}

      {s.can_review && (
        <div className="flex flex-col gap-2 rounded-lg border border-line p-3">
          <label className="flex flex-col gap-1 text-sm">
            Ghi chú khi duyệt / lý do từ chối
            <textarea className="input min-h-[60px]" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <div className="flex flex-wrap justify-end gap-2">
            <button
              className="btn-ghost text-danger"
              disabled={!!busy || note.trim().length < 3}
              title={note.trim().length < 3 ? 'Ghi lý do từ chối' : undefined}
              onClick={() => act('reject', { reason: note.trim() }, `Đã từ chối ${code}`)}
            >
              {busy === 'reject' ? <Loader2 size={15} className="animate-spin" /> : <XCircle size={15} />} Từ chối
            </button>
            <button
              className="btn-primary"
              disabled={!!busy || !check?.ok}
              onClick={() => act('approve', { note: note.trim() || null }, `Đã phê duyệt ${code} — dữ liệu đã cập nhật`)}
            >
              {busy === 'approve' ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />} Phê duyệt & ghi dữ liệu
            </button>
          </div>
        </div>
      )}
      {s.can_withdraw && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-line p-3 text-sm">
          <span className="text-muted">Đang chờ cấp tỉnh phê duyệt. Dữ liệu chưa hiển thị cho tới khi được duyệt.</span>
          <button className="btn-ghost shrink-0" disabled={!!busy} onClick={() => act('withdraw', null, `Đã rút ${code}`)}>
            <Undo2 size={15} /> Rút hồ sơ
          </button>
        </div>
      )}
    </section>
  );
}

function SummaryPreview({ summary }) {
  if (!summary?.preview?.length) return null;
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-3 gap-2">
        <KpiCard label="Thêm mới" value={summary.creates} />
        <KpiCard label="Cập nhật" value={summary.updates} />
        <KpiCard label="Xoá" value={summary.deletes} tone={summary.deletes ? 'danger' : undefined} />
      </div>
      <PreviewTable rows={summary.preview} title={`Dữ liệu trong hồ sơ (${summary.preview.length} dòng đầu)`} />
    </div>
  );
}

/** Những gì sẽ ghi khi phê duyệt — tính lại với dữ liệu hiện tại mỗi lần mở. */
function ChangesView({ changes }) {
  const { creates, updates, deletes } = changes;
  const changed = updates.filter((u) => u.changes.length);
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-2">
        <KpiCard label="Thêm mới" value={creates.length} />
        <KpiCard label="Cập nhật" value={changed.length} sub={changes.unchanged ? `${changes.unchanged} bản ghi không đổi` : undefined} />
        <KpiCard label="Xoá" value={deletes.length} tone={deletes.length ? 'danger' : undefined} />
      </div>
      <ChangesMap creates={creates} updates={updates} />
      {creates.length > 0 && (
        <details open className="text-sm">
          <summary className="cursor-pointer font-medium text-good">Thêm mới ({creates.length})</summary>
          <table className="mt-1 w-full text-left text-xs">
            <tbody>
              {creates.map((c) => (
                <tr key={c.dong} className="border-t border-line">
                  <td className="w-14 py-1 text-muted">Dòng {c.dong}</td>
                  <td className="pr-2 font-mono">{c.ma}</td>
                  <td className="pr-2">{c.ten}</td>
                  <td className="text-muted">{c.ma_xa}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
      {changed.length > 0 && (
        <details open className="text-sm">
          <summary className="cursor-pointer font-medium text-warn">Cập nhật ({changed.length}) — giá trị cũ → mới</summary>
          <div className="mt-1 flex flex-col gap-1">
            {changed.map((u) => (
              <div key={u.dong} className="rounded border border-line p-2 text-xs">
                <div className="font-medium"><span className="font-mono">{u.ma}</span> {u.ten}</div>
                {u.changes.map((c) => (
                  <div key={c.field} className="flex flex-wrap gap-1">
                    <span className="text-muted">{c.label}:</span>
                    <span className="text-danger line-through">{show(c.old)}</span>→<b>{show(c.new)}</b>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </details>
      )}
      {deletes.length > 0 && (
        <details open className="text-sm">
          <summary className="cursor-pointer font-medium text-danger">Sẽ xoá ({deletes.length}) — không có trong hồ sơ “thay toàn bộ”</summary>
          <ul className="mt-1 list-inside list-disc text-xs">
            {deletes.map((d) => <li key={d.ma}><span className="font-mono">{d.ma}</span> {d.ten}</li>)}
          </ul>
        </details>
      )}
      {changes.truncated && <p className="text-xs text-muted">Chỉ hiện 300 bản ghi đầu mỗi nhóm.</p>}
    </div>
  );
}

const show = (v) => (v === null || v === undefined || v === '' ? '(trống)' : Array.isArray(v) ? v.join(', ') : typeof v === 'boolean' ? (v ? 'có' : 'không') : String(v));

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
    <div className="h-64 overflow-hidden rounded-lg border border-line">
      <MapContainer center={[22.75, 106.05]} zoom={9} zoomSnap={0.25} className="h-full w-full" scrollWheelZoom={false}>
        <BaseLayer basemap="auto" />
        <FitAll bounds={bounds} />
        {items.filter((i) => i.geometry).map((i) => (
          <GeoJSON key={`g-${i.dong}`} data={i.geometry} style={{ color: color(i.kind), weight: 2, fillOpacity: 0.2 }}>
            <Tooltip>{i.ma} · {i.ten}</Tooltip>
          </GeoJSON>
        ))}
        {items.filter((i) => i.lat != null).map((i) => (
          <CircleMarker key={`p-${i.dong}`} center={[i.lat, i.lon]} radius={7} pathOptions={{ color: '#fff', weight: 2, fillColor: color(i.kind), fillOpacity: 1 }}>
            <Tooltip>{i.kind === 'new' ? 'Thêm mới' : 'Cập nhật'}: {i.ma} · {i.ten}</Tooltip>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}

export function PreviewTable({ rows, title }) {
  const columns = rows.length ? Object.keys(rows[0]) : [];
  if (!columns.length) return null;
  return (
    <details className="text-xs">
      <summary className="cursor-pointer font-medium">{title}</summary>
      <div className="mt-2 max-h-72 overflow-auto rounded-lg border border-line">
        <table className="w-full text-left">
          <thead className="sticky top-0 bg-panel text-muted">
            <tr>{columns.map((c) => <th key={c} className="px-2 py-1 font-mono">{c}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.dong} className="border-t border-line">
                {columns.map((c) => <td key={c} className="whitespace-nowrap px-2 py-1">{show(row[c]) === '(trống)' ? '' : show(row[c])}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export function IssueTable({ title, tone, issues, total }) {
  return (
    <div className={clsx('rounded-lg border p-2 text-xs', tone === 'danger' ? 'border-danger/50 bg-danger/5' : 'border-warn/50 bg-warn/5')}>
      <div className={clsx('mb-1 flex items-center gap-1.5 font-semibold', tone === 'danger' ? 'text-danger' : 'text-warn')}>
        <AlertTriangle size={14} /> {title}
      </div>
      <div className="max-h-60 overflow-auto">
        <table className="w-full text-left">
          <tbody>
            {issues.map((i, k) => (
              <tr key={k} className="border-t border-line/60 align-top">
                <td className="w-16 py-1 pr-2 text-muted">{i.row ? `Dòng ${i.row}` : 'Tệp'}</td>
                <td className="w-28 pr-2 font-mono">{i.field || ''}</td>
                <td>{i.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {total > issues.length && <div className="mt-1 text-muted">… và {total - issues.length} mục khác</div>}
    </div>
  );
}
