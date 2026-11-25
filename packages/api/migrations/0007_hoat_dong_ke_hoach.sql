-- Baton v0.1 — migration 0007: dòng hoạt động, kế hoạch, hỏi người giao, cảnh báo
--
-- SPEC mục 6 d.190 (dòng hoạt động), d.191 (kế hoạch), d.196 (cảnh báo),
-- 19.6 (`question` → `waiting_assigner`, mốc 60 phút), 19.12 câu 2 (`baton reply`).

-- ===================================================================
-- 1. Ba mốc mới trên bảng `phien`
-- ===================================================================

-- **Lúc agent gửi `question`** — 19.6: "`waiting_assigner` … không bị tính đứng,
-- nhưng **quá 60 phút** thì hiện ở *Cần chú ý*".
--
-- Mốc **riêng**, không dùng `tin_hieu_cuoi_luc`: agent chờ trả lời vẫn gửi nhịp
-- tim (nó đang sống, chỉ bị chặn), mà nhịp tim là một tín hiệu (d.188). Đếm 60
-- phút từ tín hiệu cuối thì mỗi nhịp tim đẩy đồng hồ về đầu, nên luật **không bao
-- giờ chạy** đúng trong ca duy nhất nó cần chạy. Reviewer lượt 3 nêu
-- (`spec-questions.md` #48).
ALTER TABLE phien ADD COLUMN waiting_assigner_luc INTEGER;

-- **"Đã bắn cảnh báo cho tín hiệu nào"** — d.196: "chuyển sang `stalled` hoặc
-- `error` thì bắn **1** thông báo; phiên **hồi lại rồi đứng lần nữa** thì bắn
-- lại".
--
-- `stalled` là **dẫn xuất, không ghi DB** (chốt #42) nên không có sự kiện nào để
-- bắn. Cột này giữ **giá trị `tin_hieu_cuoi_luc` mà tin gần nhất đã bắn cho** —
-- **không** phải một cờ boolean: cờ thì "hồi lại rồi đứng lần nữa" không phân
-- biệt được với "vẫn đang đứng từ lần trước", và tin sẽ bắn lặp mỗi lần có ai mở
-- Tổng quan. Luật ở hàm thuần `canhBaoDung` (`shared/src/phien.ts`).
ALTER TABLE phien ADD COLUMN canh_bao_tin_hieu_luc INTEGER;

-- **Câu trả lời đã trao cho agent tới mốc nào** — 19.6: "Có câu trả lời thì phiên
-- về `running`, và **lần gọi kế tiếp của agent nhận được câu trả lời**". Mốc này
-- là chỗ nhớ "lần kế tiếp" đó; `heartbeat` trao rồi nhích mốc.
ALTER TABLE phien ADD COLUMN tra_loi_doc_luc INTEGER;

-- **Phiên bản kế hoạch hiện hành** — d.191. Không suy ra bằng `max(phien_ban)`
-- trong `phien_ke_hoach`: một kế hoạch **rỗng** (agent gửi lại danh sách trống,
-- hợp lệ) không có dòng nào, nên `max` sẽ rơi về phiên bản **cũ** và đường đọc
-- dựng lại một kế hoạch agent vừa bỏ. Số đếm phải nằm ở chỗ không phụ thuộc vào
-- việc có bước nào hay không.
ALTER TABLE phien ADD COLUMN ke_hoach_phien_ban INTEGER NOT NULL DEFAULT 0;

-- ===================================================================
-- 2. Dòng hoạt động của phiên — SPEC mục 6 d.190
-- ===================================================================
-- "Agent gửi các mục loại `thought`, `action` (tên, tham số, kết quả),
-- `question` (hỏi người giao), `result`, `error`. Mục có thể **đánh dấu tạm
-- thời** (bị mục kế thay chỗ trên màn hình; **vẫn lưu trong lịch sử**). **Mục đã
-- gửi không sửa được.**"
CREATE TABLE phien_hoat_dong (
  id               TEXT    PRIMARY KEY,
  workspace_id     TEXT    NOT NULL REFERENCES workspace(id),
  phien_id         TEXT    NOT NULL REFERENCES phien(id),
  -- Bản sao dẫn xuất từ phiên, canh bằng trigger ở dưới. Có nó để trang ticket
  -- (mục 14) đọc dòng hoạt động mà không phải join `phien`.
  ticket_id        TEXT    NOT NULL REFERENCES ticket(id),

  -- Năm mã của **mục 0.1**, không thêm mã nào.
  --
  -- `NULL` = **câu trả lời của người giao** (19.12 câu 2: "ghi thành một hoạt
  -- động trên phiên của người hỏi"). Năm mã của 0.1 đều là thứ "**agent** gửi"
  -- (d.190), nên một mục do *người giao* hay *chủ* gửi không có mã nào trong
  -- bảng. SPEC không nói loại nào cho câu trả lời — chỗ SPEC thiếu, câu hỏi gửi
  -- M-Baton. Chốt tạm: để `loai` rỗng và nhận ra câu trả lời bằng
  -- `tra_loi_cho_id`, thay vì tự thêm mã thứ sáu vào bảng 0.1 hoặc mượn nghĩa của
  -- `result` (mục `result` có luật riêng ở d.193).
  loai             TEXT    CHECK (loai IS NULL OR loai IN (
                     'thought', 'action', 'question', 'result', 'error'
                   )),

  tac_gia_loai     TEXT    NOT NULL CHECK (tac_gia_loai IN ('owner', 'agent')),
  tac_gia_agent_id TEXT    REFERENCES agent(id),

  noi_dung         TEXT    NOT NULL,
  -- `action` "(**tên, tham số, kết quả**)" — d.190 kể đúng ba thứ này.
  ten_thao_tac     TEXT,
  tham_so          TEXT,
  ket_qua_thao_tac TEXT,

  -- "**đánh dấu tạm thời**" — mục bị mục kế **thay chỗ trên màn hình**, nhưng
  -- **vẫn lưu trong lịch sử**. Nên đây là một cờ của chính mục, đặt **lúc gửi**:
  -- không có lệnh nào "đánh dấu lại một mục cũ", vì mục đã gửi không sửa được.
  -- Đường đọc mặc định ẩn mục tạm thời **đã bị mục sau thay chỗ**; `?gom_tam_thoi=co`
  -- lấy đủ cả lịch sử.
  tam_thoi         INTEGER NOT NULL DEFAULT 0 CHECK (tam_thoi IN (0, 1)),

  -- Câu trả lời trả lời mục `question` nào (19.12 câu 2).
  tra_loi_cho_id   TEXT    REFERENCES phien_hoat_dong(id),

  -- Thứ tự trong phiên. **Không** dựa vào `gui_luc`: hai mục trong cùng một
  -- milisecond thì dòng hoạt động hiện sai thứ tự, mà "suy nghĩ rồi thao tác" đọc
  -- ngược là vô nghĩa. Số này cấp trong cửa ghi (tuần tự), nên không đua.
  thu_tu           INTEGER NOT NULL,
  gui_luc          INTEGER NOT NULL,

  -- `loai` rỗng **đúng khi** đây là câu trả lời. Không có luật này thì "mục của
  -- agent" và "câu trả lời" có hai nguồn sự thật.
  CHECK ((loai IS NULL) = (tra_loi_cho_id IS NOT NULL)),
  CHECK (tac_gia_loai <> 'agent' OR tac_gia_agent_id IS NOT NULL),
  CHECK (tac_gia_loai <> 'owner' OR tac_gia_agent_id IS NULL),
  -- Câu trả lời không bao giờ "tạm thời": nó là thứ agent phải đọc được.
  CHECK (tra_loi_cho_id IS NULL OR tam_thoi = 0)
) STRICT;

CREATE UNIQUE INDEX ux_phien_hoat_dong_thu_tu ON phien_hoat_dong (phien_id, thu_tu);

-- Dòng hoạt động của một phiên, theo thứ tự — mục 14 ("Chi tiết phiên").
CREATE INDEX ix_phien_hoat_dong_phien
  ON phien_hoat_dong (workspace_id, phien_id, thu_tu);

-- Câu hỏi **chưa có trả lời** của một phiên: `heartbeat` trao câu trả lời mới
-- (19.6), và đường đọc "câu hỏi đang chờ tôi trả lời" của người giao.
CREATE INDEX ix_phien_hoat_dong_tra_loi
  ON phien_hoat_dong (workspace_id, tra_loi_cho_id);

-- -------------------------------------------------------------------
-- "**Mục đã gửi không sửa được**" (d.190) — hàng rào ở DB
-- -------------------------------------------------------------------
-- Tầng lệnh cũng chặn (không có lệnh nào UPDATE bảng này, và whitelist
-- `TRUONG_CLIENT` không có trường nào trỏ tới một mục đã có), nhưng một luật
-- "không sửa được" mà chỉ dựa vào "hiện chưa ai viết lệnh sửa" thì lượt sau có
-- người viết. Hai tầng, cùng khuôn với `ux_luot_giao_mo` của lượt 1.
CREATE TRIGGER tg_hoat_dong_khong_sua
BEFORE UPDATE ON phien_hoat_dong
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'FORBIDDEN: muc hoat dong da gui khong sua duoc');
END;

-- "vẫn lưu trong lịch sử" — mục tạm thời bị **ẩn trên màn hình**, không bị xoá.
-- Cộng hàng "Xoá bất cứ thứ gì — không bao giờ" của bảng quyền mục 3.
CREATE TRIGGER tg_hoat_dong_khong_xoa
BEFORE DELETE ON phien_hoat_dong
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'FORBIDDEN: muc hoat dong khong xoa duoc');
END;

-- Bản sao `workspace_id`/`ticket_id` không bao giờ lệch với phiên — cùng lý do và
-- cùng khuôn với `tg_phien_khop_luot_them` của 0006.
CREATE TRIGGER tg_hoat_dong_khop_phien
BEFORE INSERT ON phien_hoat_dong
FOR EACH ROW WHEN
  NEW.workspace_id <> (SELECT workspace_id FROM phien WHERE id = NEW.phien_id)
  OR NEW.ticket_id <> (SELECT ticket_id FROM phien WHERE id = NEW.phien_id)
BEGIN
  SELECT RAISE(ABORT, 'INVALID_INPUT: hoat dong phai khop workspace va ticket cua phien');
END;

-- ===================================================================
-- 3. Kế hoạch của phiên — SPEC mục 6 d.191
-- ===================================================================
-- "Danh sách bước, mỗi bước có trạng thái chờ, đang làm, xong hoặc huỷ. Agent
-- gửi lại **toàn bộ danh sách** mỗi lần cập nhật."
--
-- **Lưu theo phiên bản, chỉ thêm.** Một lần cập nhật = một `phien_ban` mới gồm
-- đủ các bước; đường đọc lấy phiên bản lớn nhất. Hai lý do:
--   1. Đúng ngữ nghĩa của SPEC: lệnh là **thay cả danh sách**, không phải sửa
--      bước thứ k. Cách "xoá hết rồi chèn lại" cũng thay cả danh sách, nhưng nó
--      cần một lệnh DELETE — mà bảng quyền mục 3 có hàng "Xoá bất cứ thứ gì —
--      không bao giờ", và một batch D1 hỏng giữa đường để lại kế hoạch rỗng.
--   2. Lịch sử kế hoạch là thứ chủ cần khi phiên đi sai: "lúc 10h nó định làm gì".
--
-- Mã trạng thái bước: SPEC mục 6 cho bốn **nhãn** tiếng Việt, bảng 0.1 **không có
-- nhóm này** (chỗ SPEC thiếu). Mã lấy theo khuôn các nhóm đã có — xem
-- `TRANG_THAI_BUOC` trong `shared/src/ma-nhan.ts`.
CREATE TABLE phien_ke_hoach (
  id           TEXT    PRIMARY KEY,
  workspace_id TEXT    NOT NULL REFERENCES workspace(id),
  phien_id     TEXT    NOT NULL REFERENCES phien(id),
  phien_ban    INTEGER NOT NULL,
  thu_tu       INTEGER NOT NULL,
  noi_dung     TEXT    NOT NULL,
  trang_thai   TEXT    NOT NULL CHECK (trang_thai IN (
                 'pending', 'in_progress', 'done', 'canceled'
               )),
  gui_luc      INTEGER NOT NULL,

  UNIQUE (phien_id, phien_ban, thu_tu)
) STRICT;

CREATE INDEX ix_phien_ke_hoach_phien
  ON phien_ke_hoach (workspace_id, phien_id, phien_ban DESC, thu_tu);

-- Một phiên bản đã gửi là một ảnh chụp: nó không đổi, phiên bản sau mới đổi.
CREATE TRIGGER tg_ke_hoach_khong_sua
BEFORE UPDATE ON phien_ke_hoach
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'FORBIDDEN: phien ban ke hoach da gui khong sua duoc');
END;

CREATE TRIGGER tg_ke_hoach_khop_phien
BEFORE INSERT ON phien_ke_hoach
FOR EACH ROW WHEN
  NEW.workspace_id <> (SELECT workspace_id FROM phien WHERE id = NEW.phien_id)
BEGIN
  SELECT RAISE(ABORT, 'INVALID_INPUT: ke hoach phai khop workspace cua phien');
END;
