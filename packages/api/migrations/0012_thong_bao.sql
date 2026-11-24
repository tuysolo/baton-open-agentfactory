-- ===================================================================
-- 0012 — kho thông báo **trong app** (bảng `thong_bao`)
-- SPEC mục 12 d.339 ("Kênh v0.1: Telegram … + **trong app (chuông)**"),
-- mục 6 d.196 + 19.12 câu 46, 19.7
-- ===================================================================
--
-- 19.12 câu 46, chốt của chủ, nguyên văn gạch đầu dòng thứ tư: "Thông báo **ghi
-- vào kho thông báo trong app**; **gửi Telegram thật là phần 7**."
--
-- Trước migration này hệ **không có kho** nào: `thong-bao.ts` dựng được nội dung
-- tin rồi trả nó ra kết quả của một lệnh, và tin đó mất ngay khi response đóng.
-- Hệ quả là chữ "chuông trong app" của d.339 không có chỗ nào để đọc, và không có
-- cách nào kiểm chứng "đã bắn 1 tin" ngoài việc tin vào con số của một lệnh.
--
-- ## `gui_telegram_luc` khai từ bây giờ, phần 7 mới ghi
--
-- Cột để NULL ở lượt này, và đường gửi (`guiThongBao`) **chưa cài** — danh sách
-- cấm của `CLAUDE.md`: không gửi Telegram/email thật tới ai. Khai sẵn vì phần 7
-- sẽ cần đúng một mốc "đã gửi ra kênh ngoài lúc nào", và một mốc chứ không một cờ:
-- giờ yên lặng 23:00–07:00 của d.347 là một luật **về thời điểm gửi**, nên nó phải
-- đọc được "tin này đã ra kênh ngoài lúc nào" để biết tin nào còn nợ.
--
-- Cùng nếp "mốc, không cờ" đã chốt bốn lần trong dự án này (xem `quyet-dinh.md`):
-- `ticket.trong_tay_tu_luc` (19.1), `phien.canh_bao_tin_hieu_luc` / `phien.error_luc`
-- (mục 6 d.196, 0007/0008), `evidence.chua_merge_bao_moc` (19.7, 0010),
-- `ticket.can_review_lai_luc` (19.3, 0011).
--
-- `doc_luc` cũng là mốc, cùng lý do: chuông cần "chưa đọc" (NULL) và cần biết
-- **lúc nào** chủ đã xem, để một lượt sau làm được "đánh dấu đã đọc tới mốc T".

CREATE TABLE thong_bao (
  id                TEXT    PRIMARY KEY,
  workspace_id      TEXT    NOT NULL REFERENCES workspace(id),

  -- Đúng các gạch đầu dòng "Bắn khi" của mục 12 d.341–346, cộng một mã cho 19.7.
  -- `phien_dung` và `phien_loi` là **hai mã**, không một: d.342 viết "Phiên đứng
  -- **hoặc** lỗi" nhưng mục 11 và 19.6 xếp hai thứ đó cạnh nhau như hai việc ngang
  -- hàng, và 19.12 câu 42 chốt rằng gộp `error` vào `stalled` là "che một thông tin
  -- cụ thể hơn bằng một thông tin mơ hồ hơn". Chủ cần đọc trong chuông là agent
  -- **báo lỗi** hay agent **im** — nên hai mã.
  --
  -- `d.348 "Tắt từng loại trong Cài đặt"` sẽ lọc theo chính cột này (phần 7).
  loai              TEXT    NOT NULL CHECK (loai IN (
                      'can_chu_do',           -- d.341: Cần Chủ 🔴 mới, hoặc 🔴 quá 2 giờ
                      'phien_dung',           -- d.342 + mục 6 d.196: phiên `stalled`
                      'phien_loi',            -- d.342 + mục 6 d.196: phiên `error`
                      'luot_khong_phan_hoi',  -- d.343
                      'bang_chung_truot',     -- d.344
                      'chua_merge_7_ngay',    -- 19.7 (dừng theo dõi, báo 1 lần)
                      'ticket_xong',          -- d.345 (gom, tối đa 1 tin mỗi 15 phút)
                      'bao_cao_sang',         -- d.346
                      'bao_cao_toi'           -- d.346
                    )),

  -- Nội dung **tiếng Việt, đã dựng xong** (mục 0.1: thông báo hiển thị nhãn Việt).
  -- Lưu chữ, không lưu khuôn + tham số: một tin đã bắn là một thứ đã nói với chủ,
  -- và nó không được đổi nghĩa khi nhãn hay khuôn chữ đổi ở một lượt sau.
  noi_dung          TEXT    NOT NULL,

  -- Các khoá liên quan — cho phép NULL, vì mỗi loại tin gắn vào thứ khác nhau.
  -- d.347: "Mỗi tin có link thẳng tới đúng thẻ hoặc ticket" — bốn cột này là thứ
  -- phần 6 dựng link từ đó, nên chúng là khoá thật (REFERENCES), không chữ tự do.
  phien_id          TEXT    REFERENCES phien(id),
  ticket_id         TEXT    REFERENCES ticket(id),
  agent_id          TEXT    REFERENCES agent(id),
  bang_chung_id     TEXT    REFERENCES evidence(id),

  tao_luc           INTEGER NOT NULL,
  -- NULL = **chưa đọc** (chuông của d.339).
  doc_luc           INTEGER,
  -- NULL = **chưa ra kênh ngoài**. Phần 7 ghi — xem đầu file.
  gui_telegram_luc  INTEGER
) STRICT;

