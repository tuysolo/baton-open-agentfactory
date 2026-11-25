-- ===================================================================
-- 0015 — **Xử lý một mục Cần Chủ**: kết quả, bỏ qua, mở lại
-- SPEC mục 8 (d.243–246, d.261, d.278–281), 19.6 (d.516), 19.9 (d.537–542),
-- 19.10 (d.553 — `ALREADY_RESOLVED`)
-- ===================================================================
--
-- 0013 cố ý **không** khai các cột này: "khai sẵn một cột mà không có đường ghi
-- nào là mời một lượt sau đoán nghĩa của nó". Nay đường ghi có mặt, nên cột có
-- mặt cùng nó.
--
-- ## Vì sao ALTER TABLE + TRIGGER, không dựng lại bảng
--
-- SQLite **không** thêm được một `CHECK` cấp bảng (liên-cột) bằng `ALTER TABLE`;
-- chỉ `ALTER TABLE … ADD COLUMN` với ràng buộc **trên chính cột đó**. Cách duy
-- nhất để có `CHECK` liên-cột là **dựng lại bảng** — tức một `DROP TABLE
-- can_chu`, thuộc **danh sách cấm** của `CLAUDE.md` mục 4 (xoá dữ liệu, cần Chủ
-- duyệt), và là một lần chép tay lại toàn bộ CHECK/index/trigger của 0013.
-- Cùng tình huống và cùng kết luận với `phien.can_chu_id` ở cuối 0013.
--
-- Nên: ràng buộc **một cột** đi vào `ADD COLUMN`; ràng buộc **liên-cột** đi vào
-- một cặp trigger `BEFORE INSERT` / `BEFORE UPDATE`. Trigger ép **đúng cùng** bộ
-- luật mà một `CHECK` cấp bảng sẽ ép, và ép thêm một thứ `CHECK` không ép được:
-- phương án đã chọn phải thuộc **chính mục này**.
--
-- ## Vì sao KHÔNG có bảng lịch sử riêng cho mục Cần Chủ
--
-- d.246 nói mở lại "**có ghi lịch sử**", và `ticket_history` (0001) là bảng lịch
-- sử duy nhất đang có — nhưng nó gắn `ticket_id NOT NULL`, mà một mục Cần Chủ
-- **không phải** một ticket (nó còn có thể là "Chung", không thuộc dự án nào).
--
-- 19.9 d.542 nói thẳng "ghi lịch sử" của mở lại **là gì**: "thêm **dòng Nhật ký
-- mới** 'T-x mở lại' và bình luận 'T-x mở lại'. Xử lý lần sau lại thêm dòng mới
-- và bình luận mới. **Dòng cũ không bị sửa**." Mục 19 **ưu tiên hơn** chữ ở các
-- mục trên (19.12), nên dấu vết của mọi lần chuyển trạng thái của một mục là
-- chuỗi dòng `nhat_ky` (chỉ thêm, có `nguoi_loai`, `luc`, và **căn cứ `T-số`**)
-- cộng chuỗi `comment` trên từng ticket liên quan — cả hai đã mang đủ "ai làm,
-- lúc nào" của d.418. Dựng bảng thứ ba cho cùng một thông tin là ba nguồn sự
-- thật cho một câu hỏi.
--
-- Hai cột dưới đây là phần còn lại của dấu vết, trên chính dòng mục:
-- `xu_ly_luc` (lúc kết) và `mo_lai_lan` (đã mở lại mấy lần).

-- -------------------------------------------------------------------
-- Cột mới
-- -------------------------------------------------------------------

