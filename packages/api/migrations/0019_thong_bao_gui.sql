-- ===================================================================
-- 0019 — **gửi thông báo ra kênh ngoài** (phần 7)
-- SPEC mục 12 (d.339–348), mục 8 d.283, 19.8 d.535, 19.12 câu 6
-- ===================================================================
--
-- 0012 dựng kho thông báo trong app và khai sẵn `gui_telegram_luc` với đúng một
-- câu: "Phần 7 ghi". Migration này trả nợ đó, và nó cần thêm **năm** thứ mà 0012
-- không có cách nào biết trước:
--
--   1. `can_chu_id` — mục 🔴 mới và lời nhắc sau 2 giờ (mục 8 d.283) là tin về
--      một **mục Cần Chủ**, mà 0012 chỉ có bốn khoá `phien`/`ticket`/`agent`/
--      `evidence`. Không có cột này thì d.347 ("mỗi tin có link thẳng tới đúng
--      thẻ") không dựng được link, và không có cách nào biết tin nhắc thuộc mục
--      nào.
--   2. `uu_tien` — xem khối ghi chú riêng dưới đây.
--   3. `gui_so_lan_thu`, `gui_thu_lai_luc` — 19.12 câu 6: "thử lại **3 lần** giãn
--      cách **10 giây, 60 giây, 5 phút**". Mốc + cron, **không** `setTimeout`,
--      cùng nếp `evidence.thu_lai_luc` của d.220.
--   4. `gui_loi_ly_do` — "Không gửi được thông báo Telegram (lý do)" ở "Cần chú
--      ý". Lý do là **câu tiếng Việt do Baton dựng**, không phải thân phản hồi
--      thô của Telegram: thân đó có thể mang lại token trong URL, và cột này chủ
--      đọc được trên UI (danh sách cấm `CLAUDE.md` mục 5, SPEC mục 15 d.417).
--   5. `can_chu.nhac_do_luc` — mốc chống bắn lặp của "nhắc **1 lần**" (d.283,
--      d.291 "KHÔNG làm: nhắc lặp nhiều lần"). Mốc, không cờ — cùng nếp
--      `phien.canh_bao_tin_hieu_luc`, `evidence.chua_merge_bao_moc`.
--
-- ## `uu_tien` là một PHÂN LOẠI BẤT BIẾN, không phải một cờ trạng thái
--
-- 19.8 d.535 cho **hai luật khác nhau trên cùng mức 🔴**: mục 🔴 **mới** "vẫn gửi
-- ngay" trong giờ yên lặng, còn **lời nhắc sau 2 giờ** của đúng mục ấy thì "hoãn
-- tới cuối giờ yên lặng". Hai tin đó có **cùng** `loai = 'can_chu_do'` — mã duy
-- nhất mà `CHECK` của 0012 có cho d.341 — nên `loai` không phân biệt được chúng,
-- và suy mức ưu tiên từ `loai` làm **một trong hai** câu của d.535 chắc chắn sai.
--
-- Nếp "mốc, không cờ" đã chốt bốn lần trong `decisions.md` nói về trạng thái
-- **đổi theo thời gian** (đã bắn chưa, đã gửi chưa); ở đây những thứ đó **vẫn** là
-- mốc (`gui_telegram_luc`, `nhac_do_luc`). `uu_tien` thì được quyết **lúc tin sinh
-- ra** và không bao giờ đổi — nên nó đi vào trigger bất biến, đứng cạnh `loai`.
--
-- Vì sao không thêm một mã `loai` mới (vd `can_chu_do_nhac`): `loai` có `CHECK`
-- cấp bảng, và SQLite **không** sửa được `CHECK` bằng `ALTER TABLE` — phải dựng
-- lại cả bảng `thong_bao` cùng 3 trigger và 1 index. Đổi một bảng đang có dữ liệu
-- thật (Baton đang được dùng) để tránh một cột là hướng xấu hơn.

ALTER TABLE thong_bao ADD COLUMN can_chu_id TEXT REFERENCES can_chu(id);

-- `NOT NULL DEFAULT 'thuong'` — mọi dòng đã có trong kho là tin **thường**: cảnh
-- báo phiên đứng/lỗi (mục 6 d.196) không nằm trong ngoại lệ 🔴 của d.347.
ALTER TABLE thong_bao ADD COLUMN uu_tien TEXT NOT NULL DEFAULT 'thuong'
  CHECK (uu_tien IN ('thuong', 'khan'));

-- Đếm **số lần đã trượt**. Trần là **4** = 1 lần đầu + 3 lần thử lại của 19.12
-- câu 6 ("thử lại 3 lần giãn 10 giây, 60 giây, 5 phút") — xem `SO_LAN_GUI_TOI_DA`
-- của `@baton/shared`. Đọc "thử lại 3 lần" thành "tổng 3 lần gửi" làm lần thử lại
-- **thứ ba** không bao giờ chạy; lỗi đó đã xảy ra một lần ở lượt này.
ALTER TABLE thong_bao ADD COLUMN gui_so_lan_thu INTEGER NOT NULL DEFAULT 0
  CHECK (gui_so_lan_thu >= 0 AND gui_so_lan_thu <= 4);
ALTER TABLE thong_bao ADD COLUMN gui_thu_lai_luc INTEGER;
ALTER TABLE thong_bao ADD COLUMN gui_loi_ly_do TEXT;

-- Mốc "đã nhắc 🔴 lúc nào" — NULL = chưa nhắc. Xem đầu file.
ALTER TABLE can_chu ADD COLUMN nhac_do_luc INTEGER;

-- ===================================================================
-- Index — hai câu quét của Cron mỗi phút
-- ===================================================================

-- (a) **Hàng tin còn nợ kênh ngoài.** Riêng phần theo đúng hai điều kiện của câu
-- quét, cùng lý lẽ `ix_evidence_thu_lai` (0009): tập ứng viên chỉ gồm tin **chưa
-- gửi và còn lượt thử**, chứ không phải cả bảng `thong_bao` — mà bảng ấy chỉ lớn
-- lên theo thời gian và gần như mọi dòng của nó là tin **đã gửi**.
--
-- Không dẫn đầu bằng `workspace_id`: cron gửi chạy cho **toàn hệ**, không có
-- workspace nào cho trước (khác `ix_thong_bao_moi` của 0012, là index của chuông).
--
-- `(tao_luc, id)` để thứ tự quét **toàn phần**: tin cũ nhất đi trước (không tin
-- nào bị bỏ lại mãi khi một lượt quét đầy trần), và hai tin cùng millisecond —
-- chuyện thường khi một lượt cron bắn nhiều tin — vẫn có thứ tự xác định.
CREATE INDEX ix_thong_bao_cho_gui
  ON thong_bao (tao_luc, id)
  WHERE gui_telegram_luc IS NULL AND gui_so_lan_thu < 4;

-- (b) **Tin `ticket_xong` đã gửi gần nhất của một workspace** — luật gộp 15 phút
-- của d.345 đọc `max(gui_telegram_luc)`. Dẫn đầu bằng `workspace_id` vì luật gộp
-- là "1 tin mỗi 15 phút" **cho chủ**, tức trong một workspace.
CREATE INDEX ix_thong_bao_gop_xong
  ON thong_bao (workspace_id, gui_telegram_luc)
  WHERE loai = 'ticket_xong' AND gui_telegram_luc IS NOT NULL;

-- (c) **Mục 🔴 còn Chờ chưa nhắc** — câu quét của "nhắc 1 lần sau 2 giờ" (d.283).
-- Riêng phần theo cả ba điều kiện, nên tập ứng viên là đúng các mục 🔴 đang chờ
-- lời nhắc: một mục vừa được nhắc **rời** index ngay, và mục đã xử lý cũng vậy.
-- Sắp theo `(tao_luc, id)` — mục 🔴 cũ nhất (quá hạn lâu nhất) đi trước.
CREATE INDEX ix_can_chu_nhac_do
  ON can_chu (tao_luc, id)
  WHERE trang_thai = 'open' AND muc = 'urgent' AND nhac_do_luc IS NULL;

-- ===================================================================
-- Trigger: mở rộng cả HAI trigger "cùng workspace" của 0012 cho `can_chu_id`
-- ===================================================================
-- `can_chu_id` là khoá ngoài thứ **năm** của bảng, và nó rời `workspace_id` y như
-- bốn khoá kia — nên nếu không mở rộng hai trigger này thì có đúng một khoá đi
-- xuyên workspace được: chuông của chủ này hiện một tin trỏ tới mục Cần Chủ của
-- chủ khác (lệch SPEC mục 1, 18).
--
-- SQLite không sửa được thân một trigger; phải `DROP` rồi `CREATE` lại. Đây là
-- **cùng** trigger, cùng tên, cùng thông điệp, chỉ thêm một vế `OR` — không phải
-- một trigger thứ hai đứng cạnh (hai trigger cùng việc là hai chỗ để quên một vế).

DROP TRIGGER tg_thong_bao_ws_them;
DROP TRIGGER tg_thong_bao_ws_sua;

CREATE TRIGGER tg_thong_bao_ws_them
BEFORE INSERT ON thong_bao
FOR EACH ROW WHEN
  (NEW.phien_id IS NOT NULL
     AND NEW.workspace_id <> (SELECT workspace_id FROM phien WHERE id = NEW.phien_id))
  OR (NEW.ticket_id IS NOT NULL
     AND NEW.workspace_id <> (SELECT workspace_id FROM ticket WHERE id = NEW.ticket_id))
  OR (NEW.agent_id IS NOT NULL
     AND NEW.workspace_id <> (SELECT workspace_id FROM agent WHERE id = NEW.agent_id))
  OR (NEW.bang_chung_id IS NOT NULL
     AND NEW.workspace_id <> (SELECT workspace_id FROM evidence WHERE id = NEW.bang_chung_id))
  OR (NEW.can_chu_id IS NOT NULL
     AND NEW.workspace_id <> (SELECT workspace_id FROM can_chu WHERE id = NEW.can_chu_id))
BEGIN
  SELECT RAISE(ABORT, 'INVALID_INPUT: thong bao phai cung workspace voi phien, ticket, agent, bang chung va muc Can Chu');
END;

CREATE TRIGGER tg_thong_bao_ws_sua
BEFORE UPDATE ON thong_bao
FOR EACH ROW WHEN
  (NEW.phien_id IS NOT NULL
     AND NEW.workspace_id <> (SELECT workspace_id FROM phien WHERE id = NEW.phien_id))
  OR (NEW.ticket_id IS NOT NULL
     AND NEW.workspace_id <> (SELECT workspace_id FROM ticket WHERE id = NEW.ticket_id))
  OR (NEW.agent_id IS NOT NULL
     AND NEW.workspace_id <> (SELECT workspace_id FROM agent WHERE id = NEW.agent_id))
  OR (NEW.bang_chung_id IS NOT NULL
     AND NEW.workspace_id <> (SELECT workspace_id FROM evidence WHERE id = NEW.bang_chung_id))
  OR (NEW.can_chu_id IS NOT NULL
     AND NEW.workspace_id <> (SELECT workspace_id FROM can_chu WHERE id = NEW.can_chu_id))
BEGIN
  SELECT RAISE(ABORT, 'INVALID_INPUT: thong bao phai cung workspace voi phien, ticket, agent, bang chung va muc Can Chu');
END;

-- ===================================================================
-- Trigger: nội dung một tin đã bắn là **bất biến** — mở rộng cho hai cột mới
-- ===================================================================
-- Cùng lý do của 0012: một tin đã vào kho là một thứ đã nói với chủ. `can_chu_id`
-- là khoá liên quan (đứng cạnh bốn khoá kia), `uu_tien` là phân loại lúc sinh ra
-- (đứng cạnh `loai`) — xem khối ghi chú đầu file. Sửa `uu_tien` được thì một tin
-- `thuong` đang đợi hết giờ yên lặng có thể bị kéo thành `khan` và gửi lúc 3 giờ
-- sáng, tức đi quanh d.347 bằng một câu `UPDATE`.
--
-- Bảng **vẫn phải UPDATE được** cho đúng các mốc có thật: `doc_luc`,
-- `gui_telegram_luc`, và ba cột của đường thử lại (`gui_so_lan_thu`,
-- `gui_thu_lai_luc`, `gui_loi_ly_do`). Không cột nào trong số đó nằm trong danh
-- sách `UPDATE OF` dưới đây.

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

-- ===================================================================
-- Trigger: `gui_telegram_luc` là mốc "đã ra kênh ngoài" — chỉ đặt **một lần**
-- ===================================================================
-- Đây là thứ duy nhất làm được "đúng 1 tin ra ngoài" ở tầng **dữ liệu**. Mã đã có
-- hai lớp (câu quét lọc `gui_telegram_luc IS NULL`, và cửa ghi kiểm **lại** lần
-- hai bên trong `WorkspaceGate`), nhưng cả hai là lời khai về **mã**; lớp này là
-- cấu trúc, nên nó còn đúng khi một lượt sau thêm một đường ghi thứ hai.
--
-- `WHEN OLD.gui_telegram_luc IS NOT NULL AND NEW.gui_telegram_luc IS NOT
-- OLD.gui_telegram_luc`: đặt lần đầu (NULL → mốc) được; đặt lại **cùng** giá trị
-- không bị chặn (không đổi gì); xoá mốc hay đổi mốc thì vỡ.
CREATE TRIGGER tg_thong_bao_gui_moc_mot_lan
BEFORE UPDATE OF gui_telegram_luc ON thong_bao
FOR EACH ROW WHEN
  OLD.gui_telegram_luc IS NOT NULL
  AND NEW.gui_telegram_luc IS NOT OLD.gui_telegram_luc
BEGIN
  SELECT RAISE(ABORT, 'INVALID_INPUT: moc gui telegram chi dat mot lan, khong doi va khong xoa');
END;

-- ===================================================================
-- Trigger: `nhac_do_luc` cũng chỉ đặt **một lần** — d.291
-- ===================================================================
-- "KHÔNG làm: nhắc lặp nhiều lần". Xoá được mốc này thì có đúng một câu `UPDATE`
-- đứng giữa chủ và một lời nhắc lặp mỗi phút cho cùng một mục 🔴.
CREATE TRIGGER tg_can_chu_nhac_do_mot_lan
BEFORE UPDATE OF nhac_do_luc ON can_chu
FOR EACH ROW WHEN
  OLD.nhac_do_luc IS NOT NULL
  AND NEW.nhac_do_luc IS NOT OLD.nhac_do_luc
BEGIN
  SELECT RAISE(ABORT, 'INVALID_INPUT: moc nhac 🔴 chi dat mot lan (muc 8 d.291)');
END;
