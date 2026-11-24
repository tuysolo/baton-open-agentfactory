-- ===================================================================
-- 0018 — **Hồ sơ dự án (bản đồ dự án)** và **Luật chung của workspace**
-- SPEC mục 9 d.294–303:
--        d.296–297 (các trường markdown: "Là gì", thư mục/nguồn, repo GitHub,
--                   stack, "Đọc trước", cách deploy và ai chạy, danh sách cấm
--                   riêng),
--        d.299 (**Lỗi đã gặp** — danh sách **chỉ thêm**: ngày, lỗi, cách tránh),
--        d.300 (hai cờ "dự án không code" và "bắt buộc review" — **đã có** ở
--               `project` từ 0001, nên **không** nhân bản ở đây),
--        d.301 (trang "Luật chung" của workspace: danh sách cấm chung +
--               checklist trước khi giao),
--        d.302 (trang Bản đồ: bảng mọi dự án — **thư mục** lấy từ bảng này),
--        d.303 (mỗi lần sửa hồ sơ **ghi lịch sử phiên bản**).
-- Mục 7 d.207: repo của bằng chứng `commit` "lấy từ hồ sơ dự án nếu không ghi"
--        — đây là chỗ nó sẽ được đọc khi phần đó được nối.
-- ===================================================================
--
-- ## Vì sao hồ sơ là một BẢNG RIÊNG, không thêm cột vào `project`
--
-- Ba lý do, và cả ba là lý do thật:
--   1. **Lịch sử phiên bản của d.303 chỉ áp cho hồ sơ**, không cho tên/mã/trạng
--      thái dự án (những thứ đã có lịch sử riêng ở đường sửa dự án). Trộn hai
--      nhóm cột vào một bảng thì mỗi lần chủ đổi *tên* dự án cũng sinh một phiên
--      bản hồ sơ — tức lịch sử hồ sơ đầy dòng không nói gì về hồ sơ.
--   2. Hồ sơ là **tuỳ chọn**: rất nhiều dự án không có hồ sơ nào. Một hàng chỉ
--      tồn tại khi có nội dung, nên `project` không phình thêm bảy cột `NULL`.
--   3. Đường đọc nóng nhất (`lietKeDuAn` của sidebar, mỗi lần mở trang) **không**
--      cần hồ sơ; để cùng bảng là kéo bảy cột markdown qua mọi lượt đọc đó.
--
-- ## `STRICT` và `workspace_id` ở mọi bảng
--
-- Nếp từ 0001 (`quyet-dinh.md` 01/10): mọi bảng mới ràng cả `workspace_id`, kể
-- cả khi khoá đã là duy nhất toàn cục — mọi câu SQL lọc được theo workspace mà
-- không phải `JOIN` lên `project`.

CREATE TABLE project_ho_so (
  -- **Một hàng cho mỗi dự án** — khoá chính là `project_id`, không một `id`
  -- riêng: "mỗi dự án có đúng một hồ sơ" là một luật đếm được, nên nó được ép
  -- tại DB chứ không dựa vào việc đường ghi nhớ kiểm.
  project_id          TEXT    PRIMARY KEY REFERENCES project(id),
  workspace_id        TEXT    NOT NULL REFERENCES workspace(id),

  -- d.296–298 — các mục markdown của hồ sơ. Tất cả **tuỳ chọn**.

  -- "Là gì" — câu trả lời đầu tiên cho một agent mới vào dự án (d.294).
  la_gi               TEXT,
  -- Thư mục hoặc nguồn (đường dẫn máy) — cột mà **bảng d.302 hiện**.
  thu_muc             TEXT,
  -- Repo GitHub: chủ sở hữu/tên, và **nhánh mặc định** (mục 7 d.207 dùng nó
  -- để quyết một commit là `merged` hay chỉ `pushed`).
  repo_chu_so_huu     TEXT,
  repo_ten            TEXT,
  repo_nhanh_mac_dinh TEXT,
  stack               TEXT,
  -- "Đọc trước" (danh sách link), cách deploy và ai chạy, danh sách cấm riêng
  -- của dự án — markdown, vì d.296 nói "markdown từng mục".
  doc_truoc           TEXT,
  cach_deploy         TEXT,
  danh_sach_cam       TEXT,

  -- d.303 — lịch sử phiên bản

  -- Phiên bản **hiện hành**, tăng 1 mỗi lần sửa. Số này là thứ đường ghi dùng
  -- để biết bản vừa chụp vào `project_ho_so_ban` là bản số bao nhiêu, nên nó
  -- phải nằm cùng hàng với nội dung (một `max()` trên bảng lịch sử sẽ sai ngay
  -- ở lần sửa đầu, khi lịch sử còn trống).
  phien_ban           INTEGER NOT NULL DEFAULT 1 CHECK (phien_ban >= 1),

  tao_luc             INTEGER NOT NULL,
  cap_nhat_luc        INTEGER NOT NULL
) STRICT;

CREATE INDEX ix_ho_so_workspace ON project_ho_so (workspace_id);

