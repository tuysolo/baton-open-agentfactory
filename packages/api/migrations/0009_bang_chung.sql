-- Baton v0.1 — migration 0009: bằng chứng (bảng `evidence`)
--
-- SPEC mục 7 (bảng "Loại bằng chứng" d.204–211, "Cổng vào Xong" d.213–217,
-- "Xác minh" d.219–223), 19.3 (review và bằng chứng mới), 19.7 (commit chưa
-- merge), 19.10, 19.11, 19.12 câu 5 (mã phiên bản deploy).
--
-- Mã của `loai`, `xac_minh` và `ket_luan` lấy **nguyên văn bảng SPEC 0.1**:
--   Loại bằng chứng    → `commit` · `deploy` · `review` · `test` · `file` · `note`
--   Xác minh bằng chứng → `pending` Đang kiểm · `passed` Đạt · `failed` Trượt
--                         · `withdrawn` Đã rút; **riêng commit**: `pushed` · `merged`
--   Kết luận review     → `pass` Đạt · `fail` Không đạt
--
-- Ba chỗ bảng này **thêm vào** 0.1, và vì sao:
--
--   A. `not_required` ("Không cần xác minh"). SPEC d.209–211 ghi cột Xác minh của
--      `test`, `file`, `note` là "Không xác minh" nhưng 0.1 **không có mã** cho
--      trạng thái đó. Nhét chúng vào `passed` thì "không cần xác minh" và "đã
--      xác minh đạt" thành một giá trị, và cổng Xong (d.214) mất khả năng phân
--      biệt — mà đúng ra `passed` của `deploy` **mở cổng** còn `note` thì không.
--      Xem `spec-questions.md` #55.
--
--   B. `withdrawn` **không** lưu vào `xac_minh`, mà là **bốn cột rút lại riêng**
--      (`rut_luc`, `rut_ly_do`, `rut_boi_*`). Lý do: d.222 nói bằng chứng "**không
--      sửa, không xoá**, chỉ có thể rút lại". Ghi `xac_minh = 'withdrawn'` là
--      **ghi đè** kết quả xác minh — tức sửa chính thứ SPEC cấm sửa, và mất luôn
--      thông tin "commit này đã merged rồi mới bị rút". `withdrawn` vẫn là mã hiển
--      thị của 0.1, suy ra ở tầng trên khi `rut_luc IS NOT NULL`
--      (`xacMinhHienThi` trong `@baton/shared`). CHECK ở dưới chặn `withdrawn`
--      trong cột `xac_minh` để không có hai nguồn sự thật.
--
--   C. `merged` và `pushed` là **hai giá trị khác nhau**, không gộp. d.206 có đúng
--      ba kết luận cho commit — merged · pushed · không tìm thấy (`failed`) — và
--      **chỉ `merged` mở cổng**. Gộp hai cái đầu là mở cổng cho commit chưa merge,
--      tức phá nguyên tắc sản phẩm số 3 ("Xong nghĩa là đã merge hoặc đã live").

