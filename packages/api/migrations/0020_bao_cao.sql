-- ===================================================================
-- 0020 — **báo cáo sáng 07:30 và handoff tối 20:00** (phần 7, việc B)
-- SPEC mục 11 d.322–336, mục 12 d.346, 19.12 câu 60
-- ===================================================================
--
-- Hai bảng:
--   * `bao_cao`   — d.336: "Báo cáo lưu theo ngày, **xem lại được**, **xuất ra
--                   markdown được**".
--   * `trong_tam` — d.324 (agent `coordinator` đề xuất 3 việc trọng tâm hôm nay)
--                   + d.331 (handoff tối đọc "đạt hay chưa" **theo trạng thái các
--                   ticket được gắn là trọng tâm").
--
-- ## CHỈ chú thích hai-gạch trong file này, không một khối chú thích kiểu C nào
--
-- Bộ tiền xử lý của `wrangler d1 execute --remote` xoá `--…` tới hết dòng **kể cả
-- bên trong** một khối chú thích kiểu C. Nên một khối như vậy có chứa dấu hai gạch
-- bị cắt mất dấu đóng, và câu lệnh ngay sau đó vỡ. Lỗi đó đã xảy ra một lần trong
-- dự án này (xem `quyet-dinh.md`), và `TEST_VAN_BAN_MIGRATION` ở `vitest.config.ts`
-- giờ quét cả thư mục để nó không xảy ra lần hai.
--
-- File này **không chứa một dấu mở khối nào**, kể cả trong chữ của chú thích: phép
-- kiểm nghiệm thu là `grep -c` trên hai ký tự đó, và nó không phân biệt được một ví
-- dụ trong văn bản với một khối thật.

-- ===================================================================
-- A. `bao_cao` — một báo cáo đã sinh
-- ===================================================================
--
-- ## `PRIMARY KEY (workspace_id, ngay, loai)` là CƠ CHẾ CHỐNG TRÙNG
--
-- Không phải một lựa chọn cho gọn. Một Cron Trigger của Cloudflare **có thể chạy
-- hơn một lần** cho cùng một nhịp (runtime không bảo đảm đúng-một-lần, và một
-- lượt `scheduled` bị cắt giữa chừng rồi chạy lại là chuyện bình thường). Mà hai
-- lượt chạy của nhịp 07:30 phải cho **một** báo cáo và **một** tin Telegram, không
-- hai — d.346 ("Bắn khi: … Báo cáo sáng và tối") nói một tin cho mỗi báo cáo.
--
-- Khoá này là chỗ duy nhất đóng được cửa sổ đua đó ở tầng **dữ liệu**: đường ghi
-- dùng `INSERT … ON CONFLICT DO NOTHING` rồi đọc `meta.changes`, nên lượt thứ hai
-- biết chắc là nó **không** chèn được gì và nó không ghi dòng `thong_bao` nào. Một
-- `SELECT` trước `INSERT` thì không đóng được: giữa hai câu đó là một cửa sổ đua.
--
-- ## Lưu CẢ `noi_dung_md` và `du_lieu_json`
--
-- Cùng lý lẽ mà 0012 đã khai cho `thong_bao.noi_dung`: một báo cáo đã sinh là **một
-- thứ đã nói với chủ**, và nó không được đổi nghĩa khi khuôn chữ hay nhãn tiếng
-- Việt đổi ở một lượt sau. Nên chữ markdown được **chốt lại lúc sinh**.
--
-- `du_lieu_json` là ảnh dữ liệu của cùng thời điểm đó, để trang web dựng lại giao
-- diện (d.322 "xem trên web") mà không phải **phân tích markdown** — phân tích lại
-- chữ đã dựng là một bộ chuyển đổi thứ hai, và nó sẽ lệch với bộ thứ nhất.
--
-- Cả hai là `TEXT NOT NULL`: một báo cáo không có chữ thì không "xuất ra markdown"
-- được, và một báo cáo không có JSON thì trang web không vẽ được vế nào.

CREATE TABLE bao_cao (
  workspace_id  TEXT    NOT NULL REFERENCES workspace(id),

  -- Ngày **trên tường** của chủ, dạng `YYYY-MM-DD` — đúng dạng của `ngayDiaPhuong`
  -- (`@baton/shared`), tức đi qua `MUI_GIO_CHU_PHUT` (19.12 câu 60). Không một mốc
  -- epoch nào thay được nó: "báo cáo của ngày 06/10" là một khái niệm trên tường,
  -- và hai mốc epoch cách nhau 1 giờ có thể thuộc hai ngày khác nhau.
  ngay          TEXT    NOT NULL,

  -- Đúng hai loại của mục 11: "Báo cáo sáng" (d.322) và "Handoff tối" (d.330).
  loai          TEXT    NOT NULL CHECK (loai IN ('sang', 'toi')),

  -- Chữ markdown đã dựng — vế "xuất ra markdown được" của d.336.
  noi_dung_md   TEXT    NOT NULL,
  -- Ảnh dữ liệu lúc sinh — vế "xem trên web" của d.322. Xem khối trên.
  du_lieu_json  TEXT    NOT NULL,

  tao_luc       INTEGER NOT NULL,

  PRIMARY KEY (workspace_id, ngay, loai)
) STRICT;

-- "Lưu theo ngày, **xem lại được**" (d.336) = một danh sách đi lùi theo ngày.
-- `(ngay DESC, loai DESC)` khớp đúng thứ tự keyset của đường đọc `GET /v1/bao-cao`
-- (không `OFFSET` — nếp đã chốt), và nó là thứ tự **toàn phần** vì `(ngay, loai)`
-- đã là khoá duy nhất trong một workspace.
CREATE INDEX ix_bao_cao_ngay ON bao_cao (workspace_id, ngay DESC, loai DESC);

-- ===================================================================
-- Trigger: một báo cáo đã sinh là **bất biến**
-- ===================================================================
-- Nếp `tg_thong_bao_noi_dung_bat_bien` của 0012/0019, cùng lý do: sửa chữ của một
-- báo cáo đã gửi cho chủ là viết lại lịch sử. Mục 15 đòi mọi hành động có dấu vết,
-- và một báo cáo là **dấu vết** của một ngày — khác hẳn `trong_tam` dưới đây, vốn
-- là một **đề xuất** và ghi đè được.
--
-- Cả bốn cột của bảng đều nằm trong danh sách, nên trên thực tế bảng này **chỉ
-- thêm**: không còn cột nào `UPDATE` được. Viết tường minh từng cột chứ không một
-- trigger `BEFORE UPDATE ON bao_cao` trần, để một lượt sau thêm một cột mốc có
-- thật (vd `doc_luc` của chủ) thì nó không bị khoá theo.
CREATE TRIGGER tg_bao_cao_bat_bien
BEFORE UPDATE OF noi_dung_md, du_lieu_json, ngay, loai, tao_luc ON bao_cao
FOR EACH ROW WHEN
  NEW.noi_dung_md <> OLD.noi_dung_md
  OR NEW.du_lieu_json <> OLD.du_lieu_json
  OR NEW.ngay <> OLD.ngay
  OR NEW.loai <> OLD.loai
  OR NEW.tao_luc <> OLD.tao_luc
BEGIN
  SELECT RAISE(ABORT, 'INVALID_INPUT: bao cao da sinh thi khong sua duoc');
END;

-- ===================================================================
-- B. `trong_tam` — 3 việc trọng tâm của một ngày
-- ===================================================================
--
-- ## Vì sao nó trỏ tới TICKET, không một dòng chữ tự do
--
-- d.331 nói handoff tối đọc "3 trọng tâm hôm nay: **đạt hay chưa** (theo **trạng
-- thái các ticket được gắn là trọng tâm**)". Tức "đạt hay chưa" **không** phải một
-- ô ai đó tick: nó đọc từ `ticket.trang_thai`. Một trọng tâm là một dòng chữ tự do
-- thì câu d.331 không cài được, và handoff tối sẽ phải hỏi lại người đề xuất.
--
-- ## `thu_tu BETWEEN 1 AND 3`
--
-- d.324 nói **3** việc, nên con số nằm trong một `CHECK`, không trong một lời khai
-- ở tầng trên: tầng trên có thể bị đi quanh bằng một đường ghi thứ hai.
--
-- ## Ghi đè được — và đó là KHÁC `bao_cao`
--
-- `trong_tam` của một ngày là một **đề xuất**, không một dấu vết: `coordinator`
-- sửa lại đề xuất của chính nó trong ngày là việc bình thường. Nên bảng này
-- **không** có trigger bất biến, và đường ghi thay cả bộ 3 bằng một `DELETE` + ba
-- `INSERT` trong cùng một `batch()`. (Dòng `bao_cao` và dòng `thong_bao` thì ngược
-- lại — hai bảng ấy đã có trigger cấm sửa.)

