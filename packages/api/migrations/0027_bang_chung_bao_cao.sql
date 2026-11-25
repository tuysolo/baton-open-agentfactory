-- ===================================================================
-- 0027 — loại bằng chứng "Báo cáo" (`bao_cao`) + cờ "ticket không code"
-- (BAT-37 việc 2, chủ chốt T-31 câu 3.4 A ngày 19/10; spec-questions.md #161)
-- SPEC mục 7 (bảng loại bằng chứng, cổng Xong d.213–217), 19.10, 19.12 câu 57
-- ===================================================================
--
-- Ca thật: ticket chỉ nghiên cứu (vd SAI-32) nằm trong một dự án CÓ code, nên
-- cổng Xong đòi commit merged/deploy + review và ticket không bao giờ đóng được.
-- Cờ "dự án không code" (d.217) không giúp: nó là cờ của cả dự án.
--
-- Migration này CHỈ THÊM:
--   1. `ticket.khong_code` — cờ "ticket không code", mặc định 0. Cổng coi ticket
--      là không code khi cờ dự án HOẶC cờ ticket bật (đọc lúc kiểm, 19.10).
--      Chỉ chủ đổi được (handlerSuaTicket); ADD COLUMN với DEFAULT hằng nên mọi
--      ticket cũ nhận 0, tức hành vi y như trước 0027.
--   2. `evidence.bao_cao_nguon` — dấu "đây là một báo cáo" + nguồn ký
--      (`reviewer`/`manager`/`coordinator`/`owner`). NULL = không phải báo cáo,
--      nên mọi dòng cũ vẫn là đúng loại cũ của nó.
--   3. `evidence.bao_cao_reviewer` — đường dẫn báo cáo của reviewer độc lập, bắt
--      buộc khi người ký là `manager` (cùng luật `review_bao_cao` của 0022).
--   4. Hai trigger ép tổ hợp hợp lệ và bất biến của hai cột mới.
--
-- ## Vì sao KHÔNG dựng lại bảng `evidence` để thêm mã `loai = 'bao_cao'`
--
-- `evidence.loai` có CHECK cấp cột (0009) và SQLite không sửa được CHECK bằng
-- ALTER TABLE: thêm mã mới là dựng lại cả bảng (CREATE bảng mới, chép dữ liệu,
-- DROP TABLE cũ, đổi tên) cùng mọi index và trigger của 0009, 0010, 0022, 0025.
-- Đó là một DROP TABLE trên bảng có dữ liệu thật — nếp của dự án (0015, 0016,
-- 0023, 0026) xếp nó vào danh sách cấm. Nên theo đúng nếp 0026 (mượn mã + cột
-- đánh dấu):
--   * Một báo cáo **có nội dung** lưu `loai = 'note'` (nội dung ở `noi_dung`,
--     đường dẫn nếu có ở `duong_dan`); báo cáo **chỉ có đường dẫn** lưu
--     `loai = 'file'`. Hai CHECK của 0009 (`note` cần `noi_dung`, `file` cần
--     `duong_dan`) vẫn đúng nguyên chữ.
--   * Mọi đường đọc map về `bao_cao` ở MỘT chỗ (`api/src/loai-bang-chung.ts`:
--     `bao_cao_nguon IS NOT NULL` ⇒ `bao_cao`). Luật cổng đọc loại ĐÃ MAP, nên
--     một báo cáo không bao giờ được đếm như `file`/`note` của nhánh cũ d.217.
--   * `loai`, `duong_dan`, `noi_dung` đã bất biến nhờ `tg_evidence_noi_dung_bat_bien`
--     (0009); hai cột mới bất biến nhờ trigger (b) dưới đây.
--
-- Rollback (KHÔNG tự áp): `migrations/rollback/0027_bang_chung_bao_cao.rollback.sql`.
-- Nó nằm trong thư mục con nên `readD1Migrations` (test) và `wrangler d1
-- migrations apply` (chỉ đọc `*.sql` ở thư mục gốc) đều không thấy nó.

-- ===================================================================
-- 1. Cột mới
-- ===================================================================
ALTER TABLE ticket ADD COLUMN khong_code INTEGER NOT NULL DEFAULT 0
  CHECK (khong_code IN (0, 1));

ALTER TABLE evidence ADD COLUMN bao_cao_nguon TEXT;
ALTER TABLE evidence ADD COLUMN bao_cao_reviewer TEXT;

-- ===================================================================
-- 2. Trigger
-- ===================================================================

-- (a) Tổ hợp hợp lệ lúc chèn. Một dòng báo cáo:
--     * chỉ mượn `note` hoặc `file`, và `note` đúng khi có nội dung;
--     * nguồn ký trong tập cho phép, và `owner` đúng khi người gửi là chủ;
--     * nguồn `manager` bắt buộc có đường dẫn báo cáo reviewer khác rỗng.
--   `bao_cao_reviewer` không có nghĩa cho dòng không phải báo cáo.
CREATE TRIGGER tg_evidence_bao_cao_them
BEFORE INSERT ON evidence
FOR EACH ROW WHEN
  (NEW.bao_cao_nguon IS NOT NULL
   AND (NEW.loai NOT IN ('file', 'note')
        OR NEW.bao_cao_nguon NOT IN ('reviewer', 'manager', 'coordinator', 'owner')
        OR (NEW.bao_cao_nguon = 'owner') <> (NEW.nguoi_gui_loai = 'owner')
        OR (NEW.loai = 'note') <> (NEW.noi_dung IS NOT NULL)))
  OR (NEW.bao_cao_nguon = 'manager'
      AND (NEW.bao_cao_reviewer IS NULL OR trim(NEW.bao_cao_reviewer) = ''))
  OR (NEW.bao_cao_reviewer IS NOT NULL AND NEW.bao_cao_nguon IS NULL)
BEGIN
  SELECT RAISE(ABORT, 'INVALID_INPUT: bang chung bao cao khong hop le');
END;

-- (b) Bất biến — SPEC d.222 (không sửa, không xoá). Cùng thông điệp với
--     `tg_evidence_noi_dung_bat_bien` của 0009 và `tg_evidence_nguon_bat_bien`.
--     Bật/tắt dấu báo cáo sau khi ghi là đổi loại của một bằng chứng đã có thể
--     mở cổng cho một ticket Xong.
CREATE TRIGGER tg_evidence_bao_cao_bat_bien
BEFORE UPDATE OF bao_cao_nguon, bao_cao_reviewer ON evidence
FOR EACH ROW WHEN
  NEW.bao_cao_nguon IS NOT OLD.bao_cao_nguon
  OR NEW.bao_cao_reviewer IS NOT OLD.bao_cao_reviewer
BEGIN
  SELECT RAISE(ABORT, 'INVALID_INPUT: noi dung bang chung khong sua duoc');
END;
