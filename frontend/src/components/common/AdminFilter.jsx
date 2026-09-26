import { useMemo, useRef, useState } from 'react';
import { ChevronDown, MapPin, Mountain, Waves, Flag, X } from 'lucide-react';
import clsx from 'clsx';
import { useStore } from '../../app/store';
import { usePresets, useUnits } from '../../api/hooks';
import { useClickOutside } from '../../utils/useClickOutside';
import { useAllowedCodes } from '../../rbac/usePermission';

const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
const PRESET_ICON = { ngap_lut: Waves, sat_lo: Mountain, tong_hop: Flag };

/** Bộ lọc địa phương toàn cục: Toàn tỉnh → preset lưu vực/địa bàn cũ → xã/phường. */
export default function AdminFilter() {
  const { filter, setFilter, clearFilter } = useStore();
  const { data: allUnits = [] } = useUnits();
  const { data: allPresets = [] } = usePresets();
  // Chỉ liệt kê địa bàn trong phạm vi được giao
  const allowed = useAllowedCodes('monitoring', 'view');
  const restricted = allowed !== null;
  const units = restricted ? allUnits.filter((u) => allowed.includes(u.code)) : allUnits;
  const presets = restricted
    ? allPresets
        .map((p) => ({ ...p, unit_codes: p.unit_codes.filter((c) => allowed.includes(c)) }))
        .filter((p) => p.unit_codes.length)
    : allPresets;
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef(null);
  useClickOutside(ref, () => setOpen(false));

  const grouped = useMemo(() => {
    const g = {};
    units
      .filter((u) => !q || norm(u.name).includes(norm(q)))
      .forEach((u) => (g[u.old_district] ||= []).push(u));
    return g;
  }, [units, q]);

  const pick = (f) => {
    setFilter(f);
    setOpen(false);
    setQ('');
  };

  const hazardPresets = presets.filter((p) => p.kind === 'luu_vuc');
  const districtPresets = presets.filter((p) => p.kind === 'dia_ban_cu');

  return (
    <div className="relative" ref={ref}>
      <button
        className={clsx('btn-ghost max-w-[16rem]', filter.codes.length && 'border-accent text-accent')}
        onClick={() => setOpen((o) => !o)}
        title="Lọc dữ liệu theo địa phương"
      >
        <MapPin size={15} />
        <span className="truncate">{restricted && !filter.codes.length ? 'Phạm vi được giao' : filter.label}</span>
        <ChevronDown size={14} />
      </button>
      {filter.codes.length > 0 && (
        <button className="absolute -right-2 -top-2 rounded-full bg-panel2 p-0.5 text-muted hover:text-ink" onClick={clearFilter} title="Bỏ lọc">
          <X size={12} />
        </button>
      )}
      {open && (
        <div className="card absolute left-0 top-11 z-[1200] w-[min(26rem,calc(100vw-2rem))] p-3 shadow-2xl bg-panel/95 backdrop-blur-md border border-line">
          <input className="input mb-2.5 text-xs py-1.5" placeholder="Tìm xã / phường trong tỉnh..." value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
          <div className="max-h-[70vh] overflow-y-auto scroll-thin space-y-1">
            {!q && (
              <>
                <button className="w-full rounded-xl px-2.5 py-2 text-left text-sm font-semibold hover:bg-panel2 transition-colors flex items-center justify-between" onClick={() => pick({ codes: [], label: restricted ? 'Phạm vi được giao' : 'Toàn tỉnh Cao Bằng', presetCode: null })}>
                  <span>{restricted ? 'Toàn bộ phạm vi được giao' : 'Toàn tỉnh Cao Bằng'}</span>
                  <span className="chip bg-panel2 text-[10px] text-muted font-normal">{units.length} xã/phường</span>
                </button>
                <div className="mt-2.5 px-2 text-[10px] font-bold uppercase tracking-wider text-muted">Lọc nhanh theo đặc thù thiên tai</div>
                {hazardPresets.map((p) => {
                  const Icon = PRESET_ICON[p.hazard] || Flag;
                  return (
                    <button
                      key={p.code}
                      className={clsx('flex w-full gap-2 rounded-md px-2 py-1.5 text-left hover:bg-panel2', filter.presetCode === p.code && 'bg-accent/10')}
                      onClick={() => pick({ codes: p.unit_codes, label: p.name, presetCode: p.code })}
                    >
                      <Icon size={16} className="mt-0.5 shrink-0 text-accent" />
                      <span>
                        <span className="block text-sm font-medium">{p.name}</span>
                        <span className="block text-xs text-muted">{p.description}</span>
                      </span>
                    </button>
                  );
                })}
                <div className="mt-2 px-2 text-[11px] font-semibold uppercase text-muted">Theo địa bàn huyện cũ</div>
                <div className="grid grid-cols-2 gap-1">
                  {districtPresets.map((p) => (
                    <button
                      key={p.code}
                      className={clsx('rounded-md px-2 py-1 text-left text-sm hover:bg-panel2', filter.presetCode === p.code && 'bg-accent/10 text-accent')}
                      onClick={() => pick({ codes: p.unit_codes, label: p.name, presetCode: p.code })}
                    >
                      {p.name.replace('Địa bàn ', '').replace(' (cũ)', '')} <span className="text-xs text-muted">({p.unit_codes.length})</span>
                    </button>
                  ))}
                </div>
                <div className="mt-2 px-2 text-[11px] font-semibold uppercase text-muted">Xã / phường</div>
              </>
            )}
            {Object.entries(grouped).map(([district, list]) => (
              <div key={district} className="mb-1">
                <div className="px-2 pt-1 text-xs text-muted">{district}</div>
                <div className="flex flex-wrap gap-1 px-1">
                  {list.map((u) => (
                    <button
                      key={u.code}
                      className={clsx('rounded-md border border-line px-2 py-0.5 text-xs hover:border-accent', filter.codes.length === 1 && filter.codes[0] === u.code && 'bg-accent text-white')}
                      onClick={() => pick({ codes: [u.code], label: `${u.unit_type === 'phuong' ? 'P.' : 'Xã'} ${u.name}`, presetCode: null })}
                    >
                      {u.name}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
