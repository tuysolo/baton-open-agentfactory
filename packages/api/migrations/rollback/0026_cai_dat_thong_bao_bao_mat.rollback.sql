-- ===================================================================
-- ROLLBACK của 0026 — KHÔNG tự áp. Chỉ chạy tay khi Chủ duyệt qua CoS.
-- ===================================================================
--
-- File nằm trong thư mục con `rollback/` nên `readD1Migrations` (bộ test) và
-- `wrangler d1 migrations apply` (chỉ đọc `*.sql` ở thư mục migrations gốc)
-- KHÔNG thấy nó. Có ca test ghim điều này (`cai-dat-thong-bao.test.ts`).
--
-- Hệ quả khi chạy (đọc kỹ trước khi duyệt):
--   * MẤT mọi công tắc thông báo đã đặt (DROP TABLE cai_dat_thong_bao) — sau
--     rollback mọi loại tin lại BẬT như trước 0026. DROP TABLE thuộc danh sách
--     cấm, nên cần Chủ duyệt.
--   * Tin bảo mật đã có (cột `bao_mat`) còn lại như tin `can_chu_do` khẩn bình
--     thường; tin đã bỏ gửi vì công tắc tắt (`bo_qua_gui_luc`) quay lại hàng chờ
--     gửi và có thể được gửi bù ở lượt cron kế tiếp.
--   * Phải deploy lại bản mã trước BAT-16 TRƯỚC khi chạy file này: bản mã BAT-16
--     đọc hai cột sẽ bị xoá.
--
-- Chạy: npx wrangler d1 execute baton --remote --file packages/api/migrations/rollback/0026_cai_dat_thong_bao_bao_mat.rollback.sql
-- rồi xoá dòng '0026_cai_dat_thong_bao_bao_mat.sql' khỏi bảng d1_migrations.

DROP TRIGGER tg_thong_bao_bao_mat_them;
DROP TRIGGER tg_thong_bao_bo_qua_hop_le;
DROP TRIGGER tg_thong_bao_bo_qua_mot_lan;

-- Trả trigger bất biến về đúng bản của 0019.
DROP TRIGGER tg_thong_bao_noi_dung_bat_bien;

CREATE TRIGGER tg_thong_bao_noi_dung_bat_bien
BEFORE UPDATE OF loai, noi_dung, tao_luc, phien_id, ticket_id, agent_id, bang_chung_id,
                 can_chu_id, uu_tien
ON thong_bao
FOR EACH ROW WHEN
  NEW.loai <> OLD.loai
  OR NEW.noi_dung <> OLD.noi_dung
  OR NEW.tao_luc <> OLD.tao_luc
  OR NEW.phien_id IS NOT OLD.phien_id
  OR NEW.ticket_id IS NOT OLD.ticket_id
  OR NEW.agent_id IS NOT OLD.agent_id
  OR NEW.bang_chung_id IS NOT OLD.bang_chung_id
  OR NEW.can_chu_id IS NOT OLD.can_chu_id
  OR NEW.uu_tien <> OLD.uu_tien
BEGIN
  SELECT RAISE(ABORT, 'INVALID_INPUT: noi dung thong bao khong sua duoc');
END;

-- Trả index hàng chờ về đúng bản của 0019.
DROP INDEX ix_thong_bao_cho_gui;

CREATE INDEX ix_thong_bao_cho_gui
  ON thong_bao (tao_luc, id)
  WHERE gui_telegram_luc IS NULL AND gui_so_lan_thu < 4;

ALTER TABLE thong_bao DROP COLUMN bo_qua_gui_luc;
ALTER TABLE thong_bao DROP COLUMN bao_mat;

DROP TABLE cai_dat_thong_bao;
