-- ===================================================================
-- 0013 — **Cần Chủ** (bảng `can_chu` + 3 bảng con)
-- SPEC mục 8 (d.226–291), 19.8 (d.531–535), 19.9 (d.537–543),
-- 19.12 câu 4 ("Chung" là giá trị **rỗng**), câu 18 (cấp `T-số` đi qua ô
-- "Tạo mục Cần Chủ"), câu 19 (`OPTIONS_REQUIRED`, `COMMAND_REQUIRED` là 422)
-- ===================================================================
--
-- Lượt này là **lõi dữ liệu + đường TẠO**. Đường **xử lý** (kết quả, bỏ qua, mở
-- lại, dòng Nhật ký tự sinh, bình luận tự thêm, phiên về `running`,
-- `resolved_asks`) là **lượt 2** của phần 4, nên các cột của nó **chưa khai ở
-- đây**: khai sẵn một cột mà không có đường ghi nào là mời một lượt sau đoán
-- nghĩa của nó. Ngoại lệ duy nhất là `trang_thai`, vì ba mã trạng thái là thứ
-- **mọi đường đọc của mục 8 phải lọc theo** ngay từ lượt này (ba khối chỉ gồm
-- mục `Chờ`, và cờ "có thể trùng" chỉ soi mục `Chờ`).
--
-- ## Vì sao PHƯƠNG ÁN và FILE là BẢNG CON, không JSON
--
-- Lựa chọn có chủ ý, ghi cả vào `quyet-dinh.md`. Bốn căn cứ:
--
--  1. **Dự án này có nếp "khoá thật, không chữ tự do"** (ghi chú của 0012 về bốn
--     cột khoá liên quan: "chúng là thứ phần 6 dựng link từ đó, nên chúng là khoá
--     thật, không chữ tự do"). Phương án là thứ phần 6 dựng **nút bấm** từ đó, và
--     19.9 đòi "loại `Quyết định`: **bắt buộc chọn 1 phương án**" — tức kết quả
--     trỏ tới **một** phương án cụ thể. Một phương án nằm trong JSON không có id
--     để trỏ tới, nên lượt 2 sẽ phải lưu "phương án đã chọn" bằng một chữ (nhãn
--     `'A'`) và không có gì buộc chữ đó khớp một phương án có thật.
--  2. **Luật đếm được ép tại DB.** "mỗi phương án có nhãn A, B, C… và **1–3
--     dòng**" là một luật **trên từng phần tử**. SQLite STRICT không có CHECK nào
--     đi vào trong một chuỗi JSON; `CHECK` trên một dòng bảng con thì có.
--  3. **Nhãn duy nhất** trong một mục (`ux_can_chu_phuong_an_nhan`) — một mục có
--     hai phương án nhãn `B` thì ô "Trả lời hàng loạt" của mục 8 ("khớp phương án
--     nếu có chữ cái đầu hợp lệ") không có câu trả lời đúng.
--  4. Cùng lý lẽ đã dùng cho `ticket_label` và `can_chu_ticket`: quan hệ 1–n có
--     luật riêng trên từng dòng thì là bảng, không là cột.
--
-- Giá phải trả: tạo một mục `decision` là 1 + n câu INSERT. Chấp nhận được — mọi
-- câu nằm trong **cùng một batch** của cửa ghi (cùng thành, cùng hỏng), đúng như
-- `handlerTaoTicket` vẫn làm với nhãn.
--
-- ## "Chung" là `project_id IS NULL` — 19.12 câu 4
--
-- Câu 4 nguyên văn: "Chung" **không phải một dự án**; nó là trường dự án để
-- **rỗng**. Nên **không** có dòng `project` nào tên "Chung", và cột dưới đây cho
-- phép NULL. Bộ lọc "Chung" của mục 8 là `project_id IS NULL`.
--
-- ## Quá hạn KHÔNG ghi vào DB — 19.8
--
-- 19.8: "Quá hạn: **không đổi mức**." Nên không có cột `qua_han` nào: "quá hạn"
-- là `han_luc < bây giờ`, một **dẫn xuất**, cùng nếp `stalled` của 19.12 câu 42
-- và `nguoiDangCam` của 19.1. Cột duy nhất là `han_luc`.

CREATE TABLE can_chu (
  id                   TEXT    PRIMARY KEY,
  workspace_id         TEXT    NOT NULL REFERENCES workspace(id),

  -- `T-số` — mục 8: "tăng dần **toàn workspace**, không tái dùng".
  -- Phạm vi `workspace` của bảng `bo_dem` (khoá `'ask'`), **khác** số ticket vốn
  -- tăng theo dự án. "Không tái dùng" được ép bởi `tg_bo_dem_chi_tang` (0001):
  -- bộ đếm chỉ tăng, nên một mục bị bỏ qua cũng không trả số lại.
  ma_so                INTEGER NOT NULL CHECK (ma_so > 0),

  tieu_de              TEXT    NOT NULL CHECK (length(tieu_de) BETWEEN 1 AND 200),

  -- **NULL = "Chung"** — 19.12 câu 4. Xem đầu file.
  project_id           TEXT    REFERENCES project(id),

  -- 3 mức của mục 8 / 0.1 — `MUC_CAN_CHU` trong `shared/src/ma-nhan.ts`.
  muc                  TEXT    NOT NULL CHECK (muc IN ('urgent', 'today', 'later')),

  -- 4 loại của mục 8 — `LOAI_CAN_CHU`.
  loai                 TEXT    NOT NULL CHECK (loai IN ('decision', 'run_command', 'review', 'fyi')),

  -- 3 trạng thái của mục 8 — `TRANG_THAI_CAN_CHU`. Mặc định `open` ("Chờ").
  trang_thai           TEXT    NOT NULL DEFAULT 'open'
                         CHECK (trang_thai IN ('open', 'resolved', 'skipped')),

  -- Bối cảnh markdown (mục 8: "có link file:// và link ticket"). Cho NULL: mục
  -- `fyi` một dòng không cần bối cảnh. Giới hạn như mô tả ticket.
  boi_canh             TEXT    CHECK (boi_canh IS NULL OR length(boi_canh) <= 100000),

  -- **Hạn** (tuỳ chọn) — mục 8 d.241 + 19.8. Agent gửi thì tôn trọng, không gửi
  -- thì server điền mặc định (`hanMacDinh` của `shared/src/can-chu.ts`):
  -- 🔴 = +4 giờ, 🟡 = 20:00 (trước 18:00 → cùng ngày, từ 18:00 → hôm sau),
  -- ⚪ = **không có hạn mặc định** ⇒ NULL.
  han_luc              INTEGER CHECK (han_luc IS NULL OR han_luc > 0),

  -- Trường riêng theo LOẠI
  -- Mỗi cột có **hai** CHECK: "chỉ loại này mới được có" và "loại này thì phải
  -- có". Cặp đó biến hai luật của mục 8 thành luật của DB, nên một đường ghi mới
  -- ở lượt sau không lách được bằng cách quên gọi hàm kiểm.

  -- `decision`: **lý do** của phương án đề xuất (mục 8: "cộng phương án đề xuất
  -- và lý do"). Bản thân "phương án nào là đề xuất" là cờ `de_xuat` trên một dòng
  -- `can_chu_phuong_an` — một mục chỉ có **một** phương án đề xuất
  -- (`ux_can_chu_phuong_an_de_xuat`), nên không có hai nguồn sự thật.
  ly_do_de_xuat        TEXT    CHECK (ly_do_de_xuat IS NULL OR length(ly_do_de_xuat) <= 20000),

  -- `run_command`: lệnh hoặc script (mục 8: "bắt buộc có lệnh hoặc script").
  lenh                 TEXT    CHECK (lenh IS NULL OR length(lenh) BETWEEN 1 AND 20000),

  -- `run_command`: cờ **cần TTY** — mục 8 ("kèm ghi chú 'chạy ở terminal thật'
  -- nếu agent đánh dấu cần TTY").
  can_tty              INTEGER NOT NULL DEFAULT 0 CHECK (can_tty IN (0, 1)),

  -- Cờ "**có thể trùng T-x**" — mục 8, phần Lỗi: "Trùng tiêu đề với một mục
  -- `Chờ` cùng dự án trong 24 giờ: **vẫn tạo**, nhưng gắn cờ 'có thể trùng T-x'".
  --
  -- Là một **khoá thật** trỏ tới mục kia, không một cờ 0/1 và không một chuỗi
  -- `'T-18'`: chữ "có thể trùng **T-x**" của SPEC đòi chỉ ra *mục nào*, và phần 6
  -- phải dựng được link tới đúng thẻ đó (cùng lý lẽ bốn cột khoá của 0012).
  trung_voi_can_chu_id TEXT    REFERENCES can_chu(id),

  tao_luc              INTEGER NOT NULL,
  cap_nhat_luc         INTEGER NOT NULL,

  -- **NULL = chủ tự tạo** — mục 8 d.229: "agent `coordinator` hoặc `manager`
  -- (CLI, MCP, API), **hoặc chủ tự tạo để ghi nhớ**".
  --
  -- Một cột, không cặp (`loai`, `agent_id`) như `ticket.nguoi_tao_*`: ở đây chỉ
  -- có đúng hai khả năng và chúng loại trừ nhau hoàn toàn, nên cặp hai cột chỉ
  -- thêm một chỗ để lệch nhau (`loai = 'owner'` kèm một `agent_id`).
  tao_boi_agent_id     TEXT    REFERENCES agent(id),

  -- Luật liên-cột

  -- Lệnh **chỉ** thuộc `run_command`, và `run_command` **phải** có lệnh
  -- (mục 8 → `COMMAND_REQUIRED`). Một tương đương, viết một dòng.
  CHECK ((loai = 'run_command') = (lenh IS NOT NULL)),
  -- Cờ cần TTY cũng chỉ có nghĩa với `run_command`.
  CHECK (loai = 'run_command' OR can_tty = 0),
  -- Lý do đề xuất **chỉ** thuộc `decision`, và `decision` **phải** có nó.
  CHECK ((loai = 'decision') = (ly_do_de_xuat IS NOT NULL)),

  -- **19.8: loại `Chỉ để biết` tối đa là 🟡.** Server tự hạ 🔴 về 🟡 và báo lại
  -- cho agent (`haMucNeuCan` của `shared/src/can-chu.ts`); CHECK này là lớp thứ
  -- hai, để một đường ghi nào ở lượt sau quên hạ thì vỡ ngay tại DB chứ không
  -- lặng lẽ tạo một mục `fyi` 🔴 không bao giờ đúng SPEC.
  CHECK (loai <> 'fyi' OR muc <> 'urgent'),

  -- Mục không tự trùng với chính nó.
  CHECK (trung_voi_can_chu_id IS NULL OR trung_voi_can_chu_id <> id)
) STRICT;

-- ===================================================================
-- Phương án của loại `Quyết định` — mục 8 d.236
-- ===================================================================
-- "bắt buộc **2–5 phương án** (mỗi phương án có **nhãn A, B, C…** và **1–3
-- dòng**), cộng phương án đề xuất và lý do."
--
-- "2–5" là một luật về **số dòng của cả nhóm**, nên nó không ép được bằng CHECK
-- của một dòng. Nó sống ở `kiemPhuongAn` (`shared/src/can-chu.ts`) và trả
-- `OPTIONS_REQUIRED` (19.12 câu 19 xếp mã này vào **422**). Cái DB ép được là
-- luật của **từng** phương án, và nó ép hết: nhãn trong đúng 5 chữ A–E (5 là trần
-- của SPEC, nên không có nhãn `F`), 1–3 dòng, nhãn duy nhất, đề xuất duy nhất.

CREATE TABLE can_chu_phuong_an (
  id           TEXT    PRIMARY KEY,
  workspace_id TEXT    NOT NULL REFERENCES workspace(id),
  can_chu_id   TEXT    NOT NULL REFERENCES can_chu(id),

  -- Nhãn **A, B, C…** của mục 8. Trần là `E` vì SPEC cho tối đa 5 phương án.
  nhan         TEXT    NOT NULL CHECK (nhan IN ('A', 'B', 'C', 'D', 'E')),

  -- Nội dung. "**1–3 dòng**" ép tại DB: số dấu `\n` tối đa là 2.
  -- `replace(x, char(10), '')` bỏ hết dấu xuống dòng, hiệu số độ dài = số dòng−1.
  noi_dung     TEXT    NOT NULL
                 CHECK (length(noi_dung) BETWEEN 1 AND 2000)
                 CHECK (length(noi_dung) - length(replace(noi_dung, char(10), '')) <= 2),

  -- Cờ "**Đề xuất**" — mục 8 ("phương án đề xuất có nhãn 'Đề xuất'").
  de_xuat      INTEGER NOT NULL DEFAULT 0 CHECK (de_xuat IN (0, 1)),

  -- Thứ tự hiện trên thẻ, và thứ tự phím tắt `1`–`5` của mục 8. Khớp nhãn.
  thu_tu       INTEGER NOT NULL CHECK (thu_tu BETWEEN 1 AND 5),

  tao_luc      INTEGER NOT NULL
) STRICT;

-- Nhãn duy nhất trong một mục — xem căn cứ (3) ở đầu file. Cũng là index cho
-- đường đọc "các phương án của một mục, theo nhãn" của thẻ.
CREATE UNIQUE INDEX ux_can_chu_phuong_an_nhan ON can_chu_phuong_an (can_chu_id, nhan);

-- Thứ tự duy nhất trong một mục: hai phương án cùng `thu_tu` thì phím `1`–`5`
-- của mục 8 không trỏ tới một phương án xác định.
CREATE UNIQUE INDEX ux_can_chu_phuong_an_thu_tu ON can_chu_phuong_an (can_chu_id, thu_tu);

-- **Đúng một phương án đề xuất** trong mỗi mục (index UNIQUE riêng phần). Không
-- có nó thì "phương án đề xuất" có thể là hai phương án, và nhãn "Đề xuất" của
-- mục 8 mất nghĩa. "Ít nhất một" thì CHECK không ép được — `kiemPhuongAn` ép.
CREATE UNIQUE INDEX ux_can_chu_phuong_an_de_xuat
  ON can_chu_phuong_an (can_chu_id)
  WHERE de_xuat = 1;

-- ===================================================================
-- File hoặc link của loại `Chủ review` — mục 8 d.238
-- ===================================================================
-- "bắt buộc có **ít nhất 1 file hoặc link** để xem."
--
-- Bảng riêng, không một cột chữ nhiều dòng: thẻ của mục 8 có "**nút** mở file
-- hoặc link", tức mỗi dòng là một đối tượng UI riêng. `loai` là **khoá**, không
-- suy ra ở tầng hiển thị: `file://…` mở bằng đường khác `https://…`, và để UI tự
-- đoán bằng tiền tố là đặt luật ở chỗ không có test.
--
-- "Ít nhất 1" là luật của **cả nhóm** ⇒ ở `kiemFileReview`, không ở CHECK.

CREATE TABLE can_chu_file (
  id           TEXT    PRIMARY KEY,
  workspace_id TEXT    NOT NULL REFERENCES workspace(id),
  can_chu_id   TEXT    NOT NULL REFERENCES can_chu(id),

  loai         TEXT    NOT NULL CHECK (loai IN ('file', 'link')),
  dia_chi      TEXT    NOT NULL CHECK (length(dia_chi) BETWEEN 1 AND 2000),

  thu_tu       INTEGER NOT NULL CHECK (thu_tu >= 1),
  tao_luc      INTEGER NOT NULL
) STRICT;

CREATE UNIQUE INDEX ux_can_chu_file_thu_tu ON can_chu_file (can_chu_id, thu_tu);

-- ===================================================================
-- Ticket liên quan — mục 8 d.240 ("**ticket liên quan** (nhiều)")
-- ===================================================================
-- Bảng nối, cùng khuôn `ticket_label`: quan hệ n–n, không thứ tự có nghĩa, nên
-- khoá chính là chính cặp khoá. Không `REFERENCES` chéo workspace nào — trigger
-- ở cuối file buộc ba `workspace_id` khớp nhau.

CREATE TABLE can_chu_ticket (
  workspace_id TEXT    NOT NULL REFERENCES workspace(id),
  can_chu_id   TEXT    NOT NULL REFERENCES can_chu(id),
  ticket_id    TEXT    NOT NULL REFERENCES ticket(id),
  tao_luc      INTEGER NOT NULL,
  PRIMARY KEY (can_chu_id, ticket_id)
) STRICT;

-- Chiều ngược: "ticket này đang bị mục Cần Chủ nào chờ" — trang chi tiết ticket
-- (phần 6), và lượt 2 cần nó để "tự thêm bình luận vào **mọi** ticket liên quan".
CREATE INDEX ix_can_chu_ticket_nguoc ON can_chu_ticket (ticket_id, can_chu_id);

-- ===================================================================
-- Index — đúng ba đường đọc thật của lượt này
-- ===================================================================

-- (a) **`T-số` duy nhất trong workspace.** Lớp thứ hai của "tăng dần toàn
-- workspace, không tái dùng" (mục 8): lớp thứ nhất là `bo_dem` +
-- `tg_bo_dem_chi_tang`, cấp số nằm **cùng batch** với dòng `can_chu` trong cửa
-- ghi. Cũng là index tra một mục theo `T-số` (`baton result T-x`, mục 13).
CREATE UNIQUE INDEX ux_can_chu_ma_so ON can_chu (workspace_id, ma_so);

-- (b) **Màn hình Cần Chủ: 3 khối theo `muc`, trong khối sắp theo HẠN rồi LÚC
-- TẠO** — mục 8 d.249 nguyên văn ("3 khối 🔴 · 🟡 · ⚪. Trong khối sắp theo hạn,
-- rồi theo lúc tạo").
--
--   WHERE workspace_id = ? AND trang_thai = 'open' AND muc = ?
--   ORDER BY han_luc, tao_luc, id
--
-- Ba khoá đầu là cột lọc **bình đẳng**, ba khoá sau là đúng `ORDER BY`, cùng
-- hướng ⇒ không `TEMP B-TREE` (bài học của `test/phan-trang.test.ts`).
--
-- `muc` **sau** `trang_thai` vì ba khối cùng lọc `trang_thai = 'open'`, nên một
-- index phục vụ cả ba lần truy vấn.
--
-- `id` để thứ tự là **toàn phần**: hai mục cùng hạn, cùng `tao_luc` (một agent
-- tạo hai mục trong cùng millisecond) vẫn có thứ tự xác định, nên cursor không
-- bỏ sót và không trả trùng.
--
-- **Không** partial `WHERE trang_thai = 'open'`: bảng "Đã xử lý" ở cuối màn hình
-- (d.251) lọc theo cùng tiền tố `(workspace_id, trang_thai)`, nên một index dùng
-- cho cả hai nửa của màn hình.
CREATE INDEX ix_can_chu_khoi ON can_chu (workspace_id, trang_thai, muc, han_luc, tao_luc, id);

-- (c) **Cờ "có thể trùng T-x"** (mục 8, phần Lỗi) — đường đọc chạy ở **mỗi lần
-- tạo**, nên nó không được là một lần quét bảng:
--
--   WHERE workspace_id = ? AND lower(tieu_de) = lower(?) AND tao_luc >= ?  (24 giờ)
--     AND trang_thai = 'open'
--
-- `lower(tieu_de)` đứng ngay sau `workspace_id` vì nó là điều kiện **bình đẳng**
-- chọn lọc nhất, `tao_luc` sau nó cho cửa sổ 24 giờ.
--
-- Index **biểu thức**, không `tieu_de` thô: phép so trùng của mục 8 không phân
-- biệt hoa/thường (`cau-hoi-spec.md` #70), nên nó phải ở **trong** câu truy vấn —
-- lọc đúng chuỗi rồi mới hạ chữ trong bộ nhớ là một phép so không khớp thêm gì.
-- `lower()` của SQLite chỉ biết ASCII, `chuanHoaTieuDe` của `@baton/shared` là bản
-- sao đúng của nó, và giới hạn "chữ **có dấu** khác hoa/thường thì không khớp"
-- được khai ở #70.
--
-- **Riêng phần** `WHERE trang_thai = 'open'`: SPEC chỉ soi mục **`Chờ`**, và số
-- mục Chờ luôn nhỏ (đó là chỗ chủ phải đọc hết mỗi ngày) dù bảng có bao nhiêu
-- nghìn mục đã xử lý — cùng lý lẽ `ix_phien_canh_bao` của 0012.
--
-- `project_id` **không** nằm trong index: nó cho phép NULL ("Chung" — 19.12 câu
-- 4) nên đưa vào khoá chỉ làm index phình mà cột đã lọc xong gần hết dòng. Nó là
-- điều kiện **lọc** sau khi index đã chọn dòng.
CREATE INDEX ix_can_chu_trung
  ON can_chu (workspace_id, lower(tieu_de), tao_luc)
  WHERE trang_thai = 'open';

-- ===================================================================
-- Trigger: mọi khoá ngoài phải CÙNG WORKSPACE
-- ===================================================================
-- Cùng lý do và cùng khuôn với 4 cặp của 0002, cặp của 0004, cặp của 0009 và cặp
-- của 0012: `workspace_id` và các khoá ngoài là những cột **rời nhau**, nên
-- `REFERENCES` không buộc chúng khớp. Một mục Cần Chủ mang workspace khác dự án,
-- khác agent tạo, hoặc khác mục nó trỏ "có thể trùng" là một mục đi xuyên
-- workspace (lệch SPEC mục 1, 18) — tức màn hình Cần Chủ của chủ này hiện một
-- thẻ về dữ liệu của chủ khác.
--
-- Quy ước `RAISE(ABORT, '<MÃ LỖI>: <mô tả>')` để `loi-d1.ts` tách được mã lỗi.
--
-- Ba khoá đều cho phép NULL, nên mỗi điều kiện tự kẹp `IS NOT NULL`: so
-- `NULL <> (SELECT …)` cho ra NULL, tức WHEN không bật, tức trigger im lặng.

CREATE TRIGGER tg_can_chu_ws_them
BEFORE INSERT ON can_chu
FOR EACH ROW WHEN
  (NEW.project_id IS NOT NULL
     AND NEW.workspace_id <> (SELECT workspace_id FROM project WHERE id = NEW.project_id))
  OR (NEW.tao_boi_agent_id IS NOT NULL
     AND NEW.workspace_id <> (SELECT workspace_id FROM agent WHERE id = NEW.tao_boi_agent_id))
  OR (NEW.trung_voi_can_chu_id IS NOT NULL
     AND NEW.workspace_id <> (SELECT workspace_id FROM can_chu WHERE id = NEW.trung_voi_can_chu_id))
BEGIN
  SELECT RAISE(ABORT, 'INVALID_INPUT: muc Can Chu phai cung workspace voi du an, agent tao va muc trung');
END;

CREATE TRIGGER tg_can_chu_ws_sua
BEFORE UPDATE ON can_chu
FOR EACH ROW WHEN
  (NEW.project_id IS NOT NULL
     AND NEW.workspace_id <> (SELECT workspace_id FROM project WHERE id = NEW.project_id))
  OR (NEW.tao_boi_agent_id IS NOT NULL
     AND NEW.workspace_id <> (SELECT workspace_id FROM agent WHERE id = NEW.tao_boi_agent_id))
  OR (NEW.trung_voi_can_chu_id IS NOT NULL
     AND NEW.workspace_id <> (SELECT workspace_id FROM can_chu WHERE id = NEW.trung_voi_can_chu_id))
BEGIN
  SELECT RAISE(ABORT, 'INVALID_INPUT: muc Can Chu phai cung workspace voi du an, agent tao va muc trung');
END;

-- Ba bảng con: `workspace_id` phải khớp mục cha.

CREATE TRIGGER tg_can_chu_phuong_an_ws_them
BEFORE INSERT ON can_chu_phuong_an
FOR EACH ROW WHEN
  NEW.workspace_id <> (SELECT workspace_id FROM can_chu WHERE id = NEW.can_chu_id)
BEGIN
  SELECT RAISE(ABORT, 'INVALID_INPUT: phuong an phai cung workspace voi muc Can Chu');
END;

CREATE TRIGGER tg_can_chu_phuong_an_ws_sua
BEFORE UPDATE ON can_chu_phuong_an
FOR EACH ROW WHEN
  NEW.workspace_id <> (SELECT workspace_id FROM can_chu WHERE id = NEW.can_chu_id)
BEGIN
  SELECT RAISE(ABORT, 'INVALID_INPUT: phuong an phai cung workspace voi muc Can Chu');
END;

CREATE TRIGGER tg_can_chu_file_ws_them
BEFORE INSERT ON can_chu_file
FOR EACH ROW WHEN
  NEW.workspace_id <> (SELECT workspace_id FROM can_chu WHERE id = NEW.can_chu_id)
BEGIN
  SELECT RAISE(ABORT, 'INVALID_INPUT: file cua muc Can Chu phai cung workspace voi muc');
END;

CREATE TRIGGER tg_can_chu_file_ws_sua
BEFORE UPDATE ON can_chu_file
FOR EACH ROW WHEN
  NEW.workspace_id <> (SELECT workspace_id FROM can_chu WHERE id = NEW.can_chu_id)
BEGIN
  SELECT RAISE(ABORT, 'INVALID_INPUT: file cua muc Can Chu phai cung workspace voi muc');
END;

-- ===================================================================
-- Trigger: bảng con phải thuộc đúng LOẠI của mục cha — mục 8 d.236, d.238
-- ===================================================================
-- Phương án chỉ có nghĩa với loại `Quyết định` (d.236) và file/link chỉ có nghĩa
-- với loại `Chủ review` (d.238). Trong một dòng `can_chu`, cặp CHECK liên-cột ở
-- đầu file đã ép đúng luật đó cho `lenh`, `can_tty` và `ly_do_de_xuat`, và lý lẽ
-- ghi ở đó là: "cặp đó biến hai luật của mục 8 thành luật của DB, nên **một đường
-- ghi mới ở lượt sau không lách được** bằng cách quên gọi hàm kiểm".
--
-- Hai bảng con thì **chưa** có hàng rào ấy: hôm nay `handlerTaoCanChu` phân nhánh
-- theo union `kiemNoiDungCanChu` nên không chèn được một phương án vào mục
-- `review`, nhưng đó là luật của **một** đường ghi, không của DB. Đo bằng đúng
-- tiêu chuẩn của file này thì đây là một lỗ trống, nên bịt luôn.
--
-- `IS NOT` (không `<>`): mục cha không tồn tại ⇒ `(SELECT …)` ra NULL, và
-- `NULL <> 'decision'` cho NULL, tức WHEN không bật và dòng con lọt. `IS NOT` so
-- được với NULL, nên trigger cũng chặn luôn ca "mục cha không có thật" — hàng rào
-- đó không trùng `REFERENCES` một cách vô ích: khoá ngoài của SQLite chỉ ép khi
-- `PRAGMA foreign_keys` đang bật.
--
-- Cả **INSERT** và **UPDATE**: đổi `can_chu_id` của một dòng con sang một mục
-- loại khác làm điều kiện lệch đúng y như lúc chèn.

CREATE TRIGGER tg_can_chu_phuong_an_loai_them
BEFORE INSERT ON can_chu_phuong_an
FOR EACH ROW WHEN
  (SELECT loai FROM can_chu WHERE id = NEW.can_chu_id) IS NOT 'decision'
BEGIN
  SELECT RAISE(ABORT, 'INVALID_INPUT: phuong an chi thuoc muc Can Chu loai decision');
END;

CREATE TRIGGER tg_can_chu_phuong_an_loai_sua
BEFORE UPDATE ON can_chu_phuong_an
FOR EACH ROW WHEN
  (SELECT loai FROM can_chu WHERE id = NEW.can_chu_id) IS NOT 'decision'
BEGIN
  SELECT RAISE(ABORT, 'INVALID_INPUT: phuong an chi thuoc muc Can Chu loai decision');
END;

CREATE TRIGGER tg_can_chu_file_loai_them
BEFORE INSERT ON can_chu_file
FOR EACH ROW WHEN
  (SELECT loai FROM can_chu WHERE id = NEW.can_chu_id) IS NOT 'review'
BEGIN
  SELECT RAISE(ABORT, 'INVALID_INPUT: file hoac link chi thuoc muc Can Chu loai review');
END;

CREATE TRIGGER tg_can_chu_file_loai_sua
BEFORE UPDATE ON can_chu_file
FOR EACH ROW WHEN
  (SELECT loai FROM can_chu WHERE id = NEW.can_chu_id) IS NOT 'review'
BEGIN
  SELECT RAISE(ABORT, 'INVALID_INPUT: file hoac link chi thuoc muc Can Chu loai review');
END;

-- Bảng nối: **ba** workspace phải khớp (bảng nối, mục, và ticket).

CREATE TRIGGER tg_can_chu_ticket_ws_them
BEFORE INSERT ON can_chu_ticket
FOR EACH ROW WHEN
  NEW.workspace_id <> (SELECT workspace_id FROM can_chu WHERE id = NEW.can_chu_id)
  OR NEW.workspace_id <> (SELECT workspace_id FROM ticket WHERE id = NEW.ticket_id)
BEGIN
  SELECT RAISE(ABORT, 'INVALID_INPUT: ticket lien quan phai cung workspace voi muc Can Chu');
END;

CREATE TRIGGER tg_can_chu_ticket_ws_sua
BEFORE UPDATE ON can_chu_ticket
FOR EACH ROW WHEN
  NEW.workspace_id <> (SELECT workspace_id FROM can_chu WHERE id = NEW.can_chu_id)
  OR NEW.workspace_id <> (SELECT workspace_id FROM ticket WHERE id = NEW.ticket_id)
BEGIN
  SELECT RAISE(ABORT, 'INVALID_INPUT: ticket lien quan phai cung workspace voi muc Can Chu');
END;

-- ===================================================================
-- `phien.can_chu_id` — trả nợ chỗ cắm mà 0006 để lại
-- ===================================================================
-- 0006 dòng 64–71 khai `phien.can_chu_id` **cố ý không** kèm
-- `REFERENCES can_chu(id)`, vì lúc đó bảng `can_chu` chưa tồn tại nên migration
-- không áp được, và ghi chú ở đó hẹn: "**Phần 4 thêm trigger khớp**, cùng khuôn
-- với các trigger workspace ở dưới". Nay trả nợ đúng như đã hẹn.
--
-- ## Vì sao TRIGGER, không phải thêm `REFERENCES`
--
-- SQLite **không có** `ALTER TABLE … ADD CONSTRAINT`. Cách duy nhất để `phien` có
-- một khoá ngoài thật là **dựng lại bảng** (tạo `phien_moi`, chép dữ liệu, xoá
-- `phien`, đổi tên, dựng lại 2 index và 6 trigger của 0006–0008). Không chọn
-- đường đó, ba lý do:
--
--  1. Nó là một `DROP TABLE phien` — **xoá dữ liệu**, thuộc danh sách cấm của
--     `CLAUDE.md` mục 4 (cần Chủ duyệt qua CoS).
--  2. Dựng lại bảng là chép tay lại toàn bộ CHECK, index và trigger của ba
--     migration cũ. Chép sai một dòng là mất **im lặng** một luật đã có test ở
--     nơi khác (vd `CHECK (trang_thai <> 'waiting_owner' OR can_chu_id IS NOT NULL)`).
--  3. Trigger ép được **nhiều hơn** `REFERENCES`: nó ép cả "cùng workspace", thứ
--     mà một khoá ngoài không bao giờ ép được (đó chính là lý do 0002, 0004,
--     0009, 0012 đều phải có trigger **bên cạnh** `REFERENCES`).
--
-- Nên cặp trigger dưới đây làm **đúng hai** việc của một khoá ngoài có kiểm
-- workspace: mục phải **tồn tại**, và phải **cùng workspace** với phiên.
--
-- `can_chu_id` cho phép NULL (phiên không chờ mục nào), nên điều kiện tự kẹp
-- `IS NOT NULL`. `(SELECT …)` trả NULL khi không có dòng nào ⇒ `IS NULL` bắt
-- được ca "mục không tồn tại", còn `<>` thì không (mọi so sánh với NULL ra NULL).
--
-- **Nối phiên vào mục là lượt 2**: mục 8 d.240 ("phiên liên quan … phiên sang
-- `waiting_owner`") và 19.6 ("mục được xử lý → phiên về `running`") là **một cặp
-- vào–ra**, nên cài một nửa ở lượt này thì có đường đưa phiên vào
-- `waiting_owner` mà không có đường đưa nó ra. Lượt này chỉ dựng **hàng rào toàn
-- vẹn** cho cột đó.

CREATE TRIGGER tg_phien_can_chu_them
BEFORE INSERT ON phien
FOR EACH ROW WHEN
  NEW.can_chu_id IS NOT NULL
  AND ((SELECT workspace_id FROM can_chu WHERE id = NEW.can_chu_id) IS NULL
       OR NEW.workspace_id <> (SELECT workspace_id FROM can_chu WHERE id = NEW.can_chu_id))
BEGIN
  SELECT RAISE(ABORT, 'INVALID_INPUT: phien phai tro toi mot muc Can Chu co that, cung workspace');
END;

CREATE TRIGGER tg_phien_can_chu_sua
BEFORE UPDATE OF can_chu_id, workspace_id ON phien
FOR EACH ROW WHEN
  NEW.can_chu_id IS NOT NULL
  AND ((SELECT workspace_id FROM can_chu WHERE id = NEW.can_chu_id) IS NULL
       OR NEW.workspace_id <> (SELECT workspace_id FROM can_chu WHERE id = NEW.can_chu_id))
BEGIN
  SELECT RAISE(ABORT, 'INVALID_INPUT: phien phai tro toi mot muc Can Chu co that, cung workspace');
END;
