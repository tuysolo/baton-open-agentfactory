-- ===================================================================
-- 0021 — **Mục `decision` gửi được một câu trả lời TỰ DO**
-- SPEC mục 8 d.244 ("kết quả: phương án đã chọn **và/hoặc** chữ tự do")
-- vs mục 8 d.259 + 19.9 d.539 ("bắt buộc chọn 1 phương án")
-- `spec-questions.md` **#121**
-- ===================================================================
--
-- ## Vì sao nới
--
-- Chủ dùng thật 11/10: trên một mục `decision` ba phương án A/B/C, chủ không
-- muốn chọn cái nào, gõ ý riêng vào ô "Ghi thêm" — và nút Gửi mờ, không gửi
-- được. Yêu cầu trực tiếp của chủ là cho trả lời tự do. SPEC **xung đột với
-- chính nó** ở chỗ này (d.244 "và/hoặc" vs d.259/d.539 "bắt buộc"), nên đây là
-- một chỗ **nới** đã ghi vào `spec-questions.md` #121 để chốt lại với Chủ, không
-- một lần tự đoán.
--
-- Luật mới: mục `decision` ở `resolved` thì **phải có `ket_qua`**, còn
-- `phuong_an_da_chon_id` là **tuỳ chọn**.
--
-- ## Vì sao BỎ hẳn mệnh đề, không thay bằng một mệnh đề mới
--
-- Mệnh đề cũ (số 6 của 0015) là:
--
--   (NEW.trang_thai = 'resolved' AND NEW.loai = 'decision'
--    AND NEW.phuong_an_da_chon_id IS NULL)
--
-- Điều kiện mới cần ép là "resolved + decision + không phương án ⇒ phải có
-- `ket_qua`". Nhưng **mệnh đề 1** của chính cặp trigger này đã ép
-- `(trang_thai = 'resolved') <> (ket_qua IS NOT NULL)` cho **mọi** loại, tức
-- `resolved` **luôn** phải có `ket_qua`. Viết thêm
-- `… AND NEW.ket_qua IS NULL` là một mệnh đề **không bao giờ bật được** — nó
-- trông như một lớp phòng thủ mà thật ra là chữ chết, và chữ chết trong một
-- trigger là thứ một lượt sau sẽ đọc là "luật này đang được ép".
--
-- Nên: **bỏ** mệnh đề 6, giữ **y nguyên** chín mệnh đề còn lại. `decision` vẫn
-- không mất lớp bảo vệ nào quan trọng: mệnh đề 4 (phương án chỉ thuộc
-- `decision`), mệnh đề 8 (phương án phải là của **chính mục này**) và mệnh đề
-- 3b (`open` thì không được mang phương án) đều còn.
--
-- Hệ quả đã nhận, khai thẳng: DB **không còn** phân biệt được "mục `decision`
-- đã xử lý bằng một phương án" với "đã xử lý bằng một câu trả lời tự do" ở tầng
-- ràng buộc — sự khác nhau đó nay chỉ còn ở dữ liệu (`phuong_an_da_chon_id`
-- NULL hay không), đúng như đường đọc và `baton result` đã hiển thị sẵn.
--
-- ## Vì sao DROP + CREATE lại, không sửa 0015
--
-- `migrations/README.md`: "**Chỉ thêm file mới, không sửa file đã áp.**" 0015 đã
-- áp lên DB thật. SQLite không có `ALTER TRIGGER`, nên cách duy nhất là bỏ
-- trigger rồi dựng lại — **không** chạm bảng, **không** chạm dữ liệu (danh sách
-- cấm `CLAUDE.md` mục 4 là xoá **file/dữ liệu**; `DROP TRIGGER` chỉ bỏ một luật
-- và dựng lại nó ngay trong cùng migration).
--
-- File này **chỉ dùng chú thích `--`** — luật của `test/migration-d1-chu-thich.test.ts`:
-- `wrangler d1 migrations apply --remote` xoá `-- …` tới hết dòng TRƯỚC khi gửi
-- SQL, nên một `--` bên trong một chú thích khối cắt luôn dấu đóng khối và nuốt
-- SQL thật.

DROP TRIGGER tg_can_chu_xu_ly_them;
DROP TRIGGER tg_can_chu_xu_ly_sua;

-- Chín mệnh đề, chép **y nguyên** 0015 trừ mệnh đề 6 đã bỏ:
--  1. `resolved` **đúng khi** có `ket_qua` — d.244. Đây cũng là mệnh đề gánh
--     luật mới: một mục `decision` `resolved` mà không phương án vẫn **buộc** có
--     `ket_qua`, tức có chữ tự do của chủ.
--  2. `skipped` **đúng khi** có `ly_do_bo_qua` — 19.9 d.541.
--  3. `open` **đúng khi** `xu_ly_luc` rỗng.
--  3b. `open` thì **không** `phuong_an_da_chon_id`.
--  3c. `open` thì **không** `ket_luan_review`.
--  4. `phuong_an_da_chon_id` chỉ thuộc loại `decision` — d.236, 19.9 d.538.
--  5. `ket_luan_review` chỉ thuộc loại `review` — d.261.
--  7. `review` mà `resolved` thì **phải** có Đạt/Cần sửa — d.261. Vế này
--     **không** nới: d.261 không có câu "và/hoặc" nào, và hai nút Đạt/Cần sửa
--     không có chỗ nào cho một lựa chọn thứ ba.
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
