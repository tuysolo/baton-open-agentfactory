-- ===================================================================
-- ROLLBACK của 0029 — KHÔNG tự áp. Chỉ chạy tay khi Chủ duyệt qua CoS.
-- ===================================================================
--
-- File nằm trong thư mục con `rollback/` nên `readD1Migrations` (bộ test) và
-- `wrangler d1 migrations apply` (chỉ đọc `*.sql` ở thư mục migrations gốc)
-- KHÔNG thấy nó. Có ca test áp thử file này lên DB thử (`ban-do-du-an.test.ts`).
--
-- Hệ quả khi chạy (đọc kỹ trước khi duyệt):
--   * MẤT ưu tiên, cờ "đang đẩy", cờ "duy trì", tên ngắn của mọi dự án; MẤT
--     khối lớn và vị trí trên đồi của mọi ticket; MẤT giới hạn WIP của workspace.
--   * Bảng `project_history` GIỮ NGUYÊN (không DROP TABLE nào — nếp của dự án
--     xếp DROP TABLE trên bảng có dữ liệu vào danh sách cấm). Nó chỉ còn là dữ
--     liệu đọc tay; bản mã trước 0029 không đọc nó. Lịch sử `khoi_lon`/`doi`
--     trong `ticket_history` cũng giữ nguyên (bảng chỉ thêm).
--   * Phải deploy lại bản mã trước "Bản đồ L1" TRƯỚC khi chạy file này: bản mã
--     mới đọc các cột sẽ bị xoá.
--
-- Chạy: npx wrangler d1 execute baton --remote --file packages/api/migrations/rollback/0029_ban_do_du_an.rollback.sql
-- rồi xoá dòng '0029_ban_do_du_an.sql' khỏi bảng d1_migrations.

DROP TRIGGER tg_ticket_doi_sua;
DROP TRIGGER tg_ticket_doi_them;
DROP TRIGGER tg_project_duy_tri_sua;
DROP TRIGGER tg_project_duy_tri_them;

ALTER TABLE workspace DROP COLUMN gioi_han_wip;
ALTER TABLE ticket DROP COLUMN doi;
ALTER TABLE ticket DROP COLUMN khoi_lon;
ALTER TABLE project DROP COLUMN ten_ngan;
ALTER TABLE project DROP COLUMN duy_tri;
ALTER TABLE project DROP COLUMN dang_day;
ALTER TABLE project DROP COLUMN uu_tien;
