-- Baton v0.1 — migration 0001: khung lõi dữ liệu
-- Nguồn sự thật về hành vi: SPEC.md (mục 1 workspace, 2 dự án, 3 agent, 4 ticket).
--
-- Quy ước chung:
--   * Mọi thời điểm là epoch milliseconds (INTEGER). Hiển thị giờ Việt Nam
--     (UTC+7) là việc của tầng UI — SPEC mục 0 nguyên tắc 8.
--   * v0.1 chỉ có 1 workspace, nhưng **mọi bảng dữ liệu đều có `workspace_id`
--     từ đầu** để sau này ship nhiều khách — SPEC mục 1, 18.
--   * "Ai làm" lưu thành cặp cột `*_loai` ('owner' | 'agent' | 'system') và
--     `*_agent_id` (chỉ có khi loại là 'agent') — SPEC mục 4, 7.
--   * Cờ boolean lưu INTEGER 0/1 có CHECK.
--   * Khoá ngoài khai bằng REFERENCES; D1 bật `foreign_keys` cho mỗi phiên nên
--     không khai PRAGMA trong migration (D1 chặn PRAGMA tuỳ ý).

-- ===================================================================
-- 1. Workspace — SPEC mục 1
-- ===================================================================
CREATE TABLE workspace (
  id            TEXT    PRIMARY KEY,
  -- Tên hiển thị của chủ, mặc định "Chủ". Mục "Cần Chủ" dùng tên này:
  -- đổi tên chủ thì tên mục đổi theo — SPEC mục 1, 8.
  ten_chu       TEXT    NOT NULL DEFAULT 'Chủ',
  tao_luc       INTEGER NOT NULL,
  cap_nhat_luc  INTEGER NOT NULL
) STRICT;

-- ===================================================================
-- 2. Agent — SPEC mục 3, 15
-- ===================================================================
CREATE TABLE agent (
  id                   TEXT    PRIMARY KEY,
  workspace_id         TEXT    NOT NULL REFERENCES workspace(id),
  -- Tên duy nhất trong workspace (vd `CoS`, `M-Sample`, `W-builder`).
  ten                  TEXT    NOT NULL,
  vai_tro              TEXT    NOT NULL
    CHECK (vai_tro IN ('coordinator', 'manager', 'worker', 'reviewer')),
  -- Model là chữ tự do — SPEC mục 1.
  model                TEXT,
  mo_ta                TEXT,
  -- Chủ đã tắt agent: agent bị tắt gọi API sẽ bị từ chối — SPEC mục 3.
  disabled             INTEGER NOT NULL DEFAULT 0 CHECK (disabled IN (0, 1)),
  -- Cờ "tất cả dự án" — SPEC mục 3 ("danh sách dự án được vào, hoặc 'tất cả'").
  vao_tat_ca_du_an     INTEGER NOT NULL DEFAULT 0 CHECK (vao_tat_ca_du_an IN (0, 1)),
  -- Lần cuối lên tiếng (tín hiệu ghi gần nhất) — SPEC mục 3, 6.
  len_tieng_luc        INTEGER,

  -- Token: server **chỉ lưu dạng băm** (SHA-256 hex 64 ký tự) — SPEC mục 3, 15.
  -- Token gốc hiện đúng một lần khi tạo; sau đó chỉ hiện 4 ký tự cuối.
  token_bam            TEXT,
  token_bon_cuoi       TEXT,
  token_tao_luc        INTEGER,
  -- Có giá trị = token đã bị thu hồi (hoặc bị thay bởi token tạo lại).
  token_thu_hoi_luc    INTEGER,

  tao_luc              INTEGER NOT NULL,
  cap_nhat_luc         INTEGER NOT NULL
) STRICT;

CREATE UNIQUE INDEX ux_agent_ten ON agent (workspace_id, ten);
-- Tra agent theo token băm: đúng một lần quét khoá cho mỗi request.
CREATE UNIQUE INDEX ux_agent_token_bam ON agent (token_bam) WHERE token_bam IS NOT NULL;

