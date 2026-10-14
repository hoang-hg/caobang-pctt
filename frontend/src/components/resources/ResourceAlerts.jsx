import UrgentStrip from '../common/UrgentStrip';
import { STOCK_LOW } from '../../utils/risk';

/**
 * Dải thông tin khẩn đầu trang Vật tư & Lực lượng (khung chung `UrgentStrip`). Mục: kho cạn kiệt, hàng sắp hết hạn,
 * phương tiện thiếu nhiên liệu / hỏng… (resourceFacts.resourceAlerts) — chạm → thẻ + bộ lọc (`onGo`). `sos` (chỉ tài khoản
 * xem được phiếu SOS): phiếu quá hạn tính là mức Đỏ, nút "Xử lý … SOS" mở Điều hành cứu hộ — nhu cầu cứu hộ đặt cạnh nguồn
 * lực. Không có mục nào: chỉ nói "chưa ghi nhận thiếu hụt" về phần CÓ dữ liệu; vùng chưa có kho / phương tiện thì nói chưa
 * đánh giá được.
 */
export default function ResourceAlerts({ items, sos, failed = [], onRetry, loading, known, onGo }) {
  const overdue = sos?.overdue > 0;
  const action = sos && (overdue || sos.waiting > 0)
    ? {
      to: '/cuu-ho',
      label: `Xử lý ${overdue ? `${sos.overdue} SOS quá hạn` : `${sos.waiting} SOS chờ`} →`,
      short: `${overdue ? sos.overdue : sos.waiting} SOS`,
      title: 'Mở Điều hành cứu hộ để điều động lực lượng cho phiếu SOS',
      level: overdue ? 3 : null,
      note: overdue ? `${sos.overdue} phiếu SOS quá hạn phản hồi` : null,
    }
    : null;
  const checked = [
    known?.warehouses > 0 && `không kho nào có hàng dưới ${STOCK_LOW}% định mức`,
    known?.vehicles > 0 && `không phương tiện nào báo dưới ${STOCK_LOW}% nhiên liệu`,
  ].filter(Boolean);
  return (
    <UrgentStrip
      label="Thông tin khẩn về nguồn lực"
      items={items.map((it) => ({ ...it, onClick: () => onGo(it) }))}
      action={action}
      calm={checked.length ? `Chưa ghi nhận thiếu hụt: ${checked.join(', ')}` : null}
      gray="Chưa có kho, phương tiện trong vùng đang xem — chưa đánh giá được thiếu hụt vật tư, nhiên liệu"
      failed={failed}
      onRetry={onRetry}
      loading={loading}
    />
  );
}
