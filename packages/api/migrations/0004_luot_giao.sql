-- Baton v0.1 — migration 0004: lượt giao (chuyền việc)
--
-- SPEC mục 5 (lượt giao), 19.1 (lượt "mở" và người đang cầm), 19.5 (trả lại).
--
-- Ba luật của SPEC được ép **ở tầng DB**, không chỉ ở code:
--
--   1. "Mỗi ticket có tối đa **1 lượt `work` mở** và **1 lượt `review` mở** cùng
--      lúc" (19.1, nói rõ hơn mục 5 dòng 157) → index UNIQUE **riêng phần** trên
--      `(ticket_id, loai)` chỉ gồm các dòng đang mở. Cửa ghi cũng kiểm (để trả
--      đúng mã lỗi tiếng Việt), nhưng một luật quan trọng như vậy phải có hàng
--      rào cuối ở DB: cửa ghi là một Durable Object cho mỗi workspace, còn
--      migration/nhập dữ liệu/bug tương lai thì không đi qua đó.
--
--   2. "`returned`: … **bắt buộc có lý do**" (mục 5) → CHECK.
--
--   3. Dữ liệu **tách theo workspace** (mục 1) → trigger buộc
--      `luot_giao.workspace_id` khớp `ticket.workspace_id`, đúng khuôn 4 trigger
--      của 0002 (`tg_ticket_link_ws_them` …) và cùng quy ước thông điệp
--      `RAISE(ABORT, 'MÃ_LỖI: mô tả')` để `loi-d1.ts` tách được mã lỗi.
--
-- Mã của `loai` và `trang_thai` lấy **nguyên văn bảng SPEC mục 0.1**:
--   Loại lượt giao      → `work` Làm · `review` Review
--   Trạng thái lượt giao → `pending` · `in_progress` · `submitted` · `accepted`
--                          · `returned` · `canceled`
-- (Mục 19.1 viết "loại `worker`"; bảng mã máy ở 0.1 ghi `work`, và 0.1 là bảng mã
-- duy nhất cho API/DB/log, nên dùng `work`.)

