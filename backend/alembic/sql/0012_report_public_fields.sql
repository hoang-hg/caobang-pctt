-- Phản ánh người dân: phần CÔNG KHAI tách khỏi phần người dân gửi (#9 rà soát go-live)
--   public_description  nội dung cán bộ duyệt để công khai (mặc định: mô tả gốc đã che SĐT / email / số giấy tờ).
--                       NULL (phản ánh duyệt trước bản này) → API công khai dùng mô tả gốc đã che.
--   public_location     vị trí công khai: mặc định làm tròn (điểm chấm có thể là nhà người báo); cán bộ chọn vị trí
--                       chính xác khi là điểm công cộng (đường, cầu, taluy). NULL → API công khai làm tròn vị trí gốc.
--   public_photos       false → không công khai ảnh (ảnh có mặt người, số nhà…)
-- Tra cứu phản ánh không để lại SĐT (#10): track_key — đuôi ngẫu nhiên cấp cho người gửi (mã tra cứu PA-1003-KXMPQR).
-- Phản ánh cũ không có track_key: người gửi không có SĐT không tra được (chưa từng được cấp mã).
ALTER TABLE community.citizen_reports
    ADD COLUMN IF NOT EXISTS public_description text,
    ADD COLUMN IF NOT EXISTS public_location geometry(Point, 4326),
    ADD COLUMN IF NOT EXISTS public_photos boolean NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS track_key text;