-- ===================================================================
-- 3. Dự án — SPEC mục 2, 7, 9
-- ===================================================================
CREATE TABLE project (
  id                TEXT    PRIMARY KEY,
  workspace_id      TEXT    NOT NULL REFERENCES workspace(id),
  ten               TEXT    NOT NULL,
  -- Mã 2–6 chữ A–Z, duy nhất trong workspace, **không đổi được sau khi tạo**
  -- (trigger `tg_project_ma_bat_bien` ở dưới chặn) — SPEC mục 2.
  ma                TEXT    NOT NULL CHECK (length(ma) BETWEEN 2 AND 6),
  mo_ta             TEXT,
  mau               TEXT,
  trang_thai        TEXT    NOT NULL DEFAULT 'active'
    CHECK (trang_thai IN ('active', 'paused', 'archived')),
  -- Agent `manager` quản lý dự án (tuỳ chọn) — SPEC mục 2.
  quan_ly_agent_id  TEXT    REFERENCES agent(id),
  -- Nhóm dự án: **chỉ để hiển thị**, xếp sidebar — SPEC mục 2.
  nhom              TEXT,
  -- Cờ "dự án không code": đổi cổng bằng chứng — SPEC mục 7, 9.
  khong_code        INTEGER NOT NULL DEFAULT 0 CHECK (khong_code IN (0, 1)),
  -- Cờ "bắt buộc review": **mặc định bật** — SPEC mục 7, 9.
  bat_buoc_review   INTEGER NOT NULL DEFAULT 1 CHECK (bat_buoc_review IN (0, 1)),
  tao_luc           INTEGER NOT NULL,
  cap_nhat_luc      INTEGER NOT NULL
) STRICT;

CREATE UNIQUE INDEX ux_project_ma ON project (workspace_id, ma);
CREATE INDEX ix_project_trang_thai ON project (workspace_id, trang_thai, nhom, ten);

-- Mã dự án **không đổi được sau khi tạo** — SPEC mục 2.
CREATE TRIGGER tg_project_ma_bat_bien
BEFORE UPDATE OF ma ON project
FOR EACH ROW WHEN NEW.ma <> OLD.ma
BEGIN
  SELECT RAISE(ABORT, 'INVALID_INPUT: ma du an khong doi duoc sau khi tao');
END;

-- ===================================================================
-- 4. Dự án agent được vào — SPEC mục 3
-- Cờ "tất cả dự án" nằm ở `agent.vao_tat_ca_du_an`.
-- ===================================================================
CREATE TABLE agent_project (
  workspace_id  TEXT    NOT NULL REFERENCES workspace(id),
  agent_id      TEXT    NOT NULL REFERENCES agent(id),
  project_id    TEXT    NOT NULL REFERENCES project(id),
  tao_luc       INTEGER NOT NULL,
  PRIMARY KEY (agent_id, project_id)
) STRICT;

CREATE INDEX ix_agent_project_theo_du_an ON agent_project (workspace_id, project_id, agent_id);

-- ===================================================================
-- 5. Quyền ghi đè từng ô của bảng quyền — SPEC mục 3
-- Mặc định theo vai trò nằm trong code; bảng này chỉ chứa ô chủ đã chỉnh.
-- `viec` là tên hàng trong bảng quyền mục 3.
-- `pham_vi` là cột "được tới đâu" (vd 'moi_du_an_duoc_vao', 'du_an_minh_quan_ly',
-- 'ticket_cua_luot_minh'); NULL = theo mặc định của vai trò.
-- ===================================================================
CREATE TABLE agent_permission (
  workspace_id  TEXT    NOT NULL REFERENCES workspace(id),
  agent_id      TEXT    NOT NULL REFERENCES agent(id),
  viec          TEXT    NOT NULL CHECK (viec IN (
                  'create_ticket',
                  'assign',
                  'change_status',
                  'submit_evidence',
                  'write_review',
                  'create_ask',
                  'write_decision'
                )),
  cho_phep      INTEGER NOT NULL CHECK (cho_phep IN (0, 1)),
  pham_vi       TEXT,
  cap_nhat_luc  INTEGER NOT NULL,
  PRIMARY KEY (agent_id, viec)
) STRICT;

-- ===================================================================
-- 6. Bộ đếm — SPEC mục 1, 4, 8, 16
-- Số ticket trong dự án và số T toàn workspace đều **tăng dần, không tái dùng**.
-- Bộ đếm chỉ tăng; xoá ticket không hạ bộ đếm (mã không bao giờ dùng lại).
-- Cấp số luôn chạy trong Durable Object cửa ghi nên không có đua.
--   pham_vi = 'project' → khoa = project_id, đếm số ticket.
--   pham_vi = 'workspace' → khoa = 'ask', đếm T-số (mục 8).
-- ===================================================================
CREATE TABLE bo_dem (
  workspace_id  TEXT    NOT NULL REFERENCES workspace(id),
  pham_vi       TEXT    NOT NULL CHECK (pham_vi IN ('project', 'workspace')),
  khoa          TEXT    NOT NULL,
  gia_tri       INTEGER NOT NULL DEFAULT 0 CHECK (gia_tri >= 0),
  PRIMARY KEY (workspace_id, pham_vi, khoa)
) STRICT;