-- ===================================================================
-- 1. Bảng lượt giao — SPEC mục 5
-- ===================================================================
CREATE TABLE luot_giao (
  id                   TEXT    PRIMARY KEY,
  workspace_id         TEXT    NOT NULL REFERENCES workspace(id),
  ticket_id            TEXT    NOT NULL REFERENCES ticket(id),

  -- Số lượt **trong phạm vi ticket**, tăng dần (SPEC 19.5 "số lượt tăng").
  -- Không tái dùng: cấp bằng `max(so_luot) + 1` **trong cùng batch** với dòng
  -- lượt (cửa ghi chạy đơn luồng), và `ux_luot_giao_so` chặn nếu trùng.
  so_luot              INTEGER NOT NULL CHECK (so_luot > 0),

  -- SPEC 19.1: mỗi lượt có **loại**.
  loai                 TEXT    NOT NULL CHECK (loai IN ('work', 'review')),

  -- Người giao: chủ hoặc một agent (SPEC mục 5 "người giao (chủ hoặc agent có
  -- quyền)"). Cùng quy ước cặp cột `*_loai` / `*_agent_id` với 0001.
  nguoi_giao_loai      TEXT    NOT NULL CHECK (nguoi_giao_loai IN ('owner', 'agent')),
  nguoi_giao_agent_id  TEXT    REFERENCES agent(id),

  -- Người nhận **luôn là một agent** (SPEC mục 5: "chọn ticket và người nhận
  -- (agent)"). Chủ tự làm đi đường khác: cờ `ticket.chu_tu_lam` (SPEC 19.10).
  nguoi_nhan_agent_id  TEXT    NOT NULL REFERENCES agent(id),

  -- 6 trạng thái của SPEC mục 5, **không thêm mã nào**. "Không phản hồi" ở Tổng
  -- quan **không** là trạng thái thứ 7: nó tính được từ `trang_thai = 'pending'`
  -- và `han_phan_hoi_luc` (xem `laKhongPhanHoi` trong `@baton/shared`).
  trang_thai           TEXT    NOT NULL DEFAULT 'pending' CHECK (trang_thai IN (
                         'pending', 'in_progress', 'submitted',
                         'accepted', 'returned', 'canceled'
                       )),

  -- Brief của lượt — SPEC mục 5: "Brief lấy từ ticket nếu có, **cho sửa riêng cho
  -- lượt này**". Nên lượt giữ bản sao 8 trường brief của mục 4, không trỏ về
  -- ticket: sửa brief ticket về sau không được đổi brief của một lượt đã giao.
  muc_tieu             TEXT,
  boi_canh             TEXT,
  pham_vi              TEXT,
  file_va_nguon        TEXT,
  dieu_cam             TEXT,
  xong_la_gi           TEXT,
  cach_kiem_chung      TEXT,
  nop_lai              TEXT,

  -- Hạn phản hồi (SPEC mục 5, mặc định 15 phút — hằng số ở `@baton/shared`).
  -- Quá hạn mà chưa nhận thì lượt hiện "Không phản hồi"; **lượt không tự huỷ**.
  han_phan_hoi_luc     INTEGER,

  -- Lý do: **bắt buộc khi `returned`** (SPEC mục 5). Cũng dùng cho `canceled`.
  ly_do                TEXT,

  -- SPEC 19.5: `returned` tạo **lượt mới** cùng người nhận; lượt mới trỏ về lượt
  -- bị trả lại để dựng được chuỗi lượt giao của mục 5 ("thấy cả chuỗi").
  luot_truoc_id        TEXT    REFERENCES luot_giao(id),

  tao_luc              INTEGER NOT NULL,
  -- Lúc người nhận gọi lệnh "nhận" (SPEC mục 5).
  nhan_luc             INTEGER,
  -- Lúc lượt rời trạng thái mở sang một kết (accepted/returned/canceled).
  dong_luc             INTEGER,
  cap_nhat_luc         INTEGER NOT NULL,

  -- Nhất quán cặp "ai", cùng khuôn với `ticket` của 0001.
  CHECK ((nguoi_giao_loai = 'agent') = (nguoi_giao_agent_id IS NOT NULL)),
  -- "`returned`: người giao trả lại, **bắt buộc có lý do**" — SPEC mục 5.
  CHECK (trang_thai <> 'returned' OR ly_do IS NOT NULL)
) STRICT;

-- ===================================================================
-- 2. Luật 19.1 ở tầng DB: tối đa 1 lượt mở cho mỗi (ticket, loại)
-- ===================================================================
-- Lượt **mở** = `pending` hoặc `in_progress` (SPEC 19.1). Index riêng phần chỉ
-- gồm các dòng đó, nên một ticket có thể có bao nhiêu lượt đã đóng cũng được,
-- nhưng không bao giờ có hai lượt `work` mở — và lượt `review` vẫn mở **song
-- song** được với lượt `work`, đúng mục 5 dòng 157 + 19.3.
CREATE UNIQUE INDEX ux_luot_giao_mo
  ON luot_giao (ticket_id, loai)
  WHERE trang_thai IN ('pending', 'in_progress');

-- Số lượt duy nhất trong phạm vi ticket (SPEC 19.5 "số lượt tăng").
CREATE UNIQUE INDEX ux_luot_giao_so ON luot_giao (workspace_id, ticket_id, so_luot);

-- ===================================================================
-- 3. Index cho các truy vấn thật
-- ===================================================================

-- `phamViLuotGiao` (ô "ticket của lượt mình" và "ticket con của lượt mình đang
-- làm" của bảng quyền SPEC mục 3) hỏi đúng một câu: **agent này có lượt đang mở
-- trên ticket này không**. Câu đó chạy ở mỗi lệnh ghi của agent `worker`, nên
-- phải nằm trọn trong index.
-- Cũng phục vụ `baton tasks` (SPEC mục 13: lượt `pending`/`in_progress` của mình).
CREATE INDEX ix_luot_giao_nguoi_nhan
  ON luot_giao (workspace_id, nguoi_nhan_agent_id, trang_thai, ticket_id);

-- Chuỗi lượt giao của một ticket (SPEC mục 5 "thấy cả chuỗi", mục 14 dòng thời
-- gian), và câu hỏi "ticket này đã có lượt `work` mở chưa" lúc tạo lượt.
CREATE INDEX ix_luot_giao_ticket
  ON luot_giao (workspace_id, ticket_id, loai, trang_thai);

-- Lượt "Không phản hồi" ở Tổng quan (SPEC mục 5, 19.6): chỉ lượt còn `pending`
-- mới có thể quá hạn, nên index riêng phần rất nhỏ.
CREATE INDEX ix_luot_giao_han_phan_hoi
  ON luot_giao (workspace_id, han_phan_hoi_luc)
  WHERE trang_thai = 'pending' AND han_phan_hoi_luc IS NOT NULL;

-- ===================================================================
-- 4. Trigger: workspace_id phải khớp ticket.workspace_id
-- ===================================================================
-- Cùng lý do và cùng khuôn với 4 cặp trigger của 0002: `workspace_id` và
-- `ticket_id` là hai khoá ngoài **rời nhau**, nên không có gì buộc chúng khớp.

CREATE TRIGGER tg_luot_giao_ws_them
BEFORE INSERT ON luot_giao
FOR EACH ROW WHEN
  NEW.workspace_id <> (SELECT workspace_id FROM ticket WHERE id = NEW.ticket_id)
BEGIN
  SELECT RAISE(ABORT, 'INVALID_INPUT: luot giao phai cung workspace voi ticket');
END;

CREATE TRIGGER tg_luot_giao_ws_sua
BEFORE UPDATE ON luot_giao
FOR EACH ROW WHEN
  NEW.workspace_id <> (SELECT workspace_id FROM ticket WHERE id = NEW.ticket_id)
BEGIN
  SELECT RAISE(ABORT, 'INVALID_INPUT: luot giao phai cung workspace voi ticket');
END;
