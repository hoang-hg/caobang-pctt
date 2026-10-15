import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronDown, Flag, MapPin, Mountain, Search, Waves, X } from 'lucide-react';
import clsx from 'clsx';
import { api } from '../../api/client';
import { DEFAULT_FILTER, useStore } from '../../app/store';
import { usePresets, useUnits } from '../../api/hooks';
import { useClickOutside } from '../../utils/useClickOutside';
import { useMediaQuery } from '../../utils/useMediaQuery';
import { foldVi } from '../../utils/format';
import { RISK, risk } from '../../utils/risk';
import { useAllowedCodes } from '../../rbac/usePermission';
import { statusByCode } from './communeStatus';
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
 * - Lãnh đạo chọn địa bàn biết ngay xã nào đang nóng: chấm màu thang rủi ro chung cạnh từng xã / nhóm lọc nhanh, mục "Cần chú
 *   ý" (xã Đỏ / Cam kèm lý do) đầu hộp chọn — /dashboard/communes, chỉ tải khi mở hộp chọn (communeStatus.js).
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
  // Tình hình từng xã: chỉ tải khi mở hộp chọn (thanh trên cùng có ở mọi trang — không hỏi máy chủ liên tục), 1 phút / lần khi mở
  const statusQ = useQuery({
    queryKey: ['communes-status'],
    queryFn: () => api('/dashboard/communes'),
    enabled: open,
    staleTime: 30_000,
    refetchInterval: open ? 60_000 : false,
  });
  const status = useMemo(() => (statusQ.data ? statusByCode(statusQ.data) : null), [statusQ.data]);

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
      statusQ={statusQ}
      status={status}
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
        {/* Điện thoại: bỏ mũi tên — nhường chỗ cho tên xã (nút vẫn báo là mở hộp chọn qua aria-haspopup) */}
        <ChevronDown size={14} className="shrink-0 max-sm:hidden" aria-hidden="true" />
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

/** Chấm mức của một xã / nhóm xã (thang rủi ro chung). */
const Dot = ({ level, className }) => (
  <span className={clsx('h-2.5 w-2.5 shrink-0 rounded-full', risk(level).fill, className)} aria-hidden="true" />
);
const ATTENTION_SHOWN = 3; // 3 xã nặng nhất đủ cho cái nhìn vài giây; phần còn lại: "Xem thêm" và chấm màu trong danh sách

