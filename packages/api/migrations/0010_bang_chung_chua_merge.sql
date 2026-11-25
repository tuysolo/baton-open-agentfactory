-- ===================================================================
-- 0010 — "chưa merge sau 7 ngày": nhãn + mốc chống bắn lặp
-- SPEC mục 7 d.221; 19.7
-- ===================================================================
--
-- 19.7 nguyên văn: "Commit `pushed` quá **7 ngày** chưa merge: **dừng theo dõi**.
-- Bằng chứng mang nhãn **'chưa merge sau 7 ngày'**; hiện ở 'Cần chú ý'; Telegram
-- báo **1 lần**. Gửi lại cùng commit để theo dõi thêm 7 ngày."
--
-- Luật đó đòi ba thứ mà 0009 chưa có chỗ để ghi:
--
--  1. **Dừng theo dõi.** 0009 đã có chỗ: đặt `theo_doi_den_luc = NULL` thì dòng
--     rời `ix_evidence_theo_doi` (index riêng phần), nên Cron không thấy nó nữa.
--     Không cần cột mới, nhưng **mất dấu**: một dòng `pushed` không có mốc không
--     phân biệt được "chưa bao giờ theo dõi" với "đã theo dõi và đã quá 7 ngày".
--
--  2. **Nhãn "chưa merge sau 7 ngày"** → `chua_merge_luc`.
--
--  3. **"Telegram báo 1 lần"** → `chua_merge_bao_moc`.
--
-- Vì sao hai cột, không một: cột (2) là **sự thật về bằng chứng** (đã quá 7 ngày
-- chưa merge — nhãn hiện trên UI, phần 6); cột (3) là **sự thật về việc gửi tin**
-- (mục 12, phần 7 mới gửi thật). Hôm nay hai lần ghi rơi vào cùng một giao dịch
-- nên gộp một cột cũng "đúng", nhưng phần 7 sẽ có ca **gửi hỏng**: lúc đó nhãn
-- phải còn mà mốc đã bắn thì chưa được ghi. Gộp một cột là biến ca đó thành "mất
-- nhãn" hoặc "bắn lặp", và không cột nào nói được ca nào đã xảy ra.
--
-- ## Vì sao (3) là một MỐC, không một cờ boolean
--
-- Cùng nếp đã chốt cho `phien.canh_bao_tin_hieu_luc` / `phien.error_luc` (SPEC
-- mục 6 d.196, `spec-questions.md` #46, migration 0008): mốc chống bắn lặp gắn với
-- **lần chuyển sang**, không phải một cờ "đã bắn".
--
-- `chua_merge_bao_moc` = **giá trị `theo_doi_den_luc` của cửa sổ theo dõi mà tin
-- gần nhất đã bắn cho**. Nên:
--   * Quét lại nhiều lần trên cùng một cửa sổ → mốc bằng nhau → **không bắn nữa**
--     (đúng "báo 1 lần"), dù Cron chạy mỗi 10 phút trong bao lâu.
--   * Một cửa sổ theo dõi **mới** trên cùng dòng (mốc 7 ngày mới) → mốc khác →
--     **bắn lại**, đúng câu cuối của 19.7 ("gửi lại cùng commit để theo dõi thêm
--     7 ngày").
--
-- Một cờ boolean cũng *đúng hôm nay*, vì "gửi lại cùng commit" sinh một **dòng
-- `evidence` mới** (0009 đã chốt vậy) nên mỗi dòng chỉ hết hạn một lần. Nhưng nó
-- đúng vì một chi tiết ở chỗ khác, và nó hỏng **im lặng** ngày nào một đường khác
-- đặt lại `theo_doi_den_luc` trên dòng cũ: cờ đã bật thì cửa sổ thứ hai **không
-- bao giờ** được báo, và không có dữ liệu nào để phát hiện. Mốc thì tự đúng.
-- Xem `decisions.md`.

ALTER TABLE evidence ADD COLUMN chua_merge_luc INTEGER;
ALTER TABLE evidence ADD COLUMN chua_merge_bao_moc INTEGER;

-- SQLite không thêm được CHECK vào bảng đã có bằng ALTER TABLE, nên hai luật
-- dưới đây đi bằng trigger — cùng cách 0008 đã làm cho `phien.error_luc`.
--
-- Luật 1: hai cột này chỉ có nghĩa với `commit` (19.7 nói về commit `pushed`).
-- Luật 2: **không bắn tin cho một bằng chứng chưa dừng theo dõi** — `chua_merge_bao_moc`
--         khác NULL thì `chua_merge_luc` cũng phải khác NULL. Thiếu luật này thì
--         một bug ghi mốc mà không ghi nhãn sẽ **tắt tin vĩnh viễn** cho dòng đó
--         và không để lại dấu nào.

CREATE TRIGGER tg_evidence_chua_merge_them
BEFORE INSERT ON evidence
FOR EACH ROW WHEN
  (NEW.chua_merge_luc IS NOT NULL AND NEW.loai <> 'commit')
  OR (NEW.chua_merge_bao_moc IS NOT NULL AND NEW.chua_merge_luc IS NULL)
BEGIN
  SELECT RAISE(ABORT, 'INVALID_INPUT: nhan chua merge sau 7 ngay chi danh cho commit da dung theo doi');
END;

CREATE TRIGGER tg_evidence_chua_merge_sua
BEFORE UPDATE OF chua_merge_luc, chua_merge_bao_moc ON evidence
FOR EACH ROW WHEN
  (NEW.chua_merge_luc IS NOT NULL AND NEW.loai <> 'commit')
  OR (NEW.chua_merge_bao_moc IS NOT NULL AND NEW.chua_merge_luc IS NULL)
BEGIN
  SELECT RAISE(ABORT, 'INVALID_INPUT: nhan chua merge sau 7 ngay chi danh cho commit da dung theo doi');
END;