-- ===================================================================
-- 1. Bảng bằng chứng — SPEC mục 7
-- ===================================================================
CREATE TABLE evidence (
  id                  TEXT    PRIMARY KEY,
  workspace_id        TEXT    NOT NULL REFERENCES workspace(id),
  ticket_id           TEXT    NOT NULL REFERENCES ticket(id),

  -- Sáu loại của SPEC 0.1 + bảng d.204–211. Không thêm mã nào.
  loai                TEXT    NOT NULL CHECK (loai IN (
                        'commit', 'deploy', 'review', 'test', 'file', 'note'
                      )),

  -- Người gửi
  -- Phải phân biệt được **chủ** và **đúng agent nào**, vì hai luật của SPEC đọc
  -- chính danh tính này:
  --   * 19.3 "khác người làm": agent gửi `review` không được là người nhận của
  --     bất kỳ lượt `work` nào trên ticket đó (`REVIEWER_IS_WORKER`).
  --   * d.222 quyền rút lại: **người gửi hoặc chủ**.
  -- Cùng quy ước cặp cột `*_loai` / `*_agent_id` với `ticket` của 0001.
  nguoi_gui_loai      TEXT    NOT NULL CHECK (nguoi_gui_loai IN ('owner', 'agent')),
  nguoi_gui_agent_id  TEXT    REFERENCES agent(id),

  -- **Thời điểm gửi — BẮT BUỘC.** 19.3 là một luật về **thứ tự thời gian**:
  -- review chỉ tính khi gửi **sau** bằng chứng `commit`/`deploy` cuối cùng, và
  -- commit/deploy mới làm review cũ **hết hiệu lực**. Cho phép NULL ở đây là cho
  -- phép một dòng không so được với dòng nào — luật 19.3 lúc đó không quyết được.
  gui_luc             INTEGER NOT NULL,

  -- Xác minh — SPEC d.206, d.207, d.219–220
  -- `withdrawn` **không** nằm ở đây (xem ghi chú B đầu file).
  xac_minh            TEXT    NOT NULL CHECK (xac_minh IN (
                        'pending', 'passed', 'failed', 'not_required',
                        'pushed', 'merged'
                      )),
  -- Lý do khi trượt — d.220 "rồi thành `failed` **với lý do**". Cũng giữ lỗi gần
  -- nhất lúc còn `pending` (đang trong vòng thử lại) để chủ xem được vì sao chậm.
  ly_do               TEXT,
  -- Lúc có kết luận xác minh (hoặc lần thử gần nhất).
  xac_minh_luc        INTEGER,

  -- Đếm lần thử và mốc thử lại — d.220: lỗi mạng hoặc token GitHub có vấn đề thì
  -- `pending`, **tự thử lại sau 5 phút, tối đa 3 lần**, rồi `failed`. Cron của
  -- lượt 3 đọc hai cột này, khai từ bây giờ để lượt 3 không phải thêm migration
  -- cho một luật đã biết trước.
  so_lan_thu          INTEGER NOT NULL DEFAULT 0 CHECK (so_lan_thu BETWEEN 0 AND 3),
  thu_lai_luc         INTEGER,

  -- Mốc dừng theo dõi commit `pushed` — 19.7: "Commit `pushed` quá **7 ngày** chưa
  -- merge: dừng theo dõi", mang nhãn "chưa merge sau 7 ngày". Gửi lại cùng commit
  -- thì theo dõi thêm 7 ngày (một dòng `evidence` mới, mốc mới). d.221: server
  -- kiểm lại các commit `pushed` **mỗi 10 phút trong 7 ngày**.
  theo_doi_den_luc    INTEGER,

  -- `commit`: hash (≥7 ký tự) + repo — SPEC d.206
  -- `repo` lưu giá trị **đã giải** lúc gửi ("lấy từ hồ sơ dự án nếu không ghi"),
  -- không trỏ về hồ sơ: hồ sơ dự án đổi repo về sau không được đổi nghĩa của một
  -- bằng chứng đã xác minh. NOT NULL ở tầng CHECK dưới.
  commit_hash         TEXT,
  repo                TEXT,

  -- `deploy`: URL + mã phiên bản tuỳ chọn — SPEC d.207
  url                 TEXT,
  -- **Mã phiên bản (vd `e91efbeb`): chỉ LƯU và HIỆN. Server KHÔNG kiểm.**
  -- Chốt của chủ, SPEC 19.12 câu 5. Đừng thêm một lần kiểm ở đây về sau: nó không
  -- phải việc còn dở, nó là câu trả lời. Muốn kiểm thì phải mở lại câu 5 trước.
  ma_phien_ban        TEXT,
  -- Mã HTTP server nhận được khi gọi URL (d.207: 2xx hoặc 3xx là đạt). Lưu lại để
  -- chủ thấy **vì sao** trượt, thay vì chỉ thấy chữ `failed`.
  ma_http             INTEGER,

  -- `review`: kết luận + ghi chú — SPEC d.208, 19.11
  ket_luan            TEXT    CHECK (ket_luan IS NULL OR ket_luan IN ('pass', 'fail')),
  ghi_chu             TEXT,

  -- `test`: tóm tắt + cờ đạt — SPEC d.209
  tom_tat             TEXT,
  test_dat            INTEGER CHECK (test_dat IS NULL OR test_dat IN (0, 1)),

  -- `file`: đường dẫn hoặc link — SPEC d.210
  duong_dan           TEXT,

  -- `note`: chữ — SPEC d.211
  noi_dung            TEXT,

  -- Rút lại — SPEC d.222
  -- "Bằng chứng **không sửa, không xoá**. Chỉ có thể **rút lại kèm lý do** (người
  -- gửi hoặc chủ). Bằng chứng đã rút **không được tính**."
  -- Lệnh rút là lượt 2, bốn cột này là lượt này. Trigger ở mục 4 chặn việc **bỏ**
  -- một lần rút đã ghi — rút lại rồi lại gỡ rút cũng là sửa bằng chứng.
  rut_luc             INTEGER,
  rut_ly_do           TEXT,
  rut_boi_loai        TEXT    CHECK (rut_boi_loai IS NULL OR rut_boi_loai IN ('owner', 'agent')),
  rut_boi_agent_id    TEXT    REFERENCES agent(id),

  tao_luc             INTEGER NOT NULL,
  cap_nhat_luc        INTEGER NOT NULL,

  -- Nhất quán cặp "ai", cùng khuôn với `ticket` của 0001 và `luot_giao` của 0004.
  CHECK ((nguoi_gui_loai = 'agent') = (nguoi_gui_agent_id IS NOT NULL)),
  CHECK ((rut_boi_loai = 'agent') = (rut_boi_agent_id IS NOT NULL)),
  -- Rút lại là **một** hành động: có mốc đúng khi có lý do và có người rút (d.222
  -- "rút lại **kèm lý do**" — một lần rút không lý do là một lần rút không giải
  -- thích được, và cổng vẫn bỏ nó ra, nên chủ không bao giờ biết vì sao).
  CHECK ((rut_luc IS NULL) = (rut_ly_do IS NULL)),
  CHECK ((rut_luc IS NULL) = (rut_boi_loai IS NULL)),

  -- Trường bắt buộc của **từng loại** — đúng từng dòng bảng d.204–211.
  -- Để ở DB chứ không chỉ ở `@baton/shared`: migration và nhập dữ liệu (mục 16)
  -- không đi qua tầng kiểm hợp lệ của API.
  CHECK (loai <> 'commit' OR (commit_hash IS NOT NULL AND length(commit_hash) >= 7)),
  CHECK (loai <> 'deploy' OR url IS NOT NULL),
  CHECK (loai <> 'review' OR ket_luan IS NOT NULL),
  CHECK (loai <> 'test'   OR (tom_tat IS NOT NULL AND test_dat IS NOT NULL)),
  CHECK (loai <> 'file'   OR duong_dan IS NOT NULL),
  CHECK (loai <> 'note'   OR noi_dung IS NOT NULL),

  -- Vốn từ `xac_minh` của **từng loại** — SPEC d.206, d.207, d.209–211 + 0.1
  -- ("riêng commit: `pushed` · `merged`").
  --   * `commit` → `pending` · `pushed` · `merged` · `failed` (không tìm thấy).
  --     **Không** có `passed`: d.206 chỉ cho ba kết luận, và `passed` cạnh
  --     `merged` sẽ là một giá trị thứ hai cũng "đạt" mà cổng không biết tin cái
  --     nào.
  --   * `deploy` → `pending` · `passed` · `failed`.
  --   * `review`, `test`, `file`, `note` → `not_required`: không có bước xác minh
  --     bất đồng bộ nào. (Với `review`, phần "Kiểm vai trò và danh tính người
  --     gửi" của d.208 chạy **đồng bộ lúc gửi** và từ chối hẳn bằng
  --     `REVIEWER_IS_WORKER` — nên không có dòng nào ở trạng thái "đang kiểm
  --     vai trò".)
  --   * `pushed`/`merged` không dùng được cho loại khác `commit`.
  CHECK (
    (loai = 'commit' AND xac_minh IN ('pending', 'pushed', 'merged', 'failed'))
    OR (loai = 'deploy' AND xac_minh IN ('pending', 'passed', 'failed'))
    OR (loai IN ('review', 'test', 'file', 'note') AND xac_minh = 'not_required')
  ),
  -- Lý do xác minh chỉ có nghĩa khi đang thử hoặc đã trượt (d.220).
  CHECK (ly_do IS NULL OR xac_minh IN ('pending', 'failed')),
  -- Chỉ loại có xác minh mới đếm lần thử (d.220 "tối đa 3 lần").
  CHECK (so_lan_thu = 0 OR loai IN ('commit', 'deploy')),
  -- Mốc 7 ngày của 19.7 chỉ có nghĩa cho commit đang `pushed`.
  CHECK (theo_doi_den_luc IS NULL OR (loai = 'commit' AND xac_minh = 'pushed'))
) STRICT;

