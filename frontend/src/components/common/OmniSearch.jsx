import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import {
  Clock3, Crosshair, Landmark, Loader2, MapPin, Radio, Search, Siren, Users, Warehouse, WifiOff,
} from 'lucide-react';
import { api } from '../../api/client';
import { useStore } from '../../app/store';
import { useUnits } from '../../api/hooks';
import { useAllowedCodes } from '../../rbac/usePermission';
import { useClickOutside } from '../../utils/useClickOutside';
import { useMediaQuery } from '../../utils/useMediaQuery';
import { useOnline } from '../../utils/useOnline';
import { Modal } from './ui';

const KIND = {
  hanh_chinh: { icon: Landmark, label: 'Xã / phường' },
  dia_danh: { icon: MapPin, label: 'Địa danh' },
  tram: { icon: Radio, label: 'Trạm quan trắc' },
  luc_luong: { icon: Users, label: 'Lực lượng' },
  kho: { icon: Warehouse, label: 'Kho' },
  sos: { icon: Siren, label: 'Phiếu cứu hộ' },
  toa_do: { icon: Crosshair, label: 'Toạ độ' },
};
const HINT = 'tên xóm, xã, địa danh, trạm, mã phiếu cứu hộ (VD SOS-1001), toạ độ (VD 22.66, 106.25) hoặc dán link Google Maps';

// Tìm gần đây (5 mục, máy này): chỉ giữ tên / toạ độ / mã — không giữ địa chỉ người báo SOS
const RECENT_KEY = 'pctt_search_recent';
const readRecent = () => { try { const v = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };
const writeRecent = (list) => { try { if (list.length) localStorage.setItem(RECENT_KEY, JSON.stringify(list)); else localStorage.removeItem(RECENT_KEY); } catch { /* bỏ qua */ } };
const slim = (it) => ({
  kind: it.kind, label: it.label, sub: it.kind === 'sos' ? '' : it.sub, lat: it.lat, lon: it.lon, admin_code: it.admin_code, ref: it.ref,
});

/** Gọi /search khi gõ (chờ 220 ms ngừng gõ); trạng thái: idle (chưa đủ 2 ký tự) · loading · done · error · offline. */
function useSearch(q, online) {
  const [state, setState] = useState({ status: 'idle', items: [], q: '' });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const text = q.trim();
    if (text.length < 2) {
      setState({ status: 'idle', items: [], q: text });
      return undefined;
    }
    if (!online) {
      setState({ status: 'offline', items: [], q: text });
      return undefined;
    }
    let live = true;
    setState((s) => ({ ...s, status: 'loading' }));
    const id = setTimeout(async () => {
      try {
        const items = await api('/search', { params: { q: text } });
        if (live) setState({ status: 'done', items, q: text });
      } catch {
        if (live) setState({ status: 'error', items: [], q: text });
      }
    }, 220);
    return () => {
      live = false;
      clearTimeout(id);
    };
  }, [q, online, tick]);
  return [state, () => setTick((t) => t + 1)];
}

/**
 * Thanh tìm kiếm toàn năng (thiết kế F.1): địa danh, đơn vị hành chính, xóm, trạm, lực lượng, kho, mã SOS, toạ độ GPS (thập
 * phân, độ-phút-giây, link Google Maps).
 * - Chọn xã / phường → lọc cả hệ thống theo xã đó + Bản đồ; mã SOS → mở đúng phiếu ở Điều hành cứu hộ (bỏ lọc địa bàn nếu phiếu
 *   ở xã khác); còn lại → bay tới vị trí trên Bản đồ.
 * - Từ 768 px: ô tìm trên thanh trên cùng (phím "/" hoặc Ctrl+K để gõ ngay); điện thoại: nút kính lúp mở hộp tìm toàn màn.
 * - Đang tìm / không thấy (gợi ý cách gõ) / lỗi (Thử lại) / mất mạng nói rõ; chưa gõ → "Tìm gần đây" (chạm lại, không gõ).
 * - Bàn phím: ↑ ↓ chọn, Enter mở, Esc đóng; trình đọc màn hình: ô tìm là combobox, kết quả là listbox.
 */