-- Bộ đếm không bao giờ giảm (bảo đảm "mã không tái dùng" — SPEC mục 4).
CREATE TRIGGER tg_bo_dem_chi_tang
BEFORE UPDATE OF gia_tri ON bo_dem
FOR EACH ROW WHEN NEW.gia_tri < OLD.gia_tri
BEGIN
  SELECT RAISE(ABORT, 'INVALID_INPUT: bo dem khong duoc giam');
END;

-- ===================================================================
-- 7. Ticket — SPEC mục 4
-- ===================================================================
CREATE TABLE ticket (
  id                        TEXT    PRIMARY KEY,
  workspace_id              TEXT    NOT NULL REFERENCES workspace(id),
  project_id                TEXT    NOT NULL REFERENCES project(id),
  -- Số tăng dần trong dự án, **không tái dùng**. Mã hiển thị là `MÃ-số`.
  so                        INTEGER NOT NULL CHECK (so > 0),

  -- Tiêu đề 1–200 ký tự sau khi cắt khoảng trắng — SPEC mục 4 (INVALID_INPUT).
  tieu_de                   TEXT    NOT NULL
    CHECK (length(tieu_de) BETWEEN 1 AND 200),
  mo_ta                     TEXT,

  -- 8 trường brief có cấu trúc (tuỳ chọn) — SPEC mục 4.
  muc_tieu                  TEXT,
  boi_canh                  TEXT,
  pham_vi                   TEXT,
  file_va_nguon             TEXT,
  dieu_cam                  TEXT,
  xong_la_gi                TEXT,
  cach_kiem_chung           TEXT,
  nop_lai                   TEXT,

  trang_thai                TEXT    NOT NULL DEFAULT 'todo'
    CHECK (trang_thai IN (
      'backlog', 'todo', 'in_progress', 'verifying', 'done', 'canceled', 'duplicate'
    )),
  uu_tien                   TEXT    NOT NULL DEFAULT 'none'
    CHECK (uu_tien IN ('urgent', 'high', 'medium', 'low', 'none')),
  -- Hạng số của ưu tiên để sắp xếp (0 Khẩn → 4 Không). Giữ khớp với `uu_tien`
  -- bằng CHECK để không bao giờ lệch.
  hang_uu_tien              INTEGER NOT NULL DEFAULT 4 CHECK (
    hang_uu_tien = CASE uu_tien
      WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2
      WHEN 'low' THEN 3 ELSE 4 END
  ),

  -- Người chịu trách nhiệm: chủ hoặc agent `manager`/`coordinator` — SPEC mục 4.
  chiu_trach_nhiem_loai     TEXT    CHECK (chiu_trach_nhiem_loai IN ('owner', 'agent')),
  chiu_trach_nhiem_agent_id TEXT    REFERENCES agent(id),

  han_luc                   INTEGER,

  nguoi_tao_loai            TEXT    NOT NULL
    CHECK (nguoi_tao_loai IN ('owner', 'agent', 'system')),
  nguoi_tao_agent_id        TEXT    REFERENCES agent(id),

  tao_luc                   INTEGER NOT NULL,
  cap_nhat_luc              INTEGER NOT NULL,
  bat_dau_luc               INTEGER,
  xong_luc                  INTEGER,

  -- Cờ hệ thống (nhãn hệ thống) — SPEC mục 7, 16, 19.1, 19.3.
  co_xong_khong_bang_chung  INTEGER NOT NULL DEFAULT 0
    CHECK (co_xong_khong_bang_chung IN (0, 1)),
  co_nhap_khong_bang_chung  INTEGER NOT NULL DEFAULT 0
    CHECK (co_nhap_khong_bang_chung IN (0, 1)),
  co_khong_ai_cam           INTEGER NOT NULL DEFAULT 0
    CHECK (co_khong_ai_cam IN (0, 1)),
  co_can_review_lai         INTEGER NOT NULL DEFAULT 0
    CHECK (co_can_review_lai IN (0, 1)),

  -- Mã cũ khi nhập từ công cụ khác, **tìm được** — SPEC mục 16.
  ma_cu                     TEXT,

  -- Xoá mềm: khôi phục trong 30 ngày; mã không bao giờ dùng lại — SPEC mục 4.
  xoa_luc                   INTEGER,

  -- Ticket gốc khi trạng thái là `duplicate` — SPEC mục 4.
  trung_voi_ticket_id       TEXT    REFERENCES ticket(id),
  -- Lý do khi vào Huỷ — SPEC mục 4 (REASON_REQUIRED).
  ly_do_huy                 TEXT,

  -- Nhất quán cặp "ai": loại 'agent' thì phải có agent_id, và ngược lại.
  CHECK ((chiu_trach_nhiem_loai = 'agent') = (chiu_trach_nhiem_agent_id IS NOT NULL)),
  CHECK ((nguoi_tao_loai = 'agent') = (nguoi_tao_agent_id IS NOT NULL))
) STRICT;

