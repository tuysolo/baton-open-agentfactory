-- Baton v0.1 — migration 0005: báo cáo nộp, nghiệm thu, huỷ lượt
--
-- SPEC mục 5 ("Báo cáo nộp", "Nghiệm thu", `canceled`), 19.2, 19.3, 19.5.
--
-- Migration 0004 đã có đủ cột cho **nghiệm thu** và **trả lại** (`trang_thai`,
-- `ly_do`, `luot_truoc_id`, `dong_luc`). Thiếu đúng một thứ: **báo cáo nộp**.
--
-- SPEC mục 5: "Báo cáo nộp (**có cấu trúc**, bắt buộc khi nộp): Kết quả `done` /
-- `partial` / `blocked`; Đã làm · Kiểm chứng · Nhánh và commit · Rủi ro, điều
-- cần xem kỹ · Việc phát sinh (không tự làm)."
--
-- "Có cấu trúc" nên 5 mục là **5 cột**, không phải một khối markdown:
--   * `ket_qua` quyết trạng thái ticket (19.2), nên phải là một mã kiểm được.
--   * "Việc phát sinh" có đường riêng ("Tạo ticket từ việc phát sinh" — mục 5),
--     nên nó phải đọc được một mình, không phải cắt ra từ chữ.
--
-- Tiền tố `bc_` cho 5 mục báo cáo: bảng `luot_giao` đã mang 8 cột brief không
-- tiền tố, và `pham_vi` của brief rất dễ lẫn với "Kiểm chứng" của báo cáo nếu
-- hai nhóm trộn phẳng vào nhau.

-- ===================================================================
-- 1. Kết quả nộp — SPEC mục 0.1, 5, 19.2
-- ===================================================================
-- Ba mã **nguyên văn bảng mục 0.1**: `done` Xong · `partial` Xong một phần ·
-- `blocked` Không làm được.
--
-- CHECK viết ở mức **cột** (SQLite cho ALTER TABLE ADD COLUMN mang CHECK cột,
-- nhưng không cho thêm CHECK mức bảng — thêm được chỉ bằng cách dựng lại bảng,
-- tức `DROP`, nằm trong danh sách cấm của CLAUDE.md).
--
-- Vì vậy luật "**bắt buộc khi nộp**" (ket_qua NOT NULL khi `trang_thai` là
-- `submitted`/`accepted`/`returned`) **không** ép được ở tầng DB ở migration
-- này; nó nằm ở cửa ghi (`handlerNopBaoCao`), là chặng duy nhất mọi đường ghi
-- đều đi qua.
ALTER TABLE luot_giao ADD COLUMN ket_qua TEXT
  CHECK (ket_qua IS NULL OR ket_qua IN ('done', 'partial', 'blocked'));

-- ===================================================================
-- 2. Năm mục của báo cáo — SPEC mục 5
-- ===================================================================
ALTER TABLE luot_giao ADD COLUMN bc_da_lam          TEXT;
ALTER TABLE luot_giao ADD COLUMN bc_kiem_chung      TEXT;
ALTER TABLE luot_giao ADD COLUMN bc_nhanh_va_commit TEXT;
ALTER TABLE luot_giao ADD COLUMN bc_rui_ro          TEXT;
ALTER TABLE luot_giao ADD COLUMN bc_viec_phat_sinh  TEXT;

-- ===================================================================
-- 3. Mốc nộp — SPEC mục 5, 19.5
-- ===================================================================
-- `dong_luc` (0004) là lúc lượt rời trạng thái mở sang một **kết**
-- (`accepted`/`returned`/`canceled`). Nộp không phải một kết: lượt `submitted`
-- đang **chờ nghiệm thu** (19.1). Nên mốc nộp là một cột riêng.
--
-- Cột này cũng là cửa sổ thời gian của **tỉ lệ đạt lần đầu** (19.5, "30 ngày
-- gần nhất"): mẫu số là "số ticket agent **đã nộp** ít nhất 1 lần".
ALTER TABLE luot_giao ADD COLUMN nop_luc INTEGER;

-- Không thêm index nào. `luot_giao` là bảng ghi nóng nhất của phần 2 và đã mang
-- 5 index; truy vấn tỉ lệ đạt lần đầu lọc theo `(workspace_id,
-- nguoi_nhan_agent_id)` nên đã nằm trong `ix_luot_giao_nguoi_nhan` của 0004,
-- chỉ phải lọc `nop_luc` sau khi tìm. Số lượt của một agent là hàng nghìn, không
-- phải hàng trăm nghìn — đo lại ở phần 6 nếu trang agent chậm.
