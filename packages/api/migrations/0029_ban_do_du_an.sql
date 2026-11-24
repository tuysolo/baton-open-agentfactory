-- ===================================================================
-- 0029 — Bản đồ dự án lượt 1: dữ liệu (SPEC mục 20.1)
-- Chủ chốt 04/11/2026, T-127 = A. Lượt 2 (giao diện) không thêm gì ở đây.
-- ===================================================================
--
-- Migration này CHỈ THÊM, không dựng lại bảng nào:
--   1. `project.uu_tien` — số nguyên 1–5 (5 = quan trọng nhất), mặc định 3.
--      Không đụng `ticket.uu_tien` (chuỗi 5 mức của mục 4): hai bảng khác nhau,
--      hai nghĩa khác nhau, chỉ trùng tên cột.
--   2. `project.dang_day`, `project.duy_tri` — cờ 0/1, mặc định 0. Bất biến
--      `duy_tri = 1 ⇒ dang_day = 0` (20.1 "Bật duy_tri thì tự tắt dang_day")
--      ép bằng hai trigger (a), cùng cách 0011 — SQLite không ADD CONSTRAINT
--      cho bảng đã có. Lớp thứ nhất là `handlerSuaDuAn` (tự tắt `dang_day`
--      trong cùng batch); trigger là hàng rào cuối.
--   3. `project.ten_ngan` — chuỗi 0–24 ký tự, NULL = dùng tên đầy đủ. Chuỗi
--      rỗng được code đổi thành NULL trước khi ghi.
--   4. `ticket.khoi_lon` (1–99, NULL = không phải khối lớn) và `ticket.doi`
--      (0–100, vị trí trên đồi). Bất biến `doi IS NOT NULL ⇒ khoi_lon IS NOT
--      NULL` ép bằng hai trigger (b).
--   5. `workspace.gioi_han_wip` — giới hạn WIP của Cài đặt workspace, 1–10,
--      mặc định 3. Đặt trên `workspace` vì đó là bảng duy nhất mang cài đặt
--      của cả workspace (`ten_chu`), một hàng mỗi workspace.
--   6. Bảng `project_history` — lịch sử CHỈ THÊM của các trường trên ở mức dự
--      án và workspace (20.1 "Mọi thay đổi các trường trên ghi Lịch sử như
--      trường khác (mục 4)"). Trước 0029 không có chỗ nào ghi lịch sử trường
--      dự án, nên phải thêm. Cùng khuôn `ticket_history` của 0001: ai, lúc,
--      trường, cũ → mới; hai trigger chặn UPDATE/DELETE; trigger khớp
--      workspace. `project_id` NULL = dòng của cài đặt workspace (chỉ trường
--      `gioi_han_wip`). Lịch sử `khoi_lon`/`doi` đi vào `ticket_history` sẵn có.
--
-- Mọi ADD COLUMN có DEFAULT hằng (hoặc cho NULL), nên mọi dòng cũ nhận giá trị
-- mặc định ngay lúc áp: không dự án nào tự thành "đang đẩy" hay "duy trì"
-- (20.1 "Dữ liệu cũ"), mọi workspace có WIP = 3.
--
-- ## Index
--
-- Chỉ thêm `ix_project_history_du_an` (dự án, lúc giảm, id giảm) cho đường đọc
-- lịch sử một dự án, mới nhất trước — cùng nếp `ix_ticket_history_ticket`.
-- KHÔNG thêm index cho việc đếm dự án `dang_day` (đồng hồ WIP): truy vấn lọc
-- `workspace_id` rồi đi `ix_project_trang_thai` của 0001, trên vài trăm dòng
-- (mốc 200 dự án của mục 0 + 17.10). Một index chỉ cho cờ 0/1 là thêm chỗ phải
-- ghi mà không đổi được kế hoạch đáng kể. KHÔNG thêm index cho `khoi_lon`: lượt
-- này chưa có truy vấn nào lọc theo nó (lượt 2 thêm kèm EXPLAIN nếu cần).
--
-- Rollback (KHÔNG tự áp): `migrations/rollback/0029_ban_do_du_an.rollback.sql`.

-- ===================================================================
-- 1. Cột mới
-- ===================================================================
ALTER TABLE project ADD COLUMN uu_tien INTEGER NOT NULL DEFAULT 3
  CHECK (uu_tien BETWEEN 1 AND 5);
ALTER TABLE project ADD COLUMN dang_day INTEGER NOT NULL DEFAULT 0
  CHECK (dang_day IN (0, 1));
ALTER TABLE project ADD COLUMN duy_tri INTEGER NOT NULL DEFAULT 0
  CHECK (duy_tri IN (0, 1));
ALTER TABLE project ADD COLUMN ten_ngan TEXT
  CHECK (ten_ngan IS NULL OR length(ten_ngan) <= 24);

ALTER TABLE ticket ADD COLUMN khoi_lon INTEGER
  CHECK (khoi_lon IS NULL OR khoi_lon BETWEEN 1 AND 99);
ALTER TABLE ticket ADD COLUMN doi INTEGER
  CHECK (doi IS NULL OR doi BETWEEN 0 AND 100);

ALTER TABLE workspace ADD COLUMN gioi_han_wip INTEGER NOT NULL DEFAULT 3
  CHECK (gioi_han_wip BETWEEN 1 AND 10);

-- ===================================================================
-- 2. Trigger bất biến
-- ===================================================================

-- (a) Dự án duy trì không "đẩy" — 20.1.
CREATE TRIGGER tg_project_duy_tri_them
BEFORE INSERT ON project
FOR EACH ROW WHEN NEW.duy_tri = 1 AND NEW.dang_day = 1
BEGIN
  SELECT RAISE(ABORT, 'INVALID_INPUT: du an duy tri khong dang day duoc');
END;

CREATE TRIGGER tg_project_duy_tri_sua
BEFORE UPDATE OF duy_tri, dang_day ON project
FOR EACH ROW WHEN NEW.duy_tri = 1 AND NEW.dang_day = 1
BEGIN
  SELECT RAISE(ABORT, 'INVALID_INPUT: du an duy tri khong dang day duoc');
END;

-- (b) Vị trí trên đồi chỉ có nghĩa cho khối lớn — 20.1 ("Đặt doi cho ticket
--     không có khoi_lon: INVALID_INPUT").
CREATE TRIGGER tg_ticket_doi_them
BEFORE INSERT ON ticket
FOR EACH ROW WHEN NEW.doi IS NOT NULL AND NEW.khoi_lon IS NULL
BEGIN
  SELECT RAISE(ABORT, 'INVALID_INPUT: doi chi dat duoc cho ticket co khoi_lon');
END;

CREATE TRIGGER tg_ticket_doi_sua
BEFORE UPDATE OF doi, khoi_lon ON ticket
FOR EACH ROW WHEN NEW.doi IS NOT NULL AND NEW.khoi_lon IS NULL
BEGIN
  SELECT RAISE(ABORT, 'INVALID_INPUT: doi chi dat duoc cho ticket co khoi_lon');
END;

-- ===================================================================
-- 3. Lịch sử trường dự án và cài đặt workspace — 20.1, mục 4
-- ===================================================================
CREATE TABLE project_history (
  id               TEXT    PRIMARY KEY,
  workspace_id     TEXT    NOT NULL REFERENCES workspace(id),
  -- NULL = dòng của cài đặt workspace (giới hạn WIP), không của một dự án.
  project_id       TEXT    REFERENCES project(id),
  tac_gia_loai     TEXT    NOT NULL CHECK (tac_gia_loai IN ('owner', 'agent', 'system')),
  tac_gia_agent_id TEXT    REFERENCES agent(id),
  luc              INTEGER NOT NULL,
  truong           TEXT    NOT NULL,
  gia_tri_cu       TEXT,
  gia_tri_moi      TEXT,
  CHECK ((tac_gia_loai = 'agent') = (tac_gia_agent_id IS NOT NULL)),
  CHECK ((project_id IS NULL) = (truong = 'gioi_han_wip'))
) STRICT;

CREATE INDEX ix_project_history_du_an ON project_history (project_id, luc DESC, id DESC);

CREATE TRIGGER tg_project_history_khong_sua
BEFORE UPDATE ON project_history
BEGIN
  SELECT RAISE(ABORT, 'FORBIDDEN: lich su chi them, khong sua');
END;

CREATE TRIGGER tg_project_history_khong_xoa
BEFORE DELETE ON project_history
BEGIN
  SELECT RAISE(ABORT, 'FORBIDDEN: lich su chi them, khong xoa');
END;

-- Không nối lịch sử xuyên workspace (mục 1, 18) — cùng khuôn
-- `tg_ticket_history_ws_them` của 0002.
CREATE TRIGGER tg_project_history_ws_them
BEFORE INSERT ON project_history
FOR EACH ROW WHEN
  NEW.project_id IS NOT NULL
  AND NEW.workspace_id <> (SELECT workspace_id FROM project WHERE id = NEW.project_id)
BEGIN
  SELECT RAISE(ABORT, 'INVALID_INPUT: lich su phai cung workspace voi du an');
END;