-- ===================================================================
-- Lịch sử phiên bản của hồ sơ — d.303, **chỉ thêm**
-- ===================================================================
--
-- Mỗi hàng là **ảnh chụp của bản TRƯỚC khi sửa**, dạng JSON. Vì sao JSON chứ
-- không chín cột lặp lại: bảng này **không bao giờ được truy vấn theo trường**
-- (không ai lọc "mọi phiên bản có stack là Go"), và chín cột lặp nghĩa là mỗi
-- lần mục 9 thêm một trường thì phải đổi **hai** bảng — bản nào quên là một
-- phiên bản mất dữ liệu im lặng.
CREATE TABLE project_ho_so_ban (
  id            TEXT    PRIMARY KEY,
  workspace_id  TEXT    NOT NULL REFERENCES workspace(id),
  project_id    TEXT    NOT NULL REFERENCES project(id),
  -- Số phiên bản **của ảnh chụp này** (bản cũ), không phải bản mới.
  phien_ban     INTEGER NOT NULL CHECK (phien_ban >= 1),
  anh_json      TEXT    NOT NULL,
  -- Ai sửa — d.418 ("mọi hành động có dấu vết ai làm").
  sua_boi_loai  TEXT    NOT NULL CHECK (sua_boi_loai IN ('owner', 'agent')),
  sua_boi_agent_id TEXT REFERENCES agent(id),
  luc           INTEGER NOT NULL,

  -- Cặp hai cột phải khớp nhau: `owner` thì không có agent, `agent` thì có.
  CHECK ((sua_boi_loai = 'agent') = (sua_boi_agent_id IS NOT NULL)),
  UNIQUE (project_id, phien_ban)
) STRICT;

CREATE INDEX ix_ho_so_ban_du_an ON project_ho_so_ban (workspace_id, project_id, phien_ban DESC);

-- Lịch sử **không sửa, không xoá** — cùng nếp `nhat_ky` của 0014: một lịch sử
-- sửa được thì không còn là lịch sử, và luật đó được ép ở DB để cả fixture test
-- cũng không đi cửa hậu.
CREATE TRIGGER tg_ho_so_ban_khong_sua
BEFORE UPDATE ON project_ho_so_ban
BEGIN
  SELECT RAISE(ABORT, 'INVALID_INPUT: lich su ho so chi them, khong sua');
END;

CREATE TRIGGER tg_ho_so_ban_khong_xoa
BEFORE DELETE ON project_ho_so_ban
BEGIN
  SELECT RAISE(ABORT, 'INVALID_INPUT: lich su ho so chi them, khong xoa');
END;

-- ===================================================================
-- "Lỗi đã gặp" — d.299, danh sách **chỉ thêm**: ngày, lỗi, cách tránh
-- ===================================================================
CREATE TABLE project_loi_da_gap (
  id            TEXT    PRIMARY KEY,
  workspace_id  TEXT    NOT NULL REFERENCES workspace(id),
  project_id    TEXT    NOT NULL REFERENCES project(id),
  -- **Ngày trên tường** `YYYY-MM-DD` (d.299 nói "ngày", không "lúc"): một lỗi
  -- đã gặp là một mục của ngày, và ngày được tính theo múi giờ nghiệp vụ của
  -- 19.12 câu 60 ở đường ghi — không phải ở đây.
  ngay          TEXT    NOT NULL CHECK (length(ngay) = 10),
  loi           TEXT    NOT NULL CHECK (length(trim(loi)) > 0),
  cach_tranh    TEXT,
  -- Ai ghi — d.418.
  ghi_boi_loai  TEXT    NOT NULL CHECK (ghi_boi_loai IN ('owner', 'agent')),
  ghi_boi_agent_id TEXT REFERENCES agent(id),
  tao_luc       INTEGER NOT NULL,

  CHECK ((ghi_boi_loai = 'agent') = (ghi_boi_agent_id IS NOT NULL))
) STRICT;

CREATE INDEX ix_loi_da_gap_du_an ON project_loi_da_gap (workspace_id, project_id, tao_luc DESC);

-- **Chỉ thêm** — đúng chữ d.299. Cùng lý lẽ với lịch sử phiên bản ở trên: một
-- mục "lỗi đã gặp" sửa được thì bài học của nó không đáng tin.
CREATE TRIGGER tg_loi_da_gap_khong_sua
BEFORE UPDATE ON project_loi_da_gap
BEGIN
  SELECT RAISE(ABORT, 'INVALID_INPUT: loi da gap chi them, khong sua');
END;

CREATE TRIGGER tg_loi_da_gap_khong_xoa
BEFORE DELETE ON project_loi_da_gap
BEGIN
  SELECT RAISE(ABORT, 'INVALID_INPUT: loi da gap chi them, khong xoa');
END;

-- ===================================================================
-- "Luật chung" của workspace — d.301
-- ===================================================================
--
-- Một hàng cho mỗi workspace, cùng khuôn `chu_tai_khoan` của 0017: "một trang
-- Luật chung cho cả workspace" là một luật đếm được, nên khoá chính là
-- `workspace_id`.
--
-- **Không** có bảng lịch sử cho nó: d.303 chỉ đòi lịch sử phiên bản cho **hồ sơ
-- dự án**. Thêm một lịch sử mà SPEC không đòi là tự phát minh hành vi.
CREATE TABLE luat_chung (
  workspace_id  TEXT    PRIMARY KEY REFERENCES workspace(id),
  -- Danh sách cấm **chung** (khác danh sách cấm riêng của từng dự án).
  danh_sach_cam TEXT,
  -- Checklist trước khi giao.
  checklist     TEXT,
  cap_nhat_luc  INTEGER NOT NULL
) STRICT;
