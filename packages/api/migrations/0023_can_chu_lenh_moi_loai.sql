-- ===================================================================
-- 0023 — mục Cần Chủ MỌI LOẠI đều mang được lệnh
-- SPEC mục 8 (d.237, d.250, bảng d.257–262, phần Lỗi d.287); `cau-hoi-spec.md` #130
-- ===================================================================
--
-- ## Lỗi thật chủ gặp 13/10
--
-- CoS tạo một mục `decision` kèm `--command "..."`. Server **chỉ** giữ lệnh cho
-- loại `run_command`, nên lệnh bị bỏ **im lặng**: thẻ nói "chạy lệnh này" mà
-- không có lệnh nào trên thẻ, và không một mã lỗi nào cho biết lệnh đã mất.
--
-- ## Đọc SPEC
--
-- * d.250 viết **chung cho mọi thẻ**: "Mỗi thẻ hiện đủ: mã, dự án, loại, tiêu đề,
--   bối cảnh …, phương án thành nút …, **lệnh có nút Copy**, file có link, ticket
--   liên quan." Câu này không giới hạn loại nào.
-- * d.237 chỉ nói `Chủ chạy lệnh` **bắt buộc** có lệnh. Nó **không** nói loại
--   khác không được có lệnh.
-- * d.287 `COMMAND_REQUIRED` không đổi: `run_command` thiếu lệnh vẫn là lỗi.
-- * Bảng d.257–262 (nút trả lời của từng loại) **không đổi**: lệnh chỉ là một
--   khối hiện thêm trên thẻ, không đổi nút chính và không đổi điều kiện bật nút.
--
-- Không có câu SPEC nào cấm loại khác mang lệnh ⇒ chốt tạm (`cau-hoi-spec.md`
-- #130): **mọi loại đều mang được lệnh**, và lệnh hiện trong khối code có nút
-- Copy trên thẻ của mọi loại.
--
-- ## Vì sao HAI CỘT MỚI chứ không nới hai CHECK của 0013
--
-- 0013 ép hai luật ở mức **bảng**:
--   CHECK ((loai = 'run_command') = (lenh IS NOT NULL))
--   CHECK (loai = 'run_command' OR can_tty = 0)
-- SQLite **không gỡ được** một CHECK mức bảng; cách duy nhất là dựng lại bảng,
-- tức một `DROP TABLE can_chu` — nằm trong **danh sách cấm** của `CLAUDE.md`
-- (xoá file/dữ liệu phải có Chủ duyệt), và cùng lý lẽ đã ghi ở đầu 0015 và 0016.
--
-- Nên migration này **chỉ thêm**:
--   * `lenh_kem`     — lệnh của mục **không phải** `run_command`;
--   * `can_tty_kem`  — cờ "chạy ở terminal thật" của chính lệnh đó.
--
-- Hai cột `lenh` / `can_tty` của 0013 **giữ nguyên nghĩa**: chúng là lệnh **bắt
-- buộc** của `run_command`, vẫn được cặp CHECK của 0013 canh đủ hai vế. Nên ở mỗi
-- dòng **đúng một** trong hai chỗ có lệnh — không hai nguồn sự thật. Đường đọc
-- gộp lại bằng `COALESCE(ct.lenh, ct.lenh_kem)` ở `COT_MUC`
-- (`packages/api/src/doc-can-chu.ts`), nên mọi màn hình và mọi lệnh CLI nhìn thấy
-- **một** trường `lenh` như trước, bất kể loại.
--
-- Luật liên-cột đi bằng **trigger** (SQLite chỉ cho `ADD COLUMN` mang ràng buộc
-- của chính cột đó) — cùng cách 0008, 0010, 0015, 0016 và 0022 đã làm.

ALTER TABLE can_chu ADD COLUMN lenh_kem TEXT
  CHECK (lenh_kem IS NULL OR length(lenh_kem) BETWEEN 1 AND 20000);

ALTER TABLE can_chu ADD COLUMN can_tty_kem INTEGER NOT NULL DEFAULT 0
  CHECK (can_tty_kem IN (0, 1));

-- -------------------------------------------------------------------
-- Luật liên-cột của hai cột mới
-- -------------------------------------------------------------------
-- Luật 1: `lenh_kem` **chỉ** cho loại khác `run_command`. Lệnh của `run_command`
--         ở cột `lenh` của 0013 và không được chép sang đây: hai chỗ cùng mang
--         lệnh cho một dòng là hai nguồn sự thật, và `COALESCE` sẽ chọn im lặng.
-- Luật 2: `can_tty_kem = 0` khi không có `lenh_kem` — một cờ "chạy ở terminal
--         thật" không có lệnh nào để chạy là dữ liệu vô nghĩa (cùng lý lẽ
--         `CHECK (loai = 'run_command' OR can_tty = 0)` của 0013).

CREATE TRIGGER tg_can_chu_lenh_kem_them
BEFORE INSERT ON can_chu
FOR EACH ROW WHEN
  (NEW.lenh_kem IS NOT NULL AND NEW.loai = 'run_command')
  OR (NEW.can_tty_kem = 1 AND NEW.lenh_kem IS NULL)
BEGIN
  SELECT RAISE(ABORT, 'INVALID_INPUT: lenh_kem chi danh cho loai khac run_command');
END;

CREATE TRIGGER tg_can_chu_lenh_kem_sua
BEFORE UPDATE OF lenh_kem, can_tty_kem, loai ON can_chu
FOR EACH ROW WHEN
  (NEW.lenh_kem IS NOT NULL AND NEW.loai = 'run_command')
  OR (NEW.can_tty_kem = 1 AND NEW.lenh_kem IS NULL)
BEGIN
  SELECT RAISE(ABORT, 'INVALID_INPUT: lenh_kem chi danh cho loai khac run_command');
END;
