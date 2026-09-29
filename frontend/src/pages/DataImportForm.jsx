import { useCallback, useEffect, useState } from 'react';
import { GeoJSON, MapContainer, Marker, useMap, useMapEvents } from 'react-leaflet';
import { FileCheck2, MapPin, Pentagon, Plus, Trash2 } from 'lucide-react';
import { Modal } from '../components/common/ui';
import { AdminBoundaries, BaseLayer, DrawTool } from '../components/map/MapTools';
import { pinIcon } from '../components/map/icons';
import { useUnits, useUnitsGeo } from '../api/hooks';

const LOCATION = new Set(['vi_do', 'kinh_do']);
const pretty = (code) => String(code).replaceAll('_', ' ');

/** CSV theo RFC 4180 (ô có dấu phẩy / nháy / xuống dòng được bọc nháy kép). */
function toCsv(fields, rows) {
  const cell = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  const lines = [fields.map((f) => f.name), ...rows.map((r) => fields.map((f) => r[f.name]))];
  return lines.map((line) => line.map(cell).join(',')).join('\r\n');
}

/** Form nhập trực tiếp → tệp CSV / GeoJSON như người dùng tự tải lên: máy chủ kiểm tra cùng một đường, không có
 * đường ghi dữ liệu riêng cho form. */
function formToFile(ds, rows) {
  if (ds.geometry === 'polygon') {
    const features = rows.map(({ geometry, ...props }) => ({ type: 'Feature', properties: props, geometry: geometry || null }));
    return new File([JSON.stringify({ type: 'FeatureCollection', features })], `nhap_truc_tiep_${ds.name}.geojson`, {
      type: 'application/geo+json',
    });
  }
  return new File(['﻿' + toCsv(ds.fields, rows)], `nhap_truc_tiep_${ds.name}.csv`, { type: 'text/csv' });
}

