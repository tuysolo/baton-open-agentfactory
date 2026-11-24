-- ===================================================================
-- 0014 — **Nhật ký quyết định** (bảng `nhat_ky` + bảng con `nhat_ky_can_cu`)
-- SPEC mục 10 (d.305–312), mục 3 (bảng quyền, hàng "Ghi Nhật ký quyết định"),
-- mục 8 d.279 + 19.9 (dòng tự sinh từ Cần Chủ — **lượt sau** nối vào),
-- 19.12 câu 4 ("Chung" là giá trị **rỗng** ⇒ dòng Nhật ký tự sinh từ mục Chung
-- để **trống** dự án).
-- ===================================================================
--
-- Lượt này là **lõi dữ liệu + đường GHI + đường ĐỌC** của mục 10. Việc **nối**
-- đường xử lý mục Cần Chủ (19.9: kết quả, bỏ qua, mở lại) vào đây là lượt sau;
-- các câu dựng nội dung dòng đã có sẵn ở `@baton/shared` → `nhat-ky.ts`, nên
-- lượt đó chỉ phải gọi, không phải nghĩ lại luật.
--
-- ## Luật mạnh nhất của mục 10: **CHỈ THÊM**, ép tại DB
--
-- d.309 nguyên văn: "**Chỉ thêm.** Không sửa, không xoá, **kể cả chủ**." Chữ "kể
-- cả chủ" là thứ làm cho một hàng rào ở tầng ứng dụng **không đủ**: ở tầng ứng
-- dụng, "chủ" là nhánh được mọi `quyen()` cho qua (`quyen.ts` bước 2), nên luật
-- này không có chỗ nào để sống ở đó. Nó sống ở trigger `BEFORE UPDATE` và
-- `BEFORE DELETE` dưới đây, trên **cả** bảng cha lẫn bảng con.
--
-- Hệ quả có chủ ý: bảng này **không có** `cap_nhat_luc`. Một cột "lúc cập nhật"
-- trên một bảng không bao giờ cập nhật được là một lời khai sai.
--
-- ## Vì sao CĂN CỨ là BẢNG CON, không JSON và không chữ tự do
--
-- d.308 nói căn cứ là "**link T-số, mã ticket, dòng cũ**" — **ba loại khác
-- nhau**, mỗi loại trỏ tới một bảng khác nhau. Cùng bốn căn cứ đã ghi ở đầu
-- 0013 (phương án và file của Cần Chủ):
--
--  1. **Nếp "khoá thật, không chữ tự do"** của dự án (ghi chú 0012, 0013). Căn
--     cứ là thứ phần 6 dựng **link** từ đó: một chuỗi `'T-18'` trong JSON không
--     bảo đảm mục `T-18` có thật, và không bảo đảm nó cùng workspace.
--  2. **Luật đếm được ép tại DB.** "dòng mới trỏ về dòng cũ" (d.309) là luật
--     **trên từng phần tử**; CHECK không đi vào trong một chuỗi JSON được.
--  3. Cờ "**đã có quyết định mới**" là một truy vấn **chiều ngược** ("có dòng
--     nào trỏ về tôi không"). Với JSON thì câu đó là một lần quét bảng; với một
--     bảng con có index thì nó là một `SEARCH`.
--  4. Cùng khuôn `can_chu_phuong_an`, `can_chu_file`, `ticket_label`.
--
-- ## "Đã có quyết định mới" là **DẪN XUẤT**, không một cột
--
-- d.309: "Muốn đổi thì thêm dòng mới trỏ về dòng cũ; dòng cũ hiện chữ 'đã có
-- quyết định mới'." Chữ đó là **hệ quả** của việc có một dòng trỏ về, nên nó
-- không được là một cột: một cột thì phải **UPDATE** dòng cũ để bật nó — đúng
-- cái việc d.309 cấm, và trigger dưới đây chặn. Cùng nếp `quaHan()` (19.8),
-- `stalled` (19.12 câu 42), `nguoiDangCam` (19.1).
--
--   da_co_quyet_dinh_moi(x) :=
--     EXISTS (SELECT 1 FROM nhat_ky_can_cu
--              WHERE loai = 'dong_cu' AND dong_cu_id = x)
--
-- ## "Chung" là `project_id IS NULL` — 19.12 câu 4
--
-- Câu 4 chốt: "Chung" **không phải một dự án**, và "dòng Nhật ký tự sinh từ một
-- mục Chung để **trống** trường dự án". Nên **không** có dòng `project` nào tên
-- "Chung", và cột dưới đây cho phép NULL — y như `can_chu.project_id` của 0013.
--
-- ## "Ai" là **cặp khoá thật**, không chữ tự do
--
-- d.308: "ai (**chủ hoặc agent**)"; d.310 còn phân biệt riêng dòng "**chủ
-- quyết**". Nên "ai" phải trả lời được hai câu: *chủ hay agent*, và *agent nào*.
-- Cặp `(nguoi_loai, agent_id)` + CHECK tương đương làm đúng vậy, cùng khuôn
-- `ticket.nguoi_tao_*`, `comment.tac_gia_*`, `evidence.nguoi_gui_*`.
--
-- Khác `can_chu.tao_boi_agent_id` (0013 dùng **một** cột, NULL = chủ) có chủ ý:
-- ở đó "ai tạo" chỉ là siêu dữ liệu, còn ở đây "ai" là **một trường của dòng**
-- mà d.311 đòi **lọc theo**, và d.310 đặt một luật riêng lên giá trị `chu`. Một
-- bộ lọc "ai = chủ" viết `agent_id IS NULL` là một bộ lọc đọc không ra nghĩa.

CREATE TABLE nhat_ky (
  id           TEXT    PRIMARY KEY,
  workspace_id TEXT    NOT NULL REFERENCES workspace(id),

  -- **Lúc** (ngày giờ) — d.308. Epoch milliseconds, như mọi mốc của Baton.
  -- Không `tao_luc`: bảng chỉ thêm, nên "lúc của dòng" và "lúc tạo dòng" là
  -- **một**, và hai tên cho một thứ là hai chỗ để lệch nhau.
  luc          INTEGER NOT NULL CHECK (luc > 0),

  -- **Ai** — d.308, d.310. Xem ghi chú ở đầu file.
  nguoi_loai   TEXT    NOT NULL CHECK (nguoi_loai IN ('chu', 'agent')),
  agent_id     TEXT    REFERENCES agent(id),

  -- **Dự án** — **NULL = "Chung"** — 19.12 câu 4.
  project_id   TEXT    REFERENCES project(id),

  -- **Quyết định** — d.308. Đây là trường mà d.312 soi để **cảnh báo** mẫu
  -- giống dữ liệu nhân sự. Cảnh báo **không chặn**, nên không có CHECK nào ở
  -- đây về chuyện đó: luật sống ở `canhBaoDuLieuNhanSu` (`@baton/shared`), và
  -- handler đưa cảnh báo ra **kết quả trả về**. Một CHECK ở đây sẽ biến "cảnh
  -- báo" thành "chặn" — ngược hẳn chữ SPEC.
  quyet_dinh   TEXT    NOT NULL CHECK (length(quyet_dinh) BETWEEN 1 AND 20000),

  -- **Vì sao** — d.306 ("ai đã quyết cái này, **vì sao**, lúc nào") và d.308
  -- liệt kê nó là một trường của dòng. Bắt buộc, không rỗng: xem
  -- `cau-hoi-spec.md` #71 (SPEC không nói rõ nó có bắt buộc không, hướng tạm là
  -- **chặt**, vì cả mục 10 tồn tại để trả lời đúng câu "vì sao").
  vi_sao       TEXT    NOT NULL CHECK (length(vi_sao) BETWEEN 1 AND 20000),

  -- "Chủ" **không** có `agent_id`, còn "agent" thì **phải** có. Một tương đương,
  -- viết một dòng — cùng khuôn cặp CHECK liên-cột của 0013.
  CHECK ((nguoi_loai = 'agent') = (agent_id IS NOT NULL))
) STRICT;

