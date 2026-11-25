-- ===================================================================
-- 0026 — công tắc từng loại thông báo + tin bảo mật tài khoản chủ (BAT-16)
-- SPEC mục 12 d.348 ("Tắt từng loại trong Cài đặt"), d.350 (giờ yên lặng),
-- 19.12 câu 3 d.594 (mọi lần đặt lại ghi Lịch sử + bắn Telegram), 19.12 câu 6
-- d.604-606 (thử lại 3 lần, giữ trong chuông, không chặn luồng chính).
-- ===================================================================
--
-- ## Vì sao KHÔNG dựng lại bảng `thong_bao` để thêm một mã `loai` mới
--
-- `thong_bao.loai` có CHECK cấp cột (0012) và SQLite không sửa được CHECK bằng
-- ALTER TABLE: thêm mã mới nghĩa là dựng lại cả bảng (CREATE bảng mới, chép dữ
-- liệu, DROP TABLE cũ, đổi tên) cùng mọi index và trigger của 0012, 0019. Đó là
-- một DROP TABLE trên một bảng có dữ liệu thật — nếp của dự án (0015, 0016,
-- 0023) xếp nó vào danh sách cấm. Nên migration này CHỈ THÊM:
--
--   1. Tin bảo mật mượn `loai = 'can_chu_do'` (mức 🔴 của d.341, tức đúng nhóm
--      "chỉ 🔴 được gửi trong giờ yên lặng" của d.350) và mang thêm cột
--      `bao_mat` = mã sự kiện. Mọi luật đọc `bao_mat` TRƯỚC `loai` (hàm
--      `congTacCuaTin` của @baton/shared), nên công tắc "Cần Chủ 🔴 mới" không
--      tắt được tin bảo mật. Đường gửi, thử lại 3 lần, chuông và "Cần chú ý"
--      dùng nguyên đường có sẵn — không một đường gửi thứ hai.
--   2. Trigger ép tin bảo mật luôn `uu_tien = 'khan'` (xuyên giờ yên lặng) và
--      không bao giờ bị đánh dấu bỏ gửi.
--   3. Bảng `cai_dat_thong_bao` — công tắc theo workspace. KHÔNG có dòng = BẬT,
--      nên mọi hành vi trước migration giữ nguyên y hệt.
--   4. Cột `thong_bao.bo_qua_gui_luc` — mốc "không gửi vì chủ đã tắt loại này".
--      Tắt = không gửi Telegram, tin VẪN ở trong chuông (không mất dấu vết).
--      Mốc, không cờ (nếp decisions.md), và chỉ đặt một lần.
--   5. Dựng lại index riêng phần `ix_thong_bao_cho_gui` để tin đã bỏ gửi rời
--      hàng chờ — nếu không, mỗi tin của một loại bị tắt nằm lại trong index mãi
--      mãi và lượt cron mỗi phút phải đi qua chúng. Index không mang dữ liệu
--      nào, DROP INDEX rồi CREATE lại không mất gì.
--
-- Rollback (KHÔNG tự áp): `migrations/rollback/0026_cai_dat_thong_bao_bao_mat.rollback.sql`.
-- Nó nằm trong thư mục con nên `readD1Migrations` (test) và `wrangler d1
-- migrations apply` (chỉ đọc `*.sql` ở thư mục gốc) đều không thấy nó.

-- ===================================================================
-- 1. Công tắc từng loại — d.348
-- ===================================================================
-- Danh sách mã là `CONG_TAC_THONG_BAO` của @baton/shared (có ca test đối chiếu).
-- `can_chu_do` tách hai: tin 🔴 MỚI (`uu_tien = 'khan'`) và lời NHẮC sau 2 giờ
-- (`uu_tien = 'thuong'`) — 0019 đã ép `uu_tien` bất biến.
--
-- Mã `bao_mat_tai_khoan` CỐ Ý không có trong CHECK: không có chỗ nào trong dữ
-- liệu để ghi "tin bảo mật đã tắt".
CREATE TABLE cai_dat_thong_bao (
  workspace_id  TEXT    NOT NULL REFERENCES workspace(id),
  cong_tac      TEXT    NOT NULL CHECK (cong_tac IN (
                  'can_chu_do_moi',
                  'can_chu_do_nhac',
                  'phien_dung',
                  'phien_loi',
                  'luot_khong_phan_hoi',
                  'bang_chung_truot',
                  'chua_merge_7_ngay',
                  'ticket_xong',
                  'bao_cao_sang',
                  'bao_cao_toi'
                )),
  bat           INTEGER NOT NULL CHECK (bat IN (0, 1)),
  cap_nhat_luc  INTEGER NOT NULL,
  PRIMARY KEY (workspace_id, cong_tac)
) STRICT;

