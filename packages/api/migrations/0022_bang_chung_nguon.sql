-- ===================================================================
-- 0022 — ba chỗ chặn của cổng Xong trong cách dùng thật (13/10)
-- SPEC mục 7 (bảng loại bằng chứng d.206, d.208; "Cổng vào Xong" d.213–217);
-- 19.7; 19.11
-- ===================================================================
--
-- Ngày 13/10 chủ dùng thật và **không ticket nào** chuyển được sang Xong. Hai
-- trong ba chỗ chặn cần cột mới, và cả hai đều là cùng một đòi hỏi: **nói ra
-- nguồn của một kết luận**, thay vì để người đọc tưởng kết luận đó tới từ một
-- nguồn mạnh hơn thực tế.
--
-- ## A. Commit merge CỤC BỘ — `merged_cuc_bo`, `nguon_xac_minh`
--
-- d.206 kiểm commit "qua **GitHub API**". Repo của chủ ff-merge vào nhánh mặc
-- định **trên máy** và chưa push, nên GitHub **không biết** commit đó: kết luận
-- mãi mãi là "không tìm thấy" ⇒ không bao giờ `merged` ⇒ cổng d.214 không bao giờ
-- mở. Tức luật d.206 đúng chữ nhưng **không có đường đi tới Xong** cho cách làm
-- việc thật của chủ.
--
-- Cách nhỏ nhất, không nới cổng thành vô nghĩa:
--   * `merged_cuc_bo` — **lời khai của người gửi**: CLI đã tự chạy
--     `git merge-base --is-ancestor <sha> <nhánh mặc định>` ngay trong repo và nó
--     **đúng**. Đây là **nội dung bằng chứng** (người gửi khẳng định), nên nó bất
--     biến như mọi trường nội dung khác của d.204–211.
--   * `nguon_xac_minh` — **kết luận của server**: `github` khi GitHub trả lời
--     được, `local` khi phải dựa vào lời khai trên. GitHub vẫn là nguồn **ưu
--     tiên**; chỉ rơi về `local` khi GitHub không biết commit đó (hoặc server chưa
--     có `GITHUB_TOKEN` nên không hỏi được ai).
--
-- Vì sao **hai** cột chứ không một: cột thứ nhất là sự thật về *điều người gửi
-- khai*, cột thứ hai là sự thật về *điều server dựa vào*. Gộp một cột thì không
-- phân biệt được "đã kiểm qua GitHub" với "tin lời CLI" — mà đó đúng là điều phải
-- nhìn thấy được trên UI và trong API, để không ai tưởng một commit chưa push đã
-- được GitHub xác nhận.
--
-- Hàng rào ở DB (trigger dưới): `nguon_xac_minh = 'local'` **chỉ** ghi được khi
-- `merged_cuc_bo = 1`. Nên không có đường nào để server tự khai "merged theo nguồn
-- local" cho một bằng chứng mà người gửi không khai gì.
--
-- ## B. Review của dự án bắt buộc review — `review_nguon`, `review_bao_cao`
--
-- d.208 đòi `review` do agent `reviewer` **khác người làm** gửi. Nhưng reviewer
-- thật của hệ này là một sub-agent do Manager gọi bằng `claude -p`: nó **không có
-- token Baton**, nên không ai gửi được `review` ĐẠT, và điều kiện phụ của cổng
-- (d.215) không bao giờ mở cho dự án bật "bắt buộc review" (mặc định **bật**).
--
-- Cách nhỏ nhất: cho `manager` ghi `review` **kèm đường dẫn báo cáo của reviewer
-- độc lập** (`review_bao_cao`, **bắt buộc** khi `review_nguon = 'manager'`), và
-- ghi rõ nguồn (`review_nguon`) để người đọc phân biệt được với review do chính
-- agent `reviewer` gửi. Luật "không review việc của chính mình"
-- (`REVIEWER_IS_WORKER`, 19.3 d.496) **không** đổi.
--
-- Cả bốn cột đi bằng `ALTER TABLE … ADD COLUMN`: SQLite không thêm được CHECK vào
-- bảng đã có, nên luật của chúng đi bằng **trigger** — cùng cách 0008 và 0010 đã
-- làm.

ALTER TABLE evidence ADD COLUMN merged_cuc_bo INTEGER NOT NULL DEFAULT 0;
ALTER TABLE evidence ADD COLUMN nguon_xac_minh TEXT;
ALTER TABLE evidence ADD COLUMN review_nguon TEXT;
ALTER TABLE evidence ADD COLUMN review_bao_cao TEXT;

