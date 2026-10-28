import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { AlertTriangle, CheckCircle2, CloudRain, Mountain, RotateCcw, Save } from 'lucide-react';
import { api } from '../api/client';
import { useStore } from '../app/store';
import { Confirm, ErrorState, Section, Skeleton } from '../components/common/ui';
import { dateTime } from '../utils/format';
import { RISK } from '../utils/risk';

const LV = [
  ['vang', 'Vàng', RISK[1]],
  ['cam', 'Cam', RISK[2]],
  ['do', 'Đỏ', RISK[3]],
];

const toForm = (t) => ({
  mua_24h: { ...t.mua_24h },
  he_so_a: { ...t.sat_lo.he_so_a },
  mua_72h: { ...t.sat_lo.mua_72h },
  nghieng_do: { ...t.sat_lo.nghieng_do },
  so_mu_b: t.sat_lo.so_mu_b,
  nguon: t.nguon || '',
});
const toBody = (f) => {
  const n = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v === '' ? null : Number(v)]));
  return {
    mua_24h: n(f.mua_24h),
    sat_lo: { he_so_a: n(f.he_so_a), mua_72h: n(f.mua_72h), nghieng_do: n(f.nghieng_do), so_mu_b: f.so_mu_b === '' ? null : Number(f.so_mu_b) },
    nguon: f.nguon,
  };
};