-- ===================================================================
-- Index — hai truy vấn thật
-- ===================================================================

-- (a) **Chuông đọc tin của MỘT workspace, mới nhất trước.** Dẫn đầu bằng
-- `workspace_id` vì đây là đường đọc của chủ trong một workspace (khác hẳn các
-- index của Cron ở 0009, vốn quét toàn hệ nên không dẫn đầu như vậy).
-- `id` để thứ tự là **toàn phần**: hai tin cùng `tao_luc` (một lượt quét cron bắn
-- nhiều tin trong cùng một millisecond là chuyện thường) vẫn có thứ tự xác định.
CREATE INDEX ix_thong_bao_moi ON thong_bao (workspace_id, tao_luc, id);

-- (b) **Cron quét các phiên có thể đang đứng hoặc lỗi** — mục 6 d.196 + 19.12 câu
-- 46 (Cron Trigger mỗi 5 phút). Không nằm trên bảng `thong_bao` mà trên `phien`:
-- đây là index cho **đường phát hiện** mà câu 46 vừa chốt, và nó thuộc lượt này.
--
-- Cùng hai lựa chọn của `ix_evidence_thu_lai` (0009), cùng lý do:
--   * **không dẫn đầu bằng `workspace_id`** — cron chạy cho toàn hệ, dẫn đầu như
--     vậy thì một lượt quét phải đi qua từng workspace một,
--   * **riêng phần** (`WHERE trang_thai <> 'closed'`) — `stalled` là trạng thái
--     **dẫn xuất, không ghi DB** (19.12 câu 42), nên không lọc trước được bằng
--     trạng thái. Thứ lọc được là "phiên còn mở", và số phiên mở luôn nhỏ dù bảng
--     `phien` có bao nhiêu triệu dòng (mốc nghiệm thu 200.000 ticket, 19.12 câu 1).
--
-- `tin_hieu_cuoi_luc` dẫn đầu phần khoá vì lượt quét sắp theo nó: phiên **im lâu
-- nhất** đi trước, nên khi một lượt quét đầy trần thì phần bị đẩy sang lượt sau là
-- các phiên mới có tín hiệu — đúng thứ ít cần cảnh báo nhất, và không dòng nào bị
-- bỏ lại mãi.
CREATE INDEX ix_phien_canh_bao
  ON phien (tin_hieu_cuoi_luc, id)
  WHERE trang_thai <> 'closed';

