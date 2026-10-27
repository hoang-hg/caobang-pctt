import { Fragment } from 'react';
import clsx from 'clsx';
import { RiskLegend } from '../common/ui';
import { RADAR_BINS } from './MapTools';
import {
  blackspotIcon, cameraIcon, COLORS, evacIcon, forceIcon, hazardIcon, reportIcon, reservoirIcon, sosIcon, stationIcon, stormIcon, vehicleIcon,
  warehouseIcon,
} from './icons';

/** Đúng biểu tượng đang vẽ trên bản đồ (mã HTML của icons.js — SVG tĩnh viết trong mã, không chứa dữ liệu người dùng). */
const Ico = ({ icon }) => (
  <span
    className="pointer-events-none inline-flex h-8 w-9 shrink-0 items-center justify-center [&>div]:!shadow-none"
    aria-hidden="true"
    // chuỗi SVG cố định của icons.js — không có dữ liệu từ máy chủ / người dùng
    dangerouslySetInnerHTML={{ __html: icon.options.html }}
  />
);

const Swatch = ({ style }) => <span className="mx-0.5 inline-block h-4 w-8 shrink-0 rounded-sm border" style={style} aria-hidden="true" />;

/**
 * Dải màu mưa dự báo liền như trang tham khảo (docs/ke-hoach-lam-moi-giao-dien.md 6.4): các nấc nối liền, số ngưỡng ở chỗ
 * nối, hai đầu "Mưa nhỏ" → "Mưa rất to". Nấc rời, không chuyển màu dần — lớp mưa dự báo tô mỗi xã đúng một màu theo
 * khoảng. `bins` = thang đang vẽ (MapTools `rainScale`), `unit` ghi sau số ngưỡng cuối ("mm", "mm/giờ"). `compact`: bỏ hàng
 * số ngưỡng (thẻ góc bản đồ điện thoại — đỡ che bản đồ; số ngưỡng xem ở Chú giải).
 */
export function RainBar({ bins, unit, compact = false }) {
  return (
    <div className="w-full min-w-[10rem]">
      <div className="flex h-2.5 overflow-hidden rounded-sm" role="img" aria-label={`Thang màu: ${bins.map((b) => b.label).join(', ')}`}>
        {bins.map((b) => <span key={b.label} className="flex-1" style={{ background: b.color }} title={b.label} />)}
      </div>
      <div className={clsx('num relative mt-0.5 h-3 text-[10px] leading-none text-muted', compact && 'hidden')} aria-hidden="true">
        {bins.slice(0, -1).map((b, i) => (
          <span key={b.max} className="absolute top-0 -translate-x-1/2 whitespace-nowrap" style={{ left: `${((i + 1) / bins.length) * 100}%` }}>
            {b.max}{i === bins.length - 2 && ` ${unit}`}
          </span>
        ))}
      </div>
      <div className={clsx('flex justify-between text-[10px] font-medium leading-tight text-ink-2', compact && 'mt-0.5')} aria-hidden="true">
        <span>Mưa nhỏ</span>
        <span>Mưa rất to</span>
      </div>
    </div>
  );
}

const RADAR_SHORT = ['Nhỏ–vừa', 'To', 'Rất to', 'Dông'];

/**
 * Thang màu radar (cường độ mưa lúc chụp ảnh) — dải liền 8 sắc của bảng màu RainViewer, dưới mỗi phần tư ghi nhóm mưa
 * (Mưa nhỏ – vừa · Mưa to · Mưa rất to · Dông rất mạnh). Dùng chung cho thẻ góc bản đồ và chú giải.
 */
export function RadarScale() {
  return (
    <div className="w-full min-w-[10rem]">
      <div className="flex h-2.5 overflow-hidden rounded-sm" role="img" aria-label={`Thang màu radar: ${RADAR_BINS.map((b) => b.label).join(', ')}`}>
        {RADAR_BINS.flatMap((b) => b.colors.map((c) => <span key={c} className="flex-1" style={{ background: c }} title={b.label} />))}
      </div>
      <div className="mt-0.5 grid grid-cols-4 whitespace-nowrap text-center text-[10px] font-medium leading-tight text-ink-2" aria-hidden="true">
        {RADAR_SHORT.map((t) => <span key={t}>{t}</span>)}
      </div>
    </div>
  );
}

