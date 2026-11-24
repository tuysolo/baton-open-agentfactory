-- ===================================================================
-- ROLLBACK của 0027 — KHÔNG tự áp. Chỉ chạy tay khi Chủ duyệt qua CoS.
-- ===================================================================
--
-- File nằm trong thư mục con `rollback/` nên `readD1Migrations` (bộ test) và
-- `wrangler d1 migrations apply` (chỉ đọc `*.sql` ở thư mục migrations gốc)
-- KHÔNG thấy nó. Có ca test áp thử file này lên DB thử (`bang-chung-bao-cao.test.ts`).
--
-- Hệ quả khi chạy (đọc kỹ trước khi duyệt):
--   * Mọi bằng chứng báo cáo đã có MẤT dấu báo cáo và nguồn ký: dòng đó còn lại
--     như một `note` (nếu có nội dung) hoặc `file` thường. Ticket không code đã
--     đóng nhờ báo cáo vẫn ở Xong (d.222: không hạ tự động), nhưng lần kiểm cổng
--     sau sẽ tính dòng đó như `file`/`note` của nhánh d.217 (cần chủ xác nhận).
--   * MẤT cờ "ticket không code" của mọi ticket: ticket đó quay về luật cổng của
--     dự án (có code ⇒ cần commit/deploy + review).
--   * Phải deploy lại bản mã trước BAT-37 việc 2 TRƯỚC khi chạy file này: bản mã
--     mới đọc ba cột sẽ bị xoá.
--   * Không DROP TABLE nào, không đụng dữ liệu cột cũ.
--
-- Chạy: npx wrangler d1 execute baton --remote --file packages/api/migrations/rollback/0027_bang_chung_bao_cao.rollback.sql
-- rồi xoá dòng '0027_bang_chung_bao_cao.sql' khỏi bảng d1_migrations.

DROP TRIGGER tg_evidence_bao_cao_bat_bien;
DROP TRIGGER tg_evidence_bao_cao_them;

ALTER TABLE evidence DROP COLUMN bao_cao_reviewer;
ALTER TABLE evidence DROP COLUMN bao_cao_nguon;
ALTER TABLE ticket DROP COLUMN khong_code;