export default function OmniSearch() {
  const wide = useMediaQuery('(min-width: 768px)');
  const online = useOnline();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [recent, setRecent] = useState(readRecent);
  const [search, retry] = useSearch(q, online);
  const ref = useRef(null);
  const input = useRef(null);
  const listId = useId();
  const navigate = useNavigate();
  const { setFocus, setFilter, clearFilter, toast } = useStore.getState();
  const filterCodes = useStore((s) => s.filter.codes);
  const { data: units = [] } = useUnits();
  const allowed = useAllowedCodes('monitoring', 'view');
  useClickOutside(ref, () => wide && setOpen(false));
  // Kết quả là xã / phường (không phải xóm, không phải tỉnh) trong phạm vi được giao → đơn vị để lọc; ngoài phạm vi chỉ xem bản đồ
  const filterUnit = (it) => {
    if (it.kind !== 'hanh_chinh' || it.ref !== it.admin_code) return null;
    const unit = units.find((u) => u.code === it.ref);
    return unit && (allowed === null || allowed.includes(unit.code)) ? unit : null;
  };

  const typing = q.trim().length >= 2;
  const items = typing ? (search.status === 'done' ? search.items : []) : recent;
  useEffect(() => setActive(0), [search.items, typing]);

  // "/" hoặc Ctrl+K: gõ tìm ngay (máy có bàn phím) — trừ khi đang gõ trong ô khác
  useEffect(() => {
    const onKey = (e) => {
      const t = e.target;
      const editing = t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
      if ((e.key === '/' && !editing && !e.ctrlKey && !e.metaKey && !e.altKey) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')) {
        e.preventDefault();
        setOpen(true);
        if (wide) input.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [wide]);

  const close = useCallback(() => {
    setOpen(false);
    setQ('');
  }, []);

  const choose = (it) => {
    if (!it) return;
    const next = [slim(it), ...recent.filter((r) => !(r.kind === it.kind && r.ref === it.ref && r.label === it.label))].slice(0, 5);
    setRecent(next);
    writeRecent(next);
    close();
    input.current?.blur();
    if (it.kind === 'sos') {
      // Phiếu ở xã ngoài vùng đang lọc → bỏ lọc, không thì danh sách cứu hộ không có phiếu này
      if (filterCodes.length && (!it.admin_code || !filterCodes.includes(it.admin_code))) {
        clearFilter();
        toast({ title: `Đã bỏ lọc địa bàn để mở phiếu ${it.label}` });
      }
      navigate(`/cuu-ho?phieu=${encodeURIComponent(it.label)}`);
      return;
    }
    // Xã / phường (không phải xóm) trong phạm vi được giao → lọc cả hệ thống theo xã đó; bản đồ tự vừa khít ranh giới xã
    const unit = filterUnit(it);
    if (unit) {
      setFilter({ codes: [unit.code], label: it.label, presetCode: null });
      navigate('/ban-do');
      return;
    }
    setFocus({ lat: it.lat, lon: it.lon, zoom: it.kind === 'hanh_chinh' ? 13 : 14, label: it.label });
    navigate('/ban-do');
  };
  // Việc mỗi kết quả làm khi chọn — ghi ngay trên dòng để biết trước chuyện gì xảy ra
  const actionOf = (it) => {
    if (it.kind === 'sos') return 'Mở phiếu';
    const unit = filterUnit(it);
    return unit ? `Lọc theo ${unit.unit_type === 'phuong' ? 'phường' : 'xã'}` : 'Xem bản đồ';
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, items.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); choose(items[active]); }
    if (e.key === 'Escape' && wide) { setOpen(false); }
  };

  const field = (
    <div className="relative">
      <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
      <input
        ref={input}
        className="input tap pl-9 pr-10"
        placeholder="Nhập địa điểm…"
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        role="combobox"
        aria-label="Tìm kiếm toàn năng"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && items[active] ? `${listId}-${active}` : undefined}
        enterKeyHint="search"
        autoComplete="off"
        autoFocus={!wide}
      />
      {search.status === 'loading' && <Loader2 size={15} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-muted" aria-hidden="true" />}
      {wide && !q && <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded border border-line px-1.5 text-[10px] text-muted xl:block">/</kbd>}
    </div>
  );

  const results = (
    <div className="flex flex-col gap-1">
      <div role="status" className="sr-only">
        {typing && search.status === 'done' ? `${search.items.length} kết quả` : search.status === 'loading' ? 'Đang tìm' : ''}
      </div>
      {!typing && recent.length > 0 && (
        <div className="flex items-center justify-between px-2 pt-1 text-xs font-semibold text-muted">
          Tìm gần đây
          <button type="button" className="tap rounded px-2 text-accent hover:bg-accent/10" onClick={() => { setRecent([]); writeRecent([]); }}>Xoá</button>
        </div>
      )}
      <ul id={listId} role="listbox" aria-label={typing ? 'Kết quả tìm kiếm' : 'Tìm gần đây'} className="flex flex-col">
        {items.map((it, i) => {
          const k = KIND[it.kind] || KIND.dia_danh;
          const Icon = typing ? k.icon : Clock3;
          // Bàn phím đi qua ô tìm (combobox: ↑ ↓ Enter) — dòng kết quả chỉ cần chuột / chạm
          return (
            <li
              key={`${it.kind}-${it.ref || it.label}-${i}`}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={clsx('tap flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5', i === active && 'bg-panel2')}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => e.preventDefault()} // giữ con trỏ trong ô tìm (bảng không đóng trước khi chọn)
              onClick={() => choose(it)}
            >
              <Icon size={16} className="shrink-0 text-accent" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{it.label}</span>
                <span className="block truncate text-xs text-muted">{k.label}{it.sub ? ` · ${it.sub}` : ''}</span>
              </span>
              <span className="shrink-0 text-[11px] font-medium text-accent">{actionOf(it)}</span>
            </li>
          );
        })}
      </ul>
      {typing && search.status === 'loading' && !search.items.length && <p className="px-2 py-3 text-center text-xs text-muted">Đang tìm…</p>}
      {typing && search.status === 'done' && !search.items.length && (
        <p className="px-2 py-3 text-center text-xs text-muted">Không thấy “{search.q}”. Thử: {HINT}.</p>
      )}
      {typing && search.status === 'error' && (
        <div role="alert" className="flex flex-wrap items-center justify-center gap-2 px-2 py-3 text-center text-xs text-danger">
          Không tìm được — máy chủ không trả lời
          <button type="button" className="btn-ghost tap px-2 py-0.5 text-xs" onClick={retry}>Thử lại</button>
        </div>
      )}
      {typing && search.status === 'offline' && (
        <p role="alert" className="flex items-center justify-center gap-1.5 px-2 py-3 text-center text-xs text-danger">
          <WifiOff size={13} aria-hidden="true" /> Mất mạng — chưa tìm được, có mạng lại sẽ tự tìm
        </p>
      )}
      {!typing && (
        <p className="px-2 py-2 text-xs leading-relaxed text-muted">
          Gõ ít nhất 2 ký tự: {HINT}. Chạm một kết quả là bản đồ bay tới chỗ đó (phiếu cứu hộ: mở đúng phiếu).
        </p>
      )}
    </div>
  );

  if (!wide) {
    return (
      <>
        <button type="button" className="btn-ghost touch-hit p-2" onClick={() => setOpen(true)} aria-label="Tìm kiếm toàn năng" title="Tìm tên xóm, mã phiếu SOS, toạ độ">
          <Search size={16} />
        </button>
        <Modal open={open} onClose={close} title="Tìm kiếm">
          <div className="flex flex-col gap-2">
            {field}
            {results}
          </div>
        </Modal>
      </>
    );
  }
  return (
    <div className="relative w-full max-w-md" ref={ref}>
      {field}
      {open && (
        <div className="card scroll-thin absolute left-0 right-0 top-11 z-[1200] max-h-[min(70vh,28rem)] overflow-y-auto p-1 shadow-2xl">
          {results}
        </div>
      )}
    </div>
  );
}
