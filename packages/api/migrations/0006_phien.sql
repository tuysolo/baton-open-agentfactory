-- Baton v0.1 — migration 0006: phiên và nhịp tim
--
-- SPEC mục 6 (phiên, tín hiệu, ngưỡng đứng, dừng), 19.6 (huỷ lượt / chờ Chủ /
-- hỏi người giao), mục 3 (trạng thái agent suy ra từ phiên), mục 0.1 (bảng mã).
--
-- **Phiên gắn đúng một lượt giao.** Mục 6 dòng 180: phiên "mở khi agent **nhận
-- một lượt giao**, đóng khi **nộp**, bị **huỷ** hoặc bị **dừng**". Nên khoá tự
-- nhiên là `luot_giao_id`, và 19.5 ("trả lại → lượt mới → người nhận phải nhận
-- lại, mở **phiên mới**") khớp luôn: lượt mới là một dòng `luot_giao` mới nên nó
-- có một dòng `phien` mới, không phải mở lại phiên cũ.
--
-- **Bảy trạng thái, lấy nguyên văn bảng SPEC mục 0.1:**
--   `running` Đang chạy · `waiting_owner` Chờ Chủ · `waiting_assigner` Chờ người
--   giao · `stalled` Đứng · `error` Lỗi · `stopping` Đang dừng · `closed` Đã đóng
--
-- Chú ý: mục 6 dòng 181–187 chỉ liệt kê **6** mã — **thiếu `waiting_assigner`**.
-- Lấy theo **0.1** vì đó là bảng mã máy duy nhất và nói rõ áp cho cả "cơ sở dữ
-- liệu"; 19.6 cũng dùng `waiting_assigner` như một trạng thái thật. Đúng cùng
-- hình huống `spec-questions.md` #29 (0.1 `work` thắng văn xuôi 19.1 `worker`).
--
-- `stalled` nằm trong CHECK nhưng **mã sản phẩm không bao giờ ghi nó**: nó là
-- kết luận **dẫn xuất** từ `tin_hieu_cuoi_luc` ở đường đọc (xem
-- `shared/src/phien.ts` — `trangThaiPhienDanXuat`). Giữ trong CHECK vì 0.1 là
-- bảng mã của DB, và vì cột này phải nhận được mọi mã hợp lệ nếu về sau có một
-- đường ghi `stalled` thật (vd cảnh báo của lượt 4).

-- ===================================================================
-- 1. Bảng phiên — SPEC mục 6
-- ===================================================================
CREATE TABLE phien (
  id                 TEXT    PRIMARY KEY,
  workspace_id       TEXT    NOT NULL REFERENCES workspace(id),

  -- Phiên **của một lượt giao** (mục 6 d.180). `ticket_id` và `agent_id` là bản
  -- sao dẫn xuất từ lượt — trigger dưới đây buộc chúng khớp, nên chúng không bao
  -- giờ lệch. Có chúng để hai truy vấn nóng nhất không phải join `luot_giao`:
  -- trạng thái agent (mục 3) và chỉ báo sức sống của dự án (19.6).
  luot_giao_id       TEXT    NOT NULL REFERENCES luot_giao(id),
  ticket_id          TEXT    NOT NULL REFERENCES ticket(id),
  agent_id           TEXT    NOT NULL REFERENCES agent(id),

  trang_thai         TEXT    NOT NULL DEFAULT 'running' CHECK (trang_thai IN (
                       'running', 'waiting_owner', 'waiting_assigner',
                       'stalled', 'error', 'stopping', 'closed'
                     )),

  -- **Tín hiệu** (mục 6 d.188) = "mọi lệnh ghi của agent trên phiên đó (nhịp
  -- tim, hoạt động, bằng chứng, bình luận, nộp). **Lệnh đọc không tính**".
  --
  -- Cột này được nhích ở **cửa ghi** (`workspace-gate.ts`), trong **cùng batch**
  -- với lệnh ghi — cùng khuôn với `agent.len_tieng_luc` của phần 1. Không rắc
  -- `capNhatTinHieu()` tay vào từng handler: lệnh ghi thêm về sau sẽ quên, và
  -- quên thì phiên bị tính đứng trong khi agent đang làm — tức sai đúng thứ mục 6
  -- sinh ra để bảo đảm.
  --
  -- Mốc này **khác** `agent.len_tieng_luc` (mục 3): xem `spec-questions.md` #13.
  tin_hieu_cuoi_luc  INTEGER NOT NULL,

  -- `baton heartbeat [ghi chú]` — SPEC mục 13. Dòng hoạt động của phiên (mục 6
  -- d.190) là lượt sau; ghi chú của nhịp tim gần nhất giữ ở đây để nó không bị
  -- mất trong lúc chờ.
  ghi_chu_cuoi       TEXT,

  -- **Chỗ cắm của PHẦN 4** (Cần Chủ). Mục 8: "**phiên liên quan** (nếu có, phiên
  -- sang `waiting_owner`)"; 19.6: "khi mục được xử lý hoặc bỏ qua, phiên về
  -- `running` và ngưỡng đứng **tính lại từ lúc đó**".
  --
  -- **Không** khai `REFERENCES can_chu(id)`: bảng `can_chu` là phần 4, và một
  -- khoá ngoài trỏ tới bảng chưa có thì migration không áp được. Phần 4 thêm
  -- trigger khớp, cùng khuôn với các trigger workspace ở dưới.
  can_chu_id         TEXT,

  -- Lúc chủ bấm "Dừng" (mục 6 d.193). Đồng hồ 10 phút của d.194 đếm từ đây.
  stopping_luc       INTEGER,

  mo_luc             INTEGER NOT NULL,
  dong_luc           INTEGER,
  -- Lý do đóng; mục 6 d.194 chỉ định một chuỗi cụ thể cho ca tự đóng.
  ly_do_dong         TEXT,
  cap_nhat_luc       INTEGER NOT NULL,

  -- Phiên đóng **đúng khi** có mốc đóng. Không có cái này thì "phiên đã đóng"
  -- (luật `SESSION_CLOSED` của d.195) có hai nguồn sự thật.
  CHECK ((trang_thai = 'closed') = (dong_luc IS NOT NULL)),
  -- `stopping` phải có mốc bấm Dừng, nếu không đồng hồ 10 phút của d.194 không
  -- bao giờ chạy và phiên treo vĩnh viễn.
  CHECK (trang_thai <> 'stopping' OR stopping_luc IS NOT NULL),
  -- `waiting_owner` là "phiên gắn với **một mục Cần Chủ** đang chờ" (d.183), nên
  -- nó không tồn tại mà thiếu mục đó. Luật này canh chỗ cắm của phần 4: nối
  -- `waiting_owner` mà quên `can_chu_id` là lỗi ngay ở DB.
  CHECK (trang_thai <> 'waiting_owner' OR can_chu_id IS NOT NULL)
) STRICT;