-- ===================================================================
-- Căn cứ của một dòng — d.308 ("link T-số, mã ticket, dòng cũ")
-- ===================================================================
-- Ba loại, ba cột trỏ, và **đúng một** cột được có giá trị với mỗi loại. Ba
-- CHECK tương đương ép hết luật đó tại DB, nên một đường ghi mới ở lượt sau
-- không lách được bằng cách quên gọi hàm kiểm.
--
-- `thu_tu` để thứ tự hiện trên màn hình là **xác định** (một dòng có thể có
-- nhiều căn cứ), và để khoá keyset của đường đọc là thứ tự toàn phần.

CREATE TABLE nhat_ky_can_cu (
  id           TEXT    PRIMARY KEY,
  workspace_id TEXT    NOT NULL REFERENCES workspace(id),
  nhat_ky_id   TEXT    NOT NULL REFERENCES nhat_ky(id),

  loai         TEXT    NOT NULL CHECK (loai IN ('ask', 'ticket', 'dong_cu')),

  -- `ask` — "link **T-số**" (d.308). Khoá thật tới mục Cần Chủ, không chuỗi
  -- `'T-18'`: đây chính là chỗ d.279 cắm vào ("căn cứ là `T-số`").
  can_chu_id   TEXT    REFERENCES can_chu(id),
  -- `ticket` — "**mã ticket**" (d.308).
  ticket_id    TEXT    REFERENCES ticket(id),
  -- `dong_cu` — "**dòng cũ**" (d.308, d.309 "thêm dòng mới trỏ về dòng cũ").
  -- Đây là nguồn duy nhất của cờ dẫn xuất "đã có quyết định mới".
  dong_cu_id   TEXT    REFERENCES nhat_ky(id),

  thu_tu       INTEGER NOT NULL CHECK (thu_tu >= 1),
  tao_luc      INTEGER NOT NULL,

  CHECK ((loai = 'ask')     = (can_chu_id IS NOT NULL)),
  CHECK ((loai = 'ticket')  = (ticket_id  IS NOT NULL)),
  CHECK ((loai = 'dong_cu') = (dong_cu_id IS NOT NULL)),

  -- Một dòng không tự thay thế chính nó — nếu không thì nó vĩnh viễn mang chữ
  -- "đã có quyết định mới" trỏ về chính nó.
  CHECK (dong_cu_id IS NULL OR dong_cu_id <> nhat_ky_id)
) STRICT;

