import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, MapPin, Radio, Droplets, Users, Warehouse, Siren, Crosshair, Landmark } from 'lucide-react';
import { api } from '../../api/client';
import { useStore } from '../../app/store';
import { useClickOutside } from '../../utils/useClickOutside';

const KIND = {
  hanh_chinh: { icon: Landmark, label: 'Hành chính' },
  dia_danh: { icon: MapPin, label: 'Địa danh' },
  tram: { icon: Radio, label: 'Trạm quan trắc' },
  ho_chua: { icon: Droplets, label: 'Hồ chứa' },
  luc_luong: { icon: Users, label: 'Lực lượng' },
  kho: { icon: Warehouse, label: 'Kho' },
  sos: { icon: Siren, label: 'Sự cố SOS' },
  toa_do: { icon: Crosshair, label: 'Toạ độ' },
};

/** Thanh tìm kiếm toàn năng: địa danh, toạ độ GPS, mã SOS… → bay tới vị trí trên bản đồ. */
export default function OmniSearch() {
  const [q, setQ] = useState('');
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const ref = useRef(null);
  const navigate = useNavigate();
  const setFocus = useStore((s) => s.setFocus);
  useClickOutside(ref, () => setOpen(false));

  useEffect(() => {
    if (q.trim().length < 2) {
      setItems([]);
      return undefined;
    }
    const id = setTimeout(async () => {
      try {
        setItems(await api('/search', { params: { q } }));
        setOpen(true);
        setActive(0);
      } catch {
        setItems([]);
      }
    }, 220);
    return () => clearTimeout(id);
  }, [q]);

  const choose = (it) => {
    if (!it) return;
    setFocus({ lat: it.lat, lon: it.lon, zoom: it.kind === 'hanh_chinh' ? 12 : 14, label: it.label });
    setOpen(false);
    setQ('');
    navigate('/ban-do');
  };

  return (
    <div className="relative hidden w-full max-w-md md:block" ref={ref}>
      <Search size={15} className="pointer-events-none absolute left-3 top-2.5 text-muted" />
      <input
        className="input pl-9"
        placeholder="Tìm địa danh, mã SOS, toạ độ GPS, link Google Maps…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => items.length && setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') setActive((a) => Math.min(a + 1, items.length - 1));
          if (e.key === 'ArrowUp') setActive((a) => Math.max(a - 1, 0));
          if (e.key === 'Enter') choose(items[active]);
          if (e.key === 'Escape') setOpen(false);
        }}
      />
      {open && items.length > 0 && (
        <div className="card absolute left-0 right-0 top-11 z-[1200] max-h-96 overflow-y-auto p-1 shadow-2xl scroll-thin">
          {items.map((it, i) => {
            const k = KIND[it.kind] || KIND.dia_danh;
            return (
              <button
                key={`${it.kind}-${it.ref || i}`}
                className={`flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left ${i === active ? 'bg-panel2' : ''}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(it)}
              >
                <k.icon size={16} className="shrink-0 text-accent" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{it.label}</span>
                  <span className="block truncate text-xs text-muted">{k.label} · {it.sub}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
