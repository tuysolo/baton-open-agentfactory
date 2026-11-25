-- ===================================================================
-- 0016 — **Mục xác nhận TỰ SINH** của dự án không code, + hai index nóng,
--        + hàng rào cho `ma_so`
-- SPEC mục 7 (d.217), 19.10 (d.548), 19.12 **câu 57**, mục 8 (d.232, d.249–252)
-- ===================================================================
--
-- Ba việc rời nhau nhưng cùng một bảng, nên cùng một migration:
--
--  1. Cột **mốc** `xac_nhan_ticket_id` cho mục Cần Chủ loại Review **tự sinh** của
--     19.12 câu 57, cộng **một index UNIQUE riêng phần** biến "**một** mục cho mỗi
--     ticket, không sinh trùng" (câu 57, gạch 2) thành một luật của **DB** chứ
--     không của một đường ghi.
--  2. Hai index cho hai đường đọc **nóng** đang quét bảng: `resolved_asks`
--     (d.268) và bảng "Đã xử lý" (d.251).
--  3. Trigger chặn `UPDATE OF ma_so` — trả một lời khai mà mã chưa đỡ (xem cuối
--     file).
--
-- **Không `DROP TABLE`, không xoá dòng nào.** Cùng lý lẽ đã ghi ở đầu 0015: SQLite
-- không thêm được `CHECK` cấp bảng bằng `ALTER TABLE`, nên ràng buộc liên-cột đi
-- vào trigger; dựng lại bảng là một `DROP TABLE can_chu`, thuộc danh sách cấm của
-- `CLAUDE.md` mục 4.