CREATE TABLE trong_tam (
  workspace_id  TEXT    NOT NULL REFERENCES workspace(id),

  -- Ngày trên tường `YYYY-MM-DD` — cùng dạng và cùng múi giờ với `bao_cao.ngay`.
  ngay          TEXT    NOT NULL,

  -- d.324: **3** việc. Xem khối trên.
  thu_tu        INTEGER NOT NULL CHECK (thu_tu BETWEEN 1 AND 3),

  ticket_id     TEXT    NOT NULL REFERENCES ticket(id),

  -- Ghi chú của người đề xuất ("vì sao việc này là trọng tâm"). Tuỳ chọn: d.324
  -- không đòi nó, và một trường bắt buộc không có trong SPEC là một rào tự dựng.
  ghi_chu       TEXT,

  -- **Ai ghi** — mục 15 (mọi hành động có dấu vết). `NULL` = chủ tự ghi; một
  -- `agent_id` = agent đề xuất (d.324 gọi tên `coordinator`). Không gộp hai ca
  -- thành một chuỗi: khoá thật thì tra được agent, chuỗi thì không.
  agent_id      TEXT    REFERENCES agent(id),

  tao_luc       INTEGER NOT NULL,

  PRIMARY KEY (workspace_id, ngay, thu_tu),

  -- Cùng một ticket không chiếm hai trong ba ô: ba ô là **ba việc**, và một danh
  -- sách "3 trọng tâm" mà hai dòng trỏ cùng chỗ thì chỉ còn hai trọng tâm.
  UNIQUE (workspace_id, ngay, ticket_id)
) STRICT;

