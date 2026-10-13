import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { AlertTriangle } from 'lucide-react';
import { api } from '../../api/client';
import { useStore } from '../../app/store';
import { FieldError, Modal } from './ui';

/** Trực ban nhập số liệu vận hành hồ theo báo cáo của đơn vị quản lý hồ (quyền monitoring.update). */
const MAX_LEVEL_DEVIATION_M = 50; // như backend api/v1/dashboard.py: lệch MNDBT quá chừng này → gần như chắc gõ thừa / thiếu chữ số
const MAX_FLOW = 100_000; // m³/s — như ReservoirOperationIn (backend)
const HOUR_MS = 3_600_000;

/** Số người dùng gõ: chấp nhận dấu phẩy thập phân ("195,4"); trống → null; không phải số → NaN. */
const parseNum = (v) => (String(v ?? '').trim() === '' ? null : Number(String(v).trim().replace(',', '.')));
/** "YYYY-MM-DDTHH:mm" theo giờ của máy — giá trị cho ô datetime-local. */
const localInput = (d) => {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

/**
 * Trực ban nhập số liệu vận hành hồ theo báo cáo của đơn vị quản lý hồ. Lỗi hiện ngay dưới ô khi gõ, cùng quy tắc với máy
 * chủ (PATCH /reservoirs/{id}/operation): mực nước lệch MNDBT quá 50 m (gõ thừa / thiếu chữ số), số cửa xả vượt số cửa của
 * hồ, lưu lượng âm, thời điểm báo ở tương lai hoặc quá 2 ngày. Nút Lưu không khoá mà không nói vì sao: bấm khi còn lỗi →
 * hiện lỗi mọi ô và đưa con trỏ tới ô lỗi đầu tiên. "Thời điểm đơn vị báo" là giờ của số liệu (không phải giờ trực ban gõ).
 */
export default function ReservoirOperationModal({ reservoir: r, onClose }) {
  const qc = useQueryClient();
  const toast = useStore((st) => st.toast);
  const [f, setF] = useState({
    current_level: r.current_level ?? r.normal_level ?? '',
    spill_gates_open: r.spill_gates_open ?? 0,
    inflow_m3s: r.inflow_m3s ?? '',
    outflow_m3s: r.outflow_m3s ?? '',
    reported_at: localInput(new Date()),
    source: '',
  });
  const [shown, setShown] = useState({}); // ô đã rời / đã bấm Lưu → hiện lỗi "chưa nhập" của ô đó
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(null);
  const refs = {
    current_level: useRef(null), spill_gates_open: useRef(null), inflow_m3s: useRef(null), outflow_m3s: useRef(null), reported_at: useRef(null),
  };
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const touch = (...keys) => setShown((s) => ({ ...s, ...Object.fromEntries(keys.map((k) => [k, true])) }));

  const level = parseNum(f.current_level);
  const gates = parseNum(f.spill_gates_open);
  const inflow = parseNum(f.inflow_m3s);
  const outflow = parseNum(f.outflow_m3s);
  const reported = f.reported_at ? new Date(f.reported_at) : null;
  const now = Date.now();
  const flowError = (v) => (v == null ? null : !Number.isFinite(v) ? 'Nhập số, VD 591' : v < 0 ? 'Không được âm'
    : v > MAX_FLOW ? `Tối đa ${MAX_FLOW.toLocaleString('vi-VN')} m³/s` : null);
  const errors = {
    current_level: level == null ? 'Nhập mực nước hồ' : !Number.isFinite(level) ? 'Nhập số, VD 195,4'
      : r.normal_level != null && Math.abs(level - r.normal_level) > MAX_LEVEL_DEVIATION_M
        ? `Lệch MNDBT (${r.normal_level} m) quá ${MAX_LEVEL_DEVIATION_M} m — kiểm tra lại, có gõ thừa / thiếu chữ số?` : null,
    spill_gates_open: gates == null ? 'Nhập số cửa xả đang mở (0 nếu đóng hết)' : !Number.isInteger(gates) || gates < 0 ? 'Số nguyên từ 0'
      : r.spill_gates && gates > r.spill_gates ? `Hồ chỉ có ${r.spill_gates} cửa xả` : gates > 50 ? 'Tối đa 50 cửa' : null,
    inflow_m3s: flowError(inflow),
    outflow_m3s: flowError(outflow),
    reported_at: !reported || Number.isNaN(reported.getTime()) ? 'Chọn thời điểm đơn vị vận hành báo số liệu'
      : reported.getTime() > now + 5 * 60_000 ? 'Thời điểm ở tương lai'
        : reported.getTime() < now - 48 * HOUR_MS ? 'Quá 2 ngày — số liệu cũ không nhập ở đây được' : null,
  };
  const FIELDS = Object.keys(errors);
  // Ô bắt buộc còn trống: chỉ báo sau khi rời ô / bấm Lưu; lỗi định dạng, vượt giới hạn: báo ngay khi gõ
  const empty = { current_level: level == null, spill_gates_open: gates == null, reported_at: !f.reported_at };
  const err = (k) => (errors[k] && (!empty[k] || shown[k]) ? errors[k] : null);
  // Lưu ý (không chặn lưu)
  const aboveNormal = Number.isFinite(level) && r.normal_level != null && level > r.normal_level ? level - r.normal_level : null;
  const missingOutflow = gates > 0 && outflow == null;

  const submit = async () => {
    const bad = FIELDS.filter((k) => errors[k]);
    if (bad.length) {
      touch(...FIELDS);
      refs[bad[0]].current?.focus();
      return;
    }
    setBusy(true);
    setFailure(null);
    try {
      await api(`/reservoirs/${encodeURIComponent(r.id)}/operation`, {
        method: 'PATCH',
        body: {
          current_level: level,
          spill_gates_open: gates,
          inflow_m3s: inflow,
          outflow_m3s: outflow,
          reported_at: reported.toISOString(),
          source: f.source.trim() || null,
        },
      });
      toast({ tone: 'good', title: `Đã cập nhật vận hành ${r.name}` });
      ['pub-reservoirs', 'reservoirs', 'kpis', 'map-layers', 'reservoir-operations'].forEach((key) => qc.invalidateQueries({ queryKey: [key] }));
      onClose();
    } catch (e) {
      setFailure(e.message); // VD máy chủ từ chối (422) — hiện ngay trong hộp thoại, không mất số đã nhập
    } finally {
      setBusy(false);
    }
  };

  const input = (k) => clsx('input min-h-[44px] text-sm sm:min-h-0', err(k) && 'border-danger');
  const aria = (k) => ({ ref: refs[k], onBlur: () => touch(k), 'aria-invalid': !!err(k), 'aria-describedby': err(k) ? `loi-ho-${k}` : undefined });
  return (
    <Modal
      open
      onClose={busy ? () => {} : onClose}
      title={`Cập nhật vận hành – ${r.name}`}
      footer={
        <>
          <button type="button" className="btn-ghost min-h-[44px] sm:min-h-0" onClick={onClose} disabled={busy}>Huỷ</button>
          <button type="button" className="btn-primary min-h-[44px] sm:min-h-0" disabled={busy} onClick={submit}>
            {busy ? 'Đang lưu…' : 'Lưu số liệu'}
          </button>
        </>
      }
    >
      <div className="grid gap-3 text-sm sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          Mực nước hồ (m) *
          <input className={input('current_level')} inputMode="decimal" value={f.current_level} onChange={set('current_level')} {...aria('current_level')} />
          {!err('current_level') && (
            <span className={clsx('text-[11px]', aboveNormal != null ? 'font-semibold text-serious' : 'text-muted')}>
              MNDBT {r.normal_level ?? '–'} m{aboveNormal != null && ` — đang cao hơn ${aboveNormal.toFixed(2).replace('.', ',')} m`}
            </span>
          )}
          <FieldError id="loi-ho-current_level">{err('current_level')}</FieldError>
        </label>
        <label className="flex flex-col gap-1">
          Số cửa xả đang mở *
          <input className={input('spill_gates_open')} inputMode="numeric" value={f.spill_gates_open} onChange={set('spill_gates_open')} {...aria('spill_gates_open')} />
          {!err('spill_gates_open') && <span className="text-[11px] text-muted">Hồ có {r.spill_gates || 0} cửa xả tràn</span>}
          <FieldError id="loi-ho-spill_gates_open">{err('spill_gates_open')}</FieldError>
        </label>
        <label className="flex flex-col gap-1">
          Lưu lượng về hồ (m³/s)
          <input className={input('inflow_m3s')} inputMode="decimal" value={f.inflow_m3s} onChange={set('inflow_m3s')} {...aria('inflow_m3s')} />
          <FieldError id="loi-ho-inflow_m3s">{err('inflow_m3s')}</FieldError>
        </label>
        <label className="flex flex-col gap-1">
          Tổng lưu lượng xả (m³/s)
          <input className={input('outflow_m3s')} inputMode="decimal" value={f.outflow_m3s} onChange={set('outflow_m3s')} {...aria('outflow_m3s')} />
          {!err('outflow_m3s') && missingOutflow && <span className="text-[11px] font-semibold text-serious">Đang mở cửa xả — nên nhập tổng lưu lượng xả để hạ du biết</span>}
          <FieldError id="loi-ho-outflow_m3s">{err('outflow_m3s')}</FieldError>
        </label>
        <label className="flex flex-col gap-1">
          Thời điểm đơn vị vận hành báo *
          <input
            type="datetime-local"
            className={input('reported_at')}
            value={f.reported_at}
            max={localInput(new Date(now + 5 * 60_000))}
            min={localInput(new Date(now - 48 * HOUR_MS))}
            onChange={set('reported_at')}
            {...aria('reported_at')}
          />
          {!err('reported_at') && <span className="text-[11px] text-muted">Giờ của số liệu (không phải giờ nhập) — dùng cho diễn biến vận hành</span>}
          <FieldError id="loi-ho-reported_at">{err('reported_at')}</FieldError>
        </label>
        <label className="flex flex-col gap-1">
          Nguồn báo cáo
          <input className="input min-h-[44px] text-sm sm:min-h-0" maxLength={200} placeholder="VD: Điện thoại trưởng ca Nhà máy TĐ Bằng Giang" value={f.source} onChange={set('source')} />
        </label>
        {failure && (
          <p role="alert" className="flex items-start gap-1.5 rounded-lg border border-danger/50 bg-danger/10 p-2.5 text-xs font-semibold text-danger sm:col-span-2">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden="true" /> Chưa lưu được: {failure}
          </p>
        )}
        <p className="text-[11px] text-muted sm:col-span-2">
          Số liệu hiện ngay trên cổng công khai và bản nhẹ, kèm thời điểm báo; thao tác được ghi nhật ký.
        </p>
      </div>
    </Modal>
  );
}
