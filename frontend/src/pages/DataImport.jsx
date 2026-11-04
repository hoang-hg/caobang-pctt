import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  AlertTriangle, Check, CheckCircle2, ChevronRight, Download, FileSpreadsheet, FileUp, Gauge, Globe2, Inbox, Loader2, PencilLine, Send,
  Upload,
} from 'lucide-react';
import { api, apiDownload, apiUpload } from '../api/client';
import { useUnits } from '../api/hooks';
import { useStore } from '../app/store';
import { BackButton, Empty, ErrorState, Modal, Segmented, Skeleton, Tabs } from '../components/common/ui';
import PageHeader from '../components/common/PageHeader';
import RoleTips from '../components/common/RoleTips';
import { PAGE } from '../components/layout/page';
import { useAllowedCodes, usePermission } from '../rbac/usePermission';
import RecordForm from './DataImportForm';
import Submissions, { IssueList, PreviewTable } from './DataSubmissions';
import DataThresholds from './DataThresholds';
import { cardOf, DATASET_GROUPS, exampleRows, fieldRule, rowLabel } from './dataImportFacts';
import { time } from '../utils/format';
import { useMediaQuery } from '../utils/useMediaQuery';

/**
 * Nhập dữ liệu chính thức — như điền biểu mẫu (thiết kế mục G). Chọn loại bằng thẻ có hình và câu mô tả (?loai=<tên>) →
 * 1. chuẩn bị (tải mẫu Excel có sẵn dòng ví dụ rồi chọn tệp đã điền — máy kiểm tra ngay; hoặc điền trực tiếp từng bản ghi)
 * → 2. kết quả kiểm tra bằng lời, lỗi theo dòng kèm cách sửa, xem trước → 3. "Ghi vào hệ thống" (cấp tỉnh, data.import) /
 * "Gửi tỉnh duyệt" (xã/phường, data.submit — tỉnh duyệt rồi mới ghi, hiển thị). Không ghi gì khi còn lỗi; ghi toàn bộ hoặc
 * không ghi gì (máy chủ). Hồ sơ xã gửi: thẻ bên cạnh (DataSubmissions).
 */
export default function DataImport() {
  const canImport = usePermission('data', 'import', '*');
  const [params, setParams] = useSearchParams();
  const code = params.get('ho-so');
  // ?ho-so=<mã>: mở một hồ sơ; ?tab=ho-so: mở danh sách hồ sơ (liên kết từ trang Hướng dẫn xử lý)
  const [tab, setTab] = useState(
    code || params.get('tab') === 'ho-so' ? 'ho-so' : params.get('tab') === 'nguong' && canImport ? 'nguong' : 'nhap',
  );
  const { data: datasets = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['import-datasets'],
    queryFn: () => api('/data-import/datasets'),
    staleTime: Infinity,
  });
  const { data: subs } = useQuery({
    queryKey: ['submissions', 'counts'],
    queryFn: () => api('/data-import/submissions', { params: { limit: 1 } }),
    refetchInterval: 60_000,
  });
  const pending = subs?.counts?.cho_duyet || 0;
  // Máy tính ≥ 1280 px (bản vẽ desktop khung H): danh sách loại dữ liệu luôn ở cột trái, quy trình nhập của loại đang chọn ở
  // giữa — không phải quay lại lưới thẻ để đổi loại; không tiêu đề trang (gợi ý ở hàng thẻ)
  const desk = useMediaQuery('(min-width: 1280px)');
  const ds = datasets.find((d) => d.name === params.get('loai'));
  // Chọn loại = một mục lịch sử: nút Quay lại của trình duyệt về danh sách thẻ
  const choose = (name) => setParams(name ? { loai: name } : {});
  const open = (c) => {
    setParams(c ? { 'ho-so': c } : {}, { replace: true });
    setTab('ho-so');
  };

  return (
    <div className={clsx(PAGE, 'pb-8')}>
      {desk ? (
        <h1 className="sr-only">{canImport ? 'Nhập dữ liệu' : 'Gửi dữ liệu của xã/phường'}</h1>
      ) : (
        <PageHeader
          tips={<RoleTips page="nhap-du-lieu" />}
          title={canImport ? 'Nhập dữ liệu' : 'Gửi dữ liệu của xã/phường'}
          description={canImport
            ? 'Cập nhật danh sách điểm sơ tán, kho, danh bạ… cho cả tỉnh. Máy kiểm tra từng dòng, hết lỗi mới ghi.'
            : 'Gửi danh sách điểm sơ tán, kho, danh bạ… của xã. Cấp tỉnh duyệt xong mới hiện trên hệ thống.'}
        />
      )}
      <div className={desk ? 'flex items-center gap-2 [&>*:not(:first-child)]:shrink-0' : 'contents'}>
      <Tabs
        value={tab}
        onChange={setTab}
        fit={canImport}
        tabs={[
          { value: 'nhap', label: canImport ? 'Nhập dữ liệu' : 'Gửi dữ liệu', short: canImport ? 'Nhập' : undefined, icon: FileUp },
          { value: 'ho-so', label: canImport ? 'Hồ sơ xã/phường gửi' : 'Hồ sơ đã gửi', short: canImport ? 'Hồ sơ xã gửi' : undefined, icon: Inbox, count: pending || null },
          // Ngưỡng cảnh báo mưa / sạt lở toàn tỉnh: chỉ cấp tỉnh (data.import) — xã không sửa được
          ...(canImport ? [{ value: 'nguong', label: 'Ngưỡng cảnh báo', short: 'Ngưỡng', icon: Gauge }] : []),
        ]}
      />
      {desk && <><span className="flex-1" /><RoleTips page="nhap-du-lieu" compact /></>}
      </div>
      {tab === 'nguong' ? (
        <DataThresholds />
      ) : tab === 'ho-so' ? (
        <Submissions canImport={canImport} code={code} onOpen={open} datasets={datasets} onResend={(name) => { setParams({ loai: name }); setTab('nhap'); }} />
      ) : isLoading ? (
        <Skeleton height={320} />
      ) : isError ? (
        <ErrorState onRetry={refetch}>Không tải được danh sách loại dữ liệu</ErrorState>
      ) : desk ? (
        <div className={clsx('grid items-start gap-5', canImport ? 'grid-cols-[280px_minmax(0,1fr)_300px]' : 'grid-cols-[280px_minmax(0,1fr)]')}>
          <DatasetNav datasets={datasets} submitMode={!canImport} current={ds?.name} onPick={choose} />
          {ds ? (
            <DatasetPanel key={ds.name} ds={ds} submitMode={!canImport} onBack={() => choose(null)} onSubmitted={open} />
          ) : (
            <div className="sheet flex min-h-[320px] flex-col items-center justify-center gap-2 p-8 text-center">
              <FileUp size={28} className="text-accent" aria-hidden="true" />
              <p className="font-semibold text-ink">Chọn loại dữ liệu ở cột bên trái</p>
              <p className="max-w-md text-sm text-ink-2">
                {canImport
                  ? 'Tải tệp mẫu, điền rồi chọn tệp (hoặc điền trực tiếp) — máy kiểm tra từng dòng, hết lỗi mới ghi vào hệ thống.'
                  : 'Tải tệp mẫu, điền rồi chọn tệp (hoặc điền trực tiếp) — cấp tỉnh duyệt xong mới hiện trên hệ thống.'}
              </p>
            </div>
          )}
          {canImport && <PendingColumn onOpen={open} />}
        </div>
      ) : ds ? (
        <DatasetPanel key={ds.name} ds={ds} submitMode={!canImport} onBack={() => choose(null)} onSubmitted={open} />
      ) : (
        <DatasetChooser datasets={datasets} submitMode={!canImport} onPick={choose} />
      )}
    </div>
  );
}