-- -------------------------------------------------------------------
-- 1. Mốc "mục này là mục xác nhận tự sinh của ticket nào"
-- -------------------------------------------------------------------
-- 19.12 câu 57 gạch 2: "**Một** mục cho mỗi ticket, không sinh trùng."
--
-- ## Vì sao một cột MỚI, không dùng `can_chu_ticket`
--
-- Bảng nối `can_chu_ticket` (0013) đã nối mục ↔ ticket, nhưng nó **không trả lời
-- được** câu hỏi mà cổng phải hỏi. Hai lý do, cả hai đều làm vỡ luật nếu bỏ qua:
--
--  * Một ticket có **nhiều** mục Cần Chủ loại `review` do agent tạo tay (d.238 là
--    một loại mục bình thường, ai cũng tạo được). Đọc "có mục `review` nào nối
--    ticket này và đã `resolved` không" thì **một mục review tay** của agent —
--    hỏi một chuyện hoàn toàn khác — sẽ **mở cổng Xong** cho ticket. Đó là một lỗ
--    đi quanh cổng, không một chi tiết hiển thị.
--  * "Không sinh trùng" phải là một ràng buộc **duy nhất**, và `can_chu_ticket`
--    có khoá chính `(can_chu_id, ticket_id)` nên nó cho phép **n** mục trên cùng
--    ticket — đúng như nó phải cho, vì d.240 nói "ticket liên quan (**nhiều**)".
--
-- Nên mốc là một cột riêng trên chính dòng mục: nó vừa là **danh tính** ("mục này
-- là mục xác nhận của ticket X"), vừa là chỗ treo index UNIQUE.
--
-- Đường sinh **vẫn** chèn một dòng `can_chu_ticket` bên cạnh (d.240: thẻ phải
-- hiện "ticket liên quan"), nên hai thứ không trùng việc: bảng nối là **quan hệ
-- hiển thị**, cột này là **vai của mục**.
ALTER TABLE can_chu ADD COLUMN xac_nhan_ticket_id TEXT REFERENCES ticket(id);

-- **Một mục cho mỗi ticket** — 19.12 câu 57, ép tại DB.
--
-- Riêng phần `WHERE … IS NOT NULL`: gần như mọi mục Cần Chủ **không** phải mục
-- xác nhận tự sinh, nên index chỉ mang đúng các dòng đó — cùng lý lẽ
-- `ix_can_chu_trung` của 0013 và `ix_phien_can_chu` của 0015.
--
-- Cũng là index của đường đọc mà cổng chạy **mỗi lần kiểm**:
--   WHERE workspace_id = ? AND xac_nhan_ticket_id = ?
-- — hai cột bình đẳng, nên đó là một `SEARCH` trên một index nhỏ. Không có nó thì
-- cổng của **mọi** ticket dự án không code là một lần quét bảng `can_chu`.
CREATE UNIQUE INDEX ux_can_chu_xac_nhan_ticket
  ON can_chu (workspace_id, xac_nhan_ticket_id)
  WHERE xac_nhan_ticket_id IS NOT NULL;

-- Mục xác nhận tự sinh phải cùng workspace với ticket nó xác nhận, và phải đúng
-- **loại `review`** — d.217 nói thẳng "một mục Cần Chủ **loại Review** tự sinh".
--
-- Cặp trigger, cùng khuôn 7 cặp của 0013: `REFERENCES` không ép "cùng workspace"
-- (đó là lý do mọi migration của dự án này đều phải có trigger **bên cạnh** khoá
-- ngoài), và `CHECK` không tra được bảng khác.
--
-- `IS NOT` ở vế workspace, không `<>`: ticket không tồn tại ⇒ `(SELECT …)` ra
-- NULL, và `NEW.workspace_id <> NULL` cho NULL, tức WHEN **không bật** và dòng
-- lọt. Cùng cái bẫy mà `tg_can_chu_phuong_an_loai_them` của 0013 đã khai.
CREATE TRIGGER tg_can_chu_xac_nhan_them
BEFORE INSERT ON can_chu
FOR EACH ROW WHEN
  NEW.xac_nhan_ticket_id IS NOT NULL
  AND (NEW.loai <> 'review'
       OR NEW.workspace_id IS NOT (SELECT workspace_id FROM ticket WHERE id = NEW.xac_nhan_ticket_id))
BEGIN
  SELECT RAISE(ABORT, 'INVALID_INPUT: muc xac nhan tu sinh phai la loai review, cung workspace voi ticket');
END;

CREATE TRIGGER tg_can_chu_xac_nhan_sua
BEFORE UPDATE ON can_chu
FOR EACH ROW WHEN
  NEW.xac_nhan_ticket_id IS NOT NULL
  AND (NEW.loai <> 'review'
       OR NEW.workspace_id IS NOT (SELECT workspace_id FROM ticket WHERE id = NEW.xac_nhan_ticket_id))
BEGIN
  SELECT RAISE(ABORT, 'INVALID_INPUT: muc xac nhan tu sinh phai la loai review, cung workspace voi ticket');
END;

-- -------------------------------------------------------------------
-- 2. Hai index cho hai đường đọc nóng
-- -------------------------------------------------------------------
--
-- ## (a) `resolved_asks` — mục 8 d.268
--
-- `asksVuaXuLy` (`doc-can-chu.ts`, phần 4 lượt 3a) lọc:
--
--   WHERE workspace_id = ? AND tao_boi_agent_id = ?
--     AND trang_thai <> 'open' AND xu_ly_luc IS NOT NULL AND xu_ly_luc >= ?
--   ORDER BY xu_ly_luc DESC, id DESC
--
-- `ix_can_chu_khoi` của 0013 dẫn đầu `(workspace_id, trang_thai, …)` và điều kiện
-- trạng thái ở đây là một **bất đẳng thức**, nên index đó chỉ dùng được vế
-- `workspace_id` ⇒ **quét toàn bộ mục của workspace**, ở **mọi** lần `tasks` và
-- `heartbeat` của **mọi** agent. Đó là đường đọc nóng nhất của hệ, và D1 tính
-- tiền theo **rows read**.
--
-- **`xu_ly_luc IS NOT NULL` thay cho `trang_thai <> 'open'` trong điều kiện riêng
-- phần, và hai cái đó TƯƠNG ĐƯƠNG — không phải một phép xấp xỉ.** Mệnh đề 3 của
-- cặp trigger `tg_can_chu_xu_ly_*` (0015) ép đúng tương đương đó ở **cả** INSERT
-- và UPDATE: `(trang_thai = 'open') <> (xu_ly_luc IS NULL)` làm ABORT. Nên không
-- có dòng nào `open` mà có `xu_ly_luc`, và ngược lại. Nhờ vậy index riêng phần
-- **không** bỏ sót dòng nào mà câu truy vấn cần.
--
-- `xu_ly_luc` để **ASC** trong index dù câu truy vấn sắp `DESC`: SQLite đi index
-- được theo **chiều ngược**, và cả hai cột của `ORDER BY` đều đảo cùng chiều — nên
-- không có `TEMP B-TREE`. Cùng hình với `ix_nhat_ky_luc` của 0014, vốn phục vụ
-- `ORDER BY luc DESC, id DESC`.
CREATE INDEX ix_can_chu_asks
  ON can_chu (workspace_id, tao_boi_agent_id, xu_ly_luc, id)
  WHERE xu_ly_luc IS NOT NULL;

-- ## (b) Bảng "Đã xử lý" — mục 8 d.251
--
--   WHERE workspace_id = ? AND xu_ly_luc IS NOT NULL
--     [AND xu_ly_luc >= ? AND xu_ly_luc < ?]      -- lọc theo khoảng ngày
--   ORDER BY xu_ly_luc DESC, id DESC
--
-- Bảng này sắp theo **ngày xử lý**, tức một cột mà `ix_can_chu_khoi` để ở **cuối**
-- (sau `muc`, `han_luc`, `tao_luc`) — nên nó không dùng được. Không có index riêng
-- thì mỗi lần mở màn hình Cần Chủ là một lần quét toàn bảng **cộng** một lần sắp
-- bằng B-tree tạm.
--
-- **Không** gộp vào `ix_can_chu_asks`: ở đó `tao_boi_agent_id` là cột thứ hai, và
-- bảng "Đã xử lý" **không** lọc theo người tạo (chủ xem mọi mục), nên nó sẽ phải
-- nhảy qua từng giá trị `tao_boi_agent_id` — mất đúng thứ tự `ORDER BY`.
CREATE INDEX ix_can_chu_da_xu_ly
  ON can_chu (workspace_id, xu_ly_luc, id)
  WHERE xu_ly_luc IS NOT NULL;

-- -------------------------------------------------------------------
-- 3. `ma_so` của một mục KHÔNG BAO GIỜ ĐỔI — mục 8 d.232
-- -------------------------------------------------------------------
-- `workspace-gate.ts` khai điều này cho `baton result T-x --wait`: khoá đánh thức
-- là `can_chu_ma:T-<số>`, và nó chỉ đúng nếu `ma_so` của một mục bất biến. Chỗ
-- dựa của lời khai, tới trước migration này, **chỉ** là **sự vắng mặt của mã**:
-- không đường ghi nào `UPDATE` cột đó. Reviewer của lượt 3a bắt đúng loại lời khai
-- này, và nếp đã chốt của dự án (`decisions.md`, lượt 2b sửa review) là **siết
-- cấu trúc cho lời khai thành đúng**, không hạ lời khai.
--
-- `BEFORE UPDATE OF ma_so` (có `OF`), khác cặp trigger của 0015: ở đây mệnh đề
-- phụ thuộc **đúng một** cột và không cột nào khác, nên `OF` là đúng phạm vi và
-- rẻ hơn.
--
-- `WHEN NEW.ma_so <> OLD.ma_so`: một câu `UPDATE … SET ma_so = ma_so` (hoặc một
-- câu đặt lại cùng giá trị) **không** bị chặn — nó không đổi gì. Chặn cả ca đó sẽ
-- làm vỡ một đường ghi vô hại mà không bảo vệ thêm điều gì.
--
-- `tg_bo_dem_chi_tang` của 0001 + `ux_can_chu_ma_so` của 0013 lo nửa "tăng dần,
-- không tái dùng"; trigger này lo nửa "của **một mục** thì không đổi".
CREATE TRIGGER tg_can_chu_ma_so_bat_bien
BEFORE UPDATE OF ma_so ON can_chu
FOR EACH ROW WHEN NEW.ma_so <> OLD.ma_so
BEGIN
  SELECT RAISE(ABORT, 'INVALID_INPUT: ma so T-x cua mot muc Can Chu khong bao gio doi');
END;

-- -------------------------------------------------------------------
-- Lỗ `INSERT OR REPLACE` — vì sao trigger trên MỘT MÌNH chưa đủ
-- -------------------------------------------------------------------
-- `INSERT OR REPLACE INTO can_chu (id, …, ma_so) VALUES ('<id đã có>', …)` **không**
-- là một `UPDATE`: SQLite xoá dòng cũ rồi chèn dòng mới, nên **không** trigger
-- `BEFORE UPDATE` nào bắn (và `PRAGMA recursive_triggers` mặc định **TẮT**, nên
-- trigger `DELETE` cũng không). Đúng cái lỗ đã tìm ra thật ở lượt 2a, và 0014 đã
-- bịt nó cho cả hai bảng `nhat_ky` bằng `BEFORE INSERT … WHEN EXISTS(id)`. Làm
-- theo đúng nếp đó.
--
-- `grep "INSERT OR REPLACE"` toàn `packages/api/src` → **không chỗ nào**, nên hôm
-- nay không có đường khai thác; nhưng lời khai ở `workspace-gate.ts` đọc như
-- "`ma_so` **không bao giờ** đổi" một cách **tuyệt đối**, và nếp của dự án là siết
-- cấu trúc cho lời khai thành đúng, không hạ lời khai.
--
-- Hàng rào này **rộng hơn** `ma_so` một cách có chủ ý: ghi đè một dòng `can_chu`
-- theo `id` đi quanh **mọi** trigger của 0013/0015/0016 (workspace khớp, loại khớp
-- trạng thái, mục xác nhận duy nhất, `mo_lai_lan` chỉ tăng). Nên chặn **chèn lên
-- một `id` đã có**, bất kể câu lệnh là `INSERT`, `INSERT OR REPLACE` hay
-- `INSERT OR IGNORE`.
--
-- Đường ghi thật cấp `id` **mới** mỗi lần (`crypto.randomUUID()`), nên nó không
-- bao giờ chạm trigger này; chỉ một câu SQL thô cố ghi đè mới chạm. Có ca test
-- chạy SQL thô.
CREATE TRIGGER tg_can_chu_khong_ghi_de
BEFORE INSERT ON can_chu
FOR EACH ROW WHEN EXISTS (SELECT 1 FROM can_chu WHERE id = NEW.id)
BEGIN
  SELECT RAISE(ABORT, 'FORBIDDEN: khong ghi de mot muc Can Chu da co (ma so T-x bat bien, muc 8)');
END;
