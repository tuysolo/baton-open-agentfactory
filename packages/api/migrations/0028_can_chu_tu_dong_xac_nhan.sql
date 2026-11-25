-- ===================================================================
-- 0028 — **Mục xác nhận TỰ SINH được tự đóng khi ticket đã Xong**
-- SPEC mục 7 (cổng), mục 8 (trạng thái mục), 19.12 câu 57
-- `spec-questions.md` **#163** — Chủ chốt T-38 = A, T-43 = A (BAT-40)
-- ===================================================================
--
-- ## Vì sao cần
--
-- Ticket sang Xong bằng **mọi** đường (đủ cổng nhờ `bao_cao`, chủ ép Xong,
-- tự lên Xong, ...) thì mục Cần Chủ **tự sinh** cho chính ticket đó (cột mốc
-- `xac_nhan_ticket_id` của 0016) mà còn `open` phải chuyển `resolved`, kết quả
-- "ticket đã Xong", trong **cùng** `db.batch()` với lệnh đưa ticket sang Xong.
--
-- Mệnh đề 7 của cặp trigger `tg_can_chu_xu_ly_*` (0015, dựng lại ở 0021) chặn
-- mọi mục `review` `resolved` mà không có `ket_luan_review`. Ghi 'dat' là nói
-- dối "chủ đã xác nhận", ghi 'can_sua' là nói dối ngược lại (và còn bật nhánh
-- dựng lại của câu 57). Nên mục tự đóng phải mang `ket_luan_review = NULL`.
--
-- ## Thay đổi: nới DUY NHẤT mệnh đề 7, cho mục tự sinh
--
--   cũ:  resolved + review + ket_luan_review IS NULL                 => ABORT
--   mới: resolved + review + ket_luan_review IS NULL
--        + xac_nhan_ticket_id IS NULL                                => ABORT
--
-- Tức mục `review` **tạo tay** (không mang mốc) vẫn **bắt buộc** Đạt/Cần sửa
-- khi `resolved` như cũ. Chỉ mục **tự sinh** được `resolved` với
-- `ket_luan_review` rỗng. `chuDaXacNhan` (`muc-xac-nhan.ts`) đòi đúng 'dat', nên
-- một mục đóng tự động **không** mở cổng Xong.
--
-- Đường xử lý của chủ (`kiemKetQuaXuLy`) vẫn đòi Đạt/Cần sửa cho mọi mục
-- `review` ở tầng ứng dụng, nên chủ không có nút nào đóng mục tự sinh mà không
-- kết luận; chỗ nới này chỉ mở cho câu lệnh tự đóng của cửa ghi.
--
-- Mọi mệnh đề khác giữ **y nguyên từng chữ** so với 0021 (có test so văn bản:
-- `test/dong-muc-xac-nhan-khi-xong.test.ts`).
--
-- ## Vì sao DROP + CREATE lại, không sửa 0021
--
-- `migrations/README.md`: chỉ thêm file mới, không sửa file đã áp. SQLite không
-- có `ALTER TRIGGER`. Không chạm bảng, không chạm CHECK cột, không chạm dữ liệu.
--
-- Rollback: `rollback/0028_can_chu_tu_dong_xac_nhan.rollback.sql` (thư mục con,
-- không tự áp).
--
-- File này **chỉ dùng chú thích `--`** — luật của `test/migration-d1-chu-thich.test.ts`.

DROP TRIGGER tg_can_chu_xu_ly_them;
DROP TRIGGER tg_can_chu_xu_ly_sua;

-- Chín mệnh đề, chép **y nguyên** 0021, trừ mệnh đề 7 nay thêm vế
-- `AND NEW.xac_nhan_ticket_id IS NULL`:
--  1. `resolved` **đúng khi** có `ket_qua` — d.244. Mục tự đóng mang
--     `ket_qua = 'ticket đã Xong'`.
--  2. `skipped` **đúng khi** có `ly_do_bo_qua` — 19.9 d.541.
--  3. `open` **đúng khi** `xu_ly_luc` rỗng.
--  3b. `open` thì **không** `phuong_an_da_chon_id`.
--  3c. `open` thì **không** `ket_luan_review`.
--  4. `phuong_an_da_chon_id` chỉ thuộc loại `decision` — d.236, 19.9 d.538.
--  5. `ket_luan_review` chỉ thuộc loại `review` — d.261.
--  7. `review` **tạo tay** mà `resolved` thì **phải** có Đạt/Cần sửa — d.261.
--     Mục tự sinh (`xac_nhan_ticket_id` khác NULL) được miễn (#163).
--  8. Phương án đã chọn phải là phương án **của chính mục này**.

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
      AND NEW.ket_luan_review IS NULL AND NEW.xac_nhan_ticket_id IS NULL)
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
      AND NEW.ket_luan_review IS NULL AND NEW.xac_nhan_ticket_id IS NULL)
  OR (NEW.phuong_an_da_chon_id IS NOT NULL
      AND (SELECT can_chu_id FROM can_chu_phuong_an WHERE id = NEW.phuong_an_da_chon_id)
          IS NOT NEW.id)
BEGIN
  SELECT RAISE(ABORT, 'INVALID_INPUT: ket qua cua muc Can Chu khong khop trang thai va loai');
END;