-- ===================================================================
-- 2. Hai cột mới của `thong_bao`
-- ===================================================================
ALTER TABLE thong_bao ADD COLUMN bao_mat TEXT
  CHECK (bao_mat IS NULL OR bao_mat IN (
    'doi_mat_khau', 'dat_lai_totp', 'dang_xuat_moi_noi', 'sai_lien_tiep'
  ));

ALTER TABLE thong_bao ADD COLUMN bo_qua_gui_luc INTEGER;

-- ===================================================================
-- 3. Index hàng chờ gửi — thêm điều kiện `bo_qua_gui_luc IS NULL`
-- ===================================================================
DROP INDEX ix_thong_bao_cho_gui;

CREATE INDEX ix_thong_bao_cho_gui
  ON thong_bao (tao_luc, id)
  WHERE gui_telegram_luc IS NULL AND gui_so_lan_thu < 4 AND bo_qua_gui_luc IS NULL;

-- ===================================================================
-- 4. Trigger
-- ===================================================================

-- (a) Tin bảo mật luôn 🔴 khẩn và không sinh ra ở trạng thái "bỏ gửi".
CREATE TRIGGER tg_thong_bao_bao_mat_them
BEFORE INSERT ON thong_bao
FOR EACH ROW WHEN
  NEW.bao_mat IS NOT NULL
  AND (NEW.uu_tien <> 'khan' OR NEW.loai <> 'can_chu_do' OR NEW.bo_qua_gui_luc IS NOT NULL)
BEGIN
  SELECT RAISE(ABORT, 'INVALID_INPUT: tin bao mat phai la can_chu_do, uu tien khan, khong bo gui');
END;

-- (b) Không đánh dấu bỏ gửi một tin bảo mật hay một tin đã gửi.
CREATE TRIGGER tg_thong_bao_bo_qua_hop_le
BEFORE UPDATE OF bo_qua_gui_luc, gui_telegram_luc ON thong_bao
FOR EACH ROW WHEN
  NEW.bo_qua_gui_luc IS NOT NULL
  AND (NEW.bao_mat IS NOT NULL OR NEW.gui_telegram_luc IS NOT NULL)
BEGIN
  SELECT RAISE(ABORT, 'FORBIDDEN: tin bao mat va tin da gui khong bo gui duoc');
END;

-- (c) Mốc bỏ gửi chỉ đặt một lần — cùng khuôn `tg_thong_bao_gui_moc_mot_lan`.
CREATE TRIGGER tg_thong_bao_bo_qua_mot_lan
BEFORE UPDATE OF bo_qua_gui_luc ON thong_bao
FOR EACH ROW WHEN
  OLD.bo_qua_gui_luc IS NOT NULL
  AND NEW.bo_qua_gui_luc IS NOT OLD.bo_qua_gui_luc
BEGIN
  SELECT RAISE(ABORT, 'INVALID_INPUT: moc bo gui chi dat mot lan, khong doi va khong xoa');
END;

-- (d) Nội dung bất biến — mở rộng trigger của 0019 cho `bao_mat` (một phân loại
-- lúc sinh ra, đứng cạnh `loai` và `uu_tien`). Cùng tên, cùng thông điệp.
DROP TRIGGER tg_thong_bao_noi_dung_bat_bien;

CREATE TRIGGER tg_thong_bao_noi_dung_bat_bien
BEFORE UPDATE OF loai, noi_dung, tao_luc, phien_id, ticket_id, agent_id, bang_chung_id,
                 can_chu_id, uu_tien, bao_mat
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
  OR NEW.bao_mat IS NOT OLD.bao_mat
BEGIN
  SELECT RAISE(ABORT, 'INVALID_INPUT: noi dung thong bao khong sua duoc');
END;