-- ===================================================================
-- 2. Index — đúng hai truy vấn thật, không index dự phòng
-- ===================================================================

-- (a) **Cổng Xong đọc mọi bằng chứng của MỘT ticket theo thứ tự thời gian.**
-- Cổng (SPEC d.213–217 + 19.3) phải biết: có `commit` nào `merged` / `deploy`
-- nào `passed` chưa, và có `review` ĐẠT nào gửi **sau** bằng chứng commit/deploy
-- **cuối cùng** hay không. Câu "sau cái cuối cùng" là một câu về thứ tự
-- `gui_luc`, nên `gui_luc` phải nằm **ngay sau** `ticket_id` trong index: thiếu
-- nó thì SQLite sắp bằng B-tree tạm mỗi lần kiểm cổng, mà cổng chạy ở **mọi**
-- lần ticket định vào Xong.
-- `id` để thứ tự là **toàn phần**: hai bằng chứng cùng `gui_luc` (gửi trong cùng
-- một millisecond, hoàn toàn có thật trong một batch) vẫn có thứ tự xác định,
-- nên kết luận của cổng không phụ thuộc thứ tự SQLite trả về.
CREATE INDEX ix_evidence_ticket ON evidence (workspace_id, ticket_id, gui_luc, id);

-- (b) **Cron quét các bằng chứng `pending` ĐẾN HẠN thử lại** — d.220 (5 phút,
-- tối đa 3 lần). Cron (lượt 3) chạy cho **toàn hệ**, không cho một workspace, nên
-- index **không** dẫn đầu bằng `workspace_id`: dẫn đầu như vậy thì một lần quét
-- phải đi qua từng workspace một, và ở mốc nghiệm thu 200.000 ticket
-- (SPEC 19.12 câu 1) đó là quét toàn bảng đội lốt index.
-- Index **riêng phần** (`WHERE xac_minh = 'pending'`) nên nó chỉ to bằng số bằng
-- chứng đang chờ kiểm — thường vài dòng, dù bảng có bao nhiêu triệu dòng: một
-- bằng chứng chỉ ở `pending` trong tối đa 15 phút.
CREATE INDEX ix_evidence_thu_lai
  ON evidence (thu_lai_luc, id)
  WHERE xac_minh = 'pending' AND thu_lai_luc IS NOT NULL;