-- **Kết quả** — mục 8 d.244 ("có **kết quả**: phương án đã chọn và/hoặc chữ tự
-- do, vd 'đã chạy', 'A, ngưỡng 500'"), 19.9 d.538–539.
--
-- Đây là **chữ** đi vào dòng Nhật ký (d.279) và vào câu bình luận
-- `"T-số đã xử lý: <kết quả>"` (d.280). Trần 2000 khớp `DAI_KET_QUA_TOI_DA` của
-- `@baton/shared/xu-ly-can-chu`, và nhỏ hơn **mọi** trần phía dưới nó
-- (`nhat_ky.quyet_dinh` 20.000, `comment.noi_dung` 100.000) — nên không có cách
-- nào để ba việc của d.278–281 hỏng một nửa vì độ dài.
ALTER TABLE can_chu ADD COLUMN ket_qua TEXT
  CHECK (ket_qua IS NULL OR length(ket_qua) BETWEEN 1 AND 2000);

-- **Phương án đã chọn** — 19.9 d.538: loại `Quyết định` "bắt buộc chọn 1 phương
-- án".
--
-- **Khoá thật**, không một chữ `'A'` rời. Đây chính là việc mà bảng con
-- `can_chu_phuong_an` của 0013 được dựng để làm — ghi chú ở đầu 0013, căn cứ
-- (1): "lượt 2 sẽ phải lưu 'phương án đã chọn' bằng một chữ (nhãn `'A'`) và
-- không có gì buộc chữ đó khớp một phương án có thật". Trigger ở cuối file này
-- buộc nó khớp một phương án **của chính mục này**.
ALTER TABLE can_chu ADD COLUMN phuong_an_da_chon_id TEXT REFERENCES can_chu_phuong_an(id);

-- **Đạt / Cần sửa** của loại `Chủ review` — mục 8 d.261 ("2 nút chọn **Đạt**
-- hoặc **Cần sửa**"). Khoá, không chữ tự do: phần 6 dựng hai nút từ đó và một
-- đường đọc về sau phải lọc được "các mục review Cần sửa".
--
-- "Cần sửa thì **bắt buộc ghi chú**" là luật của `kiemKetQuaXuLy`, không của
-- DB: ghi chú đi vào `ket_qua`, và `ket_qua` vốn luôn khác NULL khi `resolved`
-- (trigger dưới), nên một CHECK ở đây không phân biệt được "ghi chú của người"
-- với mặc định `'đã xem'` của 19.9.
ALTER TABLE can_chu ADD COLUMN ket_luan_review TEXT
  CHECK (ket_luan_review IS NULL OR ket_luan_review IN ('dat', 'can_sua'));

-- **Lý do bỏ qua** — 19.9 d.541 ("Bỏ qua: **bắt buộc lý do**"). Cùng trần với
-- `ket_qua` và cùng lý do: nó đi nguyên văn vào Nhật ký và bình luận.
ALTER TABLE can_chu ADD COLUMN ly_do_bo_qua TEXT
  CHECK (ly_do_bo_qua IS NULL OR length(ly_do_bo_qua) BETWEEN 1 AND 2000);

-- Lúc mục rời `Chờ` (sang `Đã xử lý` hoặc `Bỏ qua`). Cột **ngày** của bảng "Đã
-- xử lý" ở cuối màn hình Cần Chủ (d.251: "ngày, mã, tiêu đề ngắn, kết quả"), và
-- khoá lọc "theo khoảng ngày" của cùng dòng đó.
--
-- Không dùng `cap_nhat_luc`: cột đó nhích vì **bất kỳ** thay đổi nào, nên nó
-- không trả lời được "mục này được quyết lúc nào".
ALTER TABLE can_chu ADD COLUMN xu_ly_luc INTEGER
  CHECK (xu_ly_luc IS NULL OR xu_ly_luc > 0);

-- Số lần mục đã được **mở lại** (d.246). Một con số, không một bảng: chuỗi dòng
-- Nhật ký đã là lịch sử đầy đủ (xem khối ghi chú ở đầu file). Cột này để đường
-- đọc hiện "đã mở lại N lần" mà không phải đếm bảng `nhat_ky`.
ALTER TABLE can_chu ADD COLUMN mo_lai_lan INTEGER NOT NULL DEFAULT 0
  CHECK (mo_lai_lan >= 0);

-- -------------------------------------------------------------------
-- Index: "phiên nào đang chờ mục này" — mục 8 d.281, 19.6 d.516
-- -------------------------------------------------------------------
-- Đường RA của cặp vào–ra chạy ở **mỗi** lần xử lý hoặc bỏ qua:
--
--   UPDATE phien … WHERE workspace_id = ? AND can_chu_id = ? AND trang_thai = 'waiting_owner'
--
-- Không có index thì đó là một lần quét **toàn bảng `phien`** — bảng lớn nhất
-- theo thời gian (một dòng cho mỗi lượt giao từng được nhận), và mốc nghiệm thu
-- 19.12 câu 1 là 200.000 ticket.
--
-- **Riêng phần** `WHERE can_chu_id IS NOT NULL`: chỉ một phần rất nhỏ số phiên
-- từng chờ một mục Cần Chủ, nên index chỉ mang đúng các dòng đó — cùng lý lẽ
-- `ix_phien_canh_bao` của 0012 và `ix_can_chu_trung` của 0013.
--
-- `workspace_id` đi **sau** `can_chu_id`: `can_chu_id` là UUID, tức đã chọn lọc
-- gần như tuyệt đối; nó đứng đầu thì index nhỏ và câu trên là một `SEARCH`. Cột
-- workspace vẫn nằm trong khoá để câu truy vấn (vốn **luôn** ràng
-- `workspace_id`, `decisions.md` 01/10) không phải quay lại bảng để lọc.
CREATE INDEX ix_phien_can_chu ON phien (can_chu_id, workspace_id)
  WHERE can_chu_id IS NOT NULL;

-- ===================================================================
-- Trigger: luật liên-cột của việc xử lý
-- ===================================================================
-- Đây là cặp `CHECK` cấp bảng mà `ALTER TABLE` không thêm được (xem đầu file).
-- **Mười** mệnh đề, mỗi mệnh đề là một câu của SPEC:
--
--  1. `resolved` **đúng khi** có `ket_qua` — d.244 ("`Đã xử lý` (có **kết
--     quả**)"). Cả hai chiều: một mục `open` mang `ket_qua` là một mục đã quyết
--     mà màn hình vẫn hiện ở khối Chờ; một mục `resolved` không `ket_qua` là
--     đúng trạng thái **không sửa lại được** mà d.279 cảnh báo.
--  2. `skipped` **đúng khi** có `ly_do_bo_qua` — 19.9 d.541 ("bắt buộc lý do").
--  3. `open` **đúng khi** `xu_ly_luc` rỗng.
--  3b. `open` thì **không** `phuong_an_da_chon_id` — một mục đang ở khối `Chờ`
--     mà mang một phương án đã chọn là dữ liệu **tự mâu thuẫn**: màn hình Cần Chủ
--     hiện nó là "chưa trả lời" trong khi dòng nói chủ đã chọn B.
--  3c. `open` thì **không** `ket_luan_review` — cùng lý lẽ với 3b, cho d.261.
--     Ba mệnh đề 3/3b/3c cộng lại mới là **toàn bộ** "mở lại thì dọn hết dấu của
--     lần xử lý trước": thiếu 3b/3c thì câu `UPDATE` của `handlerMoLaiCanChu`
--     quên một trong hai cột đó mà **không trigger nào bật** (mệnh đề 4/5 chỉ
--     chặn theo `loai`, 6/7 chỉ bật khi `resolved`), tức đúng cái "mục `Chờ` mang
--     kết quả cũ" mà khối ghi chú của `handlerMoLaiCanChu` nói là không thể có.
--  4. `phuong_an_da_chon_id` chỉ thuộc loại `decision` — d.236, 19.9 d.538.
--  5. `ket_luan_review` chỉ thuộc loại `review` — d.261.
--  6. `decision` mà `resolved` thì **phải** có phương án — 19.9 d.538 ("bắt
--     buộc chọn 1 phương án"). Đây là nửa luật mà một `CHECK` một cột không với
--     tới, và là nửa quan trọng nhất của loại này.
--  7. `review` mà `resolved` thì **phải** có Đạt/Cần sửa — d.261.
--  8. Phương án đã chọn phải là phương án **của chính mục này**. `CHECK` không
--     ép được (nó không tra bảng khác), `REFERENCES` cũng không (nó chỉ ép
--     "có tồn tại"). Không có mệnh đề này thì `phuong_an_da_chon_id` trỏ sang
--     phương án của một mục khác vẫn lọt — tức kết quả của chủ nói về một câu
--     hỏi khác.
--
-- `IS NOT` (không `<>`) ở mệnh đề 8: mục cha của phương án không tồn tại thì
-- `(SELECT …)` ra NULL, và `NULL <> NEW.id` cho NULL, tức WHEN không bật và dòng
-- lọt. Cùng cái bẫy mà `tg_can_chu_phuong_an_loai_them` của 0013 đã khai.
--
-- `BEFORE UPDATE` không giới hạn `OF <cột>`: mệnh đề 1–3 và 6–7 đều phụ thuộc
-- `trang_thai`, mà `trang_thai` đổi cùng lúc với các cột này trong **một** câu
-- UPDATE; liệt kê cột là mở đường cho một câu chỉ đổi `loai` làm lệch 4–7.

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
  OR (NEW.trang_thai = 'resolved' AND NEW.loai = 'decision'
      AND NEW.phuong_an_da_chon_id IS NULL)
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
  OR (NEW.trang_thai = 'resolved' AND NEW.loai = 'decision'
      AND NEW.phuong_an_da_chon_id IS NULL)
  OR (NEW.trang_thai = 'resolved' AND NEW.loai = 'review'
      AND NEW.ket_luan_review IS NULL)
  OR (NEW.phuong_an_da_chon_id IS NOT NULL
      AND (SELECT can_chu_id FROM can_chu_phuong_an WHERE id = NEW.phuong_an_da_chon_id)
          IS NOT NEW.id)
BEGIN
  SELECT RAISE(ABORT, 'INVALID_INPUT: ket qua cua muc Can Chu khong khop trang thai va loai');
END;

-- ===================================================================
-- Trigger: số lần mở lại **chỉ tăng** — d.246
-- ===================================================================
-- Cùng khuôn `tg_bo_dem_chi_tang` của 0001. Không có nó thì một đường ghi sau
-- (hoặc một lần sửa tay) hạ được con số, tức xoá dấu vết của những lần mở lại
-- đã xảy ra — mà "mở lại được … **có ghi lịch sử**" là nửa của d.246.
CREATE TRIGGER tg_can_chu_mo_lai_chi_tang
BEFORE UPDATE OF mo_lai_lan ON can_chu
FOR EACH ROW WHEN NEW.mo_lai_lan < OLD.mo_lai_lan
BEGIN
  SELECT RAISE(ABORT, 'INVALID_INPUT: so lan mo lai muc Can Chu chi tang');
END;