/** Một hàng ngưỡng Vàng / Cam / Đỏ (nhãn gắn ô — trình đọc màn hình đọc "Mưa 24 giờ, mức Vàng"). */
function LevelRow({ id, label, unit, value, onChange, levels = LV, step = 'any' }) {
  return (
    <fieldset className="grid gap-1.5">
      <legend className="mb-1 text-xs font-semibold text-ink-2">{label}</legend>
      <div className="grid grid-cols-3 gap-2">
        {levels.map(([k, name, r]) => (
          <div key={k}>
            <label htmlFor={`${id}-${k}`} className="mb-0.5 flex items-center gap-1 text-[11px] font-semibold text-muted">
              <span className={clsx('h-2.5 w-2.5 rounded-full', r.fill)} aria-hidden="true" /> {name}
            </label>
            <div className="relative">
              <input
                id={`${id}-${k}`}
                type="number"
                inputMode="decimal"
                step={step}
                min="0"
                className="input tap num pr-12"
                value={value[k] ?? ''}
                onChange={(e) => onChange({ ...value, [k]: e.target.value })}
                aria-label={`${label}, mức ${name}`}
              />
              <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-muted">{unit}</span>
            </div>
          </div>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * Ngưỡng cảnh báo mưa lớn & sạt lở toàn tỉnh (backend services/thresholds.py) — chỉ cấp tỉnh (data.import) sửa. Bắt buộc ghi
 * căn cứ; lưu xong mọi màn tô màu mưa, xếp mức sạt lở theo ngưỡng mới (sự kiện thresholds.updated), nhật ký pháp lý ghi
 * giá trị trước / sau.
 */
export default function DataThresholds() {
  const qc = useQueryClient();
  const toast = useStore((s) => s.toast);
  const q = useQuery({ queryKey: ['thresholds'], queryFn: () => api('/data-import/thresholds') });
  const [form, setForm] = useState(null);
  const [errors, setErrors] = useState([]);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!q.data) {
    return q.isError ? <ErrorState onRetry={q.refetch}>Không tải được ngưỡng cảnh báo</ErrorState> : <Skeleton height={420} />;
  }
  const t = q.data;
  const f = form || toForm(t);
  const set = (k) => (v) => setForm({ ...f, [k]: v });

  const save = async () => {
    setBusy(true);
    try {
      await api('/data-import/thresholds', { method: 'PUT', body: toBody(f) });
      setAsking(false);
      setErrors([]);
      setForm(null);
      await qc.invalidateQueries();
      toast({ tone: 'good', title: 'Đã áp dụng ngưỡng mới', body: 'Màu mưa và mức sạt lở ở mọi màn hình tính lại theo ngưỡng này.' });
    } catch (e) {
      setAsking(false);
      setErrors(String(e.message || 'Chưa lưu được').split('; '));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-4">
      <div
        className={clsx(
          'flex items-start gap-2 rounded-xl border p-3 text-sm',
          t.minh_hoa ? 'border-warn/40 bg-warn/10' : 'border-line bg-panel',
        )}
      >
        {t.minh_hoa
          ? <AlertTriangle size={18} className="mt-0.5 shrink-0 text-warn" aria-hidden="true" />
          : <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-good" aria-hidden="true" />}
        <div className="min-w-0 leading-relaxed">
          {t.minh_hoa ? (
            <>
              <b>Đang dùng ngưỡng minh hoạ</b> — chưa hiệu chỉnh theo số liệu của tỉnh. Biểu đồ sạt lở ghi rõ "đường minh hoạ".
              Khi có văn bản / nghiên cứu (Đài KTTV, Viện Địa chất, Sở NN&MT), nhập ngưỡng và căn cứ dưới đây.
            </>
          ) : (
            <>
              Ngưỡng đang dùng theo: <b>{t.nguon}</b>
              <span className="text-muted"> — cập nhật {dateTime(t.cap_nhat)}{t.nguoi_cap_nhat ? ` bởi ${t.nguoi_cap_nhat}` : ''}</span>
            </>
          )}
          <p className="mt-1 text-xs text-muted">
            Đây là màu báo để theo dõi trên hệ thống, không phải cấp độ rủi ro thiên tai chính thức của cơ quan KTTV.
          </p>
        </div>
      </div>

      <Section title={<><CloudRain size={16} aria-hidden="true" /> Mưa lớn</>} bodyClass="grid gap-3 pt-1">
        <LevelRow id="mua24" label="Mưa 24 giờ (ô chỉ số, dải tình hình, cổng người dân)" unit="mm" value={f.mua_24h} onChange={set('mua_24h')} />
      </Section>

      <Section title={<><Mountain size={16} aria-hidden="true" /> Sạt lở, lũ quét — ngưỡng theo trạm mưa</>} bodyClass="grid gap-4 pt-1">
        <p className="text-xs leading-relaxed text-muted">
          Trạm vượt một trong các điều kiện của mức nào thì xếp mức đó (biểu đồ "Ngưỡng kích hoạt sạt lở" ở Tổng quan): cường độ
          mưa hiện tại vượt đường ngưỡng <b className="num">I = a · (R/100)<sup>−b</sup></b> (R: mưa 72 giờ), hoặc mưa 72 giờ vượt
          ngưỡng, hoặc cảm biến nghiêng taluy trong 25 km vượt ngưỡng.
        </p>
        <LevelRow id="hsa" label="Hệ số a của đường ngưỡng (cường độ tại R = 100 mm)" unit="mm/giờ" value={f.he_so_a} onChange={set('he_so_a')} />
        <div className="grid gap-1.5 sm:max-w-[16rem]">
          <label htmlFor="so-mu-b" className="text-xs font-semibold text-ink-2">Số mũ b (chung cho 3 mức)</label>
          <input id="so-mu-b" type="number" inputMode="decimal" step="any" min="0" className="input tap num" value={f.so_mu_b ?? ''} onChange={(e) => set('so_mu_b')(e.target.value)} />
        </div>
        <LevelRow id="mua72" label="Mưa tích luỹ 72 giờ" unit="mm" value={f.mua_72h} onChange={set('mua_72h')} />
        <LevelRow id="nghieng" label="Độ nghiêng taluy (cảm biến gần trạm)" unit="độ" value={f.nghieng_do} onChange={set('nghieng_do')} levels={LV.slice(1)} />
      </Section>

      <Section title="Căn cứ và áp dụng" bodyClass="grid gap-3 pt-1">
        <div className="grid gap-1">
          <label htmlFor="nguon-nguong" className="text-xs font-semibold text-ink-2">
            Căn cứ của ngưỡng <span className="text-danger">*</span>
          </label>
          <textarea
            id="nguon-nguong"
            className="input min-h-[72px] leading-relaxed"
            maxLength={500}
            value={f.nguon}
            onChange={(e) => set('nguon')(e.target.value)}
            placeholder="VD: Công văn số …/KTTV ngày …; Báo cáo nghiên cứu ngưỡng mưa gây sạt lở tỉnh Cao Bằng (Viện Địa chất, 2026)"
          />
        </div>
        {errors.length > 0 && (
          <div role="alert" className="rounded-xl border border-danger/30 bg-danger/10 p-3 text-xs font-medium text-danger">
            Chưa lưu — sửa các điểm sau:
            <ul className="mt-1 list-disc pl-5">{errors.map((e) => <li key={e}>{e}</li>)}</ul>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            className="btn-ghost tap"
            onClick={() => setForm({ ...toForm({ ...t.mac_dinh, nguon: f.nguon }) })}
            title="Điền lại các giá trị minh hoạ ban đầu (vẫn phải bấm Áp dụng)"
          >
            <RotateCcw size={15} aria-hidden="true" /> Điền giá trị minh hoạ
          </button>
          <button type="button" className="btn-primary tap" disabled={!form || busy} onClick={() => setAsking(true)}>
            <Save size={15} aria-hidden="true" /> Áp dụng ngưỡng
          </button>
        </div>
      </Section>

      {asking && (
        <Confirm
          title="Áp dụng ngưỡng cảnh báo mới?"
          confirmLabel="Áp dụng cho toàn tỉnh"
          busy={busy}
          onConfirm={save}
          onClose={() => setAsking(false)}
        >
          <p>
            Màu mưa 24 giờ ở mọi màn hình (cả cổng người dân) và mức sạt lở của từng trạm mưa tính lại ngay theo ngưỡng mới.
            Nhật ký pháp lý ghi lại giá trị trước và sau.
          </p>
        </Confirm>
      )}
    </div>
  );
}
