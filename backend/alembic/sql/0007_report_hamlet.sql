-- Xóm / tổ dân phố người dân chọn khi gửi phản ánh (danh sách từ công cụ nhập loại "xom"). Lưu TÊN tại thời điểm
-- gửi (không khoá ngoại) → xóm sau này bị sáp nhập / đổi tên thì phản ánh cũ vẫn giữ đúng tên đã chọn.
ALTER TABLE community.citizen_reports ADD COLUMN IF NOT EXISTS hamlet_name text;