-- Mã ticket duy nhất trong dự án (và vì vậy duy nhất trong workspace).
CREATE UNIQUE INDEX ux_ticket_so ON ticket (project_id, so);

-- --- Index theo mốc 200 dự án + 200.000 ticket -----------------------
-- Thứ tự sắp xếp chuẩn của danh sách ticket, cũng là khoá keyset (cursor):
--   (hang_uu_tien ASC, tao_luc DESC, id DESC)
-- Không dùng OFFSET lớn; trang sau lọc theo bộ ba này.

-- Danh sách ticket trong một dự án, lọc theo trạng thái (SPEC mục 14).
CREATE INDEX ix_ticket_du_an
  ON ticket (workspace_id, project_id, trang_thai, hang_uu_tien, tao_luc DESC, id DESC)
  WHERE xoa_luc IS NULL;

-- Danh sách "Tất cả dự án" và các con số ở Tổng quan (SPEC mục 11, 14).
CREATE INDEX ix_ticket_ws_trang_thai
  ON ticket (workspace_id, trang_thai, hang_uu_tien, tao_luc DESC, id DESC)
  WHERE xoa_luc IS NULL;

-- Lọc theo người chịu trách nhiệm (SPEC mục 14).
CREATE INDEX ix_ticket_chiu_trach_nhiem
  ON ticket (workspace_id, chiu_trach_nhiem_agent_id, trang_thai, hang_uu_tien, tao_luc DESC, id DESC)
  WHERE xoa_luc IS NULL AND chiu_trach_nhiem_agent_id IS NOT NULL;

-- Ticket có hạn: sắp theo hạn, bỏ qua ticket không có hạn.
CREATE INDEX ix_ticket_han
  ON ticket (workspace_id, han_luc)
  WHERE xoa_luc IS NULL AND han_luc IS NOT NULL;

-- "Vừa xong": ticket Xong trong 24 giờ qua (SPEC mục 11).
CREATE INDEX ix_ticket_xong_luc
  ON ticket (workspace_id, xong_luc DESC)
  WHERE xoa_luc IS NULL AND xong_luc IS NOT NULL;

-- Thay đổi gần nhất, cho "cập nhật cuối" ở Bản đồ dự án (SPEC mục 9).
CREATE INDEX ix_ticket_cap_nhat
  ON ticket (workspace_id, cap_nhat_luc DESC, id DESC)
  WHERE xoa_luc IS NULL;

-- Tìm theo mã cũ sau khi nhập dữ liệu (SPEC mục 16).
CREATE INDEX ix_ticket_ma_cu
  ON ticket (workspace_id, ma_cu)
  WHERE ma_cu IS NOT NULL;

-- Thùng rác: khôi phục trong 30 ngày (SPEC mục 4).
CREATE INDEX ix_ticket_da_xoa
  ON ticket (workspace_id, xoa_luc)
  WHERE xoa_luc IS NOT NULL;

-- ===================================================================
-- 8. Liên kết ticket — SPEC mục 4 + 19.4
-- Hai chiều, **được khác dự án**.
-- `dieu_phoi` là loại RIÊNG, khác `related` (SPEC 19.4).
-- `parent` và `blocks` có hướng: tu_ticket_id là cha / là bên chặn.
-- ===================================================================
CREATE TABLE ticket_link (
  workspace_id    TEXT    NOT NULL REFERENCES workspace(id),
  tu_ticket_id    TEXT    NOT NULL REFERENCES ticket(id),
  den_ticket_id   TEXT    NOT NULL REFERENCES ticket(id),
  loai            TEXT    NOT NULL
    CHECK (loai IN ('parent', 'related', 'blocks', 'dieu_phoi')),
  tao_luc         INTEGER NOT NULL,
  PRIMARY KEY (tu_ticket_id, den_ticket_id, loai),
  CHECK (tu_ticket_id <> den_ticket_id)
) STRICT;