-- Đường đọc thật: "trọng tâm của **một ngày**" — báo cáo sáng (d.324) và handoff
-- tối (d.331) đều hỏi đúng câu đó, sắp theo `thu_tu`. Đi trọn trong khoá chính
-- `(workspace_id, ngay, thu_tu)`, nên **không** thêm một index thứ hai cho nó.
--
-- Index dưới đây là cho câu **ngược**: "ticket này có đang là trọng tâm của ngày
-- nào không" — đường mà trang chi tiết ticket và phép kiểm "cùng workspace" dùng.
-- Không có nó thì câu ngược phải quét cả bảng.
CREATE INDEX ix_trong_tam_ticket ON trong_tam (workspace_id, ticket_id, ngay);

-- ===================================================================
-- Trigger: `workspace_id` phải khớp `ticket.workspace_id`
-- ===================================================================
-- **Vì sao TRIGGER, không khoá ngoài phức hợp.** Hướng tốt hơn là
-- `(workspace_id, ticket_id) REFERENCES ticket(workspace_id, id)` — một ràng buộc
-- cấu trúc thật, không một trigger phải nhớ viết. SQLite cho làm vậy với một bảng
-- **mới** như bảng này, nhưng chỉ khi bảng **cha** có một `UNIQUE` hoặc `PRIMARY
-- KEY` đúng trên `(workspace_id, id)`.
--
-- `ticket` **không** có: 0001 khai `id TEXT PRIMARY KEY` và chỉ một unique khác là
-- `ux_ticket_so ON ticket (project_id, so)`. Thêm một `UNIQUE (workspace_id, id)`
-- cho `ticket` thì phải `ALTER`/dựng lại bảng ticket đang có dữ liệu thật — đúng
-- thứ 0002 đã cân nhắc và bỏ, và `DROP TABLE` nằm trong danh sách cấm
-- `CLAUDE.md`. Nên: trigger, cùng khuôn và cùng thông điệp với 4 cặp trigger của
-- 0002.
--
-- Lệch thì ABORT: một dòng `trong_tam` mang workspace A trỏ vào ticket của
-- workspace B là một trọng tâm đi xuyên workspace (lệch SPEC mục 1, 18), tức báo
-- cáo sáng của chủ này kể một ticket của chủ khác.
--
-- Quy ước `RAISE(ABORT, '<MÃ LỖI>: <mô tả>')` để `loi-d1.ts` tách được mã lỗi.
--
-- Kiểm **cả hai** khoá ngoài. `ticket_id` là `NOT NULL` nên vế của nó không cần
-- kẹp `IS NOT NULL`; `agent_id` thì cho phép NULL (chủ tự ghi), nên vế của nó
-- phải tự kẹp — so `NULL <> (SELECT …)` cho ra NULL, tức `WHEN` không bật, tức
-- trigger im lặng bỏ qua (cùng cái bẫy mà 0012 đã khai).

CREATE TRIGGER tg_trong_tam_ws_them
BEFORE INSERT ON trong_tam
FOR EACH ROW WHEN
  NEW.workspace_id <> (SELECT workspace_id FROM ticket WHERE id = NEW.ticket_id)
  OR (NEW.agent_id IS NOT NULL
     AND NEW.workspace_id <> (SELECT workspace_id FROM agent WHERE id = NEW.agent_id))
BEGIN
  SELECT RAISE(ABORT, 'INVALID_INPUT: trong tam phai cung workspace voi ticket va agent');
END;

CREATE TRIGGER tg_trong_tam_ws_sua
BEFORE UPDATE ON trong_tam
FOR EACH ROW WHEN
  NEW.workspace_id <> (SELECT workspace_id FROM ticket WHERE id = NEW.ticket_id)
  OR (NEW.agent_id IS NOT NULL
     AND NEW.workspace_id <> (SELECT workspace_id FROM agent WHERE id = NEW.agent_id))
BEGIN
  SELECT RAISE(ABORT, 'INVALID_INPUT: trong tam phai cung workspace voi ticket va agent');
END;