/** Bước 0: chọn loại dữ liệu — thẻ có hình, câu mô tả, nhóm theo cụm dữ liệu điều hành. */
function DatasetChooser({ datasets, submitMode, onPick }) {
  const known = new Set(DATASET_GROUPS.flatMap((g) => g.names));
  const groups = [
    ...DATASET_GROUPS.map((g) => ({ ...g, items: g.names.map((n) => datasets.find((d) => d.name === n)).filter(Boolean) })),
    { key: 'khac', title: 'Loại khác', items: datasets.filter((d) => !known.has(d.name)) },
  ].filter((g) => g.items.length);
  return (
    <nav aria-label="Loại dữ liệu" className="flex flex-col gap-4">
      <h2 className="text-base font-semibold">{submitMode ? 'Xã bạn muốn gửi danh sách nào?' : 'Bạn muốn cập nhật danh sách nào?'}</h2>
      {groups.map((g) => (
        <section key={g.key} aria-labelledby={`nhom-du-lieu-${g.key}`}>
          <h3 id={`nhom-du-lieu-${g.key}`} className="mb-2 text-sm font-semibold text-ink-2">{g.title}</h3>
          <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {g.items.map((d) => {
              const c = cardOf(d);
              return (
                <li key={d.name}>
                  <button
                    type="button"
                    onClick={() => onPick(d.name)}
                    className="card tap flex h-full w-full items-start gap-3 p-3 text-left transition-colors hover:border-accent"
                  >
                    <span className="icon-tile mt-0.5 h-11 w-11" aria-hidden="true"><c.icon size={22} strokeWidth={1.75} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-ink">{d.label}</span>
                      <span className="mt-0.5 block text-sm text-ink-2">{c.hint}</span>
                      {(d.public || d.geometry === 'polygon') && (
                        <span className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted">
                          {d.public && <span className="inline-flex items-center gap-1"><Globe2 size={12} aria-hidden="true" /> Hiện cho người dân</span>}
                          {d.geometry === 'polygon' && <span>Vùng trên bản đồ (tệp GeoJSON)</span>}
                        </span>
                      )}
                    </span>
                    <ChevronRight size={18} className="mt-1 shrink-0 text-muted" aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </nav>
  );
}

/**
 * Cột phải "Hồ sơ xã gửi chờ duyệt" (máy tính ≥ 1280 px, bản vẽ khung H — chỉ cấp tỉnh): tối đa 5 hồ sơ cũ nhất trước, mỗi hồ sơ
 * một nút "Xem & duyệt" mở thẳng hồ sơ (duyệt / trả lại ở màn hồ sơ — phải xem dữ liệu trước). Cùng khoá truy vấn với thẻ "Hồ sơ
 * xã/phường gửi" (không gọi thêm).
 */
function PendingColumn({ onOpen }) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['submissions', 'cho_duyet'],
    queryFn: () => api('/data-import/submissions', { params: { status: 'cho_duyet', limit: 100 } }),
    refetchInterval: 30_000,
  });
  const items = data?.items || [];
  return (
    <aside aria-label="Hồ sơ xã gửi chờ duyệt" className="sheet sticky top-0 flex flex-col gap-3 p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[15px] font-bold text-ink">Hồ sơ xã gửi chờ duyệt</h2>
        {items.length > 0 && <span className="num chip bg-panel2 text-ink-2">{items.length}</span>}
      </div>
      {isLoading ? <Skeleton height={120} /> : isError ? (
        <ErrorState onRetry={refetch}>Không tải được hồ sơ chờ duyệt</ErrorState>
      ) : items.length ? (
        <ul className="flex flex-col gap-2">
          {items.slice(0, 5).map((x) => (
            <li key={x.code} className="flex flex-col gap-2 rounded-[14px] bg-panel2 p-3.5">
              <b className="text-sm leading-snug text-ink">{x.dataset_label} — {x.admin_names}</b>
              <span className="text-xs text-muted">{x.submitted_by_name} · {x.code}{x.summary ? ` · ${x.summary.creates ?? 0} mới, ${x.summary.updates ?? 0} sửa` : ''}</span>
              <button type="button" onClick={() => onOpen(x.code)} className="btn-primary tap h-10 self-start rounded-xl px-4 text-sm">
                Xem & duyệt <ChevronRight size={15} aria-hidden="true" />
              </button>
            </li>
          ))}
          {items.length > 5 && <li className="text-xs text-muted">… và {items.length - 5} hồ sơ khác ở thẻ "Hồ sơ xã/phường gửi"</li>}
        </ul>
      ) : (
        <p className="text-sm text-muted">Không có hồ sơ nào chờ duyệt.</p>
      )}
      <p className="rounded-[14px] border border-dashed border-line p-3 text-[13px] leading-normal text-ink-2">
        Xã/phường gửi dữ liệu → nằm chờ ở đây, chưa ghi vào hệ thống cho tới khi cấp tỉnh duyệt.
      </p>
    </aside>
  );
}

/** Máy tính ≥ 1280 px (bản vẽ khung H): danh sách loại dữ liệu dạng cột trái, nhóm theo cụm; loại đang chọn tô màu nhấn. */
function DatasetNav({ datasets, submitMode, current, onPick }) {
  const known = new Set(DATASET_GROUPS.flatMap((g) => g.names));
  const groups = [
    ...DATASET_GROUPS.map((g) => ({ ...g, items: g.names.map((n) => datasets.find((d) => d.name === n)).filter(Boolean) })),
    { key: 'khac', title: 'Loại khác', items: datasets.filter((d) => !known.has(d.name)) },
  ].filter((g) => g.items.length);
  return (
    <nav aria-label="Loại dữ liệu" className="sheet sticky top-0 flex flex-col gap-3 p-5">
      <h2 className="text-[15px] font-bold leading-snug text-ink">{submitMode ? 'Xã bạn muốn gửi danh sách nào?' : 'Bạn muốn cập nhật danh sách nào?'}</h2>
      {groups.map((g) => (
        <section key={g.key} aria-labelledby={`nhom-loai-${g.key}`}>
          <h3 id={`nhom-loai-${g.key}`} className="mb-1 text-xs font-bold text-muted">{g.title}</h3>
          <ul className="flex flex-col gap-0.5">
            {g.items.map((d) => (
              <li key={d.name}>
                <button
                  type="button"
                  onClick={() => onPick(d.name)}
                  aria-current={current === d.name ? 'true' : undefined}
                  title={cardOf(d).hint}
                  className={clsx(
                    'tap flex min-h-[40px] w-full items-center gap-2 rounded-xl px-3 text-left text-sm transition-colors',
                    current === d.name ? 'bg-accent/10 font-semibold text-accent' : 'text-ink-2 hover:bg-panel2 hover:text-ink',
                  )}
                >
                  <span className="min-w-0 flex-1">{d.label}</span>
                  {d.public && <Globe2 size={13} className="shrink-0 text-muted" aria-label="Hiện cho người dân" />}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </nav>
  );
}

/** Một bước của quy trình: số thứ tự + tên bước; xong → dấu ✓. */
function Step({ n, title, done, plain = false, children }) {
  if (plain) return <section className="flex min-w-0 flex-col gap-3" aria-label={`Bước ${n}: ${title}`}>{children}</section>;
  return (
    <section className="flex min-w-0 flex-col gap-3 border-t border-line pt-4" aria-label={`Bước ${n}: ${title}`}>
      <h3 className="flex items-center gap-2 font-semibold">
        <span
          className={clsx('flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold', done ? 'bg-good/15 text-good' : 'bg-accent text-white')}
          aria-hidden="true"
        >
          {done ? <Check size={14} /> : n}
        </span>
        {title}
      </h3>
      {children}
    </section>
  );
}

const kb = (n) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

/** Dải 3 bước (bản vẽ khung H1): bước đã xong có dấu tích, dòng dưới là tệp đang dùng. */
function StepStrip({ steps }) {
  return (
    <ol className="grid grid-cols-3 gap-2.5" aria-label="Các bước nhập">
      {steps.map((s, i) => (
        <li key={s.title} className="flex items-center gap-2.5 rounded-[14px] bg-panel2 px-3 py-3">
          <span className={clsx('flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-bold', s.done ? 'bg-good text-white' : 'bg-accent text-white')} aria-hidden="true">
            {s.done ? <Check size={15} /> : i + 1}
          </span>
          <span className="min-w-0">
            <b className="block text-sm leading-snug text-ink">{s.title}</b>
            <span className="block truncate text-xs text-ink-2" title={s.note}>{s.note}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

/** Hộp "Tệp mẫu" (bản vẽ khung H2): tải mẫu, các cột và cách ghi. Lúc chưa chọn loại này không mở được. */
function TemplateModal({ ds, noun, polygon, onDownload, onForm, onClose }) {
  return (
    <Modal open wide onClose={onClose} title={`Tệp mẫu — ${ds.label}`} subtitle="Các cột phải có và cách điền" footer={<button type="button" className="btn-secondary" onClick={onClose}>Đóng</button>}>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button type="button" className="btn-primary" onClick={onDownload}><Download size={15} aria-hidden="true" /> {polygon ? 'Tải tệp mẫu (GeoJSON)' : 'Tải mẫu Excel'}</button>
          <button type="button" className="btn-secondary" onClick={onForm}>Hoặc {polygon ? 'vẽ' : 'điền'} trực tiếp trên web <ChevronRight size={15} aria-hidden="true" /></button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-xs text-ink-2">
              <tr><th className="px-3 py-2 font-bold">Cột</th><th className="px-3 py-2 font-bold">Ý nghĩa</th><th className="px-3 py-2"><span className="sr-only">Bắt buộc</span></th><th className="px-3 py-2 font-bold">Cách ghi</th></tr>
            </thead>
            <tbody>
              {ds.fields.map((f) => (
                <tr key={f.name} className="border-t border-line align-top">
                  <td className="px-3 py-2 font-mono text-[13px] font-semibold text-ink">{f.name}</td>
                  <td className="px-3 py-2 text-ink">{f.label}</td>
                  <td className="px-3 py-2"><span className={clsx('chip whitespace-nowrap px-2 py-0 text-xs font-semibold', f.required ? 'bg-accent/10 text-accent' : 'bg-panel2 text-ink-2')}>{f.required ? 'Bắt buộc' : 'Không bắt buộc'}</span></td>
                  <td className="px-3 py-2 text-ink-2">{fieldRule(f)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="rounded-[14px] border border-dashed border-line p-3 text-[13px] leading-normal text-ink-2">
          {polygon
            ? 'Tệp mẫu có sẵn một vùng ví dụ.'
            : `Có sẵn một dòng ví dụ: điền đè lên, mỗi dòng một ${noun}; lưu lại dạng .xlsx hoặc .csv đều được. Còn sót dòng ví dụ thì máy sẽ nhắc.`}
        </p>
        <p className="rounded-[14px] bg-panel2 p-3 text-[13px] leading-normal text-ink-2">
          Tên cột viết có dấu cũng được. Ghi trùng mã: sửa {noun} đang có, không tạo thêm.
        </p>
      </div>
    </Modal>
  );
}

function DatasetPanel({ ds, submitMode, onBack, onSubmitted }) {
  const desk = useMediaQuery('(min-width: 1280px)'); // bản vẽ khung H1: dải 3 bước, tệp mẫu trong hộp riêng
  const navigate = useNavigate();
  const [tplOpen, setTplOpen] = useState(false);
  const toast = useStore((s) => s.toast);
  const qc = useQueryClient();
  const c = cardOf(ds);
  const polygon = ds.geometry === 'polygon';
  const [method, setMethod] = useState('file'); // file | form
  const [file, setFile] = useState(null);
  const [drag, setDrag] = useState(false);
  const [mode, setMode] = useState('upsert');
  const [report, setReport] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [note, setNote] = useState('');
  // Xã/phường được chọn trong form: hồ sơ của xã chỉ các xã mình phụ trách; cấp tỉnh: mọi xã
  const { data: units = [] } = useUnits();
  const allowed = useAllowedCodes('data', submitMode ? 'submit' : 'import');
  const communes = useMemo(
    () => units.filter((u) => !allowed || allowed.includes(u.code)).sort((a, b) => a.name.localeCompare(b.name, 'vi')),
    [units, allowed],
  );
  const viaForm = method === 'form';
  const label = (row) => rowLabel(row, { viaForm, polygon, geojson: !viaForm && /\.geojson$/i.test(file?.name || '') });
  const unit = viaForm ? 'bản ghi' : polygon ? 'mục' : 'dòng';

  const clear = () => { setReport(null); setResult(null); setConfirmed(false); };
  const form = (f, m) => {
    const fd = new FormData();
    fd.append('file', f);
    fd.append('mode', m);
    return fd;
  };
  const check = async (f = file, m = mode) => {
    if (!f) return;
    setBusy('validate');
    clear();
    try {
      setReport(await apiUpload(`/data-import/datasets/${ds.name}/validate`, form(f, m)));
    } catch (e) {
      toast({ tone: 'danger', title: 'Không đọc được dữ liệu', body: e.message, duration: 9000 });
    } finally {
      setBusy('');
    }
  };
  // Chọn / kéo thả tệp → máy kiểm tra ngay (không phải bấm thêm nút)
  const pickFile = (f) => {
    if (!f) return;
    setFile(f);
    check(f);
  };
  const apply = async () => {
    setBusy('apply');
    try {
      const res = await apiUpload(`/data-import/datasets/${ds.name}/apply`, form(file, mode));
      setReport(res.report);
      setResult(res.result);
      qc.invalidateQueries();
      toast({
        tone: 'good',
        title: `Đã ghi ${ds.label.toLowerCase()} vào hệ thống`,
        body: `${res.result.created} mới · ${res.result.updated} cập nhật · ${res.result.deleted} xoá`,
      });
    } catch (e) {
      if (e.data?.report) setReport(e.data.report);
      toast({ tone: 'danger', title: 'Chưa ghi được', body: e.message, duration: 9000 });
    } finally {
      setBusy('');
    }
  };
  const submit = async () => {
    setBusy('submit');
    try {
      const fd = form(file, mode);
      fd.append('name', ds.name);
      if (note.trim()) fd.append('note', note.trim());
      const res = await apiUpload('/data-import/submissions', fd);
      qc.invalidateQueries({ queryKey: ['submissions'] });
      toast({ tone: 'good', title: `Đã gửi hồ sơ ${res.code}`, body: 'Chờ cấp tỉnh duyệt — duyệt xong dữ liệu mới hiện trên hệ thống.' });
      onSubmitted(res.code);
    } catch (e) {
      if (e.data?.report) setReport(e.data.report);
      toast({ tone: 'danger', title: 'Chưa gửi được', body: e.message, duration: 9000 });
    } finally {
      setBusy('');
    }
  };
  const again = () => { clear(); setFile(null); setNote(''); };
  const destructive = mode === 'replace' && report?.deletes > 0;
  const ready = report?.ok && !result && (!destructive || confirmed) && !busy;
  const changes = report ? changeWords(report) : '';
  const download = () => apiDownload(`/data-import/datasets/${ds.name}/template`, `mau_${ds.name}`).catch((e) =>
    toast({ tone: 'danger', title: 'Không tải được tệp mẫu', body: e.message }));
  const located = polygon || ds.fields.some((f) => f.name === 'vi_do');

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {!desk && <BackButton onClick={onBack} className="self-start">Chọn loại khác</BackButton>}
      <section className="card flex min-w-0 flex-col gap-4 p-4">
        <div className="flex items-start gap-3">
          {!desk && <span className="icon-tile mt-0.5 h-11 w-11" aria-hidden="true"><c.icon size={22} strokeWidth={1.75} /></span>}
          <div className="min-w-0 flex-1">
            <h2 className="flex flex-wrap items-center gap-2 text-lg font-semibold leading-tight">
              {submitMode ? `Gửi ${ds.label.toLowerCase()}` : ds.label}
              {desk && ds.public && <span className="chip bg-accent/10 px-2 py-0 text-xs font-semibold text-accent">Hiện cho người dân</span>}
            </h2>
            <p className="mt-0.5 text-sm text-ink-2">{c.hint}</p>
            <details className="mt-1 text-sm">
              <summary className="tap cursor-pointer text-accent">Lưu ý khi nhập loại này</summary>
              <p className="mt-1 text-ink-2">{ds.description}</p>
              {ds.update_only && <p className="mt-1 text-ink-2">Chỉ cập nhật những {c.noun} đã có — không thêm mới.</p>}
              {ds.public && <p className="mt-1 text-ink-2">Dữ liệu này hiện cho người dân trên cổng thông tin sau khi ghi.</p>}
            </details>
          </div>
          {desk && <button type="button" className="btn-secondary tap h-11 shrink-0 rounded-xl px-4" onClick={() => setTplOpen(true)}>Tải tệp mẫu</button>}
        </div>

        {desk && (
          <StepStrip steps={[
            { title: 'Tải tệp mẫu', note: polygon ? 'Tệp GeoJSON có sẵn vùng ví dụ' : 'Excel, CSV có sẵn cột', done: !!file || viaForm },
            { title: 'Chọn tệp hoặc điền trực tiếp', note: file ? `${viaForm ? 'Điền trực tiếp' : file.name}${report ? ` · ${report.total} ${unit}` : ''}` : 'Chưa có dữ liệu', done: !!report },
            { title: 'Máy kiểm tra từng dòng', note: submitMode ? 'Hết lỗi mới gửi tỉnh duyệt' : 'Hết lỗi mới ghi', done: !!report?.ok },
          ]} />
        )}
        {tplOpen && <TemplateModal ds={ds} noun={c.noun} polygon={polygon} onDownload={download} onClose={() => setTplOpen(false)} onForm={() => { setTplOpen(false); setMethod('form'); setFile(null); clear(); }} />}

        <Step n={1} title="Chuẩn bị dữ liệu" done={!!report} plain={desk}>
          <Segmented
            label="Cách nhập"
            touch
            className="self-start"
            value={method}
            onChange={(m) => { setMethod(m); setFile(null); clear(); }}
            options={[
              { value: 'file', label: polygon ? 'Tải tệp bản đồ lên' : 'Dùng tệp mẫu Excel', short: 'Tệp mẫu', icon: FileSpreadsheet },
              { value: 'form', label: polygon ? 'Vẽ trực tiếp trên web' : 'Điền trực tiếp trên web', short: polygon ? 'Vẽ trực tiếp' : 'Điền trực tiếp', icon: PencilLine },
            ]}
          />
          <p className="text-sm text-ink-2">
            {viaForm
              ? `Hợp khi chỉ có vài ${c.noun}, dùng được cả trên điện thoại: điền từng ô, ${polygon ? 'vẽ vùng' : 'chọn vị trí'} trên bản đồ.`
              : polygon
                ? 'Vùng chỉ nhận tệp bản đồ GeoJSON (xuất từ QGIS, ArcGIS…). Ít vùng: chọn "Vẽ trực tiếp trên web".'
                : `Hợp khi có nhiều ${c.noun}: tải tệp mẫu, điền bằng Excel trên máy tính rồi chọn tệp để tải lên.`}
          </p>

          {ds.replaceable && (
            <fieldset className="flex flex-col gap-1.5 text-sm">
              <legend className="mb-1 font-medium">Danh sách đang có trong hệ thống</legend>
              <label className="tap flex items-start gap-2">
                <input type="radio" name="mode" className="mt-1" checked={mode === 'upsert'} onChange={() => { setMode('upsert'); if (file && !viaForm) check(file, 'upsert'); else clear(); }} />
                <span><b>Giữ lại</b> — thêm {c.noun} mới, sửa {c.noun} trùng mã; {c.noun} không có trong {viaForm ? 'form' : 'tệp'} giữ nguyên</span>
              </label>
              <label className="tap flex items-start gap-2">
                <input type="radio" name="mode" className="mt-1" checked={mode === 'replace'} onChange={() => { setMode('replace'); if (file && !viaForm) check(file, 'replace'); else clear(); }} />
                <span><b>Thay toàn bộ{submitMode ? ' của xã' : ''}</b> — xoá {c.noun} không có trong {viaForm ? 'form' : 'tệp'}{submitMode ? ' khi tỉnh duyệt' : ''}</span>
              </label>
            </fieldset>
          )}

          {viaForm ? (
            <RecordForm ds={ds} noun={c.noun} communes={communes} onReady={(f) => { setFile(f); check(f); }} />
          ) : (
            <div className="flex flex-col gap-3">
              {!desk && (
                <>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <button type="button" className="btn-secondary" onClick={download}>
                      <Download size={15} /> {polygon ? 'Tải tệp mẫu (GeoJSON)' : 'Tải mẫu Excel'}
                    </button>
                    <span className="text-sm text-ink-2">
                      {polygon
                        ? 'Tệp mẫu có sẵn một vùng ví dụ.'
                        : `Có sẵn một dòng ví dụ: điền đè lên, mỗi dòng một ${c.noun}; lưu lại dạng .xlsx hoặc .csv đều được.`}
                    </span>
                  </div>
                  <ColumnsTable ds={ds} />
                </>
              )}
              <label
                className={clsx(
                  'flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed px-4 py-5 text-center text-sm transition-colors focus-within:border-accent hover:border-accent',
                  drag ? 'border-accent bg-accent/5' : 'border-line',
                )}
                onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
                onDragLeave={() => setDrag(false)}
                onDrop={(e) => { e.preventDefault(); setDrag(false); pickFile(e.dataTransfer.files?.[0]); }}
              >
                {busy === 'validate' ? <Loader2 size={22} className="animate-spin text-accent" aria-hidden="true" /> : <Upload size={22} className="text-accent" aria-hidden="true" />}
                {file ? (
                  <>
                    <b className="break-all">{file.name}</b>
                    <span className="text-xs text-muted">{busy === 'validate' ? 'Đang kiểm tra…' : `${kb(file.size)} · bấm để chọn tệp khác (sửa xong tệp thì chọn lại)`}</span>
                  </>
                ) : (
                  <>
                    <b>Chọn tệp đã điền</b>
                    <span className="text-xs text-muted">hoặc kéo thả tệp vào đây · nhận {ds.formats.join(', ')} · máy kiểm tra ngay</span>
                  </>
                )}
                <input
                  type="file"
                  className="sr-only"
                  aria-label="Tệp dữ liệu đã điền"
                  accept={ds.formats.join(',')}
                  // Xoá giá trị sau khi đọc: sửa tệp rồi chọn lại đúng tệp đó vẫn kiểm tra lại được
                  onChange={(e) => { pickFile(e.target.files?.[0]); e.target.value = ''; }}
                />
              </label>
            </div>
          )}
        </Step>

        {report && (
          <Step n={2} title="Kết quả kiểm tra" done={report.ok} plain={desk}>
            <ReportView report={report} ds={ds} label={label} unit={unit} viaForm={viaForm} />
          </Step>
        )}

        {report?.ok && !result && (
          <Step n={3} title={submitMode ? 'Gửi tỉnh duyệt' : 'Ghi vào hệ thống'} plain={desk}>
            {submitMode && (
              <label className="flex flex-col gap-1 text-sm">
                Ghi chú gửi cấp tỉnh (không bắt buộc)
                <textarea className="input min-h-[56px]" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)}
                  placeholder="VD: Cập nhật theo phương án ứng phó năm 2026 của UBND xã" />
              </label>
            )}
            <p className="text-sm text-ink-2">
              {submitMode
                ? <>Bấm <b>Gửi tỉnh duyệt</b>: hồ sơ chờ cấp tỉnh xem lại — duyệt xong {changes} mới được ghi{ds.public ? ' và hiện cho người dân' : ''}.</>
                : <>Bấm <b>Ghi vào hệ thống</b>: {changes} được ghi ngay{ds.public ? ', hiện cho người dân trên cổng thông tin' : ''}. Ghi tất cả hoặc không ghi gì; nhật ký ghi lại người nhập.</>}
            </p>
            {destructive && (
              <label className="tap flex items-start gap-2 text-sm font-medium text-danger">
                <input type="checkbox" className="mt-1" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
                Tôi hiểu {report.deletes} {c.noun} đang có sẽ bị xoá{submitMode ? ' khi tỉnh duyệt' : ''}
              </label>
            )}
            <div>
              {submitMode ? (
                <button className={destructive ? 'btn-danger' : 'btn-primary'} disabled={!ready} onClick={submit}>
                  {busy === 'submit' ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Gửi tỉnh duyệt
                </button>
              ) : (
                <button className={destructive ? 'btn-danger' : 'btn-primary'} disabled={!ready} onClick={apply}>
                  {busy === 'apply' ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />} Ghi vào hệ thống
                </button>
              )}
            </div>
          </Step>
        )}

        {/* Bản vẽ khung H4: hộp "Ghi xong" — ba số thật từ máy chủ; đóng hộp là nhập tiếp được */}
        {result && (
          <Modal
            open
            size="md"
            onClose={again}
            title="Ghi xong"
            subtitle="Nhật ký đã ghi lại người nhập và giờ nhập"
            footer={
              <>
                {located && <button type="button" className="btn-secondary mr-auto" onClick={() => navigate('/ban-do')}>Xem trên bản đồ <ChevronRight size={15} aria-hidden="true" /></button>}
                <button type="button" className="btn-secondary" onClick={onBack}>Nhập loại khác</button>
                <button type="button" className="btn-primary" onClick={again}>Xong</button>
              </>
            }
          >
            <div className="flex flex-col gap-3" role="status">
              <div className="flex items-center gap-3">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-good/15 text-good" aria-hidden="true"><Check size={24} /></span>
                <div className="min-w-0">
                  <b className="block text-lg leading-snug text-ink">Đã ghi {ds.label.toLowerCase()} vào hệ thống</b>
                  <span className="text-sm text-ink-2">{time(Date.now())} · ghi trong một lần, không dòng nào dở dang</span>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2.5">
                {[['Thêm mới', result.created], ['Cập nhật', result.updated], ['Xoá', result.deleted]].map(([k, v]) => (
                  <div key={k} className="rounded-[14px] border border-line px-3 py-2.5">
                    <div className="text-[13px] font-semibold text-ink">{k}</div>
                    <div className="num mt-0.5 text-2xl font-bold text-ink">{v} <span className="font-sans text-[13px] font-normal text-ink-2">{c.noun}</span></div>
                  </div>
                ))}
              </div>
              {ds.public && <p className="rounded-[14px] bg-panel2 p-3 text-[13px] leading-normal text-ink-2">Dữ liệu này hiện cho người dân trên cổng thông tin.</p>}
            </div>
          </Modal>
        )}
      </section>
    </div>
  );
}

/** "2 mới, 1 cập nhật, 3 sẽ bị xoá" — số thay đổi bằng lời. */
const changeWords = (r) => [
  r.creates && `${r.creates} mới`,
  r.updates && `${r.updates} cập nhật`,
  r.deletes && `${r.deletes} sẽ bị xoá`,
].filter(Boolean).join(', ') || 'không có gì thay đổi';

/** Các cột của tệp: tên thông tin trước, tên cột trong tệp (chữ nhỏ), cách ghi. */
function ColumnsTable({ ds }) {
  return (
    <details className="rounded-lg bg-panel2 p-2 text-sm">
      <summary className="tap cursor-pointer font-medium">Các cột trong tệp ({ds.fields.length}) — tên cột viết có dấu cũng được</summary>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[520px] text-left text-xs">
          <thead className="text-muted">
            <tr><th className="py-1 pr-2">Thông tin</th><th className="pr-2">Tên cột</th><th className="pr-2">Cách ghi</th></tr>
          </thead>
          <tbody>
            {ds.fields.map((f) => (
              <tr key={f.name} className="border-t border-line align-top">
                <td className="py-1 pr-2 text-ink">
                  {f.label}
                  {f.required && <b className="ml-1 whitespace-nowrap font-semibold text-danger">bắt buộc</b>}
                </td>
                <td className="pr-2 font-mono text-ink-2">{f.name}</td>
                <td className="pr-2 text-ink-2">{fieldRule(f)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

/** Kết quả kiểm tra bằng lời: không lỗi / còn lỗi ở bao nhiêu dòng; lỗi theo dòng kèm cách sửa; xem trước. */
function ReportView({ report, ds, label, unit, viaForm }) {
  const bad = report.total - report.valid;
  const leftover = exampleRows(ds, report.preview);
  const desk = useMediaQuery('(min-width: 1280px)');
  const pill = 'inline-flex items-center gap-2 rounded-full border border-line bg-panel px-3.5 py-2 text-sm text-ink';
  return (
    <div className="flex flex-col gap-3">
      {desk && report.total > 0 && (
        <div className="flex flex-wrap gap-2">
          <span className={pill}><span className="h-2 w-2 rounded-full bg-good" aria-hidden="true" /><b className="num">{report.valid}</b> {unit} hợp lệ</span>
          {bad > 0 && <span className={pill}><span className="h-2 w-2 rounded-full bg-danger" aria-hidden="true" /><b className="num">{bad}</b> {unit} lỗi</span>}
          <span className={pill}>{changeWords(report)}</span>
        </div>
      )}
      {report.ok ? (
        <p className="flex items-start gap-2 rounded-lg bg-good/10 p-3 text-sm" role="status">
          <CheckCircle2 size={18} className="mt-px shrink-0 text-good" aria-hidden="true" />
          <span><b>Không có lỗi.</b> {report.total} {unit} hợp lệ — {changeWords(report)}.</span>
        </p>
      ) : (
        <p className="flex items-start gap-2 rounded-lg bg-warn/10 p-3 text-sm" role="status">
          <AlertTriangle size={18} className="mt-px shrink-0 text-warn" aria-hidden="true" />
          <span>
            <b>Còn {report.error_count} lỗi{bad > 0 ? ` ở ${bad} ${unit}` : ''}.</b>{' '}
            {viaForm ? 'Sửa các ô báo lỗi rồi bấm "Kiểm tra dữ liệu" lại.' : 'Sửa trong tệp, lưu lại rồi chọn lại tệp — máy kiểm tra lại ngay.'}{' '}
            Chưa có gì được ghi vào hệ thống.
          </span>
        </p>
      )}
      {report.error_count > 0 && (
        <IssueList title="Lỗi cần sửa" tone="error" issues={report.errors} total={report.error_count} ds={ds} label={label} viaForm={viaForm} />
      )}
      {(report.warning_count > 0 || leftover.length > 0) && (
        <IssueList
          title="Lưu ý (không chặn việc ghi)"
          issues={[
            ...leftover.map((row) => ({ row, field: null, message: 'Còn nguyên dòng ví dụ của tệp mẫu — xoá dòng này nếu không phải dữ liệu thật.' })),
            ...(report.warnings || []),
          ]}
          total={report.warning_count + leftover.length}
          ds={ds}
          label={label}
          viaForm={viaForm}
        />
      )}
      {report.preview.length > 0 && (
        <PreviewTable rows={report.preview} ds={ds} title={`Xem trước ${report.preview.length} ${unit} đầu (giá trị máy đã đọc được)`} />
      )}
      {!report.total && <Empty>Tệp không có {unit} dữ liệu nào — kiểm tra lại tệp đã điền.</Empty>}
    </div>
  );
}