-- Tra chiều ngược (ticket con, bị chặn, ticket dự án của ticket điều phối).
CREATE INDEX ix_ticket_link_nguoc ON ticket_link (den_ticket_id, loai, tu_ticket_id);
CREATE INDEX ix_ticket_link_ws ON ticket_link (workspace_id, loai);

-- ===================================================================
-- 9. Nhãn ticket — SPEC mục 4, 14
-- ===================================================================
CREATE TABLE ticket_label (
  workspace_id  TEXT    NOT NULL REFERENCES workspace(id),
  ticket_id     TEXT    NOT NULL REFERENCES ticket(id),
  nhan          TEXT    NOT NULL CHECK (length(nhan) BETWEEN 1 AND 50),
  tao_luc       INTEGER NOT NULL,
  PRIMARY KEY (ticket_id, nhan)
) STRICT;

-- Lọc theo nhãn trên toàn workspace (SPEC mục 14).
CREATE INDEX ix_ticket_label_theo_nhan ON ticket_label (workspace_id, nhan, ticket_id);

-- ===================================================================
-- 10. Lịch sử ticket — SPEC mục 4
-- Mọi thay đổi ghi 1 dòng (ai, lúc nào, trường, cũ → mới).
-- **Chỉ thêm. Không sửa, không xoá** — hai trigger dưới chặn ở tầng DB.
-- ===================================================================
CREATE TABLE ticket_history (
  id              TEXT    PRIMARY KEY,
  workspace_id    TEXT    NOT NULL REFERENCES workspace(id),
  ticket_id       TEXT    NOT NULL REFERENCES ticket(id),
  tac_gia_loai    TEXT    NOT NULL CHECK (tac_gia_loai IN ('owner', 'agent', 'system')),
  tac_gia_agent_id TEXT   REFERENCES agent(id),
  luc             INTEGER NOT NULL,
  truong          TEXT    NOT NULL,
  gia_tri_cu      TEXT,
  gia_tri_moi     TEXT,
  CHECK ((tac_gia_loai = 'agent') = (tac_gia_agent_id IS NOT NULL))
) STRICT;

CREATE INDEX ix_ticket_history_ticket ON ticket_history (ticket_id, luc DESC, id DESC);
CREATE INDEX ix_ticket_history_ws ON ticket_history (workspace_id, luc DESC, id DESC);

CREATE TRIGGER tg_ticket_history_khong_sua
BEFORE UPDATE ON ticket_history
BEGIN
  SELECT RAISE(ABORT, 'FORBIDDEN: lich su chi them, khong sua');
END;

CREATE TRIGGER tg_ticket_history_khong_xoa
BEFORE DELETE ON ticket_history
BEGIN
  SELECT RAISE(ABORT, 'FORBIDDEN: lich su chi them, khong xoa');
END;

-- ===================================================================
-- 11. Bình luận — SPEC mục 4
-- Markdown, của chủ hoặc agent. Tác giả tự sửa được (cờ `da_sua`).
-- Agent không xoá được — luật đó ở tầng quyền (lượt 2), không ở DB.
-- ===================================================================
CREATE TABLE comment (
  id                TEXT    PRIMARY KEY,
  workspace_id      TEXT    NOT NULL REFERENCES workspace(id),
  ticket_id         TEXT    NOT NULL REFERENCES ticket(id),
  tac_gia_loai      TEXT    NOT NULL CHECK (tac_gia_loai IN ('owner', 'agent', 'system')),
  tac_gia_agent_id  TEXT    REFERENCES agent(id),
  noi_dung          TEXT    NOT NULL CHECK (length(noi_dung) >= 1),
  da_sua            INTEGER NOT NULL DEFAULT 0 CHECK (da_sua IN (0, 1)),
  tao_luc           INTEGER NOT NULL,
  cap_nhat_luc      INTEGER NOT NULL,
  CHECK ((tac_gia_loai = 'agent') = (tac_gia_agent_id IS NOT NULL))
) STRICT;

-- 10 bình luận cuối của một ticket (SPEC mục 13 `baton show`).
CREATE INDEX ix_comment_ticket ON comment (ticket_id, tao_luc DESC, id DESC);
