-- Mạng đường: tách sơ đồ vẽ tay của bản trình diễn (seed_roads — nối tâm các xã, điểm giữa lệch ngẫu nhiên) khỏi dữ liệu
-- đường chính thức nhập sau này (kiểm toán go-live 10/2026). "Chỉ đường an toàn" cho người dân không được vẽ tuyến trên
-- đường giả lập: chạy thật (DEMO_MODE=false) seed xoá các đoạn 'so_do' → chỉ đường hiện hướng chim bay, ghi rõ không
-- phải đường đi (services/safe_routing.build_route).
--   source  'so_do'       sơ đồ vẽ tay (chỉ nạp khi DEMO_MODE=true)
--           'chinh_thuc'  mặc định cho dữ liệu thêm sau — seed không bao giờ xoá
-- Mọi đoạn đang có đều do seed vẽ tay (chưa có công cụ nhập mạng đường) → đánh dấu 'so_do' rồi mới đổi mặc định.
ALTER TABLE operations.road_segments ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'so_do';
ALTER TABLE operations.road_segments ALTER COLUMN source SET DEFAULT 'chinh_thuc';