CREATE UNIQUE INDEX ux_nhat_ky_can_cu_thu_tu ON nhat_ky_can_cu (nhat_ky_id, thu_tu);

-- **Chiều ngược** của cờ "đã có quyết định mới" (d.309): "có dòng nào trỏ về
-- dòng này không". Riêng phần, vì chỉ loại `dong_cu` tham gia câu hỏi đó.
CREATE INDEX ix_nhat_ky_can_cu_dong_cu
  ON nhat_ky_can_cu (dong_cu_id, nhat_ky_id)
  WHERE dong_cu_id IS NOT NULL;

-- "Mục Cần Chủ này đã sinh ra dòng Nhật ký nào" — đường đọc của mục 8 (thẻ đã
-- xử lý) và của `baton result T-x`, lượt sau cần.
CREATE INDEX ix_nhat_ky_can_cu_can_chu
  ON nhat_ky_can_cu (can_chu_id, nhat_ky_id)
  WHERE can_chu_id IS NOT NULL;

-- "Ticket này đã được quyết gì" — trang chi tiết ticket (phần 6).
CREATE INDEX ix_nhat_ky_can_cu_ticket
  ON nhat_ky_can_cu (ticket_id, nhat_ky_id)
  WHERE ticket_id IS NOT NULL;

-- ===================================================================
-- Index — đúng bốn đường đọc của d.311
-- ===================================================================
-- d.311: "**gom theo ngày**, **lọc theo dự án** và **theo ai**, **tìm theo
-- chữ**."
--
-- Thứ tự chuẩn của mọi đường đọc là `(luc DESC, id DESC)`: "gom theo ngày" là
-- một phép gom **trên kết quả đã sắp theo thời gian**, không một cột `ngay`
-- riêng — ngày là một **dẫn xuất** của `luc` theo múi giờ của chủ
-- (`MUI_GIO_CHU_PHUT`, `cau-hoi-spec.md` #68), và lưu nó thành cột là khoá cứng
-- một múi giờ vào dữ liệu. `id` đứng cuối để thứ tự là **toàn phần** (bài học
-- của `test/phan-trang.test.ts`).

-- (a) **Gom theo ngày** — cũng là đường đọc mặc định (không lọc gì).
CREATE INDEX ix_nhat_ky_luc ON nhat_ky (workspace_id, luc, id);

-- (b) **Lọc theo dự án.** `project_id` cho phép NULL, và đó là chuyện **cần**
-- ở đây chứ không phải chuyện phải né (khác `ix_can_chu_trung` của 0013, nơi
-- cột NULL chỉ làm index phình): bộ lọc "Chung" của 19.12 câu 4 là
-- `project_id IS NULL`, và nó là một **tiền tố bình đẳng** của index này, nên
-- câu đó vẫn là một `SEARCH`.
CREATE INDEX ix_nhat_ky_du_an ON nhat_ky (workspace_id, project_id, luc, id);

-- (c) **Lọc theo ai.** Cặp `(nguoi_loai, agent_id)` theo đúng thứ tự khai của
-- bảng, nên cả hai bộ lọc của màn hình đi được index: "ai = chủ"
-- (`nguoi_loai = 'chu'`, một tiền tố) và "ai = agent X" (cả cặp).
--
-- Index này còn phục vụ **tầm nhìn dòng Chung** của `manager` (chỉ dòng do
-- chính mình ghi — xem `docDuocDongChung`), vốn cũng lọc theo `agent_id`.
CREATE INDEX ix_nhat_ky_ai ON nhat_ky (workspace_id, nguoi_loai, agent_id, luc, id);

-- (d) **Tìm theo chữ** — d.311.
--
-- **Khai thẳng giới hạn: câu này KHÔNG có index, và không thể có.** Phép tìm là
-- `lower(quyet_dinh) LIKE '%…%'` (chuỗi con, đúng nếp 19.12 câu 8 chốt cho
-- `Cmd/Ctrl+K`), mà một `LIKE` mở đầu bằng `%` không dùng được B-tree nào: mọi
-- index đều sắp theo **tiền tố**. Nên câu tìm là một lần quét **trong phạm vi
-- workspace** (`ix_nhat_ky_luc` thu hẹp trước, rồi lọc `LIKE` trên kết quả).
--
-- Chấp nhận được ở v0.1, và đây là lý do: số dòng Nhật ký là số **quyết định
-- của một người** — nó tăng theo ngày, không theo 200.000 ticket của mốc 19.12
-- câu 1. Mốc hiệu năng của SPEC đặt lên **danh sách ticket và Tổng quan**, không
-- lên màn hình này.
--
-- Nới hết được bằng FTS5 (`CREATE VIRTUAL TABLE … USING fts5`) ở một migration
-- sau nếu chủ thấy cần — không đổi bảng nào, chỉ thêm.
--
-- Giới hạn thứ hai, cùng y chỗ `ix_can_chu_trung` đã khai (#70): `lower()` của
-- SQLite **chỉ biết ASCII**, nên tìm `"CHỌN"` không khớp `"chọn"`, còn
-- `"CHON"`/`"chon"` thì khớp. `chuanHoaTimChu` của `@baton/shared` là **bản sao
-- đúng** của phép hạ đó, nên hai bên không lệch nhau.

-- ===================================================================
-- Trigger: CHỈ THÊM — d.309, "kể cả chủ"
-- ===================================================================
-- Hàng rào của luật mạnh nhất trong mục 10. Xem đầu file để biết vì sao nó phải
-- ở tầng DB chứ không ở tầng ứng dụng.
--
-- `BEFORE`, không `AFTER`: `RAISE(ABORT)` huỷ cả câu lệnh và cả giao dịch chứa
-- nó, nên một `UPDATE … WHERE` chạm nhiều dòng cũng không ghi được dòng nào.
--
-- Quy ước `RAISE(ABORT, '<MÃ LỖI>: <mô tả>')` để `loi-d1.ts` tách được mã lỗi.
-- Mã là `FORBIDDEN`: đây là một việc **không ai được phép làm**, không phải một
-- dữ liệu sai hình dạng.

CREATE TRIGGER tg_nhat_ky_khong_sua
BEFORE UPDATE ON nhat_ky
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'FORBIDDEN: Nhat ky quyet dinh chi them, khong sua (SPEC muc 10) - ke ca chu');
END;

CREATE TRIGGER tg_nhat_ky_khong_xoa
BEFORE DELETE ON nhat_ky
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'FORBIDDEN: Nhat ky quyet dinh chi them, khong xoa (SPEC muc 10) - ke ca chu');
END;

