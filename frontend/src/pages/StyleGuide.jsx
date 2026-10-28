import { useState } from 'react';
import { BellRing, CloudRain, Droplets, Home, Layers, Siren, Users } from 'lucide-react';
import PageHeader from '../components/common/PageHeader';
import { EmptyState, ErrorState, KpiCard, Section, Segmented, Tabs } from '../components/common/ui';
import { ART_NAMES } from '../components/common/EmptyArt';
import StatCard from '../components/dashboard/StatCard';
import { PAGE } from '../components/layout/page';
import { useStore } from '../app/store';

/**
 * Trang mẫu giao diện — CHỈ máy dev (App.jsx nạp khi import.meta.env.DEV, bản chạy thật không có): bày mọi thành phần dùng
 * chung ở nền Sáng / Tối để rà nhanh khi sửa nền móng (docs/ke-hoach-lam-moi-giao-dien.md mục 4). Chữ trên trang là chữ
 * mẫu cố định, không phải số liệu.
 */
export default function StyleGuide() {
  const { theme, toggleTheme } = useStore();
  const [seg, setSeg] = useState('a');
  const [tab, setTab] = useState('a');
  return (
    <div className={`${PAGE} pb-10`}>
      <PageHeader
        title="Mẫu giao diện"
        description="Chỉ máy dev — bày các thành phần dùng chung để rà ở nền Sáng và Tối."
        actions={<button type="button" className="btn-secondary" onClick={toggleTheme}>Đổi sang nền {theme === 'dark' ? 'Sáng' : 'Tối'}</button>}
      />

      <Section title="Chữ — thang cỡ">
        <div className="flex flex-col gap-1">
          <span className="num text-5xl font-extrabold">48 · con số chính màn lớn</span>
          <span className="num text-4xl font-extrabold">36 · con số ô</span>
          <span className="text-3xl font-bold">30 · con số ô gọn</span>
          <span className="text-2xl font-semibold">24 · tiêu đề trang</span>
          <span className="text-xl font-semibold">20 · tiêu đề khối lớn</span>
          <span className="text-lg font-semibold">18 · tiêu đề thẻ</span>
          <span className="text-base">16 · nội dung trên điện thoại</span>
          <span className="text-sm">14 · nội dung tối thiểu</span>
          <span className="text-xs text-muted">12 · chú thích phụ</span>
        </div>
      </Section>

      <Section title="Nút, chip, chọn chế độ, thẻ chuyển">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn-primary">Nút chính</button>
          <button type="button" className="btn-secondary">Nút phụ</button>
          <button type="button" className="btn-ghost">Nút nhẹ</button>
          <button type="button" className="btn-danger">Việc khẩn</button>
          <button type="button" className="btn-primary" disabled>Đang tắt</button>
          <span className="chip bg-good/15 text-good">Bình thường</span>
          <span className="chip bg-warn/15 text-warn">Chờ duyệt</span>
          <span className="chip bg-danger/15 text-danger">Lỗi</span>
          <span className="chip bg-panel2 text-muted">Đã tắt</span>
        </div>
        <div className="mt-3 flex flex-col gap-3">
          <Segmented label="Chế độ mẫu" value={seg} onChange={setSeg} options={[{ value: 'a', label: 'Xem tình hình', icon: Layers }, { value: 'b', label: 'Điều hành' }]} />
          <Tabs value={tab} onChange={setTab} tabs={[{ value: 'a', label: 'Tổng hợp', icon: Home }, { value: 'b', label: 'Sạt lở & đường đèo', icon: Droplets, count: 3 }]} />
        </div>
      </Section>

      <Section title="Ô số — mức rủi ro chỉ vạch màu từ Vàng trở lên">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <StatCard compact icon={CloudRain} title="Chưa có số liệu" value="–" level={null} footer="Viền nét đứt, biểu tượng xám" />
          <StatCard compact icon={CloudRain} title="Bình thường" value="12" unit="mm" level={0} footer="Không vạch, biểu tượng xanh" />
          <StatCard compact icon={CloudRain} title="Vàng" value="58" unit="mm" level={1} footer="Vạch vàng" />
          <StatCard compact icon={Droplets} title="Cam" value="2/5" level={2} footer="Vạch cam" />
          <StatCard compact icon={Siren} title="Đỏ, cần xử lý ngay" value="7" level={3} alert footer="Viền đỏ" />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard label="Không mức" value="656" icon={Users} sub="Ô gọn của trang nghiệp vụ" />
          <KpiCard label="Vàng" value="3" tone="warn" icon={BellRing} sub="Vạch vàng" />
          <KpiCard label="Cam" value="2" tone="serious" sub="Vạch cam" />
          <KpiCard label="Đỏ" value="1" tone="danger" sub="Vạch đỏ" />
        </div>
      </Section>

      <Section title="Bảng">
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead><tr><th>Tên</th><th>Địa bàn</th><th className="text-right">Số lượng</th></tr></thead>
            <tbody>
              <tr><td>Dòng mẫu thứ nhất</td><td>Xã mẫu</td><td className="num text-right">1.250</td></tr>
              <tr><td>Dòng mẫu thứ hai</td><td>Phường mẫu</td><td className="num text-right">38</td></tr>
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Màn trống, lỗi — hình nét đơn">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {ART_NAMES.map((n) => (
            <EmptyState key={n} art={n} height={150}>Hình "{n}" — kèm một câu nói rõ cần làm gì</EmptyState>
          ))}
        </div>
        <ErrorState className="mt-3" onRetry={() => {}}>Không tải được số liệu từ máy chủ</ErrorState>
      </Section>

      <Section title="Lớp nổi trên bản đồ (.float-panel)">
        <div className="relative h-56 overflow-hidden rounded-lg bg-[linear-gradient(135deg,#bfdbfe,#bbf7d0)] p-4" data-thang-mau="">
          <div className="float-panel absolute left-4 top-4 w-56 p-3 text-sm">
            <b className="block">Bảng nổi</b>
            <span className="text-ink-2">Nền ô đục 95 %, làm mờ phía sau, một mức bóng.</span>
          </div>
          <div className="float-panel absolute bottom-4 right-4 px-3 py-2 text-xs">Chú giải · thanh thời gian</div>
        </div>
      </Section>
    </div>
  );
}
