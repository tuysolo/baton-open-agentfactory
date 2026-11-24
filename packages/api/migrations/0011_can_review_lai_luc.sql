-- ===================================================================
-- 0011 — mốc của cờ "cần review lại"
-- SPEC 19.3 d.494–495; 19.6 d.522; 19.11 d.555
-- ===================================================================
--
-- 0001 đã có cột cờ `ticket.co_can_review_lai` (0/1) và 0003 đã có index riêng
-- phần `ix_ticket_co_co` phủ nó. Thiếu đúng một thứ: **lúc cờ được bật**.
--
-- Vì sao cần một mốc chứ không chỉ một cờ — 19.6 d.522, nguyên văn của chỉ báo
-- dự án: "🟡 … hoặc có cờ 'cần review lại' **quá 24 giờ**". Một cờ 0/1 không đo
-- được "quá 24 giờ": nó biết *có* nhưng không biết *từ bao giờ*. Nên chỉ báo dự
-- án (phần 6) sẽ phải đoán, hoặc phải đi dò `ticket_history` — một bảng chỉ-thêm
-- dùng cho dòng thời gian của chủ, không phải chỗ để tính một chỉ báo mở mỗi lần
-- vào Tổng quan.
--
-- Cùng nếp "mốc, không cờ" đã chốt ba lần trong dự án này:
--   * `ticket.trong_tay_tu_luc` cho cờ "không ai cầm" quá 24 giờ (19.1),
--   * `phien.canh_bao_tin_hieu_luc` / `phien.error_luc` (mục 6 d.196, 0008),
--   * `evidence.chua_merge_bao_moc` (19.7, 0010).
-- Xem `quyet-dinh.md`.
--
-- ## Nghĩa chính xác của cột
--
-- `can_review_lai_luc` = **lúc cờ chuyển từ tắt sang bật**, và chỉ lúc đó. Cờ còn
-- bật qua nhiều lượt ghi thì mốc **không nhích** — nếu nhích, đồng hồ 24 giờ của
-- d.522 bị đặt lại mỗi lần một bằng chứng mới tới và ngưỡng 🟡 không bao giờ chạm
-- được, đúng cái bệnh mà ghi chú "gia hạn đồng hồ 7 ngày" của 0010 đã nêu.
-- Cờ tắt → mốc về NULL.
--
-- ## Không thêm index mới — có chủ ý
--
-- Truy vấn "Cần chú ý" / "có cờ" lọc bằng `co_can_review_lai = 1` và đã đi
-- `ix_ticket_co_co` (0003), nên nó **không** cần cột này trong index. Cột chỉ được
-- đọc **sau khi** dòng đã được chọn (để so với 24 giờ). Thêm một index riêng phần
-- ở đây là thêm một chỗ phải ghi mỗi lần cờ đổi mà không truy vấn nào dùng; lượt
-- nào cài chỉ báo dự án của d.522 và cần lọc theo mốc thì thêm index lúc đó, kèm
-- một ca `EXPLAIN QUERY PLAN` như nếp của `bang-chung.test.ts`.

ALTER TABLE ticket ADD COLUMN can_review_lai_luc INTEGER;

-- SQLite không thêm CHECK vào bảng đã có bằng ALTER TABLE, nên luật đi bằng
-- trigger — cùng cách 0008 và 0010 đã làm.
--
-- Luật: **cờ và mốc phải cùng có hoặc cùng không.** Một dòng có mốc mà cờ tắt là
-- một mốc không ai đọc; một dòng cờ bật mà không mốc làm d.522 không tính được và
-- **hỏng im lặng** (chỉ báo dự án mãi không lên 🟡, không có dữ liệu nào để thấy).

CREATE TRIGGER tg_ticket_can_review_lai_them
BEFORE INSERT ON ticket
FOR EACH ROW WHEN
  (NEW.co_can_review_lai = 1) <> (NEW.can_review_lai_luc IS NOT NULL)
BEGIN
  SELECT RAISE(ABORT, 'INVALID_INPUT: co can review lai va moc can review lai phai cung co hoac cung khong');
END;

CREATE TRIGGER tg_ticket_can_review_lai_sua
BEFORE UPDATE OF co_can_review_lai, can_review_lai_luc ON ticket
FOR EACH ROW WHEN
  (NEW.co_can_review_lai = 1) <> (NEW.can_review_lai_luc IS NOT NULL)
BEGIN
  SELECT RAISE(ABORT, 'INVALID_INPUT: co can review lai va moc can review lai phai cung co hoac cung khong');
END;
