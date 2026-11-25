-- Baton v0.1 — migration 0003: ticket, 7 trạng thái, người đang cầm, index danh sách
--
-- Lượt 3 của phần 1 cài hành vi của SPEC mục 4 (+ 19.1, 19.2, 19.4, 19.10, 19.11).
-- Khung bảng đã có ở 0001; đây chỉ là những thứ 0001 chưa cần:
--
--   A. Hai cột cho **người đang cầm** (SPEC 19.1) và cờ "không ai cầm".
--   B. Index cho các bộ lọc danh sách thật của mục 13 (`baton list`) và mục 14.
--      Luật: **hướng index khớp hướng `ORDER BY`**, và bộ ba khoá keyset
--      `(hang_uu_tien, tao_luc DESC, id DESC)` phải nằm **ngay sau** các cột lọc
--      bằng dấu `=`; có một cột chen vào là SQLite phải `USE TEMP B-TREE FOR
--      ORDER BY`, tức sắp lại toàn bộ trong bộ nhớ (bẫy đã gặp ở lượt 2).

-- ===================================================================
-- A. Người đang cầm — SPEC 19.1, 19.10
-- ===================================================================

-- Chủ bấm "Tôi làm" (SPEC 19.10): ticket sang Đang làm, **người đang cầm là
-- chủ**, không có nhịp tim. Đây là bậc 4 trong thứ tự ưu tiên của 19.1 và là bậc
-- duy nhất không cần bảng `luot_giao` (phần 2), nên làm được ngay.
-- Cờ boolean lưu INTEGER 0/1 có CHECK, cùng quy ước với 0001. SQLite cho phép
-- CHECK trong `ADD COLUMN` (chỉ PRIMARY KEY và UNIQUE là không được).
ALTER TABLE ticket ADD COLUMN chu_tu_lam INTEGER NOT NULL DEFAULT 0
  CHECK (chu_tu_lam IN (0, 1));

-- Lúc tình trạng "nhóm `active` **và** người đang cầm trống" bắt đầu.
-- Cờ "Đang làm mà không ai cầm" chỉ bật khi tình trạng đó **kéo dài 24 giờ**
-- (SPEC 19.1), nên phải biết nó bắt đầu từ lúc nào — một cột, không phải một
-- phép tính trên `cap_nhat_luc` (cập nhật vì lý do khác sẽ làm đồng hồ chạy lại).
-- NULL = ticket không ở tình trạng đó.
ALTER TABLE ticket ADD COLUMN trong_tay_tu_luc INTEGER;

-- Bình luận **xoá mềm** — SPEC mục 4 ("Agent không xoá được"; chủ thì
-- `spec-questions.md` #23 chốt tạm là xoá được). Xoá mềm chứ không `DELETE`: mục 15
-- đòi "mọi hành động có dấu vết ai làm", nên một bình luận biến mất không dấu vết
-- là sai hướng. Dòng vẫn còn, đường đọc lọc `xoa_luc IS NULL`.
ALTER TABLE comment ADD COLUMN xoa_luc INTEGER;

-- ===================================================================
-- B. Index cho danh sách ticket — SPEC mục 13, 14; mốc 200.000 ticket
-- ===================================================================

-- "Tất cả dự án", **không** lọc trạng thái (màn hình mặc định của mục 14, và
-- `baton list` không cờ). `ix_ticket_ws_trang_thai` của 0001 dẫn đầu bằng
-- `trang_thai`, nên không dùng được cho `ORDER BY` của truy vấn này.
CREATE INDEX ix_ticket_ws_uu_tien
  ON ticket (workspace_id, hang_uu_tien, tao_luc DESC, id DESC)
  WHERE xoa_luc IS NULL;

-- Lọc theo **người chịu trách nhiệm** mà không lọc trạng thái (SPEC mục 14).
-- `ix_ticket_chiu_trach_nhiem` của 0001 có `trang_thai` chen giữa.
CREATE INDEX ix_ticket_ctn_uu_tien
  ON ticket (workspace_id, chiu_trach_nhiem_agent_id, hang_uu_tien, tao_luc DESC, id DESC)
  WHERE xoa_luc IS NULL AND chiu_trach_nhiem_agent_id IS NOT NULL;

-- Lọc "**có cờ**" (SPEC mục 14): ticket mang ít nhất một cờ hệ thống.
-- Index riêng phần, nên chỉ to bằng số ticket có cờ — thường rất nhỏ.
CREATE INDEX ix_ticket_co_co
  ON ticket (workspace_id, hang_uu_tien, tao_luc DESC, id DESC)
  WHERE xoa_luc IS NULL
    AND (co_khong_ai_cam = 1 OR co_can_review_lai = 1
         OR co_xong_khong_bang_chung = 1 OR co_nhap_khong_bang_chung = 1);

-- Quét cờ "Đang làm mà không ai cầm" (SPEC 19.1): việc nền của Cron chỉ cần
-- những ticket đang ở tình trạng chờ đủ 24 giờ.
CREATE INDEX ix_ticket_trong_tay
  ON ticket (workspace_id, trong_tay_tu_luc)
  WHERE xoa_luc IS NULL AND trong_tay_tu_luc IS NOT NULL;

-- Ticket điều phối ↔ ticket dự án (SPEC 19.4): tra theo **chiều xuôi**
-- (`tu_ticket_id` là ticket điều phối) để lấy mọi ticket dự án của nó.
-- 0001 có index chiều ngược; chiều xuôi trước nay dựa vào khoá chính
-- `(tu_ticket_id, den_ticket_id, loai)`, dùng được nhưng không lọc được `loai`
-- trong index khi chỉ biết `tu_ticket_id`.
CREATE INDEX ix_ticket_link_xuoi ON ticket_link (tu_ticket_id, loai, den_ticket_id);
