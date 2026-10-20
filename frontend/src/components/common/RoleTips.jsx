import { Link } from 'react-router-dom';
import { BookOpen } from 'lucide-react';
import { PageTips } from './ui';
import { useGuideRole } from '../../rbac/usePermission';
import { tipsFor } from '../../utils/guides';

/**
 * Gợi ý 3 bước lần đầu mở một trang, theo nhóm người dùng — cấp tỉnh / cấp xã / quản trị hệ thống (utils/guides.js) — kèm
 * liên kết tới trang Hướng dẫn xử lý. "Đã hiểu" nhớ riêng từng nhóm: máy dùng chung đổi sang tài khoản cấp khác vẫn thấy
 * gợi ý của cấp mình (khoá của cấp tỉnh giữ như cũ — ai đã bấm "Đã hiểu" ở Tổng quan không phải bấm lại).
 */
export default function RoleTips({ page, className }) {
  const role = useGuideRole();
  const steps = tipsFor(page, role);
  if (!steps) return null;
  return (
    <PageTips
      key={role}
      id={role === 'tinh' ? page : `${page}-${role}`}
      steps={steps}
      className={className}
      more={(
        <Link to={`/huong-dan?vai=${role}`} className="btn-ghost tap px-2 py-1 text-xs font-semibold text-accent">
          <BookOpen size={14} aria-hidden="true" /> Hướng dẫn đầy đủ
        </Link>
      )}
    />
  );
}