-- Bảng con chịu **cùng một** luật, và phải thế: sửa hay xoá được căn cứ của một
-- dòng là sửa được chính dòng đó (bỏ `dong_cu` đi là gỡ chữ "đã có quyết định
-- mới" khỏi dòng cũ — đúng cái d.309 cấm).

CREATE TRIGGER tg_nhat_ky_can_cu_khong_sua
BEFORE UPDATE ON nhat_ky_can_cu
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'FORBIDDEN: Can cu cua dong Nhat ky chi them, khong sua (SPEC muc 10)');
END;

CREATE TRIGGER tg_nhat_ky_can_cu_khong_xoa
BEFORE DELETE ON nhat_ky_can_cu
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'FORBIDDEN: Can cu cua dong Nhat ky chi them, khong xoa (SPEC muc 10)');
END;

-- -------------------------------------------------------------------
-- Lỗ hổng `INSERT OR REPLACE` — và vì sao hai trigger trên KHÔNG đủ
-- -------------------------------------------------------------------
-- `INSERT OR REPLACE INTO nhat_ky (id, …) VALUES ('<id đã có>', …)` **ghi đè**
-- một dòng đã có: SQLite xoá dòng trùng khoá rồi chèn dòng mới. Phép xoá đó
-- **không** bắn `BEFORE DELETE` — tài liệu SQLite nói rõ trigger DELETE chỉ bắn
-- cho `REPLACE` khi `PRAGMA recursive_triggers` **đang bật**, mà mặc định nó
-- **tắt** và D1 không cho ta bật nó một cách chắc chắn trên mọi kết nối.
--
-- Nên hàng rào d.309 phải đứng thêm một chân ở `BEFORE INSERT`: **id đã tồn tại
-- thì ABORT**, bất kể câu lệnh là `INSERT`, `INSERT OR REPLACE` hay
-- `INSERT OR IGNORE`. Trigger `BEFORE INSERT` thì bắn trong **mọi** trường hợp,
-- trước khi giải quyết xung đột khoá — đó là lý do nó bịt được đường này.
--
-- Hệ quả: một dòng Nhật ký, một lần, vĩnh viễn. Đường ghi thật cấp `id` mới mỗi
-- lần nên không bao giờ chạm trigger này; chỉ một câu SQL thô cố ghi đè mới
-- chạm. Có ca test chạy SQL thô cho **cả hai** bảng, so cả nội dung dòng cũ.