-- ===================================================================
-- 2. Tối đa một phiên MỞ cho mỗi lượt giao
-- ===================================================================
-- Mục 6 d.180 nói phiên mở khi agent nhận **một** lượt giao, và một lượt chỉ
-- nhận được một lần (`ASSIGNMENT_NOT_PENDING`, mục 5). Index riêng phần nên một
-- lượt vẫn có bao nhiêu phiên **đã đóng** cũng được, nhưng không bao giờ hai
-- phiên mở — tức không bao giờ có hai đồng hồ ngưỡng đứng cho cùng một việc.
CREATE UNIQUE INDEX ux_phien_mo_moi_luot
  ON phien (luot_giao_id)
  WHERE trang_thai <> 'closed';

-- ===================================================================
-- 3. Index cho các truy vấn thật
-- ===================================================================

-- **Trạng thái agent** (mục 3 d.98–103) và thẻ "Đội agent" của Tổng quan (mục 11
-- ý 3: trạng thái + thời gian từ tín hiệu cuối). Chạy cho mỗi hàng của danh sách
-- agent, nên phải nằm trọn trong index. Index riêng phần: chỉ phiên còn mở mới
-- quyết trạng thái agent, mà phiên đóng thì nhiều hơn phiên mở hàng trăm lần.
CREATE INDEX ix_phien_agent_mo
  ON phien (workspace_id, agent_id, trang_thai, tin_hieu_cuoi_luc)
  WHERE trang_thai <> 'closed';

-- **Chỉ báo sức sống của dự án** (19.6: 🟡 khi "có phiên `stalled` hoặc `error`")
-- và "phiên đang mở" của một ticket (mục 14 chi tiết ticket).
CREATE INDEX ix_phien_ticket
  ON phien (workspace_id, ticket_id, trang_thai);

-- Tra phiên theo lượt giao: `heartbeat`, đóng phiên lúc nộp, đưa phiên sang
-- `stopping` lúc huỷ lượt (19.6).
CREATE INDEX ix_phien_luot_giao ON phien (workspace_id, luot_giao_id);