const Row = ({ sym, children }) => (
  <li className="flex items-center gap-2 py-0.5">
    {sym}
    <span className="min-w-0 leading-snug">{children}</span>
  </li>
);

/** Từng lớp → các dòng chú giải (chỉ hiện lớp đang bật, để chú giải luôn ngắn). */
const ROWS = {
  sos: () => (
    <Row sym={<Ico icon={sosIcon(1, 'moi')} />}>
      <b>SOS</b> — màu theo cấp: Đỏ cấp 1, Cam cấp 2, Vàng cấp 3; nhấp nháy = phiếu mới chưa tiếp nhận
    </Row>
  ),
  stations: () => (
    <>
      <Row sym={<Ico icon={stationIcon('muc_nuoc', 2, '2.1')} />}>
        <b>Trạm mực nước</b> — viền theo báo động I / II / III (Vàng / Cam / Đỏ), số = mực nước (m)
      </Row>
      <Row sym={<Ico icon={stationIcon('luong_mua', 0, '12')} />}><b>Trạm đo mưa</b> — số = cường độ mưa đo mới nhất (mm/giờ)</Row>
      <Row sym={<Ico icon={stationIcon('muc_nuoc', null, undefined, true)} />}>Xám, nét đứt: mất tín hiệu / chưa có số đo</Row>
    </>
  ),
  reservoirs: () => (
    <>
      <Row sym={<Ico icon={reservoirIcon(3, 3)} />}><b>Hồ chứa</b> xả lũ lớn (Đỏ) — nhãn dưới biểu tượng: số cửa đang mở · lưu lượng xả (m³/s)</Row>
      <Row sym={<Ico icon={reservoirIcon(1, 2)} />}>Hồ đang xả điều tiết (Cam)</Row>
      <Row sym={<Ico icon={reservoirIcon(0, 0)} />}>Hồ chưa xả tràn (Xanh)</Row>
      <Row sym={<Ico icon={reservoirIcon(0, null)} />}>Xám, nét đứt: chưa có số liệu vận hành</Row>
    </>
  ),
  storm: () => <Row sym={<Ico icon={stormIcon()} />}><b>Tâm bão</b> — nét liền: đã qua, nét đứt: dự báo; vòng tròn: gió mạnh</Row>,
  flood: () => (
    <Row sym={<Swatch style={{ background: 'rgba(37,99,235,.45)', borderColor: '#1d4ed8' }} />}>
      <b>Vùng ngập</b> — màu càng đậm ngập càng sâu
    </Row>
  ),
  landslide: () => (
    <Row sym={<Swatch style={{ background: `${COLORS.do}40`, borderColor: COLORS.do }} />}>
      <b>Vùng sạt lở / lũ quét</b> — màu theo mức nguy cơ
    </Row>
  ),
  blackspots: () => (
    <>
      <Row sym={<Ico icon={blackspotIcon(3)} />}>
        <b>Điểm đen sạt lở, đèo dốc</b> — Đỏ: cấm đường / nguy cơ rất cao, Cam: cảnh báo, Xanh: chưa ghi nhận nguy cơ
      </Row>
      <Row sym={<Ico icon={blackspotIcon(null)} />}>Xám, nét đứt: chưa có số liệu giám sát (không phải an toàn)</Row>
    </>
  ),
  hazardPoints: () => (
    <>
      <Row sym={<Ico icon={hazardIcon('sat_lo', 'do')} />}><b>Điểm sạt lở</b> — Đỏ: nguy cơ rất cao</Row>
      <Row sym={<Ico icon={hazardIcon('giao_thong', 'cam')} />}><b>Sự cố giao thông</b> (cây đổ, sập cầu…)</Row>
      <Row sym={<Ico icon={hazardIcon('ha_tang', 'vang')} />}><b>Sự cố hạ tầng</b> (đứt dây điện…)</Row>
    </>
  ),
  reports: () => (
    <>
      <Row sym={<Ico icon={reportIcon('cho_duyet')} />}><b>Phản ánh</b> chờ duyệt</Row>
      <Row sym={<Ico icon={reportIcon('da_duyet')} />}>Phản ánh đã duyệt / đang xử lý</Row>
    </>
  ),
  roads: () => (
    <Row sym={<Swatch style={{ borderColor: COLORS.do, borderStyle: 'dashed', borderWidth: 2, height: 4 }} />}>
      <b>Đoạn đường bị chặn</b> (đỏ nét đứt)
    </Row>
  ),
  forces: () => (
    <>
      <Row sym={<Ico icon={forceIcon('san_sang')} />}><b>Lực lượng</b> sẵn sàng — vị trí đơn vị</Row>
      <Row sym={<Ico icon={forceIcon('nhiem_vu')} />}>Lực lượng đang làm nhiệm vụ</Row>
    </>
  ),
  vehicles: () => (
    <Row sym={<Ico icon={vehicleIcon({ category: 'duong_thuy', status: 'nhiem_vu' })} />}>
      <b>Phương tiện</b> — viền cam: đang làm nhiệm vụ, xám: bảo dưỡng
    </Row>
  ),
  routes: () => (
    <Row sym={<Swatch style={{ borderColor: COLORS.good, borderStyle: 'dashed', borderWidth: 2, height: 4 }} />}>
      <b>Lộ trình điều động</b> — xanh: tránh vùng nguy hiểm, cam: đi qua
    </Row>
  ),
  warehouses: () => <Row sym={<Ico icon={warehouseIcon(15)} />}><b>Kho vật tư</b> — viền đỏ: có mặt hàng dưới 20% định mức, vàng: dưới 50%</Row>,
  evac: () => <Row sym={<Ico icon={evacIcon(0.9)} />}><b>Điểm sơ tán</b> — viền cam: trên 85% sức chứa, đỏ: đã đầy</Row>,
  cameras: () => <Row sym={<Ico icon={cameraIcon()} />}><b>Camera</b> — bấm để xem trực tiếp</Row>,
};