/** Nội dung bảng chọn địa bàn (dùng chung cho bảng thả xuống và hộp chọn điện thoại). */
function AreaPanel({ unitsQ, presetsQ, units, presets, statusQ, status, filter, scopeName, onPick, autoFocus }) {
  const [q, setQ] = useState('');
  const [allAttention, setAllAttention] = useState(false);
  const k = foldVi(q.trim());
  const list = useMemo(
    () => units.filter((u) => !k || foldVi(u.name).includes(k)).sort((a, b) => byName(a.name, b.name)),
    [units, k],
  );
  const grouped = GROUPS.map(([type, name]) => [name, list.filter((u) => (u.unit_type === 'phuong' ? 'phuong' : 'xa') === type)])
    .filter(([, items]) => items.length);
  const shownPresets = presets.filter((p) => !k || foldVi(p.name).includes(k));
  const one = (code) => filter.codes.length === 1 && filter.codes[0] === code;
  // Cần chú ý: xã Đỏ / Cam — nặng trước, nhiều lý do trước, rồi theo tên
  const attention = useMemo(() => (status
    ? units.map((u) => ({ u, st: status.get(u.code) })).filter((x) => x.st?.level >= 2)
      .sort((a, b) => b.st.level - a.st.level || b.st.reasons.length - a.st.reasons.length || byName(a.u.name, b.u.name))
    : []), [status, units]);
  const reasonText = (st) => st.reasons.map((r) => r.text).join(' · ');
  const pickUnit = (u) => onPick({ codes: [u.code], label: unitLabel(u), presetCode: null });

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

        {/* Thông tin khẩn trên cùng: xã Đỏ / Cam kèm lý do — lãnh đạo chạm là lọc cả hệ thống theo xã đó */}
        {!k && (
          <section aria-label="Xã/phường cần chú ý" className="mt-2.5">
            {statusQ.isError && !statusQ.data ? (
              <p role="alert" className="flex flex-wrap items-center justify-between gap-2 px-2 py-1 text-xs text-danger">
                Không tải được tình hình từng xã — vẫn chọn được địa bàn
                <button type="button" className="btn-ghost tap px-2 py-0.5 text-xs" onClick={() => statusQ.refetch()}>Thử lại</button>
              </p>
            ) : !status ? (
              <p role="status" className="px-2 py-1 text-[11px] text-muted">Đang tải tình hình từng xã…</p>
            ) : attention.length ? (
              <>
                <h4 className="flex items-center gap-1.5 px-2 text-[11px] font-bold uppercase tracking-wide text-ink">
                  <Dot level={attention[0].st.level} /> Cần chú ý · {attention.length} xã/phường
                </h4>
                {(allAttention ? attention : attention.slice(0, ATTENTION_SHOWN)).map(({ u, st }) => {
                  const on = one(u.code);
                  return (
                    <button
                      key={u.code}
                      type="button"
                      aria-pressed={on}
                      aria-label={`Cần chú ý: ${unitLabel(u)} — ${risk(st.level).name}: ${reasonText(st)}`}
                      className={clsx('tap flex w-full items-start gap-2.5 rounded-lg px-2.5 py-1.5 text-left hover:bg-panel2', on && 'bg-accent/10')}
                      onClick={() => pickUnit(u)}
                    >
                      <Dot level={st.level} className="mt-1" />
                      <span className="min-w-0 flex-1">
                        <span className={clsx('block text-sm font-medium', on && 'text-accent')}>{unitLabel(u)}</span>
                        <span className="line-clamp-2 block text-xs text-muted">{reasonText(st)}</span>
                      </span>
                      {on && <Check size={15} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />}
                    </button>
                  );
                })}
                {attention.length > ATTENTION_SHOWN && (
                  <button type="button" className="tap w-full rounded-lg px-2.5 py-1 text-left text-xs font-medium text-accent hover:bg-accent/10" onClick={() => setAllAttention((v) => !v)}>
                    {allAttention ? 'Thu gọn' : `Xem thêm ${attention.length - ATTENTION_SHOWN} xã/phường cần chú ý`}
                  </button>
                )}
              </>
            ) : (
              <p className="flex items-center gap-1.5 px-2 py-1 text-[11px] text-muted">
                <Dot level={0} /> Không xã/phường nào ở mức Đỏ / Cam lúc này
              </p>
            )}
          </section>
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
              // Mức nặng nhất của các xã trong nhóm + số xã Đỏ / Cam
              const levels = status ? p.unit_codes.map((c) => status.get(c)?.level || 0) : [];
              const worst = status ? Math.max(0, ...levels) : null;
              const hot = levels.filter((lv) => lv >= 2).length;
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
                    {hot > 0 && <span className="block text-xs font-medium text-ink">{hot} xã/phường cần chú ý</span>}
                  </span>
                  <span className="chip shrink-0 self-start bg-panel2 text-[11px] text-muted">
                    {worst != null && <Dot level={worst} />}
                    {p.unit_codes.length} xã/phường
                  </span>
                </button>
              );
            })}
          </>
        )}

        {!k && <h4 className="mt-2.5 px-2 text-[11px] font-bold uppercase tracking-wide text-muted">Xã / phường{unitsQ.data ? ` (${units.length})` : ''}</h4>}
        {!k && status && (
          <p className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 px-2 pt-1 text-[11px] text-muted">
            {[3, 2, 1, 0].map((lv) => <span key={lv} className="inline-flex items-center gap-1"><Dot level={lv} /> {RISK[lv].name}</span>)}
            <span>— theo cảnh báo, vùng nguy hiểm, SOS, trạm vượt ngưỡng, mưa dự báo 24 giờ; không phải cấp độ rủi ro chính thức</span>
          </p>
        )}
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
                  const st = status?.get(u.code);
                  const why = st ? `${risk(st.level).name}${st.reasons.length ? `: ${reasonText(st)}` : ''}` : '';
                  return (
                    <button
                      key={u.code}
                      type="button"
                      aria-pressed={on}
                      aria-label={why ? `${unitLabel(u)} — ${why}` : unitLabel(u)}
                      title={why || undefined}
                      className={clsx(
                        'tap flex min-w-0 items-center gap-1.5 rounded-md border px-2 py-1 text-left text-xs',
                        on ? 'border-accent bg-accent text-white' : 'border-line hover:border-accent',
                      )}
                      onClick={() => pickUnit(u)}
                    >
                      {on ? <Check size={12} className="shrink-0" aria-hidden="true" /> : st && <Dot level={st.level} className="h-2 w-2" />}
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