-- (c) **Cron quét các commit `pushed` còn trong 7 ngày** — 19.7 + d.221 (kiểm lại
-- mỗi 10 phút trong 7 ngày). Cùng lý do như (b): toàn hệ, nên không dẫn đầu bằng
-- `workspace_id`, và riêng phần, nên chỉ chứa đúng các commit đang được theo dõi.
-- Cron đọc theo `theo_doi_den_luc` để làm **hai** việc trong một lần quét: cái
-- nào còn hạn thì kiểm lại, cái nào quá hạn thì dừng theo dõi và gắn nhãn
-- "chưa merge sau 7 ngày".
CREATE INDEX ix_evidence_theo_doi
  ON evidence (theo_doi_den_luc, id)
  WHERE xac_minh = 'pushed' AND theo_doi_den_luc IS NOT NULL;

-- ===================================================================
-- 3. Trigger: workspace_id phải khớp ticket.workspace_id
-- ===================================================================
-- Cùng lý do và cùng khuôn với 4 cặp trigger của 0002 và cặp của 0004:
-- `workspace_id` và `ticket_id` là hai khoá ngoài **rời nhau**, nên không có gì
-- buộc chúng khớp, và một bằng chứng mang workspace khác ticket là một bằng chứng
-- đi xuyên workspace (lệch SPEC mục 1, 18).
-- Quy ước thông điệp `RAISE(ABORT, '<MÃ LỖI>: <mô tả>')` để `loi-d1.ts` tách được
-- mã lỗi ra khỏi thông điệp SQLite.

CREATE TRIGGER tg_evidence_ws_them
BEFORE INSERT ON evidence
FOR EACH ROW WHEN
  NEW.workspace_id <> (SELECT workspace_id FROM ticket WHERE id = NEW.ticket_id)
BEGIN
  SELECT RAISE(ABORT, 'INVALID_INPUT: bang chung phai cung workspace voi ticket');
END;