/**
 * Chú giải bản đồ cán bộ: thang màu rủi ro dùng chung + biểu tượng của các lớp ĐANG BẬT (thứ tự như bảng lớp). Lớp mưa
 * dự báo có thang màu riêng (một sắc độ xanh, không phải màu rủi ro): `rain` = thang đang vẽ (MapTools `rainScale`), không
 * vẽ được thì `rainNote` ghi vì sao (thời điểm đã qua, đang tải, lỗi, chưa có số liệu). Radar: `radarNote` = giờ của ảnh
 * đang hiện hoặc vì sao không có ảnh; bảng màu radar trùng sắc vàng / cam / đỏ nên ghi rõ không phải màu rủi ro.
 */
export default function MapLegend({ layers, order, rain, rainNote, radarNote }) {
  const keys = order.filter((k) => layers[k] && ROWS[k]);
  return (
    <div className="space-y-2 text-xs">
      <div>
        <div className="mb-1 font-bold text-ink">Thang màu rủi ro (dùng chung toàn hệ thống)</div>
        <RiskLegend className="!text-xs" />
      </div>
      {keys.length > 0 ? (
        <ul className="space-y-0.5 text-ink-2">{keys.map((k) => <Fragment key={k}>{ROWS[k]()}</Fragment>)}</ul>
      ) : (
        <p className="text-muted">Chưa bật lớp nào có biểu tượng.</p>
      )}
      {layers.forecast && (
        <div>
          <div className="mb-1 font-bold text-ink">{rain ? rain.title : 'Mưa dự báo theo xã'}</div>
          {rain ? (
            <RainBar bins={rain.bins} unit={rain.hourly ? 'mm/giờ' : 'mm'} />
          ) : (
            <p className="text-muted">{rainNote}</p>
          )}
        </div>
      )}
      {layers.radar && (
        <div>
          <div className="mb-1 font-bold text-ink">Radar mưa (RainViewer)</div>
          <p className="mb-1 text-muted">{radarNote}</p>
          <RadarScale />
          <p className="mt-1 text-muted">
            Màu là cường độ mưa lúc chụp ảnh — không phải lượng mưa cộng dồn, cũng không phải màu rủi ro. Kéo thanh thời gian
            về −1h, −2h để xem ảnh trước (chỉ lưu khoảng 2 giờ).
          </p>
        </div>
      )}
    </div>
  );
}