CREATE TRIGGER tg_nhat_ky_khong_de
BEFORE INSERT ON nhat_ky
FOR EACH ROW WHEN EXISTS (SELECT 1 FROM nhat_ky WHERE id = NEW.id)
BEGIN
  SELECT RAISE(ABORT, 'FORBIDDEN: Nhat ky quyet dinh chi them, khong ghi de dong da co (SPEC muc 10) - ke ca chu');
END;

CREATE TRIGGER tg_nhat_ky_can_cu_khong_de
BEFORE INSERT ON nhat_ky_can_cu
FOR EACH ROW WHEN EXISTS (SELECT 1 FROM nhat_ky_can_cu WHERE id = NEW.id)
BEGIN
  SELECT RAISE(ABORT, 'FORBIDDEN: Can cu cua dong Nhat ky chi them, khong ghi de can cu da co (SPEC muc 10)');
END;

-- ===================================================================
-- Trigger: mọi khoá ngoài phải CÙNG WORKSPACE
-- ===================================================================
-- Cùng lý do và cùng khuôn với 0002, 0004, 0009, 0012, 0013: `workspace_id` và
-- các khoá ngoài là những cột **rời nhau**, nên `REFERENCES` không buộc chúng
-- khớp. Một dòng Nhật ký mang workspace khác dự án hay khác agent là một dòng đi
-- xuyên workspace (lệch SPEC mục 1, 18).
--
-- **Chỉ `BEFORE INSERT`** — khác các migration trước, và có lý do: hai trigger
-- "chỉ thêm" ở trên đã chặn **mọi** `UPDATE` trên hai bảng này, nên một trigger
-- `BEFORE UPDATE` kiểm workspace là mã không bao giờ chạy tới. Mã chết trong một
-- migration là một lời khai sai về nơi luật đang sống.
--
-- Hai khoá cho phép NULL (`agent_id`, `project_id`), nên mỗi điều kiện tự kẹp
-- `IS NOT NULL`: so `NULL <> (SELECT …)` cho ra NULL, tức WHEN không bật.
--
-- Và mỗi khoá **có giá trị** còn phải kiểm riêng `(SELECT …) IS NULL`, không chỉ
-- `<>`: khi đối tượng được trỏ tới **không tồn tại**, `(SELECT …)` trả NULL, nên
-- `NEW.workspace_id <> NULL` cho NULL và WHEN **không** bật — dòng lọt. Khoá
-- ngoài của SQLite chỉ ép khi `PRAGMA foreign_keys` đang bật, nên chỗ này không
-- thừa. Đây đúng là cái bẫy `<>` vs `IS NOT` mà 0013 đã vấp một lần; bảng cha và
-- bảng con nay viết **cùng một** khuôn.

