-- Baton v0.1 — migration 0002
--
-- Hai việc, cả hai do `worker-reviewer` nêu khi nghiệm thu lượt 1:
--
--   A. **Buộc `workspace_id` của bảng con khớp `ticket.workspace_id`.**
--      0001 khai khoá ngoài rời: `workspace_id REFERENCES workspace(id)` và
--      `ticket_id REFERENCES ticket(id)`. Hai khoá đó **độc lập**, nên một dòng
--      `ticket_link` hoàn toàn hợp lệ với DB vẫn có thể mang `workspace_id` của
--      workspace A trong khi ticket thuộc workspace B — tức một bug ở tầng trên
--      nối được ticket xuyên workspace. Lệch tinh thần SPEC mục 1 ("dữ liệu phải
--      tách theo workspace từ đầu để sau này ship nhiều khách" — mục 18).
--
--      Cách sửa đúng nhất về mặt quan hệ là khoá ngoài phức hợp
--      `(workspace_id, ticket_id) REFERENCES ticket(workspace_id, id)`. Nhưng
--      SQLite **không sửa được khoá ngoài của bảng đã có**: phải dựng bảng mới,
--      chép dữ liệu, xoá bảng cũ, đổi tên. Việc đó cần `DROP TABLE` — nằm trong
--      danh sách cấm của CLAUDE.md (xoá file/dữ liệu phải có Chủ duyệt) — và
--      cũng là rủi ro không cần thiết cho một ràng buộc mà **trigger làm được
--      đúng bằng vậy**. Nên dùng trigger: mỗi INSERT/UPDATE kiểm
--      `workspace_id` khớp workspace của ticket, lệch thì ABORT.
--      Chi phí: một lần tra khoá chính cho mỗi dòng ghi.
--
--      Áp cho cả 4 bảng con của `ticket`: `ticket_link` (cả hai đầu),
--      `ticket_label`, `comment`, `ticket_history`.
--
--   B. **Index cho các truy vấn danh sách thật của lượt 2.**
--      `ix_ticket_du_an` của 0001 đặt `trang_thai` **trước** `hang_uu_tien`, nên
--      truy vấn "mọi ticket của một dự án, sắp theo ưu tiên" (không lọc trạng
--      thái) không dùng được index cho `ORDER BY` → SQLite phải `USE TEMP B-TREE
--      FOR ORDER BY`, tức sắp toàn bộ ticket của dự án trong bộ nhớ. Ở mốc
--      200.000 ticket thì không chấp nhận được.
--      Thêm index không có `trang_thai` cho đúng truy vấn đó, và index
--      `(workspace_id, ten, id)` cho danh sách dự án (keyset theo tên).

-- ===================================================================
-- A. Trigger: workspace_id của bảng con phải khớp ticket.workspace_id
-- ===================================================================
--
-- Quy ước thông điệp: `RAISE(ABORT, '<MÃ LỖI>: <mô tả>')`, cùng dạng với các
-- trigger của 0001, để tầng trên tách được mã lỗi ra khỏi thông điệp SQLite.

-- --- ticket_link: kiểm **cả hai đầu** --------------------------------
CREATE TRIGGER tg_ticket_link_ws_them
BEFORE INSERT ON ticket_link
FOR EACH ROW WHEN
  NEW.workspace_id <> (SELECT workspace_id FROM ticket WHERE id = NEW.tu_ticket_id)
  OR NEW.workspace_id <> (SELECT workspace_id FROM ticket WHERE id = NEW.den_ticket_id)
BEGIN
  SELECT RAISE(ABORT, 'INVALID_INPUT: lien ket ticket phai cung workspace');
END;

CREATE TRIGGER tg_ticket_link_ws_sua
BEFORE UPDATE ON ticket_link
FOR EACH ROW WHEN
  NEW.workspace_id <> (SELECT workspace_id FROM ticket WHERE id = NEW.tu_ticket_id)
  OR NEW.workspace_id <> (SELECT workspace_id FROM ticket WHERE id = NEW.den_ticket_id)
BEGIN
  SELECT RAISE(ABORT, 'INVALID_INPUT: lien ket ticket phai cung workspace');
END;

-- --- ticket_label ----------------------------------------------------
CREATE TRIGGER tg_ticket_label_ws_them
BEFORE INSERT ON ticket_label
FOR EACH ROW WHEN
  NEW.workspace_id <> (SELECT workspace_id FROM ticket WHERE id = NEW.ticket_id)
BEGIN
  SELECT RAISE(ABORT, 'INVALID_INPUT: nhan ticket phai cung workspace voi ticket');
END;

CREATE TRIGGER tg_ticket_label_ws_sua
BEFORE UPDATE ON ticket_label
FOR EACH ROW WHEN
  NEW.workspace_id <> (SELECT workspace_id FROM ticket WHERE id = NEW.ticket_id)
BEGIN
  SELECT RAISE(ABORT, 'INVALID_INPUT: nhan ticket phai cung workspace voi ticket');
END;

-- --- comment ---------------------------------------------------------
CREATE TRIGGER tg_comment_ws_them
BEFORE INSERT ON comment
FOR EACH ROW WHEN
  NEW.workspace_id <> (SELECT workspace_id FROM ticket WHERE id = NEW.ticket_id)
BEGIN
  SELECT RAISE(ABORT, 'INVALID_INPUT: binh luan phai cung workspace voi ticket');
END;

CREATE TRIGGER tg_comment_ws_sua
BEFORE UPDATE ON comment
FOR EACH ROW WHEN
  NEW.workspace_id <> (SELECT workspace_id FROM ticket WHERE id = NEW.ticket_id)
BEGIN
  SELECT RAISE(ABORT, 'INVALID_INPUT: binh luan phai cung workspace voi ticket');
END;

-- --- ticket_history --------------------------------------------------
-- Lịch sử chỉ thêm (0001 đã có trigger chặn UPDATE và DELETE), nên chỉ cần
-- kiểm lúc INSERT.
CREATE TRIGGER tg_ticket_history_ws_them
BEFORE INSERT ON ticket_history
FOR EACH ROW WHEN
  NEW.workspace_id <> (SELECT workspace_id FROM ticket WHERE id = NEW.ticket_id)
BEGIN
  SELECT RAISE(ABORT, 'INVALID_INPUT: lich su phai cung workspace voi ticket');
END;

-- ===================================================================
-- B. Index cho truy vấn danh sách của lượt 2
-- ===================================================================

-- "Mọi ticket của một dự án, sắp theo ưu tiên" — không lọc trạng thái.
-- Khoá keyset là `(hang_uu_tien, tao_luc DESC, id DESC)` (`decisions.md` 01/10),
-- và index phải mang đúng bộ ba đó **ngay sau** `project_id`, không có
-- `trang_thai` chen vào, nếu không SQLite phải sắp bằng B-tree tạm.
CREATE INDEX ix_ticket_du_an_uu_tien
  ON ticket (workspace_id, project_id, hang_uu_tien, tao_luc DESC, id DESC)
  WHERE xoa_luc IS NULL;

-- Danh sách dự án, keyset theo `(ten, id)`.
-- `ix_project_trang_thai` của 0001 dẫn đầu bằng `trang_thai`, nên không dùng
-- được cho danh sách "mọi dự án sắp theo tên". `id` để thứ tự là **toàn phần**:
-- hai dự án trùng tên vẫn có thứ tự xác định, cursor không bỏ sót không trả trùng.
CREATE INDEX ix_project_ten ON project (workspace_id, ten, id);

-- Danh sách agent, keyset theo `(ten, id)` — SPEC mục 3 "Đội agent".
-- `ux_agent_ten` là UNIQUE trên `(workspace_id, ten)` nên `ten` đã là thứ tự
-- toàn phần, nhưng index này mang thêm `id` để cùng một dạng truy vấn keyset
-- `(ten, id) > (?, ?)` dùng được cho cả dự án và agent.
CREATE INDEX ix_agent_ten_id ON agent (workspace_id, ten, id);
