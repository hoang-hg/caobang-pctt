import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { MapContainer, Marker, Popup } from 'react-leaflet';
import {
  Users, Ship, Package, AlertTriangle, FileSpreadsheet, FileDown, MapPin, Phone, Send, Truck, Wrench, Fuel, Search, PackageMinus,
} from 'lucide-react';
import { useAreaQuery } from '../api/hooks';
import { useStore } from '../app/store';
import { Empty, KpiCard, Modal, Progress, Section, StatusDot, Tabs } from '../components/common/ui';
import SuppliesChart from '../components/charts/SuppliesChart';
import DispatchModal from '../components/common/DispatchModal';
import IssueModal from '../components/common/IssueModal';
import { BaseLayer } from '../components/map/MapTools';
import { vehicleIcon } from '../components/map/icons';
import { CATEGORY, FORCE_TYPE, INCIDENT, PRIORITY, RES_STATUS, SKILL, VEHICLE, VEHICLE_CAT } from '../utils/labels';
import { dateTime, int } from '../utils/format';
import { exportExcel } from '../utils/exportExcel';
import { exportSnapshotPdf } from '../utils/exportPdf';
import { Can } from '../rbac/usePermission';

const norm = (s = '') => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').toLowerCase();
const Tel = ({ phone }) => <a href={`tel:${phone.replace(/\s/g, '')}`} className="inline-flex items-center gap-1 text-accent hover:underline"><Phone size={12} />{phone}</a>;

function QuickDispatch({ force, onClose }) {
  const { data: tickets = [] } = useAreaQuery('sos', '/sos');
  const [ticket, setTicket] = useState(null);
  if (ticket) return <DispatchModal ticket={ticket} presetForceId={force.id} onClose={onClose} />;
  const open = tickets.filter((t) => t.status === 'moi' || t.status === 'dieu_phoi');
  return (
    <Modal open onClose={onClose} title={`Điều động nhanh – ${force.name}`}>
      <p className="mb-2 text-sm text-muted">Chọn điểm nóng cần đến:</p>
      <div className="flex flex-col gap-1.5">
        {open.map((t) => (
          <button key={t.id} className="card flex items-center gap-2 p-2 text-left hover:border-accent" onClick={() => setTicket(t)}>
            <span className={clsx('chip', PRIORITY[t.priority].cls)}>{PRIORITY[t.priority].short}</span>
            <span className="text-sm"><b>{t.code}</b> · {INCIDENT[t.incident_type]} · {t.address || t.admin_name}</span>
          </button>
        ))}
        {!open.length && <Empty>Không có điểm nóng đang chờ điều phối</Empty>}
      </div>
    </Modal>
  );
}

