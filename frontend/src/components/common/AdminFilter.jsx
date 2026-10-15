import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Flag, MapPin, Mountain, Search, Waves, X } from 'lucide-react';
import clsx from 'clsx';
import { DEFAULT_FILTER, useStore } from '../../app/store';
import { usePresets, useUnits } from '../../api/hooks';
import { useClickOutside } from '../../utils/useClickOutside';
import { useMediaQuery } from '../../utils/useMediaQuery';
import { foldVi } from '../../utils/format';
import { useAllowedCodes } from '../../rbac/usePermission';
import { EmptyState, ErrorState, Modal, Skeleton, useEscapeToClose } from './ui';

const PRESET_ICON = { ngap_lut: Waves, sat_lo: Mountain, tong_hop: Flag };
const byName = new Intl.Collator('vi').compare;
const GROUPS = [['phuong', 'Phường'], ['xa', 'Xã']];
const unitLabel = (u) => `${u.unit_type === 'phuong' ? 'Phường' : 'Xã'} ${u.name}`;

/**
 * Bộ lọc địa phương toàn cục (thiết kế F.1): Toàn tỉnh → nhóm lọc nhanh theo thiên tai → 56 xã/phường (sau sắp xếp
 * 01/07/2025 — không nhóm / hiện theo địa bàn huyện cũ). Chọn → mọi trang (Tổng quan, Bản đồ, Cứu hộ, Nguồn lực…) tính lại
 * theo vùng; bộ lọc nhớ theo tài khoản (app/store.js).
 * - Nút trên thanh trên cùng ở MỌI cỡ màn (trước đây dưới 1024 px nằm trong menu ☰: chạm 2 lần, bảng chọn tràn ra ngoài menu).
 * - Từ 1024 px: bảng chọn thả xuống; nhỏ hơn: hộp chọn gần trọn màn, mọi dòng / ô xã ≥ 44 px trên màn cảm ứng, không tự bật
 *   bàn phím (chạm chọn — ít gõ).
 * - Chỉ liệt kê địa bàn trong phạm vi được giao; tài khoản một xã thấy tên xã của mình.
 */