CREATE TRIGGER tg_evidence_ws_sua
BEFORE UPDATE ON evidence
FOR EACH ROW WHEN
  NEW.workspace_id <> (SELECT workspace_id FROM ticket WHERE id = NEW.ticket_id)
BEGIN
  SELECT RAISE(ABORT, 'INVALID_INPUT: bang chung phai cung workspace voi ticket');
END;

-- ===================================================================
-- 4. Trigger: "không sửa, không xoá" — SPEC d.222
-- ===================================================================
-- d.222 là một luật về **tính toàn vẹn của bằng chứng**, nên phải có hàng rào ở
-- DB, không chỉ ở cửa ghi: cửa ghi là một Durable Object cho mỗi workspace, còn
-- migration, nhập dữ liệu (mục 16) và bug tương lai thì không đi qua đó.
--
-- Bảng này **vẫn phải UPDATE được** cho hai việc có thật và đúng SPEC: ghi kết quả
-- xác minh (d.220, pending → merged/pushed/failed) và ghi một lần rút lại (d.222).
-- Nên trigger chặn đúng phần **nội dung** — thứ người gửi khẳng định — và để yên
-- phần **kết luận của server**.

CREATE TRIGGER tg_evidence_khong_xoa
BEFORE DELETE ON evidence
BEGIN
  SELECT RAISE(ABORT, 'INVALID_INPUT: bang chung khong xoa duoc, chi rut lai duoc');
END;

-- Nội dung bất biến: loại, ticket, người gửi, lúc gửi, và mọi giá trị của sáu
-- dòng bảng d.204–211. Sửa một trong số đó là **thay** bằng chứng khác vào chỗ
-- một bằng chứng đã được xác minh (và có thể đã mở cổng cho một ticket Xong).
CREATE TRIGGER tg_evidence_noi_dung_bat_bien
BEFORE UPDATE OF
  loai, ticket_id, nguoi_gui_loai, nguoi_gui_agent_id, gui_luc,
  commit_hash, repo, url, ma_phien_ban, ket_luan, ghi_chu,
  tom_tat, test_dat, duong_dan, noi_dung, tao_luc
ON evidence
FOR EACH ROW WHEN
  NEW.loai <> OLD.loai
  OR NEW.ticket_id <> OLD.ticket_id
  OR NEW.nguoi_gui_loai <> OLD.nguoi_gui_loai
  OR NEW.nguoi_gui_agent_id IS NOT OLD.nguoi_gui_agent_id
  OR NEW.gui_luc <> OLD.gui_luc
  OR NEW.commit_hash IS NOT OLD.commit_hash
  OR NEW.repo IS NOT OLD.repo
  OR NEW.url IS NOT OLD.url
  OR NEW.ma_phien_ban IS NOT OLD.ma_phien_ban
  OR NEW.ket_luan IS NOT OLD.ket_luan
  OR NEW.ghi_chu IS NOT OLD.ghi_chu
  OR NEW.tom_tat IS NOT OLD.tom_tat
  OR NEW.test_dat IS NOT OLD.test_dat
  OR NEW.duong_dan IS NOT OLD.duong_dan
  OR NEW.noi_dung IS NOT OLD.noi_dung
  OR NEW.tao_luc <> OLD.tao_luc
BEGIN
  SELECT RAISE(ABORT, 'INVALID_INPUT: noi dung bang chung khong sua duoc');
END;

-- Một lần rút lại là **một chiều**. Gỡ rút (đặt `rut_luc` về NULL) sẽ làm một
-- bằng chứng "không được tính" (d.222) được tính lại, tức sửa kết luận của cổng
-- bằng một thao tác mà SPEC không có.
CREATE TRIGGER tg_evidence_rut_mot_chieu
BEFORE UPDATE OF rut_luc, rut_ly_do, rut_boi_loai, rut_boi_agent_id ON evidence
FOR EACH ROW WHEN
  OLD.rut_luc IS NOT NULL
  AND (
    NEW.rut_luc IS NOT OLD.rut_luc
    OR NEW.rut_ly_do IS NOT OLD.rut_ly_do
    OR NEW.rut_boi_loai IS NOT OLD.rut_boi_loai
    OR NEW.rut_boi_agent_id IS NOT OLD.rut_boi_agent_id
  )
BEGIN
  SELECT RAISE(ABORT, 'INVALID_INPUT: bang chung da rut lai, khong doi duoc');
END;