CREATE TRIGGER tg_nhat_ky_ws_them
BEFORE INSERT ON nhat_ky
FOR EACH ROW WHEN
  (NEW.project_id IS NOT NULL
     AND ((SELECT workspace_id FROM project WHERE id = NEW.project_id) IS NULL
          OR NEW.workspace_id <> (SELECT workspace_id FROM project WHERE id = NEW.project_id)))
  OR (NEW.agent_id IS NOT NULL
     AND ((SELECT workspace_id FROM agent WHERE id = NEW.agent_id) IS NULL
          OR NEW.workspace_id <> (SELECT workspace_id FROM agent WHERE id = NEW.agent_id)))
BEGIN
  SELECT RAISE(ABORT, 'INVALID_INPUT: dong Nhat ky phai cung workspace voi du an va agent');
END;

-- Bảng con: **bốn** workspace phải khớp — chính nó, dòng cha, và đối tượng mà
-- căn cứ trỏ tới (mục Cần Chủ, ticket, hoặc dòng cũ).
--
-- `IS NULL` được kiểm riêng cho từng khoá, không chỉ `<>`: `(SELECT …)` trả NULL
-- khi **không có dòng nào**, và `NEW.workspace_id <> NULL` cho NULL (WHEN không
-- bật) — tức một căn cứ trỏ tới một đối tượng **không tồn tại** sẽ lọt. Khoá
-- ngoài của SQLite chỉ ép khi `PRAGMA foreign_keys` đang bật, nên hàng rào này
-- không thừa (cùng lý lẽ `tg_phien_can_chu_them` của 0013).

CREATE TRIGGER tg_nhat_ky_can_cu_ws_them
BEFORE INSERT ON nhat_ky_can_cu
FOR EACH ROW WHEN
  NEW.workspace_id <> (SELECT workspace_id FROM nhat_ky WHERE id = NEW.nhat_ky_id)
  OR (NEW.can_chu_id IS NOT NULL
      AND ((SELECT workspace_id FROM can_chu WHERE id = NEW.can_chu_id) IS NULL
           OR NEW.workspace_id <> (SELECT workspace_id FROM can_chu WHERE id = NEW.can_chu_id)))
  OR (NEW.ticket_id IS NOT NULL
      AND ((SELECT workspace_id FROM ticket WHERE id = NEW.ticket_id) IS NULL
           OR NEW.workspace_id <> (SELECT workspace_id FROM ticket WHERE id = NEW.ticket_id)))
  OR (NEW.dong_cu_id IS NOT NULL
      AND ((SELECT workspace_id FROM nhat_ky WHERE id = NEW.dong_cu_id) IS NULL
           OR NEW.workspace_id <> (SELECT workspace_id FROM nhat_ky WHERE id = NEW.dong_cu_id)))
BEGIN
  SELECT RAISE(ABORT, 'INVALID_INPUT: can cu cua dong Nhat ky phai cung workspace voi dong, muc Can Chu, ticket va dong cu');
END;