-- ===================================================================
-- Trigger: khoá liên quan phải cùng workspace với tin
-- ===================================================================
-- Cùng lý do và cùng khuôn với 4 cặp trigger của 0002, cặp của 0004 và cặp của
-- 0009: `workspace_id` và các khoá ngoài là những cột **rời nhau**, nên không có
-- gì buộc chúng khớp, và một thông báo mang workspace khác phiên/ticket của nó là
-- một tin đi xuyên workspace (lệch SPEC mục 1, 18) — tức chuông của chủ này hiện
-- một tin về dữ liệu của chủ khác.
--
-- Quy ước thông điệp `RAISE(ABORT, '<MÃ LỖI>: <mô tả>')` để `loi-d1.ts` tách được
-- mã lỗi ra khỏi thông điệp SQLite.
--
-- Bốn khoá đều cho phép NULL, nên mỗi điều kiện phải tự kẹp `IS NOT NULL`: so
-- `NULL <> (SELECT …)` cho ra NULL, tức WHEN không bật, tức trigger im lặng bỏ qua.

CREATE TRIGGER tg_thong_bao_ws_them
BEFORE INSERT ON thong_bao
FOR EACH ROW WHEN
  (NEW.phien_id IS NOT NULL
     AND NEW.workspace_id <> (SELECT workspace_id FROM phien WHERE id = NEW.phien_id))
  OR (NEW.ticket_id IS NOT NULL
     AND NEW.workspace_id <> (SELECT workspace_id FROM ticket WHERE id = NEW.ticket_id))
  OR (NEW.agent_id IS NOT NULL
     AND NEW.workspace_id <> (SELECT workspace_id FROM agent WHERE id = NEW.agent_id))
  OR (NEW.bang_chung_id IS NOT NULL
     AND NEW.workspace_id <> (SELECT workspace_id FROM evidence WHERE id = NEW.bang_chung_id))
BEGIN
  SELECT RAISE(ABORT, 'INVALID_INPUT: thong bao phai cung workspace voi phien, ticket, agent va bang chung');
END;

CREATE TRIGGER tg_thong_bao_ws_sua
BEFORE UPDATE ON thong_bao
FOR EACH ROW WHEN
  (NEW.phien_id IS NOT NULL
     AND NEW.workspace_id <> (SELECT workspace_id FROM phien WHERE id = NEW.phien_id))
  OR (NEW.ticket_id IS NOT NULL
     AND NEW.workspace_id <> (SELECT workspace_id FROM ticket WHERE id = NEW.ticket_id))
  OR (NEW.agent_id IS NOT NULL
     AND NEW.workspace_id <> (SELECT workspace_id FROM agent WHERE id = NEW.agent_id))
  OR (NEW.bang_chung_id IS NOT NULL
     AND NEW.workspace_id <> (SELECT workspace_id FROM evidence WHERE id = NEW.bang_chung_id))
BEGIN
  SELECT RAISE(ABORT, 'INVALID_INPUT: thong bao phai cung workspace voi phien, ticket, agent va bang chung');
END;

-- ===================================================================
-- Trigger: nội dung một tin đã bắn là **bất biến**
-- ===================================================================
-- Một tin đã vào kho là một thứ đã nói với chủ. Sửa `loai`, `noi_dung`, `tao_luc`
-- hay các khoá liên quan là viết lại lịch sử của chuông — cùng lý do mà d.222 giữ
-- bằng chứng bất biến (trigger `tg_evidence_noi_dung_bat_bien` của 0009).
--
-- Bảng **vẫn phải UPDATE được** cho đúng hai mốc có thật: `doc_luc` (chủ xem
-- chuông) và `gui_telegram_luc` (phần 7 gửi ra kênh ngoài). Hai cột đó không nằm
-- trong danh sách `UPDATE OF` dưới đây.

CREATE TRIGGER tg_thong_bao_noi_dung_bat_bien
BEFORE UPDATE OF loai, noi_dung, tao_luc, phien_id, ticket_id, agent_id, bang_chung_id
ON thong_bao
FOR EACH ROW WHEN
  NEW.loai <> OLD.loai
  OR NEW.noi_dung <> OLD.noi_dung
  OR NEW.tao_luc <> OLD.tao_luc
  OR NEW.phien_id IS NOT OLD.phien_id
  OR NEW.ticket_id IS NOT OLD.ticket_id
  OR NEW.agent_id IS NOT OLD.agent_id
  OR NEW.bang_chung_id IS NOT OLD.bang_chung_id
BEGIN
  SELECT RAISE(ABORT, 'INVALID_INPUT: noi dung thong bao khong sua duoc');
END;
