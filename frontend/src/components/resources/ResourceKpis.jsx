import { AlertTriangle, Package, Ship, Users } from 'lucide-react';
import StatCard, { Badge } from '../dashboard/StatCard';
import { ErrorState, Skeleton } from '../common/ui';
import { int } from '../../utils/format';
import { STOCK_LOW, STOCK_WATCH, stockLevel } from '../../utils/risk';
import { warehouseFacts } from './resourceFacts';

const GRID = 'grid grid-cols-2 gap-2 lg:grid-cols-4 [&>*]:min-w-0';
const STOCK_BADGE = { 3: `Dưới ${STOCK_LOW}%`, 1: `Dưới ${STOCK_WATCH}%` };

/**
 * 4 ô chỉ số của thiết kế C (lãnh đạo đọc trong vài giây): quân số sẵn sàng · xuồng, xe lội nước đang rảnh · dự trữ lương
 * thực, nước uống so với định mức · kho cạn kiệt / hàng sắp hết hạn. Cùng kiểu ô của Tổng quan (StatCard gọn): vạch màu theo
 * thang rủi ro chung, ô Xám nét đứt = chưa có dữ liệu. Chạm ô → thẻ + bộ lọc tương ứng (`onGo(tab, filter)`).
 * Ô kho tính từ danh sách kho đang tải (đếm như dải khẩn và bộ lọc "Mức dự trữ"); danh sách lỗi thì dùng số tổng hợp.
 */
export default function ResourceKpis({ summaryQ, warehouses, onGo }) {
  const s = summaryQ.data;
  if (!s) {
    return summaryQ.isError
      ? <ErrorState height={96} onRetry={summaryQ.refetch}>Không tải được chỉ số nguồn lực</ErrorState>
      : <div className={GRID} role="group" aria-label="Chỉ số nguồn lực" aria-busy="true">{[0, 1, 2, 3].map((i) => <Skeleton key={i} height={96} />)}</div>;
  }
  const fo = s.forces || {};
  const ve = s.vehicles || {};
  const st = s.stock || {};

  const facts = warehouses?.map(warehouseFacts);
  const low = facts ? facts.filter((x) => x.low.length).length : st.critical_warehouses || 0;
  const expiring = facts ? facts.reduce((n, x) => n + x.expiring.length, 0) : st.expiring_items || 0;
  const hasStock = facts ? facts.some((x) => x.rated.length) : st.food_pct != null || st.water_pct != null;
  const stockLv = stockLevel([st.food_pct, st.water_pct].filter((v) => v != null).reduce((m, v) => Math.min(m, v), Infinity));
  const foodWaterLv = st.food_pct == null && st.water_pct == null ? null : stockLv;
  const pct = (v) => (v == null ? '–' : `${v}%`);

  return (
    <div className={GRID} role="group" aria-label="Chỉ số nguồn lực">
      <StatCard
        compact
        footerRows
        icon={Users}
        title={<><span className="sm:hidden">Quân số sẵn sàng</span><span className="hidden sm:inline">Cán bộ, chiến sĩ sẵn sàng</span></>}
        level={!fo.total ? null : fo.ready ? undefined : 3}
        badge={!fo.total ? <Badge level={null}>Chưa có dữ liệu</Badge> : !fo.ready && <Badge level={3}>Hết quân sẵn sàng</Badge>}
        value={fo.total ? int(fo.ready) : '–'}
        unit={fo.total ? `/ ${int(fo.total)}` : undefined}
        footer={fo.total ? `${int(fo.on_mission)} người đang làm nhiệm vụ` : 'Chưa nhập lực lượng trong vùng'}
        onClick={() => onGo('luc_luong', {})}
        hint="Quân số sẵn sàng / tổng quân số của các đơn vị trong vùng đang xem — chạm để xem danh sách lực lượng"
      />
      <StatCard
        compact
        footerRows
        icon={Ship}
        title={<><span className="sm:hidden">Xuồng rảnh</span><span className="hidden sm:inline">Xuồng, xe lội nước rảnh</span></>}
        level={!ve.boats_total ? null : ve.boats_free ? undefined : 3}
        badge={!ve.boats_total ? <Badge level={null}>Chưa có xuồng</Badge> : !ve.boats_free && <Badge level={3}>Hết xuồng rảnh</Badge>}
        value={ve.boats_total ? int(ve.boats_free) : '–'}
        unit={ve.boats_total ? `/ ${int(ve.boats_total)} xuồng` : undefined}
        footer={`${int(ve.amphibious_free)} xe lội nước · ${int(ve.excavators_free)} máy xúc, ủi sẵn sàng`}
        onClick={() => onGo('phuong_tien', { nhom: 'duong_thuy', tt: 'san_sang' })}
        hint="Xuồng, ca nô, ghe đang sẵn sàng / tổng số; xe lội nước, máy xúc, máy ủi sẵn sàng — chạm để xem phương tiện đường thủy sẵn sàng"
      />
      <StatCard
        compact
        footerRows
        icon={Package}
        title={<><span className="sm:hidden">Lương thực, nước</span><span className="hidden sm:inline">Dự trữ lương thực · nước uống</span></>}
        level={foodWaterLv}
        badge={foodWaterLv == null ? <Badge level={null}>Chưa có định mức</Badge> : STOCK_BADGE[foodWaterLv] && <Badge level={foodWaterLv}>{STOCK_BADGE[foodWaterLv]}</Badge>}
        value={`${pct(st.food_pct)} · ${pct(st.water_pct)}`}
        footer="so với định mức an toàn"
        onClick={() => onGo('vat_tu', {})}
        hint="Tổng tồn lương thực / nước uống so với tổng định mức an toàn của các kho trong vùng — chạm để xem kho"
      />
      <StatCard
        compact
        footerRows
        icon={AlertTriangle}
        title={<><span className="sm:hidden">Kho cạn kiệt</span><span className="hidden sm:inline">Kho cạn kiệt · sắp hết hạn</span></>}
        level={low ? 3 : expiring ? 2 : hasStock ? 0 : null}
        badge={low ? <Badge level={3}>Cạn kiệt</Badge> : expiring ? <Badge level={2}>Sắp hết hạn</Badge> : !hasStock && <Badge level={null}>Chưa có tồn kho</Badge>}
        value={hasStock ? int(low) : '–'}
        unit={hasStock ? `kho dưới ${STOCK_LOW}%` : undefined}
        footer={`${int(expiring)} mặt hàng sắp hết hạn dùng`}
        onClick={() => onGo('vat_tu', low ? { tt: 'can_kiet' } : expiring ? { tt: 'het_han' } : {})}
        hint={`Kho có mặt hàng dưới ${STOCK_LOW}% định mức (Đỏ), hàng hết hạn trong 30 ngày (Cam) — chạm để xem các kho đó`}
      />
    </div>
  );
}