export default function Resources() {
  const navigate = useNavigate();
  const setFocus = useStore((s) => s.setFocus);
  const filterLabel = useStore((s) => s.filter.label);
  const [tab, setTab] = useState('forces');
  const [status, setStatus] = useState('');
  const [level, setLevel] = useState('');
  const [q, setQ] = useState('');
  const [quick, setQuick] = useState(null);
  const [issue, setIssue] = useState(null);
  const tableRef = useRef(null);

  const { data: summary } = useAreaQuery('resources-summary', '/resources/summary', {}, { refetchInterval: 30_000 });
  const { data: forces = [] } = useAreaQuery('forces', '/resources/forces', { status: status || undefined, level: level || undefined });
  const { data: warehouses = [] } = useAreaQuery('warehouses', '/resources/warehouses', { level: level || undefined });
  const { data: vehicles = [] } = useAreaQuery('vehicles', '/resources/vehicles', { status: status || undefined });
  const { data: depots = [] } = useAreaQuery('fuel', '/resources/fuel-depots');

  const match = (...fields) => !q || fields.some((f) => norm(f).includes(norm(q)));
  const fForces = forces.filter((f) => match(f.name, f.commander, f.admin_name, ...(f.skills || []).map((s) => SKILL[s])));
  const fWarehouses = warehouses.filter((w) => match(w.name, w.admin_name));
  const fVehicles = vehicles.filter((v) => match(v.code, v.name, v.force_name, VEHICLE[v.vehicle_type]));
  const critical = useMemo(() => warehouses.filter((w) => w.alerts.critical.length || w.alerts.expiring.length), [warehouses]);

  const showOnMap = (lat, lon, label) => {
    setFocus({ lat, lon, zoom: 14, label });
    navigate('/ban-do');
  };

  const doExcel = () => {
    const stamp = new Date().toISOString().slice(0, 10);
    if (tab === 'forces') {
      exportExcel(fForces.map((f) => ({
        'Mã': f.code, 'Đơn vị': f.name, 'Loại': FORCE_TYPE[f.org_type], 'Cấp': f.level === 'tinh' ? 'Tỉnh' : 'Xã', 'Vị trí': f.base_name,
        'Tổng quân số': f.personnel_total, 'Sẵn sàng': f.personnel_ready, 'Đang nhiệm vụ': f.personnel_on_mission,
        'Chỉ huy': f.commander, 'SĐT': f.contact_phone, 'Tần số': f.radio_freq, 'Kỹ năng': f.skills.map((s) => SKILL[s]).join(', '),
      })), { sheet: 'Luc luong', filename: `luc-luong-cuu-ho-${stamp}.xlsx` });
    } else if (tab === 'supplies') {
      exportExcel(fWarehouses.flatMap((w) => w.items.map((i) => ({
        'Kho': w.name, 'Địa bàn': w.admin_name, 'Mặt hàng': i.name, 'Nhóm': CATEGORY[i.category], 'Tồn': i.quantity, 'Đơn vị': i.unit,
        'Định mức': i.safety_quota, '% định mức': i.pct, 'Hạn dùng': i.expiry_date || '',
      }))), { sheet: 'Ton kho', filename: `ton-kho-vat-tu-${stamp}.xlsx` });
    } else {
      exportExcel(fVehicles.map((v) => ({
        'Số hiệu': v.code, 'Tên': v.name, 'Loại': VEHICLE[v.vehicle_type], 'Nhóm': VEHICLE_CAT[v.category], 'Đơn vị': v.force_name,
        'Trạng thái': RES_STATUS[v.status].label, 'Nhiên liệu %': v.fuel_level, 'Nhiệm vụ': v.mission_code || '',
      })), { sheet: 'Phuong tien', filename: `phuong-tien-${stamp}.xlsx` });
    }
  };

  const doPdf = () =>
    exportSnapshotPdf(tableRef.current, {
      title: 'BÁO CÁO NGUỒN LỰC ỨNG PHÓ THIÊN TAI – TỈNH CAO BẰNG',
      subtitle: `${{ forces: 'Lực lượng cứu hộ', supplies: 'Kho vật tư & nhu yếu phẩm', vehicles: 'Phương tiện & thiết bị' }[tab]} · ${filterLabel} · ${new Date().toLocaleString('vi-VN')}`,
      filename: `nguon-luc-${tab}-${new Date().toISOString().slice(0, 10)}.pdf`,
    });

  const s = summary || {};
  return (
    <div className="flex flex-col gap-3 p-3">
      <div>
        <h1 className="text-lg font-bold">Quản lý Vật tư & Lực lượng cứu hộ – {filterLabel}</h1>
        <p className="text-xs text-muted">Ta đang có gì, ở đâu, tình trạng ra sao — số liệu tự nhảy khi kho xuất hàng hoặc lực lượng nhận lệnh</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Cán bộ, chiến sĩ sẵn sàng" value={int(s.forces?.ready)} icon={Users} sub={`${int(s.forces?.on_mission)} đang làm nhiệm vụ / tổng ${int(s.forces?.total)}`} />
        <KpiCard label="Xuồng / xe lội nước đang rảnh" value={`${int(s.vehicles?.boats_free)} / ${int(s.vehicles?.amphibious_free)}`} icon={Ship} sub={`${int(s.vehicles?.excavators_free)} máy xúc, máy ủi sẵn sàng`} />
        <KpiCard label="Dự trữ lương thực / nước uống" value={`${s.stock?.food_pct ?? '–'}% / ${s.stock?.water_pct ?? '–'}%`} icon={Package} sub="so với định mức an toàn" tone={s.stock?.food_pct < 50 || s.stock?.water_pct < 50 ? 'warn' : undefined} />
        <KpiCard
          label="Kho cạn kiệt (<20%) / sắp hết hạn"
          value={`${int(s.stock?.critical_warehouses)} / ${int(s.stock?.expiring_items)}`}
          icon={AlertTriangle}
          tone={s.stock?.critical_warehouses ? 'danger' : undefined}
          sub={critical.slice(0, 2).map((w) => w.name.replace('Kho cụm ', '')).join(', ')}
        />
      </div>

      <div className="card flex flex-wrap items-center gap-2 p-2">
        <div className="relative min-w-[14rem] flex-1">
          <Search size={14} className="absolute left-3 top-2.5 text-muted" />
          <input className="input pl-8" placeholder="Tìm nhanh đơn vị, chỉ huy, kỹ năng, số hiệu…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="input w-auto" value={level} onChange={(e) => setLevel(e.target.value)} aria-label="Cấp quản lý">
          <option value="">Mọi cấp quản lý</option>
          <option value="tinh">Cấp tỉnh</option>
          <option value="cum">Kho cụm</option>
          <option value="xa">Cấp xã</option>
        </select>
        <select className="input w-auto" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Tình trạng">
          <option value="">Mọi tình trạng</option>
          {Object.entries(RES_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <button className="btn-ghost" onClick={doExcel}><FileSpreadsheet size={15} /> Excel</button>
        <button className="btn-ghost" onClick={doPdf}><FileDown size={15} /> PDF</button>
      </div>

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'forces', label: 'Lực lượng', icon: Users, count: fForces.length },
          { value: 'supplies', label: 'Vật tư – Nhu yếu phẩm', icon: Package, count: fWarehouses.length },
          { value: 'vehicles', label: 'Phương tiện – Trang thiết bị', icon: Truck, count: fVehicles.length },
        ]}
      />

      <div ref={tableRef} className="bg-bg">
        {tab === 'forces' && (
          <div className="card overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr><th>Đơn vị</th><th>Quân số</th><th>Vị trí đóng quân</th><th>Chỉ huy & liên lạc</th><th>Kỹ năng đặc thù</th><th className="no-print" /></tr>
              </thead>
              <tbody>
                {fForces.map((f) => (
                  <tr key={f.id}>
                    <td>
                      <div className="flex items-center gap-2 font-medium"><StatusDot cls={RES_STATUS[f.status].dot} />{f.name}</div>
                      <div className="text-xs text-muted">{FORCE_TYPE[f.org_type]} · cấp {f.level === 'tinh' ? 'tỉnh' : 'xã'} · {f.vehicle_count} phương tiện</div>
                    </td>
                    <td className="whitespace-nowrap">
                      <div className="font-mono text-sm">{f.personnel_total} / <span className="text-good">{f.personnel_ready}</span> / <span className="text-warn">{f.personnel_on_mission}</span></div>
                      <div className="text-[11px] text-muted">tổng / sẵn sàng / nhiệm vụ</div>
                    </td>
                    <td>
                      <div className="text-sm">{f.base_name}</div>
                      <button className="no-print inline-flex items-center gap-1 text-xs text-accent hover:underline" onClick={() => showOnMap(f.lat, f.lon, f.name)}><MapPin size={12} /> Xem trên bản đồ</button>
                    </td>
                    <td className="text-sm">
                      <div>{f.commander}</div>
                      <Tel phone={f.contact_phone} />
                      <div className="text-xs text-muted">📻 {f.radio_freq}</div>
                    </td>
                    <td><div className="flex max-w-[16rem] flex-wrap gap-1">{f.skills.map((sk) => <span key={sk} className="chip bg-panel2 text-ink-2">{SKILL[sk]}</span>)}</div></td>
                    <td className="no-print">
                      <Can I="dispatch" a="create">
                        <button className="btn-danger px-2 py-1 text-xs" disabled={f.personnel_ready < 1} onClick={() => setQuick(f)}><Send size={12} /> Điều động nhanh</button>
                      </Can>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!fForces.length && <Empty />}
          </div>
        )}

        {tab === 'supplies' && (
          <div className="flex flex-col gap-3">
            <Section title="Biểu đồ phân bổ – kho đầy / kho thiếu (điều tiết liên vùng)"><SuppliesChart height={260} /></Section>
            <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
              {fWarehouses.map((w) => (
                <div key={w.id} className={clsx('card p-3', w.alerts.critical.length && 'border-danger/60')}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold">{w.name}</div>
                      <div className="text-xs text-muted">{{ tinh: 'Kho dự trữ tỉnh', cum: 'Kho cụm', da_chien: 'Kho dã chiến', xa: 'Kho xã' }[w.level]} · {w.admin_name} · {w.manager} · <Tel phone={w.phone} /></div>
                    </div>
                    <div className="no-print flex gap-1">
                      <button className="btn-ghost px-2 py-1" title="Xem trên bản đồ" onClick={() => showOnMap(w.lat, w.lon, w.name)}><MapPin size={14} /></button>
                      <Can I="inventory" a="issue" scope={w.admin_code}>
                        <button className="btn-primary px-2 py-1 text-xs" onClick={() => setIssue(w)}><PackageMinus size={12} /> Xuất kho</button>
                      </Can>
                    </div>
                  </div>
                  {!w.items.length && <p className="mt-2 text-xs text-muted">Chưa có số liệu tồn kho — nhập bằng loại dữ liệu “Tồn kho”.</p>}
                  <table className="mt-2 w-full text-xs">
                    <tbody>
                      {w.items.map((i) => {
                        const exp = w.alerts.expiring.includes(i.item_code);
                        const low = i.pct < 20;
                        return (
                          <tr key={i.item_code} className="border-b border-line/50">
                            <td className="py-1 pr-2">{i.name}</td>
                            <td className="w-24 py-1"><Progress value={i.pct} tone={low ? 'danger' : i.pct < 50 ? 'warn' : 'good'} /></td>
                            <td className={clsx('py-1 pl-2 text-right font-mono', low && 'font-semibold text-danger')}>{int(i.quantity)} {i.unit}</td>
                            <td className="py-1 pl-2 text-right">
                              {low && <span className="chip bg-danger text-white">Cạn kiệt</span>}
                              {exp && <span className="chip bg-serious text-white" title={`Hạn dùng ${i.expiry_date}`}>Sắp hết hạn</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <div className="mt-1 text-[11px] text-muted">Cập nhật: {dateTime(w.items.reduce((m, i) => (i.last_updated > m ? i.last_updated : m), ''))}</div>
                </div>
              ))}
            </div>
            {!fWarehouses.length && <Empty />}
          </div>
        )}

        {tab === 'vehicles' && (
          <div className="grid gap-3 xl:grid-cols-[1fr_420px]">
            <div className="card overflow-x-auto">
              <table className="table-base">
                <thead><tr><th>Số hiệu</th><th>Loại</th><th>Đơn vị quản lý</th><th>Trạng thái</th><th>Nhiên liệu</th><th className="no-print" /></tr></thead>
                <tbody>
                  {Object.keys(VEHICLE_CAT).map((cat) => {
                    const list = fVehicles.filter((v) => v.category === cat);
                    if (!list.length) return null;
                    return [
                      <tr key={cat}><td colSpan={6} className="bg-panel2/60 text-xs font-semibold uppercase text-muted">{VEHICLE_CAT[cat]} ({list.length})</td></tr>,
                      ...list.map((v) => (
                        <tr key={v.id}>
                          <td className="font-mono font-semibold">{v.code}</td>
                          <td>{VEHICLE[v.vehicle_type]}{v.capacity ? <span className="text-xs text-muted"> · {v.capacity} chỗ</span> : ''}</td>
                          <td className="text-sm">{v.force_name}</td>
                          <td>
                            <div className="flex items-center gap-1.5 text-sm">
                              {v.status === 'bao_duong' ? <Wrench size={13} className="text-danger" /> : <StatusDot cls={RES_STATUS[v.status].dot} />}
                              {RES_STATUS[v.status].label}
                            </div>
                            {v.status === 'nhiem_vu' && v.mission_code && (
                              <div className="mt-0.5 text-xs text-muted">{v.mission_code} · <Progress value={(v.mission_progress || 0) * 100} tone="warn" className="inline-block w-20 align-middle" /></div>
                            )}
                          </td>
                          <td className="w-32">
                            <div className="flex items-center gap-1 text-xs"><Fuel size={12} /> {v.fuel_level}%</div>
                            <Progress value={v.fuel_level} tone={v.fuel_level < 30 ? 'danger' : v.fuel_level < 60 ? 'warn' : 'good'} />
                          </td>
                          <td className="no-print"><button className="btn-ghost px-2 py-1" title="Xem trên bản đồ" onClick={() => showOnMap(v.lat, v.lon, v.code)}><MapPin size={14} /></button></td>
                        </tr>
                      )),
                    ];
                  })}
                </tbody>
              </table>
              {!fVehicles.length && <Empty />}
            </div>
            <div className="flex flex-col gap-3">
              <Section title="Vị trí phương tiện" bodyClass="pb-3">
                <div className="h-72 overflow-hidden rounded-lg">
                  <MapContainer center={[22.75, 106.05]} zoom={8} className="h-full w-full" scrollWheelZoom={false}>
                    <BaseLayer basemap="auto" showNav={false} />
                    {fVehicles.filter((v) => v.lat).map((v) => (
                      <Marker key={v.id} position={[v.lat, v.lon]} icon={vehicleIcon(v)}>
                        <Popup><b>{v.code}</b> {VEHICLE[v.vehicle_type]}<br />{v.force_name}</Popup>
                      </Marker>
                    ))}
                  </MapContainer>
                </div>
              </Section>
              <Section title="Quản lý nhiên liệu dự trữ">
                <div className="flex flex-col gap-2">
                  {depots.map((d) => (
                    <div key={d.id} className="text-sm">
                      <div className="flex justify-between"><span>{d.name}</span><span className="font-mono text-xs">{int(d.gasoline_l + d.diesel_l)} / {int(d.capacity_l)} L</span></div>
                      <div className="flex gap-2 text-[11px] text-muted"><span>Xăng {int(d.gasoline_l)} L</span><span>Dầu {int(d.diesel_l)} L</span></div>
                      <Progress value={(100 * (d.gasoline_l + d.diesel_l)) / d.capacity_l} tone={(d.gasoline_l + d.diesel_l) / d.capacity_l < 0.3 ? 'danger' : 'accent'} />
                    </div>
                  ))}
                </div>
              </Section>
            </div>
          </div>
        )}
      </div>

      {quick && <QuickDispatch force={quick} onClose={() => setQuick(null)} />}
      <IssueModal warehouse={issue} onClose={() => setIssue(null)} />
    </div>
  );
}