-- -------------------------------------------------------------------
-- 1. Vốn giá trị và sự nhất quán giữa bốn cột
-- -------------------------------------------------------------------
-- Luật 1: `merged_cuc_bo` là 0/1, và chỉ `commit` khai được (lời khai này nói về
--         một nhánh git, nó không có nghĩa cho năm loại kia).
-- Luật 2: `nguon_xac_minh` chỉ nhận `github`/`local`, chỉ cho `commit`, và
--         `local` **đòi** `merged_cuc_bo = 1` — xem khối A ở trên.
-- Luật 3: `review_nguon` chỉ nhận `reviewer`/`manager` và chỉ cho `review`;
--         `manager` **đòi** `review_bao_cao` khác rỗng (đó là cả lý do nó được
--         nhận). `review_bao_cao` không có nghĩa cho loại khác `review`.

CREATE TRIGGER tg_evidence_nguon_them
BEFORE INSERT ON evidence
FOR EACH ROW WHEN
  NEW.merged_cuc_bo NOT IN (0, 1)
  OR (NEW.merged_cuc_bo = 1 AND NEW.loai <> 'commit')
  OR (NEW.nguon_xac_minh IS NOT NULL
      AND (NEW.loai <> 'commit' OR NEW.nguon_xac_minh NOT IN ('github', 'local')))
  OR (NEW.nguon_xac_minh = 'local' AND NEW.merged_cuc_bo <> 1)
  OR (NEW.review_nguon IS NOT NULL
      AND (NEW.loai <> 'review' OR NEW.review_nguon NOT IN ('reviewer', 'manager')))
  OR (NEW.review_nguon = 'manager'
      AND (NEW.review_bao_cao IS NULL OR trim(NEW.review_bao_cao) = ''))
  OR (NEW.review_bao_cao IS NOT NULL AND NEW.loai <> 'review')
BEGIN
  SELECT RAISE(ABORT, 'INVALID_INPUT: nguon bang chung khong hop le');
END;

CREATE TRIGGER tg_evidence_nguon_sua
BEFORE UPDATE OF merged_cuc_bo, nguon_xac_minh, review_nguon, review_bao_cao ON evidence
FOR EACH ROW WHEN
  NEW.merged_cuc_bo NOT IN (0, 1)
  OR (NEW.merged_cuc_bo = 1 AND NEW.loai <> 'commit')
  OR (NEW.nguon_xac_minh IS NOT NULL
      AND (NEW.loai <> 'commit' OR NEW.nguon_xac_minh NOT IN ('github', 'local')))
  OR (NEW.nguon_xac_minh = 'local' AND NEW.merged_cuc_bo <> 1)
  OR (NEW.review_nguon IS NOT NULL
      AND (NEW.loai <> 'review' OR NEW.review_nguon NOT IN ('reviewer', 'manager')))
  OR (NEW.review_nguon = 'manager'
      AND (NEW.review_bao_cao IS NULL OR trim(NEW.review_bao_cao) = ''))
  OR (NEW.review_bao_cao IS NOT NULL AND NEW.loai <> 'review')
BEGIN
  SELECT RAISE(ABORT, 'INVALID_INPUT: nguon bang chung khong hop le');
END;

-- -------------------------------------------------------------------
-- 2. Ba cột **nội dung** vẫn bất biến — SPEC d.222
-- -------------------------------------------------------------------
-- `tg_evidence_noi_dung_bat_bien` của 0009 liệt kê từng cột nội dung bằng tên,
-- nên nó **không** biết ba cột sinh ra ở đây. `merged_cuc_bo`, `review_nguon` và
-- `review_bao_cao` là thứ **người gửi khẳng định** — sửa chúng là thay một bằng
-- chứng khác vào chỗ một bằng chứng đã được xác minh (và có thể đã mở cổng cho một
-- ticket Xong). `nguon_xac_minh` **không** vào đây: nó là kết luận của server, do
-- chặng ghi xác minh đặt (d.219–221), đúng như `xac_minh` và `ma_http`.

CREATE TRIGGER tg_evidence_nguon_bat_bien
BEFORE UPDATE OF merged_cuc_bo, review_nguon, review_bao_cao ON evidence
FOR EACH ROW WHEN
  NEW.merged_cuc_bo <> OLD.merged_cuc_bo
  OR NEW.review_nguon IS NOT OLD.review_nguon
  OR NEW.review_bao_cao IS NOT OLD.review_bao_cao
BEGIN
  SELECT RAISE(ABORT, 'INVALID_INPUT: noi dung bang chung khong sua duoc');
END;