export default function AdminFilter() {
  const { filter, setFilter, clearFilter } = useStore();
  const unitsQ = useUnits();
  const presetsQ = usePresets();
  const allowed = useAllowedCodes('monitoring', 'view');
  const restricted = allowed !== null;
  const units = useMemo(() => {
    const all = unitsQ.data || [];
    return restricted ? all.filter((u) => allowed.includes(u.code)) : all;
  }, [unitsQ.data, restricted, allowed]);
  const presets = useMemo(() => {
    const all = (presetsQ.data || []).filter((p) => p.kind === 'luu_vuc');
    return restricted
      ? all.map((p) => ({ ...p, unit_codes: p.unit_codes.filter((c) => allowed.includes(c)) })).filter((p) => p.unit_codes.length)
      : all;
  }, [presetsQ.data, restricted, allowed]);
  const wide = useMediaQuery('(min-width: 1024px)');
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const trigger = useRef(null);
  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  useClickOutside(ref, () => wide && setOpen(false));
  useEscapeToClose(open && wide, close); // hộp chọn trên điện thoại (Modal) tự xử lý Esc

  // Bộ lọc đã nhớ có mã ngoài phạm vi / không còn (đổi vai trò, nhập lại danh sách xã) → bỏ mã đó; không còn mã nào → Toàn tỉnh
  useEffect(() => {
    if (!unitsQ.data || !filter.codes.length) return;
    const ok = new Set(units.map((u) => u.code));
    const kept = filter.codes.filter((c) => ok.has(c));
    if (kept.length === filter.codes.length) return;
    if (kept.length) setFilter({ ...filter, codes: kept });
    else clearFilter();
  }, [unitsQ.data, units, filter, setFilter, clearFilter]);

  const filtered = filter.codes.length > 0;
  const only = restricted && units.length === 1 ? units[0] : null; // tài khoản một xã / phường
  const scopeName = only ? unitLabel(only) : restricted ? 'Phạm vi được giao' : 'Toàn tỉnh Cao Bằng';
  const label = filtered ? filter.label : scopeName;
  // Nhãn gọn cho thanh trên cùng điện thoại: bỏ chữ "Phường / Xã" (đã có biểu tượng địa điểm), "Toàn tỉnh" thay "Toàn tỉnh Cao Bằng"
  const short = filtered
    ? filter.label.replace(/^(Phường|Xã) /, '')
    : only ? only.name : restricted ? 'Được giao' : 'Toàn tỉnh';
  const pick = (f) => {
    if (f.codes.length) setFilter(f);
    else clearFilter();
    close();
  };

  const panel = (
    <AreaPanel
      unitsQ={unitsQ}
      presetsQ={presetsQ}
      units={units}
      presets={presets}
      filter={filter}
      scopeName={restricted ? 'Toàn bộ phạm vi được giao' : 'Toàn tỉnh Cao Bằng'}
      onPick={pick}
      autoFocus={wide}
    />
  );

  return (
    <div className="relative flex min-w-0 items-center" ref={ref}>
      <button
        ref={trigger}
        type="button"
        className={clsx(
          'btn-ghost touch-hit min-w-0 max-w-full gap-1.5 px-2.5 lg:max-w-[16rem]',
          filtered && 'border-accent bg-accent/10 text-accent',
        )}
        onClick={() => setOpen((o) => !o)}
        title="Lọc dữ liệu theo địa phương"
        aria-label={`Địa bàn đang xem: ${label} — bấm để đổi`}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <MapPin size={15} className="shrink-0" aria-hidden="true" />
        <span className="truncate lg:hidden">{short}</span>
        <span className="hidden truncate lg:inline">{label}</span>
        <ChevronDown size={14} className="shrink-0" aria-hidden="true" />
      </button>
      {filtered && wide && (
        <>
          <button type="button" className="absolute -right-2 -top-2 rounded-full bg-panel2 p-0.5 text-muted hover:text-ink [@media(pointer:coarse)]:hidden" onClick={clearFilter} title="Bỏ lọc" aria-label="Bỏ lọc, xem toàn bộ phạm vi">
            <X size={12} />
          </button>
          {/* Màn cảm ứng (iPad ngang): nút bỏ lọc riêng 44 px cạnh bộ lọc — chấm ✕ ở góc quá nhỏ, nới vùng chạm thì đè lên nút bộ lọc */}
          <button type="button" className="btn-ghost tap-sq ml-1 hidden p-0 [@media(pointer:coarse)]:inline-flex" onClick={clearFilter} title="Bỏ lọc" aria-label="Bỏ lọc, xem toàn bộ phạm vi">
            <X size={14} />
          </button>
        </>
      )}
      {open && wide && (
        <div role="dialog" aria-label="Chọn địa bàn" className="card absolute left-0 top-11 z-[1200] flex max-h-[min(75vh,40rem)] w-[26rem] flex-col border border-line bg-panel/95 p-3 shadow-2xl backdrop-blur-md">
          {panel}
        </div>
      )}
      <Modal open={open && !wide} onClose={close} title="Chọn địa bàn xem số liệu">
        {panel}
      </Modal>
    </div>
  );
}

