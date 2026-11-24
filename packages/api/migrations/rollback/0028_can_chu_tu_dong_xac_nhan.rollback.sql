-- ===================================================================
-- ROLLBACK của 0028 — KHÔNG tự áp. Chỉ chạy tay khi Chủ duyệt qua CoS.
-- ===================================================================
--
-- File nằm trong thư mục con `rollback/` nên `readD1Migrations` (bộ test) và
-- `wrangler d1 migrations apply` (chỉ đọc `*.sql` ở thư mục migrations gốc)
-- KHÔNG thấy nó. Có ca test áp thử file này lên DB thử
-- (`test/dong-muc-xac-nhan-khi-xong.test.ts`).
--
-- Việc làm: dựng lại cặp trigger `tg_can_chu_xu_ly_them`/`_sua` y như 0021
-- (mệnh đề 7 không miễn mục tự sinh).
--
-- Hệ quả khi chạy (đọc kỹ trước khi duyệt):
--   * Phải deploy lại bản mã trước BAT-40 TRƯỚC khi chạy file này: bản mã BAT-40
--     tự đóng mục xác nhận khi ticket sang Xong, và sau rollback câu lệnh đó bị
--     trigger chặn, tức MỌI lệnh đưa ticket có mục xác nhận đang Chờ sang Xong
--     sẽ thất bại cả batch.
--   * Các mục đã tự đóng (`resolved`, `ket_luan_review` NULL, kết quả "ticket đã
--     Xong") VẪN CÒN NGUYÊN: trigger chỉ kiểm dòng lúc INSERT/UPDATE, không quét
--     dữ liệu cũ. Một lần UPDATE sau này trên chính dòng đó mà giữ `resolved`
--     sẽ bị chặn; mở lại (về `open`) thì vẫn được.
--   * Không DROP TABLE nào, không đụng dữ liệu.
--
-- Chạy: npx wrangler d1 execute baton --remote --file packages/api/migrations/rollback/0028_can_chu_tu_dong_xac_nhan.rollback.sql
-- rồi xoá dòng '0028_can_chu_tu_dong_xac_nhan.sql' khỏi bảng d1_migrations.

DROP TRIGGER tg_can_chu_xu_ly_them;
DROP TRIGGER tg_can_chu_xu_ly_sua;

CREATE TRIGGER tg_can_chu_xu_ly_them
BEFORE INSERT ON can_chu
FOR EACH ROW WHEN
  ((NEW.trang_thai = 'resolved') <> (NEW.ket_qua IS NOT NULL))
  OR ((NEW.trang_thai = 'skipped') <> (NEW.ly_do_bo_qua IS NOT NULL))
  OR ((NEW.trang_thai = 'open') <> (NEW.xu_ly_luc IS NULL))
  OR (NEW.trang_thai = 'open' AND NEW.phuong_an_da_chon_id IS NOT NULL)
  OR (NEW.trang_thai = 'open' AND NEW.ket_luan_review IS NOT NULL)
  OR (NEW.phuong_an_da_chon_id IS NOT NULL AND NEW.loai <> 'decision')
  OR (NEW.ket_luan_review IS NOT NULL AND NEW.loai <> 'review')
  OR (NEW.trang_thai = 'resolved' AND NEW.loai = 'review'
      AND NEW.ket_luan_review IS NULL)
  OR (NEW.phuong_an_da_chon_id IS NOT NULL
      AND (SELECT can_chu_id FROM can_chu_phuong_an WHERE id = NEW.phuong_an_da_chon_id)
          IS NOT NEW.id)
BEGIN
  SELECT RAISE(ABORT, 'INVALID_INPUT: ket qua cua muc Can Chu khong khop trang thai va loai');
END;

CREATE TRIGGER tg_can_chu_xu_ly_sua
BEFORE UPDATE ON can_chu
FOR EACH ROW WHEN
  ((NEW.trang_thai = 'resolved') <> (NEW.ket_qua IS NOT NULL))
  OR ((NEW.trang_thai = 'skipped') <> (NEW.ly_do_bo_qua IS NOT NULL))
  OR ((NEW.trang_thai = 'open') <> (NEW.xu_ly_luc IS NULL))
  OR (NEW.trang_thai = 'open' AND NEW.phuong_an_da_chon_id IS NOT NULL)
  OR (NEW.trang_thai = 'open' AND NEW.ket_luan_review IS NOT NULL)
  OR (NEW.phuong_an_da_chon_id IS NOT NULL AND NEW.loai <> 'decision')
  OR (NEW.ket_luan_review IS NOT NULL AND NEW.loai <> 'review')
  OR (NEW.trang_thai = 'resolved' AND NEW.loai = 'review'
      AND NEW.ket_luan_review IS NULL)
  OR (NEW.phuong_an_da_chon_id IS NOT NULL
      AND (SELECT can_chu_id FROM can_chu_phuong_an WHERE id = NEW.phuong_an_da_chon_id)
          IS NOT NEW.id)
BEGIN
  SELECT RAISE(ABORT, 'INVALID_INPUT: ket qua cua muc Can Chu khong khop trang thai va loai');
END;
