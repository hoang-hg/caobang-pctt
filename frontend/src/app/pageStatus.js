import { create } from 'zustand';

/**
 * Thông tin riêng của trang đang mở cho thanh trạng thái dưới cùng (StatusBar): `dataTime` — giờ số liệu của trang (Bản đồ
 * giám sát: lần tải lớp dữ liệu gần nhất), `cursor` — toạ độ con trỏ trên bản đồ ({ lat, lng } hoặc null). Kho riêng, không
 * nằm trong useStore: toạ độ đổi theo từng lần rê chuột — để trong useStore thì mọi trang gọi useStore() đều vẽ lại. Trang
 * đặt giá trị khi mở, xoá khi rời trang.
 */
export const usePageStatus = create(() => ({ dataTime: null, cursor: null }));