/** Nội dung bảng chọn địa bàn (dùng chung cho bảng thả xuống và hộp chọn điện thoại). */
function AreaPanel({ unitsQ, presetsQ, units, presets, filter, scopeName, onPick, autoFocus }) {
  const [q, setQ] = useState('');
  const k = foldVi(q.trim());
  const list = useMemo(
    () => units.filter((u) => !k || foldVi(u.name).includes(k)).sort((a, b) => byName(a.name, b.name)),
    [units, k],
  );
  const grouped = GROUPS.map(([type, name]) => [name, list.filter((u) => (u.unit_type === 'phuong' ? 'phuong' : 'xa') === type)])
    .filter(([, items]) => items.length);
  const shownPresets = presets.filter((p) => !k || foldVi(p.name).includes(k));
  const one = (code) => filter.codes.length === 1 && filter.codes[0] === code;

  return (
    <div className="flex min-h-0 flex-col gap-2">
      <label className="relative block shrink-0">
        <span className="sr-only">Tìm xã / phường</span>
        <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
        <input
          className="input tap py-1.5 pl-8 text-sm"
          placeholder="Tìm xã / phường trong tỉnh..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus={autoFocus}
          enterKeyHint="search"
        />
      </label>
      <div className="scroll-thin -mx-1 min-h-0 flex-1 overflow-y-auto px-1">
        {!k && (
          <button
            type="button"
            aria-pressed={!filter.codes.length}
            className={clsx('tap flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-semibold hover:bg-panel2', !filter.codes.length && 'bg-accent/10 text-accent')}
            onClick={() => onPick(DEFAULT_FILTER)}
          >
            <span className="flex items-center gap-2">
              {!filter.codes.length ? <Check size={15} aria-hidden="true" /> : <MapPin size={15} className="text-muted" aria-hidden="true" />}
              {scopeName}
            </span>
            {unitsQ.data && <span className="chip shrink-0 bg-panel2 text-[11px] font-normal text-muted">{units.length} xã/phường</span>}
          </button>
        )}

        {(shownPresets.length > 0 || (!k && presetsQ.isError)) && (
          <>
            <h4 className="mt-2.5 px-2 text-[11px] font-bold uppercase tracking-wide text-muted">Lọc nhanh theo đặc thù thiên tai</h4>
            {presetsQ.isError && !presetsQ.data && (
              <p className="flex items-center justify-between gap-2 px-2 py-1 text-xs text-danger" role="alert">
                Không tải được nhóm lọc nhanh
                <button type="button" className="btn-ghost tap px-2 py-0.5 text-xs" onClick={() => presetsQ.refetch()}>Thử lại</button>
              </p>
            )}
            {shownPresets.map((p) => {
              const Icon = PRESET_ICON[p.hazard] || Flag;
              const on = filter.presetCode === p.code;
              return (
                <button
                  key={p.code}
                  type="button"
                  aria-pressed={on}
                  className={clsx('tap flex w-full gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-panel2', on && 'bg-accent/10')}
                  onClick={() => onPick({ codes: p.unit_codes, label: p.name, presetCode: p.code })}
                >
                  {on ? <Check size={16} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" /> : <Icon size={16} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />}
                  <span className="min-w-0 flex-1">
                    <span className={clsx('block text-sm font-medium', on && 'text-accent')}>{p.name}</span>
                    {p.description && <span className="line-clamp-2 block text-xs text-muted">{p.description}</span>}
                  </span>
                  <span className="chip shrink-0 self-start bg-panel2 text-[11px] text-muted">{p.unit_codes.length} xã/phường</span>
                </button>
              );
            })}
          </>
        )}

        {!k && <h4 className="mt-2.5 px-2 text-[11px] font-bold uppercase tracking-wide text-muted">Xã / phường{unitsQ.data ? ` (${units.length})` : ''}</h4>}
        {unitsQ.isError && !unitsQ.data ? (
          <ErrorState className="mt-1" onRetry={unitsQ.refetch}>Không tải được danh sách xã/phường</ErrorState>
        ) : !unitsQ.data ? (
          <div className="mt-1 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {Array.from({ length: 9 }, (_, i) => <Skeleton key={i} height={32} />)}
          </div>
        ) : (
          grouped.map(([name, items]) => (
            <div key={name} className="mb-1.5">
              <div className="px-2 pb-1 pt-1.5 text-xs text-muted">{name} ({items.length})</div>
              <div className="grid grid-cols-2 gap-1.5 px-1 sm:grid-cols-3">
                {items.map((u) => {
                  const on = one(u.code);
                  return (
                    <button
                      key={u.code}
                      type="button"
                      aria-pressed={on}
                      aria-label={unitLabel(u)}
                      className={clsx(
                        'tap flex min-w-0 items-center gap-1 rounded-md border px-2 py-1 text-left text-xs',
                        on ? 'border-accent bg-accent text-white' : 'border-line hover:border-accent',
                      )}
                      onClick={() => onPick({ codes: [u.code], label: unitLabel(u), presetCode: null })}
                    >
                      {on && <Check size={12} className="shrink-0" aria-hidden="true" />}
                      <span className="truncate">{u.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))
        )}
        {k && unitsQ.data && !list.length && !shownPresets.length && (
          <EmptyState className="mt-1">Không có xã/phường nào khớp “{q.trim()}” — gõ không dấu cũng được (VD “thuc phan”)</EmptyState>
        )}
      </div>
    </div>
  );
}
