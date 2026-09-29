-- Phản ánh người dân: phần CÔNG KHAI tách khỏi phần người dân gửi (#9 rà soát go-live)
--   public_description  nội dung cán bộ duyệt để công khai (mặc định: mô tả gốc đã che SĐT / email / số giấy tờ).
--                       NULL (phản ánh duyệt trước bản này) → API công khai dùng mô tả gốc đã che.
--   public_exact        true: cán bộ xác nhận công khai đúng điểm người dân chấm (điểm công cộng: đường, cầu, taluy).
--                       false (mặc định): vị trí công khai làm tròn (điểm chấm có thể là nhà người báo) — tính khi trả
--                       ra (services/reports.PUBLIC_POINT_SQL), đổi độ làm tròn áp dụng cho mọi phản ánh.
--   public_photos       false → không công khai ảnh (ảnh có mặt người, số nhà…)
-- Tra cứu phản ánh không để lại SĐT (#10): track_key — đuôi ngẫu nhiên cấp cho người gửi (mã tra cứu PA-1003-KXMPQR).
-- Phản ánh cũ không có track_key: người gửi không có SĐT không tra được (chưa từng được cấp mã).
ALTER TABLE community.citizen_reports
    ADD COLUMN IF NOT EXISTS public_description text,
    ADD COLUMN IF NOT EXISTS public_exact boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS public_photos boolean NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS track_key text;
