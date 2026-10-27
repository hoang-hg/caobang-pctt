import { useState } from 'react';
import { Link } from 'react-router-dom';
import { GeoJSON, MapContainer, Tooltip, ZoomControl } from 'react-leaflet';
import clsx from 'clsx';
import { Maximize2 } from 'lucide-react';
import { useAreaQuery, useUnitsGeo } from '../../api/hooks';
import { useStore } from '../../app/store';
import { Legend } from '../charts/chartTheme';
import { AreaFocus, BaseLayer, MapResize } from '../map/MapTools';
import { LEVEL } from '../../utils/labels';
import { dateTime } from '../../utils/format';
import { NO_DATA, RISK, risk } from '../../utils/risk';
import { SEVERITY_LEVEL } from './alertFacts';

const CENTER = [22.75, 106.05];
const MAP_PAD = { topLeft: [14, 14], bottomRight: [14, 14] };

/**
 * Bản đồ vùng đang có cảnh báo (thiết kế E.2 — khoanh vùng cảnh báo): xã / phường tô theo cảnh báo nặng nhất đang hiệu lực
 * ở đó (Rất cao Đỏ, Cao Cam, Trung bình Vàng — thang chung), vùng vẽ tay viền nét đứt. Rê / chạm xã → các lệnh đang phát ở
 * đó. Bên dưới: danh sách xã theo mức (đọc được không cần nhìn màu). Màn cảm ứng: một ngón cuộn trang, hai ngón kéo bản đồ.
 */
export default function AlertMap({ broadcasts, factsOf }) {
  const { data: geo, isError: geoError, refetch } = useUnitsGeo();
  const { data: area } = useAreaQuery('area', '/admin-units/area', {}, { staleTime: Infinity });
  const filtered = useStore((s) => s.filter.codes.length > 0);
  const [coarse] = useState(() => window.matchMedia?.('(pointer: coarse)').matches ?? false);
  const live = broadcasts.filter((b) => factsOf(b).live);
  // Mỗi xã: mức nặng nhất + các lệnh đang hiệu lực nhắm tới xã đó
  const byCode = new Map();
  for (const b of live) {
    for (const c of b.target_admin_codes || []) {
      const cur = byCode.get(c) || { level: 0, list: [] };
      cur.level = Math.max(cur.level, SEVERITY_LEVEL[b.severity] || 0);
      cur.list.push(b);
      byCode.set(c, cur);
    }
  }
  const drawn = live.filter((b) => b.target_geom && b.target_geom.type !== 'Point');
  // GeoJSON của react-leaflet không vẽ lại khi đổi kiểu → khoá theo trạng thái cảnh báo từng xã
  const sig = [...byCode.entries()].map(([c, e]) => `${c}:${e.level}`).sort().join('|');
  const names = (lv) => (geo?.features || []).filter((f) => byCode.get(f.properties.code)?.level === lv).map((f) => f.properties.name);

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-ink">
          Vùng đang có cảnh báo <span className="text-xs font-normal text-muted">· {byCode.size} xã/phường · {live.length} lệnh đang hiệu lực</span>
        </h3>
        <Link to="/ban-do" className="btn-ghost tap min-h-[32px] px-2.5 py-0.5 text-xs"><Maximize2 size={12} aria-hidden="true" /> Bản đồ đầy đủ</Link>
      </div>
      <div className="relative isolate z-0 h-60 overflow-hidden rounded-lg border border-line sm:h-72 xl:h-80">
        <MapContainer center={CENTER} zoom={8.8} zoomControl={false} zoomSnap={0.1} zoomDelta={0.5} scrollWheelZoom={false} dragging={!coarse} className="h-full w-full">
          <BaseLayer basemap="auto" />
          <ZoomControl position="bottomright" />
          <MapResize />
          <AreaFocus area={area} filtered={filtered} padding={MAP_PAD} />
          {geo && (
            <GeoJSON
              key={sig}
              data={geo}
              style={(f) => {
                const e = byCode.get(f.properties.code);
                return e
                  ? { color: risk(e.level).hex, weight: 1.5, fillColor: risk(e.level).hex, fillOpacity: 0.45 }
                  : { color: NO_DATA.hex, weight: 0.6, opacity: 0.5, fillOpacity: 0 };
              }}
              onEachFeature={(f, layer) => {
                const e = byCode.get(f.properties.code);
                if (!e) return;
                layer.bindTooltip(
                  `<b>${f.properties.name}</b><br>${e.list.map((b) => `${b.code} · ${LEVEL[b.severity]?.label} · đến ${dateTime(b.valid_until)}`).join('<br>')}`,
                  { sticky: true },
                );
              }}
            />
          )}
          {drawn.map((b) => (
            <GeoJSON key={`${b.id}-${b.severity}`} data={b.target_geom} style={{ color: risk(SEVERITY_LEVEL[b.severity]).hex, weight: 2.5, dashArray: '6 5', fillOpacity: 0.08 }}>
              <Tooltip sticky>{b.code} · vùng vẽ tay · {b.title}</Tooltip>
            </GeoJSON>
          ))}
        </MapContainer>
        {!geo && geoError && (
          <div role="alert" className="absolute inset-x-2 top-2 z-[500] flex flex-wrap items-center justify-center gap-2 rounded-lg border border-danger/40 bg-panel/95 px-3 py-2 text-center text-xs text-danger shadow">
            Không tải được ranh giới xã/phường
            <button type="button" className="btn-ghost tap min-h-[32px] px-2 py-0.5 text-xs" onClick={() => refetch()}>Thử lại</button>
          </div>
        )}
        {geo && !live.length && (
          <div className="pointer-events-none absolute inset-x-2 top-2 z-[500] rounded-lg bg-panel/90 px-3 py-2 text-center text-xs text-ink-2 shadow">Không có cảnh báo đang hiệu lực</div>
        )}
      </div>
      <Legend
        items={[
          { label: `${LEVEL.do.label} · Đỏ`, color: RISK[3].hex },
          { label: `${LEVEL.cam.label} · Cam`, color: RISK[2].hex },
          { label: `${LEVEL.vang.label} · Vàng`, color: RISK[1].hex },
          { label: 'Vùng vẽ tay', color: NO_DATA.hex, dashed: true },
        ]}
      />
      {coarse && <p className="text-[11px] text-muted">Chạm xã để xem lệnh · hai ngón tay để kéo, phóng bản đồ</p>}
      {byCode.size > 0 && geo && (
        <ul className="flex flex-col gap-1 text-xs">
          {[3, 2, 1].map((lv) => {
            const n = names(lv);
            if (!n.length) return null;
            return (
              <li key={lv} className="flex items-start gap-1.5">
                <span className={clsx('mt-1 h-2.5 w-2.5 shrink-0 rounded-sm', risk(lv).fill)} aria-hidden="true" />
                <span className="min-w-0 [overflow-wrap:anywhere]"><b>{risk(lv).name} — {n.length} xã:</b> {n.sort((a, b) => a.localeCompare(b, 'vi')).join(', ')}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