function FieldInput({ f, value, onChange, communes }) {
  const label = (
    <span className="text-xs">
      {f.label}
      {f.required && <span className="text-danger"> *</span>}
    </span>
  );
  let input;
  if (f.name === 'ma_xa' && communes?.length) {
    input = (
      <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">— chọn xã/phường —</option>
        {communes.map((u) => <option key={u.code} value={u.code}>{u.name} ({u.code})</option>)}
      </select>
    );
  } else if (f.kind === 'enum') {
    input = (
      <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
        {(!f.required || f.choices.length > 1) && <option value="">—</option>}
        {f.choices.map((c) => <option key={c} value={c}>{pretty(c)}</option>)}
      </select>
    );
  } else if (f.kind === 'bool') {
    input = (
      <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        <option value="có">có</option>
        <option value="không">không</option>
      </select>
    );
  } else {
    const type = { int: 'number', float: 'number', date: 'date' }[f.kind] || 'text';
    input = (
      <input
        className="input"
        type={type}
        step={f.kind === 'float' ? 'any' : undefined}
        value={value}
        placeholder={f.example ? `VD ${f.example}` : f.kind === 'list' ? 'cách nhau dấu ;' : ''}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  return <label className="flex min-w-0 flex-col gap-1">{label}{input}</label>;
}

/**
 * Nhập trực tiếp từng bản ghi (thay cho tải tệp) — dành cho cán bộ không quen Excel / GIS.
 * `communes`: xã/phường được chọn (hồ sơ của xã: chỉ các xã mình phụ trách); `onReady(file)`: tệp đã sinh để kiểm tra.
 */
export default function RecordForm({ ds, communes, onReady }) {
  const blank = useCallback(() => {
    const r = {};
    ds.fields.forEach((f) => {
      r[f.name] = f.choices.length === 1 ? f.choices[0] : ''; // VD xã chỉ gửi kho cấp "xa" → điền sẵn
    });
    if ('ma_xa' in r && communes?.length === 1) r.ma_xa = communes[0].code;
    return r;
  }, [ds, communes]);
  const [rows, setRows] = useState(() => [blank()]);
  const [picking, setPicking] = useState(null); // chỉ số bản ghi đang chọn vị trí / vẽ vùng
  // Danh sách xã tải xong sau khi mở form: phụ trách đúng 1 xã → điền sẵn cho các bản ghi chưa chọn
  const only = communes?.length === 1 ? communes[0].code : null;
  useEffect(() => {
    if (only) setRows((rs) => rs.map((r) => ('ma_xa' in r && !r.ma_xa ? { ...r, ma_xa: only } : r)));
  }, [only]);
  const set = (i, patch) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const fields = ds.fields.filter((f) => !LOCATION.has(f.name));
  const located = (r) => (ds.geometry === 'polygon' ? !!r.geometry : r.vi_do !== '' && r.kinh_do !== '');

  return (
    <div className="flex flex-col gap-3">
      {rows.map((r, i) => (
        <fieldset key={i} className="rounded-lg border border-line p-3">
          <legend className="px-1 text-xs font-semibold text-muted">Bản ghi {i + 1}</legend>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {fields.map((f) => (
              <FieldInput key={f.name} f={f} value={r[f.name] ?? ''} communes={communes} onChange={(v) => set(i, { [f.name]: v })} />
            ))}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {ds.geometry !== 'none' && (
              <>
                <button type="button" className="btn-ghost text-xs" onClick={() => setPicking(i)}>
                  {ds.geometry === 'polygon' ? <Pentagon size={14} /> : <MapPin size={14} />}
                  {ds.geometry === 'polygon' ? 'Vẽ vùng trên bản đồ' : 'Chọn vị trí trên bản đồ'}
                </button>
                <span className={located(r) ? 'text-xs text-good' : 'text-xs text-muted'}>
                  {ds.geometry === 'polygon'
                    ? r.geometry ? 'Đã vẽ vùng' : 'Chưa vẽ vùng'
                    : located(r) ? `${Number(r.vi_do).toFixed(5)}, ${Number(r.kinh_do).toFixed(5)}` : 'Chưa chọn vị trí'}
                </span>
              </>
            )}
            {rows.length > 1 && (
              <button type="button" className="btn-ghost ml-auto text-xs text-danger" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}>
                <Trash2 size={14} /> Bỏ bản ghi
              </button>
            )}
          </div>
        </fieldset>
      ))}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-ghost" onClick={() => setRows((rs) => [...rs, blank()])}>
          <Plus size={15} /> Thêm bản ghi
        </button>
        <button type="button" className="btn-primary" onClick={() => onReady(formToFile(ds, rows))}>
          <FileCheck2 size={15} /> Kiểm tra dữ liệu
        </button>
      </div>
      {picking !== null && (
        <LocationModal
          ds={ds}
          row={rows[picking]}
          onClose={() => setPicking(null)}
          onPick={(v) =>
            set(picking, ds.geometry === 'polygon' ? { geometry: v } : { vi_do: v.lat.toFixed(6), kinh_do: v.lon.toFixed(6) })
          }
        />
      )}
    </div>
  );
}

function PointPicker({ value, onChange }) {
  useMapEvents({ click: (e) => onChange({ lat: e.latlng.lat, lon: e.latlng.lng }) });
  return value ? <Marker position={[value.lat, value.lon]} icon={pinIcon('!', '#dc2626')} /> : null;
}

/** Bản đồ mở ở xã của bản ghi (hoặc toàn tỉnh). */
function FitCommune({ code }) {
  const map = useMap();
  const { data: units } = useUnits();
  useEffect(() => {
    const u = units?.find((x) => x.code === code);
    if (u?.bbox) map.fitBounds([[u.bbox[1], u.bbox[0]], [u.bbox[3], u.bbox[2]]], { padding: [20, 20] });
  }, [units, code, map]);
  return null;
}

function LocationModal({ ds, row, onPick, onClose }) {
  const polygon = ds.geometry === 'polygon';
  const initial = polygon
    ? row.geometry || null
    : row.vi_do !== '' && row.kinh_do !== '' ? { lat: Number(row.vi_do), lon: Number(row.kinh_do) } : null;
  const [value, setValue] = useState(initial);
  const [mode, setMode] = useState(polygon && !initial ? 'polygon' : null);
  const { data: geo } = useUnitsGeo();
  const onDrawn = useCallback((g) => {
    setValue(g);
    setMode(null);
  }, []);
  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={polygon ? 'Vẽ vùng trên bản đồ' : 'Chọn vị trí trên bản đồ'}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>Huỷ</button>
          <button className="btn-primary" disabled={!value} onClick={() => { onPick(value); onClose(); }}>
            Dùng {polygon ? 'vùng' : 'vị trí'} này
          </button>
        </>
      }
    >
      <p className="mb-2 text-xs text-muted">
        {polygon
          ? 'Bấm lần lượt các đỉnh của vùng, bấm lại đỉnh đầu tiên để khép vùng.'
          : 'Bấm lên bản đồ để đặt vị trí (phóng to để đặt chính xác).'}
      </p>
      <div className="h-[26rem] overflow-hidden rounded-lg border border-line">
        <MapContainer center={[22.75, 106.05]} zoom={9} zoomSnap={0.25} className="h-full w-full">
          <BaseLayer basemap="auto" />
          <AdminBoundaries geo={geo} />
          <FitCommune code={row.ma_xa} />
          {polygon ? (
            <>
              <DrawTool mode={mode} onDrawn={onDrawn} />
              {initial && value === initial && <GeoJSON data={initial} style={{ color: '#ef4444', weight: 2 }} />}
            </>
          ) : (
            <PointPicker value={value} onChange={setValue} />
          )}
        </MapContainer>
      </div>
      {polygon && (
        <button type="button" className="btn-ghost mt-2 text-xs" onClick={() => { setValue(null); setMode('polygon'); }}>
          <Pentagon size={14} /> {value ? 'Vẽ lại' : 'Bắt đầu vẽ'}
        </button>
      )}
    </Modal>
  );
}