-- ===================================================================
-- 4. Trigger: phiên không bao giờ lệch với lượt giao của nó
-- ===================================================================
-- Cùng lý do và cùng khuôn với các trigger của 0002 và 0004: `workspace_id`,
-- `luot_giao_id`, `ticket_id`, `agent_id` là bốn khoá ngoài **rời nhau**, nên
-- không có gì buộc chúng kể cùng một câu chuyện. Ba cột sau là bản sao dẫn xuất
-- từ lượt giao; một bản sao không được canh là một bản sao sẽ lệch.
--
-- Quy ước thông điệp `RAISE(ABORT, 'MÃ_LỖI: mô tả')` để `loi-d1.ts` tách được mã.

CREATE TRIGGER tg_phien_khop_luot_them
BEFORE INSERT ON phien
FOR EACH ROW WHEN
  NEW.workspace_id <> (SELECT workspace_id FROM luot_giao WHERE id = NEW.luot_giao_id)
  OR NEW.ticket_id <> (SELECT ticket_id FROM luot_giao WHERE id = NEW.luot_giao_id)
  OR NEW.agent_id <> (SELECT nguoi_nhan_agent_id FROM luot_giao WHERE id = NEW.luot_giao_id)
BEGIN
  SELECT RAISE(ABORT, 'INVALID_INPUT: phien phai khop workspace, ticket va nguoi nhan cua luot giao');
END;

CREATE TRIGGER tg_phien_khop_luot_sua
BEFORE UPDATE ON phien
FOR EACH ROW WHEN
  NEW.workspace_id <> (SELECT workspace_id FROM luot_giao WHERE id = NEW.luot_giao_id)
  OR NEW.ticket_id <> (SELECT ticket_id FROM luot_giao WHERE id = NEW.luot_giao_id)
  OR NEW.agent_id <> (SELECT nguoi_nhan_agent_id FROM luot_giao WHERE id = NEW.luot_giao_id)
BEGIN
  SELECT RAISE(ABORT, 'INVALID_INPUT: phien phai khop workspace, ticket va nguoi nhan cua luot giao');
END;

-- **Phiên đã đóng không mở lại được.** Mục 6 d.195: "Mọi lệnh ghi **sau khi
-- phiên đóng** bị từ chối (`SESSION_CLOSED`)". Cửa ghi kiểm luật đó để trả đúng
-- mã lỗi tiếng Việt; trigger này là hàng rào cuối, vì một phiên đóng rồi mở lại
-- là cách âm thầm nhất để vô hiệu hoá cả luật `SESSION_CLOSED` lẫn đồng hồ 10
-- phút của d.194. Muốn làm tiếp thì nhận lượt mới (19.5), không phải hồi sinh
-- phiên cũ.
CREATE TRIGGER tg_phien_dong_la_vinh_vien
BEFORE UPDATE ON phien
FOR EACH ROW WHEN OLD.trang_thai = 'closed' AND NEW.trang_thai <> 'closed'
BEGIN
  SELECT RAISE(ABORT, 'SESSION_CLOSED: phien da dong, khong mo lai duoc');
END;

-- ===================================================================
-- 5. Ngưỡng đứng theo dự án và theo agent — SPEC mục 6 dòng 189
-- ===================================================================
-- "Ngưỡng đứng: **mặc định 30 phút**; chỉnh **theo dự án** hoặc **theo agent**
-- (**5–1440 phút**)."
--
-- `NULL` = **không đặt riêng**, dùng bậc rộng hơn. Thứ tự áp (agent → dự án → 30
-- phút) nằm trong `nguongDungPhut` của `@baton/shared`, một chỗ duy nhất: SPEC
-- **không nói** bậc nào thắng khi cả hai được đặt (câu hỏi SPEC lượt này).
--
-- Khoảng 5–1440 ép bằng CHECK **mức cột** — SQLite cho `ALTER TABLE ADD COLUMN`
-- mang CHECK cột, nhưng không cho thêm CHECK mức bảng (phải dựng lại bảng, tức
-- `DROP`, nằm trong danh sách cấm của CLAUDE.md). Cùng cách đã dùng ở 0005.
ALTER TABLE project ADD COLUMN nguong_dung_phut INTEGER
  CHECK (nguong_dung_phut IS NULL OR (nguong_dung_phut >= 5 AND nguong_dung_phut <= 1440));

ALTER TABLE agent ADD COLUMN nguong_dung_phut INTEGER
  CHECK (nguong_dung_phut IS NULL OR (nguong_dung_phut >= 5 AND nguong_dung_phut <= 1440));
