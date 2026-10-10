import { Fragment } from 'react';
import { RiskLegend } from '../common/ui';
import { RAIN_BINS } from './MapTools';
import {
  cameraIcon, COLORS, evacIcon, forceIcon, hazardIcon, reportIcon, reservoirIcon, sosIcon, stationIcon, stormIcon, vehicleIcon,
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
        <b>Trạm mực nước</b> — viền theo báo động BĐ I / II / III (Vàng / Cam / Đỏ), số = mực nước (m)
      </Row>
      <Row sym={<Ico icon={stationIcon('luong_mua', 0, '12')} />}><b>Trạm đo mưa</b> — số = mưa 24 giờ (mm)</Row>
      <Row sym={<Ico icon={stationIcon('muc_nuoc', null, undefined, true)} />}>Xám, nét đứt: mất tín hiệu / chưa có số đo</Row>
    </>
  ),
  reservoirs: () => <Row sym={<Ico icon={reservoirIcon(2)} />}><b>Hồ chứa</b> — viền cam: đang mở cửa xả (số cửa)</Row>,
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
  warehouses: () => <Row sym={<Ico icon={warehouseIcon(15)} />}><b>Kho vật tư</b> — viền đỏ: tồn dưới 20% định mức, cam: dưới 50%</Row>,
  evac: () => <Row sym={<Ico icon={evacIcon(0.9)} />}><b>Điểm sơ tán</b> — viền cam: trên 85% sức chứa, đỏ: đã đầy</Row>,
  cameras: () => <Row sym={<Ico icon={cameraIcon()} />}><b>Camera</b> — bấm để xem trực tiếp</Row>,
};

/**
 * Chú giải bản đồ cán bộ: thang màu rủi ro dùng chung + biểu tượng của các lớp ĐANG BẬT (thứ tự như bảng lớp). Lớp mưa
 * dự báo có thang màu riêng (một sắc độ xanh, không phải màu rủi ro).
 */
export default function MapLegend({ layers, order }) {
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
          <div className="mb-1 font-bold text-ink">Mưa dự báo 24 giờ tới (P50)</div>
          <ul className="grid grid-cols-2 gap-1">
            {RAIN_BINS.map((b) => (
              <li key={b.label} className="flex items-center gap-1.5">
                <span className="h-3 w-5 rounded-sm" style={{ background: b.color }} aria-hidden="true" />
                {b.label}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
