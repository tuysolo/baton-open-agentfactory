-- ===================================================================
-- 0025 — nguồn review `coordinator` (BAT-6 đợt 3 phần D, 14/10)
-- SPEC mục 3 (hàng "Ghi kết quả review"), mục 7 d.210, 19.3
-- ===================================================================
--
-- `coordinator` được ghi `review` (nguồn `coordinator`, không bắt buộc báo cáo).
-- Trigger của 0022 chỉ nhận `reviewer`/`manager` cho review_nguon nên phải thay.
-- SQLite không sửa được trigger tại chỗ: bỏ rồi tạo lại, giữ nguyên mọi điều kiện
-- khác. Không đụng dữ liệu hàng nào.
--
-- Quyền mặc định nằm trong code (quyen.ts); `agent_permission` chỉ chứa ô chủ đã
-- chỉnh, nên agent coordinator đã có sẵn nhận quyền mới mà không cần migration
-- dữ liệu.

DROP TRIGGER tg_evidence_nguon_them;
DROP TRIGGER tg_evidence_nguon_sua;
DROP TRIGGER tg_evidence_nguon_bat_bien;

CREATE TRIGGER tg_evidence_nguon_them
BEFORE INSERT ON evidence
FOR EACH ROW WHEN
  NEW.merged_cuc_bo NOT IN (0, 1)
  OR (NEW.merged_cuc_bo = 1 AND NEW.loai <> 'commit')
  OR (NEW.nguon_xac_minh IS NOT NULL
      AND (NEW.loai <> 'commit' OR NEW.nguon_xac_minh NOT IN ('github', 'local')))
  OR (NEW.nguon_xac_minh = 'local' AND NEW.merged_cuc_bo <> 1)
  OR (NEW.review_nguon IS NOT NULL
      AND (NEW.loai <> 'review'
           OR NEW.review_nguon NOT IN ('reviewer', 'manager', 'coordinator')))
  OR (NEW.review_nguon = 'manager'
      AND (NEW.review_bao_cao IS NULL OR trim(NEW.review_bao_cao) = ''))
  OR (NEW.review_bao_cao IS NOT NULL AND NEW.loai <> 'review')
BEGIN
  SELECT RAISE(ABORT, 'INVALID_INPUT: nguon bang chung khong hop le');
END;

CREATE TRIGGER tg_evidence_nguon_sua
BEFORE UPDATE OF merged_cuc_bo, nguon_xac_minh, review_nguon, review_bao_cao ON evidence
FOR EACH ROW WHEN
  NEW.merged_cuc_bo NOT IN (0, 1)
  OR (NEW.merged_cuc_bo = 1 AND NEW.loai <> 'commit')
  OR (NEW.nguon_xac_minh IS NOT NULL
      AND (NEW.loai <> 'commit' OR NEW.nguon_xac_minh NOT IN ('github', 'local')))
  OR (NEW.nguon_xac_minh = 'local' AND NEW.merged_cuc_bo <> 1)
  OR (NEW.review_nguon IS NOT NULL
      AND (NEW.loai <> 'review'
           OR NEW.review_nguon NOT IN ('reviewer', 'manager', 'coordinator')))
  OR (NEW.review_nguon = 'manager'
      AND (NEW.review_bao_cao IS NULL OR trim(NEW.review_bao_cao) = ''))
  OR (NEW.review_bao_cao IS NOT NULL AND NEW.loai <> 'review')
BEGIN
  SELECT RAISE(ABORT, 'INVALID_INPUT: nguon bang chung khong hop le');
END;

-- Tạo lại SAU CÙNG, y nguyên 0022: thứ tự kích hoạt theo thứ tự tạo, và test
-- d.222 đòi thông điệp "không sửa được" thắng thông điệp "không hợp lệ".
CREATE TRIGGER tg_evidence_nguon_bat_bien
BEFORE UPDATE OF merged_cuc_bo, review_nguon, review_bao_cao ON evidence
FOR EACH ROW WHEN
  NEW.merged_cuc_bo <> OLD.merged_cuc_bo
  OR NEW.review_nguon IS NOT OLD.review_nguon
  OR NEW.review_bao_cao IS NOT OLD.review_bao_cao
BEGIN
  SELECT RAISE(ABORT, 'INVALID_INPUT: noi dung bang chung khong sua duoc');
END;
