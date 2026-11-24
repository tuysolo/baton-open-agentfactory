# Migration D1 của Baton

Mỗi file là một bước, đặt tên `NNNN_<mo-ta>.sql`, áp theo thứ tự tên file.
**Chỉ thêm file mới, không sửa file đã áp.**

| File | Nội dung |
|---|---|
| `0001_khung_loi.sql` | workspace, agent, project, agent_project, agent_permission, bo_dem, ticket, ticket_link, ticket_label, ticket_history, comment |
| `0002_workspace_khop_va_index.sql` | Trigger buộc `workspace_id` của 4 bảng con khớp `ticket.workspace_id`; index `ix_ticket_du_an_uu_tien`, `ix_project_ten`, `ix_agent_ten_id` |
| `0003_ticket_trang_thai.sql` | `ticket.chu_tu_lam`, `ticket.trong_tay_tu_luc`, `comment.xoa_luc`; index danh sách của mục 13, 14 |
| `0004_luot_giao.sql` | Bảng `luot_giao` (SPEC mục 5, 19.1, 19.5): 6 trạng thái, 2 loại, brief riêng của lượt, hạn phản hồi, lý do trả lại, `luot_truoc_id`; `ux_luot_giao_mo`, `ux_luot_giao_so`, `ix_luot_giao_nguoi_nhan`, `ix_luot_giao_ticket`, `ix_luot_giao_han_phan_hoi`; trigger khớp workspace |
| `0005_bao_cao_nop.sql` | **Báo cáo nộp** của lượt (SPEC mục 5, 19.2): `ket_qua` (`done`/`partial`/`blocked`), 5 cột `bc_*` (Đã làm · Kiểm chứng · Nhánh và commit · Rủi ro, điều cần xem kỹ · Việc phát sinh), `nop_luc`. Không thêm index |
| `0009_bang_chung.sql` | Bảng `evidence` (SPEC mục 7, 19.3, 19.7, 19.11, 19.12 câu 5): 6 loại, `xac_minh` (`pending`/`passed`/`failed`/`not_required`/`pushed`/`merged`), `gui_luc` bắt buộc, 4 cột rút lại, mốc thử lại 5 phút + mốc theo dõi 7 ngày; `ix_evidence_ticket`, `ix_evidence_thu_lai`, `ix_evidence_theo_doi`; trigger khớp workspace, chặn DELETE và chặn sửa nội dung (d.222) |
| `0010_bang_chung_chua_merge.sql` | "Chưa merge sau 7 ngày" (SPEC 19.7): `evidence.chua_merge_luc` (nhãn, = lúc dừng theo dõi) và `evidence.chua_merge_bao_moc` (**mốc** chống bắn lặp của "Telegram báo 1 lần", = `theo_doi_den_luc` của cửa sổ vừa hết hạn — cùng nếp `phien.canh_bao_tin_hieu_luc` của 0008); hai trigger buộc hai cột chỉ dùng cho `commit` và chỉ khi đã dừng theo dõi. Không index mới: "dừng theo dõi" nghĩa là `theo_doi_den_luc = NULL`, tức dòng **rời** `ix_evidence_theo_doi` |
| `0011_can_review_lai_luc.sql` | **Mốc** của cờ "cần review lại" (SPEC 19.3 d.494, 19.6 d.522, 19.11 d.555): `ticket.can_review_lai_luc` = lúc cờ **chuyển từ tắt sang bật**, và không nhích khi cờ còn bật — 19.6 d.522 đòi "cờ 'cần review lại' **quá 24 giờ**", mà một cờ 0/1 không đo được "quá 24 giờ". Hai trigger buộc **cờ và mốc cùng có hoặc cùng không**. Không index mới: truy vấn "có cờ" lọc bằng `co_can_review_lai = 1` và đã đi `ix_ticket_co_co` (0003); cột này chỉ được đọc **sau khi** dòng đã được chọn |
| `0012_thong_bao.sql` | **Kho thông báo trong app** (SPEC mục 12 d.339 "chuông"; mục 6 d.196 + 19.12 câu 46): bảng `thong_bao` — `loai` (đúng các gạch "Bắn khi" của d.341–346, cộng `chua_merge_7_ngay` của 19.7; `phien_dung` và `phien_loi` là **hai** mã để d.348 tắt riêng được), `noi_dung` tiếng Việt đã dựng xong, bốn khoá liên quan (`phien_id`/`ticket_id`/`agent_id`/`bang_chung_id`, cho NULL — d.347 dựng link từ đó), `tao_luc`, `doc_luc` (NULL = chưa đọc), `gui_telegram_luc` (NULL — **phần 7** mới ghi). `ix_thong_bao_moi` (workspace, tạo lúc, id) cho chuông; `ix_phien_canh_bao` (partial: phiên **còn mở**) cho Cron 5 phút của câu 46. Trigger khớp workspace cho cả bốn khoá, và `tg_thong_bao_noi_dung_bat_bien` (một tin đã nói với chủ thì không viết lại; `doc_luc`/`gui_telegram_luc` vẫn sửa được) |

| `0013_can_chu.sql` | **Lõi dữ liệu Cần Chủ** (SPEC mục 8, 19.8, 19.12 câu 4 và 18): bảng `can_chu` — `ma_so` (`T-số`, tăng dần **toàn workspace** qua `bo_dem` phạm vi `workspace` khoá `'ask'`), `project_id` **cho NULL = "Chung"** (câu 4: Chung **không phải một dự án**), `muc`/`loai`/`trang_thai` CHECK đúng 3/4/3 mã, `boi_canh`, `han_luc`, và trường riêng theo loại (`ly_do_de_xuat` cho `decision`, `lenh` + `can_tty` cho `run_command`) mỗi cái kèm **một CHECK tương đương** ("chỉ loại này được có" **và** "loại này phải có"); `trung_voi_can_chu_id` là **khoá thật** cho cờ "có thể trùng T-x"; `CHECK (loai <> 'fyi' OR muc <> 'urgent')` là lớp thứ hai của 19.8. Ba bảng con: `can_chu_phuong_an` (nhãn A–E, **1–3 dòng** ép bằng số dấu `\n`, `ux_*_nhan`, `ux_*_thu_tu`, `ux_*_de_xuat` riêng phần ⇒ **đúng một** phương án đề xuất), `can_chu_file` (`loai` là khoá `file`/`link`), `can_chu_ticket` (bảng nối "ticket liên quan là **nhiều**", `ix_can_chu_ticket_nguoc` cho chiều ngược). Index: `ux_can_chu_ma_so`, `ix_can_chu_khoi` (3 khối của d.249), `ix_can_chu_trung` (riêng phần `open`). Trigger khớp workspace cho cả 4 bảng, **và** `tg_phien_can_chu_them`/`_sua` trả nợ chỗ cắm `phien.can_chu_id` của 0006. **Không** cột `qua_han` — 19.8 nói quá hạn không đổi mức, nên nó là dẫn xuất |

| `0021_can_chu_tra_loi_tu_do.sql` | **Mục `decision` gửi được một câu trả lời TỰ DO** (mục 8 d.244 "và/hoặc chữ tự do" vs d.259 + 19.9 d.539 "bắt buộc chọn 1 phương án" — `cau-hoi-spec.md` **#121**, chỗ **nới** theo yêu cầu trực tiếp của chủ 11/10). `DROP` rồi `CREATE` lại `tg_can_chu_xu_ly_them`/`_sua` của 0015 **y nguyên trừ mệnh đề 6** (`resolved` + `decision` ⇒ phải có `phuong_an_da_chon_id`). Không thay bằng một mệnh đề mới: **mệnh đề 1** đã ép `resolved` ⇔ có `ket_qua` cho mọi loại, nên "không phương án thì phải có `ket_qua`" đã được ép sẵn; thêm `AND ket_qua IS NULL` là một mệnh đề không bao giờ bật. Không chạm bảng, không chạm dữ liệu, không sửa 0015 |

| `0023_can_chu_lenh_moi_loai.sql` | **Mục Cần Chủ MỌI LOẠI đều mang được lệnh** (mục 8 d.250 "lệnh có nút Copy" — viết chung cho mọi thẻ — so với d.237 chỉ nói `run_command` **bắt buộc** có lệnh; `cau-hoi-spec.md` **#130**, lỗi thật chủ gặp 13/10: lệnh của mục `decision` bị **bỏ im lặng**). Hai CHECK **mức bảng** của 0013 (`(loai = 'run_command') = (lenh IS NOT NULL)`, `loai = 'run_command' OR can_tty = 0`) không gỡ được mà không dựng lại bảng, tức một `DROP TABLE can_chu` — nằm trong danh sách cấm (cùng lý lẽ 0015, 0016). Nên **chỉ thêm** hai cột: `lenh_kem` (lệnh của loại **khác** `run_command`) và `can_tty_kem`; `lenh`/`can_tty` của 0013 giữ nguyên nghĩa "lệnh bắt buộc của `run_command`". `tg_can_chu_lenh_kem_them`/`_sua` ép **mỗi dòng đúng một chỗ** có lệnh và không có cờ TTY treo. Đường đọc gộp bằng `COALESCE(ct.lenh, ct.lenh_kem)` ở `COT_MUC`, nên mọi màn hình và mọi lệnh CLI vẫn thấy **một** trường `lenh`. `COMMAND_REQUIRED` (d.287) và bảng nút d.257–262 **không đổi** |

| `0026_cai_dat_thong_bao_bao_mat.sql` | **Công tắc từng loại thông báo + tin bảo mật tài khoản** (SPEC mục 12 d.348, d.350; 19.12 câu 3, 6 — BAT-16). Bảng `cai_dat_thong_bao` (không dòng = bật; CHECK không nhận mã `bao_mat_tai_khoan`). `thong_bao.bao_mat` (mã sự kiện; tin bảo mật mượn `loai = 'can_chu_do'`, buộc `uu_tien = 'khan'`) và `thong_bao.bo_qua_gui_luc` (mốc "không gửi vì chủ tắt", chỉ đặt một lần, cấm trên tin bảo mật/tin đã gửi). Dựng lại `ix_thong_bao_cho_gui` thêm `bo_qua_gui_luc IS NULL`; mở rộng `tg_thong_bao_noi_dung_bat_bien` cho `bao_mat`. **Không** dựng lại bảng `thong_bao`. Rollback: `rollback/0026_cai_dat_thong_bao_bao_mat.rollback.sql` — thư mục con, **không** tự áp |

| `0027_bang_chung_bao_cao.sql` | **Bằng chứng "Báo cáo" (`bao_cao`) + cờ "ticket không code"** (BAT-37 việc 2, T-31 câu 3.4 A, `cau-hoi-spec.md` #161). `ticket.khong_code` (NOT NULL DEFAULT 0, CHECK 0/1; chỉ chủ đổi; cổng coi ticket là không code khi cờ dự án **hoặc** cờ ticket bật). `evidence.bao_cao_nguon` (dấu báo cáo + nguồn ký `reviewer`/`manager`/`coordinator`/`owner`; NULL = không phải báo cáo) và `evidence.bao_cao_reviewer` (báo cáo reviewer độc lập, bắt buộc khi nguồn `manager`). **Không** dựng lại bảng `evidence`: báo cáo mượn `loai = 'note'` (có nội dung) hoặc `'file'` (chỉ đường dẫn); mọi đường đọc map về `bao_cao` qua `api/src/loai-bang-chung.ts`. Trigger `tg_evidence_bao_cao_them` (tổ hợp hợp lệ) và `tg_evidence_bao_cao_bat_bien` (d.222). Rollback: `rollback/0027_bang_chung_bao_cao.rollback.sql` — thư mục con, **không** tự áp |

| `0028_can_chu_tu_dong_xac_nhan.sql` | **Mục xác nhận tự sinh tự đóng khi ticket sang Xong** (BAT-40, `cau-hoi-spec.md` #163, Chủ chốt T-38 = A, T-43 = A; SPEC mục 7, 8, 19.12 câu 57). `DROP` rồi `CREATE` lại `tg_can_chu_xu_ly_them`/`_sua` của 0021 **y nguyên trừ mệnh đề 7**: nay thêm vế `AND NEW.xac_nhan_ticket_id IS NULL`, tức chỉ mục `review` **tạo tay** mới bắt buộc Đạt/Cần sửa khi `resolved`; mục **tự sinh** (mốc 0016) được `resolved` với `ket_luan_review` NULL (kết quả "ticket đã Xong"). Không chạm bảng, CHECK, dữ liệu. Có test so văn bản trigger với 0021. Rollback: `rollback/0028_can_chu_tu_dong_xac_nhan.rollback.sql` — thư mục con, **không** tự áp |

| `0029_ban_do_du_an.sql` | **Bản đồ dự án lượt 1 — dữ liệu** (SPEC 20.1, Chủ chốt T-127 = A 04/11). Chỉ thêm: `project.uu_tien` (1–5, mặc định 3), `project.dang_day`, `project.duy_tri` (0/1, mặc định 0), `project.ten_ngan` (≤ 24 ký tự, NULL = tên đầy đủ); `ticket.khoi_lon` (1–99/NULL), `ticket.doi` (0–100/NULL); `workspace.gioi_han_wip` (1–10, mặc định 3). Trigger `tg_project_duy_tri_them/_sua` (`duy_tri = 1 ⇒ dang_day = 0`) và `tg_ticket_doi_them/_sua` (`doi` ⇒ có `khoi_lon`). Bảng chỉ-thêm `project_history` (lịch sử trường dự án + WIP; `project_id` NULL = dòng WIP) + `ix_project_history_du_an` + 3 trigger (không sửa, không xoá, khớp workspace). **Không** dựng lại bảng; không index cho đếm `dang_day`. Rollback: `rollback/0029_ban_do_du_an.rollback.sql` — thư mục con, **không** tự áp, giữ nguyên `project_history` |

Thư mục `rollback/` chứa file hoàn tác **chạy tay** (cần Chủ duyệt). `readD1Migrations`
và `wrangler d1 migrations apply` chỉ đọc `*.sql` ở thư mục này, không đọc thư mục con.

Bảng trên **chưa có dòng cho `0006`–`0008`** (phiên, hoạt động, kế hoạch,
`phien.error_luc`) — sót của các lượt phần 2, không thuộc phạm vi lượt này.

Phần 4 lượt 2 và phần sau thêm migration mới cho **đường xử lý** mục Cần Chủ
(kết quả, bỏ qua, mở lại — 19.9), Nhật ký quyết định (mục 10) và hồ sơ dự án.

## Vì sao mọi lệnh GHI đi qua Durable Object

D1 **không có giao dịch tương tác**: không mở được một transaction rồi đọc, quyết
định, rồi ghi trong cùng giao dịch. Chỉ có `batch()` — một nhóm câu lệnh biết
trước, cùng thành hoặc cùng hỏng.

Mọi luật của SPEC đều là đọc-kiểm-ghi: cấp số ticket kế tiếp (mục 4, "không tái
dùng"), kiểm cổng bằng chứng trước khi vào Xong (mục 7), "mỗi ticket tối đa 1
lượt `worker` mở" (mục 19.1), cấp `T-số` (mục 8). Làm thẳng trên D1 thì hai
request song song cùng đọc rồi cùng ghi → hai ticket cùng số.

Nên mỗi workspace có **một Durable Object `WorkspaceGate`** làm cửa ghi duy nhất:
DO chạy đơn luồng nên các lệnh ghi tự xếp hàng, phần quyết định chạy trong DO,
phần ghi gom vào một `env.DB.batch()`. Lệnh ĐỌC đi thẳng D1, không qua DO.

## Thời điểm và kiểu dữ liệu

- Mọi thời điểm là **epoch milliseconds** (`INTEGER`). Giờ Việt Nam (UTC+7) chỉ
  là chuyện hiển thị — SPEC mục 0 nguyên tắc 8, mục 14.
- Mọi bảng dùng `STRICT` để SQLite từ chối kiểu sai ngay tại DB.
- Boolean là `INTEGER` 0/1 có `CHECK`.
- `workspace_id` có ở **mọi** bảng dữ liệu từ đầu, kể cả khi v0.1 chỉ có một
  workspace — SPEC mục 1, 18.

## Luật SPEC được ép ở tầng DB (không chỉ ở code)

| Luật SPEC | Cách ép |
|---|---|
| Mục 2 — mã dự án 2–6 chữ A–Z, duy nhất trong workspace | `CHECK (length(ma) BETWEEN 2 AND 6)` + `ux_project_ma`; định dạng A–Z kiểm ở `@baton/shared` (`MAU_MA_DU_AN`) |
| Mục 2 — mã dự án **không đổi được sau khi tạo** | trigger `tg_project_ma_bat_bien` |
| Mục 4 — tiêu đề 1–200 ký tự | `CHECK (length(tieu_de) BETWEEN 1 AND 200)` |
| Mục 4 — số ticket tăng dần, **không tái dùng** | `bo_dem` + trigger `tg_bo_dem_chi_tang` + `ux_ticket_so`; xoá ticket là xoá mềm (`xoa_luc`), không hạ bộ đếm |
| Mục 4 — lịch sử **chỉ thêm, không sửa không xoá** | trigger `tg_ticket_history_khong_sua`, `tg_ticket_history_khong_xoa` |
| Mục 4 — 7 trạng thái cố định, 5 mức ưu tiên | `CHECK (trang_thai IN (...))`, `CHECK (uu_tien IN (...))` |
| Mục 4 + 19.4 — "điều phối" là loại liên kết riêng | `ticket_link.loai IN ('parent','related','blocks','dieu_phoi')` |
| Mục 3, 15 — token **chỉ lưu dạng băm** | bảng `agent` không có cột token gốc; chỉ `token_bam`, `token_bon_cuoi`, `token_tao_luc`, `token_thu_hoi_luc` |
| Mục 7 — "bắt buộc review" mặc định bật | `project.bat_buoc_review INTEGER NOT NULL DEFAULT 1` |
| Mục 1, 18 — dữ liệu **tách theo workspace**: không nối ticket xuyên workspace | `0002`: trigger `tg_ticket_link_ws_*`, `tg_ticket_label_ws_*`, `tg_comment_ws_*`, `tg_ticket_history_ws_them` buộc `workspace_id` khớp `ticket.workspace_id` (0001 chỉ có hai khoá ngoài **rời nhau**, không buộc chúng khớp) |
| Mục 5 + 19.1 — mỗi ticket tối đa **1 lượt `work` mở** và **1 lượt `review` mở** | `0004`: index UNIQUE riêng phần `ux_luot_giao_mo (ticket_id, loai) WHERE trang_thai IN ('pending','in_progress')`; cửa ghi kiểm thêm để trả `ASSIGNMENT_OPEN` kèm thông điệp tiếng Việt |
| Mục 5 — `returned` **bắt buộc có lý do** | `0004`: `CHECK (trang_thai <> 'returned' OR ly_do IS NOT NULL)` |
| Mục 5 — đúng **6** mã trạng thái lượt, **2** mã loại | `0004`: `CHECK (trang_thai IN (...))`, `CHECK (loai IN ('work','review'))` |
| 19.5 — **số lượt tăng** trong phạm vi ticket, không tái dùng | `0004`: `ux_luot_giao_so (workspace_id, ticket_id, so_luot)`; cấp số `max+1` nằm **cùng batch** với dòng lượt trong cửa ghi |
| Mục 7 (d.222) — bằng chứng **không sửa, không xoá**, chỉ rút lại được | `0009`: trigger `tg_evidence_khong_xoa` (chặn mọi DELETE), `tg_evidence_noi_dung_bat_bien` (chặn sửa loại, ticket, người gửi, `gui_luc` và mọi giá trị của sáu dòng bảng d.204–211), `tg_evidence_rut_mot_chieu` (rút rồi không gỡ rút được). UPDATE **vẫn mở** cho kết quả xác minh — đó là kết luận của server, không phải nội dung người gửi khẳng định |
| Mục 7 (d.206) — commit chỉ **`merged`** mở cổng, `pushed` thì không | `0009`: `xac_minh` giữ `pushed` và `merged` là **hai** giá trị khác nhau; CHECK không cho `commit` nhận `passed`, nên không có giá trị "đạt" thứ hai để cổng hiểu nhầm |
| 19.7 — Telegram báo **1 lần** cho "chưa merge sau 7 ngày" | `0010`: `chua_merge_bao_moc` là **mốc** (giá trị `theo_doi_den_luc` mà tin đã bắn cho), không một cờ boolean — cùng nếp `phien.canh_bao_tin_hieu_luc`/`error_luc` của `0007`/`0008`. Quét lại bao nhiêu lần trên cùng cửa sổ cũng không bắn thêm; một cửa sổ theo dõi **mới** thì mốc khác → bắn lại, đúng câu "gửi lại cùng commit để theo dõi thêm 7 ngày" |
| 19.7 — nhãn chỉ dành cho commit, và chỉ khi **đã dừng theo dõi** | `0010`: `tg_evidence_chua_merge_them` / `tg_evidence_chua_merge_sua` chặn `chua_merge_luc` trên loại khác `commit`, và chặn `chua_merge_bao_moc` khi chưa có `chua_merge_luc` (một mốc đã bắn mà không có nhãn sẽ **tắt tin vĩnh viễn** cho dòng đó, không để lại dấu nào) |
| 19.3 d.494 + 19.6 d.522 — cờ "cần review lại" phải đo được **"quá 24 giờ"** | `0011`: `tg_ticket_can_review_lai_them` / `tg_ticket_can_review_lai_sua` buộc `co_can_review_lai = 1` **tương đương** `can_review_lai_luc IS NOT NULL`. Một dòng cờ bật mà không mốc làm d.522 không tính được và **hỏng im lặng** (chỉ báo dự án mãi không lên 🟡) |
| Mục 6 d.196 + 19.12 câu 46 — phiên đứng/lỗi bắn **1** tin, hồi lại rồi đứng lần nữa thì bắn **lại** | `0007`/`0008`: `phien.canh_bao_tin_hieu_luc` là **mốc** (giá trị mà tin gần nhất đã bắn cho), `phien.error_luc` là mốc **lần vào `error`** (19.12 câu 50). `0012`: `ix_phien_canh_bao` cho Cron 5 phút quét toàn hệ, và bảng `thong_bao` là chỗ tin **đi vào** — nên "đã bắn 1 tin" kiểm chứng được bằng dữ liệu, không bằng con số trả về của một lệnh. Luật ở hàm thuần `canhBaoDung`, và nó chạy **lần hai** trong cửa ghi (`WorkspaceGate.ghiMocCanhBao`) để hai lượt cron chồng nhau vẫn chỉ ra một tin |
| Mục 12 — một tin đã bắn là một thứ **đã nói với chủ** | `0012`: `tg_thong_bao_noi_dung_bat_bien` chặn sửa `loai`, `noi_dung`, `tao_luc` và bốn khoá liên quan; chỉ `doc_luc` và `gui_telegram_luc` còn mở. Cùng lý lẽ của `tg_evidence_noi_dung_bat_bien` (d.222) |
| Mục 8 — `T-số` tăng dần **toàn workspace**, không tái dùng | `0013`: `bo_dem` phạm vi `workspace` khoá `'ask'` + `tg_bo_dem_chi_tang` (0001) + `ux_can_chu_ma_so (workspace_id, ma_so)`; cấp số nằm **cùng batch** với dòng `can_chu` trong cửa ghi, nên 6 request song song ra 6 số khác nhau (có ca đua thật trong `test/can-chu.test.ts`) |
| Mục 8 — `decision` có **2–5** phương án, mỗi phương án **1–3 dòng**, nhãn A, B, C… | `0013`: số **2–5** là luật của cả nhóm nên ở `kiemPhuongAn` (`OPTIONS_REQUIRED`); luật của **từng** dòng thì DB ép hết — `CHECK (nhan IN ('A'…'E'))` (trần 5 ⇒ không có nhãn `F`), `CHECK (length(noi_dung) - length(replace(noi_dung, char(10), '')) <= 2)` cho "1–3 dòng", `ux_can_chu_phuong_an_nhan` cho nhãn duy nhất, `ux_can_chu_phuong_an_de_xuat` (riêng phần `WHERE de_xuat = 1`) cho **đúng một** phương án đề xuất |
| Mục 8 — `run_command` **phải** có lệnh; `decision` **phải** có lý do đề xuất | `0013`: hai CHECK **tương đương** `(loai = 'run_command') = (lenh IS NOT NULL)` và `(loai = 'decision') = (ly_do_de_xuat IS NOT NULL)` — vừa chặn "thiếu" (lớp thứ hai của `COMMAND_REQUIRED` / `OPTIONS_REQUIRED`), vừa chặn "loại khác mà có" (một mục `fyi` mang `lenh` là dữ liệu vô nghĩa mà phần 6 sẽ dựng nút Copy từ đó) |
| 19.8 — loại `Chỉ để biết` **tối đa 🟡** | `0013`: `CHECK (loai <> 'fyi' OR muc <> 'urgent')`. Lớp thứ nhất là `haMucNeuCan` (tự hạ **và báo lại cho agent** trong kết quả trả về — nửa thứ hai của câu, nửa dễ mất); CHECK là lớp thứ hai, để một đường ghi ở lượt sau quên hạ thì vỡ ngay tại DB chứ không lặng lẽ tạo một mục trái SPEC |
| 19.12 câu 4 — "Chung" là **giá trị rỗng**, không một dự án | `0013`: `can_chu.project_id` **cho phép NULL**, và **không** có dòng `project` nào tên "Chung" (có ca kiểm đúng điều đó). Bộ lọc "Chung" của mục 8 là `project_id IS NULL` |
| Mục 1, 18 — mục Cần Chủ không đi xuyên workspace | `0013`: `tg_can_chu_ws_*` (dự án, agent tạo, mục "có thể trùng"), `tg_can_chu_phuong_an_ws_*`, `tg_can_chu_file_ws_*`, `tg_can_chu_ticket_ws_*` (bảng nối buộc **ba** workspace khớp). Cùng khuôn 0002/0004/0009/0012: `REFERENCES` không buộc `workspace_id` khớp |
| Mục 6 d.183 — `waiting_owner` phải trỏ tới một mục Cần Chủ **có thật** | `0006`: `CHECK (trang_thai <> 'waiting_owner' OR can_chu_id IS NOT NULL)` canh "có khoá". `0013`: `tg_phien_can_chu_them`/`_sua` canh "khoá đó **trỏ tới một mục có thật, cùng workspace**" — SQLite không có `ADD CONSTRAINT` nên đây là cách duy nhất không phải dựng lại bảng `phien` (xem `quyet-dinh.md` 03/10) |
| 20.1 — khoảng giá trị của Bản đồ (`uu_tien` 1–5, `ten_ngan` ≤ 24, `khoi_lon` 1–99, `doi` 0–100, WIP 1–10, cờ 0/1) | `0029`: CHECK cột của từng `ADD COLUMN`; lớp thứ nhất là các hàm `kiem*` của `@baton/shared` (`ban-do.ts`) — thông điệp `INVALID_INPUT` kèm khoảng |
| 20.1 — "Bật `duy_tri` thì tự tắt `dang_day`" | `0029`: `tg_project_duy_tri_them`/`_sua` chặn `duy_tri = 1 AND dang_day = 1`; cửa ghi (`handlerSuaDuAn`) tự tắt `dang_day` cùng batch |
| 20.1 — "Đặt `doi` cho ticket không có `khoi_lon`: `INVALID_INPUT`" | `0029`: `tg_ticket_doi_them`/`_sua`; cửa ghi xét trên ticket **sau khi áp cả lệnh**, tắt `khoi_lon` thì xoá `doi` cùng lệnh |
| 20.1 → mục 4 — lịch sử trường dự án **chỉ thêm** | `0029`: `tg_project_history_khong_sua`, `tg_project_history_khong_xoa`, `tg_project_history_ws_them` |
| Mục 3 — hai hàng "không bao giờ" của bảng quyền | `agent_permission.viec` CHECK **không nhận** `delete_anything` và `resolve_ask`: không có chỗ nào trong dữ liệu để ghi đè hai hàng đó |

## Phân trang: keyset (cursor), không `OFFSET`

Mốc nghiệm thu là **200 dự án + 200.000 ticket**, danh sách và Tổng quan dưới
1 giây. `LIMIT ... OFFSET 100000` buộc SQLite đếm qua 100.000 dòng mỗi lần, nên
Baton không dùng `OFFSET`.

Thứ tự chuẩn của danh sách ticket, cũng là khoá cursor:

```
ORDER BY hang_uu_tien ASC, tao_luc DESC, id DESC
```

`hang_uu_tien` là số (0 Khẩn … 4 Không) để thứ tự ưu tiên của SPEC mục 4 nằm
ngay trong index, không phải sắp bằng `CASE` lúc chạy. `CHECK` trên `ticket` giữ
`hang_uu_tien` luôn khớp `uu_tien`.

Trang sau không dùng `OFFSET` mà lọc theo đúng bộ ba đó. **Hướng trộn** (`ưu tiên`
tăng, `tao_luc` và `id` giảm) nên không viết được bằng một lần so bộ giá trị:

```sql
WHERE hang_uu_tien > ?                                  -- mức ưu tiên sau
   OR (hang_uu_tien = ? AND (tao_luc, id) < (?, ?))     -- trong cùng mức
ORDER BY hang_uu_tien, tao_luc DESC, id DESC
```

`id` có trong khoá để thứ tự là **toàn phần** — hai ticket cùng ưu tiên, cùng
`tao_luc` vẫn có thứ tự duy nhất, nên cursor không bỏ sót và không trả trùng.

**Hướng của `ORDER BY` phải khớp hướng của index.** Viết
`ORDER BY hang_uu_tien, tao_luc, id` (cả ba tăng) thì SQLite vẫn khớp tiền tố
index cho `WHERE`, nhưng phải `USE TEMP B-TREE FOR LAST 2 TERMS OF ORDER BY`, tức
sắp lại trong bộ nhớ. `test/phan-trang.test.ts` đo bằng `EXPLAIN QUERY PLAN` và
giữ lại cả ca sai đó để lượt sau không rơi vào.

Danh sách **dự án** và **agent** dùng khoá đơn giản hơn, cùng một hướng nên so
được bằng bộ giá trị:

```sql
WHERE workspace_id = ? AND (ten, id) > (?, ?)  ORDER BY ten, id
```

Gom nhóm theo `nhom` cho sidebar là việc của UI sau khi lấy dữ liệu: `nhom` cho
phép `NULL` nên đưa vào khoá cursor chỉ làm phức tạp mà không được gì.

## Index nào phục vụ truy vấn nào

| Index | Truy vấn | SPEC |
|---|---|---|
| `ix_ticket_du_an` (workspace, project, trạng thái, hạng ưu tiên, tạo lúc ↓, id ↓) | Danh sách ticket của một dự án, lọc theo trạng thái, gom theo trạng thái hoặc xem bảng; cursor nằm trọn trong index | 14 |
| `ix_ticket_ws_trang_thai` (workspace, trạng thái, hạng ưu tiên, tạo lúc ↓, id ↓) | Danh sách "Tất cả dự án"; đếm Đang làm / Chờ kiểm chứng cho Tổng quan | 11, 14 |
| `ix_ticket_chiu_trach_nhiem` | Lọc theo người chịu trách nhiệm | 14 |
| `ix_ticket_han` (partial: có hạn) | Ticket sắp tới hạn, quá hạn | 4, 11 |
| `ix_ticket_xong_luc` (partial: đã xong) | "Vừa xong" và "việc xong 24 giờ qua" ở Tổng quan và báo cáo sáng | 11 |
| `ix_ticket_cap_nhat` | "Cập nhật cuối" ở Bản đồ dự án | 9 |
| `ix_ticket_ma_cu` (partial) | Tìm ticket theo mã cũ sau khi nhập | 16 |
| `ix_ticket_da_xoa` (partial) | Thùng rác, khôi phục trong 30 ngày | 4 |
| `ux_ticket_so` (project, số) | Tra ticket theo mã `MÃ-số`; bảo đảm số không trùng | 1, 4 |
| `ix_ticket_link_nguoc` (đến, loại, từ) | Ticket con, "bị chặn", ticket dự án của một ticket điều phối | 4, 19.4 |
| `ix_ticket_label_theo_nhan` | Lọc theo nhãn, kể cả nhãn hệ thống "xong không bằng chứng" | 14 |
| `ix_ticket_history_ticket` (ticket, lúc ↓) | Lịch sử một ticket, mới nhất trước | 4 |
| `ix_comment_ticket` (ticket, tạo lúc ↓) | 10 bình luận cuối của `baton show` | 13 |
| `ux_agent_token_bam` | Xác thực: tra agent theo băm token, một lần tra khoá cho mỗi request | 3, 15 |
| `ux_agent_ten` | Tên agent duy nhất trong workspace | 3 |
| `ux_project_ma` | Mã dự án duy nhất trong workspace ("Mã dự án đã có") | 2 |
| `ix_project_trang_thai` (workspace, trạng thái, nhóm, tên) | Sidebar: dự án theo nhóm, bỏ dự án `archived` | 2, 14 |
| `ix_agent_project_theo_du_an` | "Agent nào được vào dự án này" | 3 |
| `ix_ticket_du_an_uu_tien` (workspace, project, hạng ưu tiên, tạo lúc ↓, id ↓) — **0002** | "Mọi ticket của một dự án, sắp theo ưu tiên", **không** lọc trạng thái. `ix_ticket_du_an` dẫn đầu bằng `trang_thai` nên không dùng được cho `ORDER BY` khi không có bộ lọc đó | 4, 14 |
| `ix_project_ten` (workspace, tên, id) — **0002** | Liệt kê dự án, keyset theo `(ten, id)`. `ix_project_trang_thai` dẫn đầu bằng `trang_thai` nên không dùng được cho "mọi dự án sắp theo tên" | 2, 14 |
| `ix_agent_ten_id` (workspace, tên, id) — **0002** | Liệt kê agent ("Đội agent"), keyset theo `(ten, id)` | 3, 11 |
| `ix_luot_giao_nguoi_nhan` (workspace, người nhận, trạng thái, ticket) — **0004** | `phamViLuotGiao` ("ticket của lượt mình" ở mỗi lệnh ghi của `worker`); `baton tasks` | 3, 5, 13 |
| `ix_luot_giao_ticket` (workspace, ticket, loại, trạng thái) — **0004** | Chuỗi lượt giao của một ticket; "ticket này đã có lượt mở chưa" | 5, 14, 19.1 |
| `ix_luot_giao_han_phan_hoi` (partial: còn `pending` và có hạn) — **0004** | Lượt "Không phản hồi" ở Tổng quan | 5, 19.6 |
| `ix_evidence_ticket` (workspace, ticket, gửi lúc, id) — **0009** | Cổng Xong đọc **mọi bằng chứng của một ticket theo thứ tự thời gian**; `gui_luc` ngay sau `ticket_id` vì 19.3 hỏi "review có sau commit/deploy **cuối cùng** không" | 7, 19.3 |
| `ix_evidence_thu_lai` (partial: `pending` và có mốc thử lại) — **0009** | Cron quét bằng chứng đến hạn **thử lại** (5 phút, tối đa 3 lần). **Không** dẫn đầu bằng `workspace_id`: Cron chạy cho toàn hệ. Câu Cron thật (`quetThuLai`, P3 lượt 3) thêm `rut_luc IS NULL` làm điều kiện **lọc** — vẫn đi index, có ca `EXPLAIN QUERY PLAN` đo đúng câu đó | 7 (d.220, d.222) |
| `ix_thong_bao_moi` (workspace, tạo lúc, id) — **0012** | Chuông trong app đọc tin của **một** workspace, mới nhất trước. Dẫn đầu bằng `workspace_id` (khác hai index Cron ở trên) vì đây là đường đọc của chủ trong một workspace | 12 (d.339) |
| `ix_phien_canh_bao` (partial: `trang_thai <> 'closed'`) — **0012** | Cron **mỗi 5 phút** quét các phiên có thể đang đứng hoặc lỗi (mục 6 d.196, 19.12 câu 46). Không dẫn đầu bằng `workspace_id`: Cron chạy toàn hệ. Partial theo "còn mở" chứ không theo `stalled`, vì `stalled` là trạng thái **dẫn xuất, không ghi DB** (19.12 câu 42) — số phiên mở luôn nhỏ dù bảng `phien` có bao nhiêu dòng. Khoá dẫn đầu `tin_hieu_cuoi_luc` vì lượt quét sắp theo nó: phiên **im lâu nhất** đi trước, nên khi đầy trần thì phần bị đẩy sang lượt sau là phiên mới có tín hiệu | 6 (d.196), 19.12 câu 46 |
| `ix_evidence_theo_doi` (partial: commit `pushed` và có mốc 7 ngày) — **0009** | Cron kiểm lại commit `pushed` (mỗi 10 phút trong 7 ngày) và dừng theo dõi khi quá hạn — **một** truy vấn cho **hai** việc, mốc quá hạn đi trước trong `ORDER BY`. Cũng không dẫn đầu bằng `workspace_id`. "Dừng theo dõi" = `theo_doi_den_luc = NULL`, tức dòng **rời** index này, nên không có lượt quét thứ hai nào thấy lại nó | 7 (d.221), 19.7 |

| `ux_can_chu_ma_so` (workspace, `ma_so`) — **0013** | `T-số` duy nhất trong workspace; cũng là đường tra một mục theo `T-số` (`baton result T-x`, mục 13) | 8, 13 |
| `ix_can_chu_khoi` (workspace, trạng thái, mức, hạn, tạo lúc, id) — **0013** | **Màn hình Cần Chủ: 3 khối 🔴/🟡/⚪, trong khối sắp theo HẠN rồi LÚC TẠO** (d.249). Ba khoá đầu lọc bình đẳng, ba khoá sau là đúng `ORDER BY` và **cùng hướng** ⇒ không `TEMP B-TREE`. `muc` đứng **sau** `trang_thai` vì cả ba khối cùng lọc `open`, nên một index phục vụ cả ba lần truy vấn. **Không** partial `WHERE trang_thai = 'open'`: bảng "Đã xử lý" (d.251) dùng chung tiền tố `(workspace_id, trang_thai)` | 8 (d.249, d.251) |
| `ix_can_chu_trung` (workspace, tiêu đề, tạo lúc) — **0013**, partial `WHERE trang_thai = 'open'` | Cờ "**có thể trùng T-x**" (mục 8 phần Lỗi) — chạy ở **mỗi lần tạo**, nên nó không được là một lần quét bảng. `tieu_de` ngay sau `workspace_id` vì là điều kiện bình đẳng chọn lọc nhất; `tao_luc` cho cửa sổ 24 giờ. Partial theo "**đang Chờ**" vì SPEC chỉ soi mục `Chờ`, và số mục Chờ luôn nhỏ (đó là chỗ chủ phải đọc hết mỗi ngày) — cùng lý lẽ `ix_phien_canh_bao`. `project_id` **không** trong khoá: nó cho NULL ("Chung") nên chỉ làm index phình, và nó là điều kiện **lọc** sau khi index đã chọn dòng | 8 (phần Lỗi) |
| `ix_project_history_du_an` (dự án, lúc ↓, id ↓) — **0029** | Lịch sử trường Bản đồ của một dự án, mới nhất trước (`GET /v1/du-an/:id/lich-su`), keyset `(luc, id)` — cùng nếp `ix_ticket_history_ticket` | 20.1, 4 |
| `ix_can_chu_ticket_nguoc` (ticket, mục) — **0013** | Chiều ngược của bảng nối: "ticket này đang bị mục Cần Chủ nào chờ" (trang chi tiết ticket, phần 6), và lượt 2 cần nó để "tự thêm bình luận vào **mọi** ticket liên quan" (d.280) | 8 (d.240, d.280) |

Mọi index trên `ticket` đều là **partial** `WHERE xoa_luc IS NULL` (trừ các index
dành riêng cho ticket đã xoá): ticket đã xoá mềm không nằm trong index danh sách,
nên index không phình theo thùng rác.

## Chỗ chưa có index, và vì sao

Command menu `Cmd/Ctrl+K` tìm theo **chuỗi con** của tiêu đề (SPEC mục 14;
`cau-hoi-spec.md` #8 chốt tạm là chỉ mã ticket, tiêu đề ticket, T-số). `LIKE
'%x%'` không dùng được B-tree. Phạm vi dữ liệu là 200.000 dòng nên quét tiêu đề
còn chịu được; nếu chậm thì thêm bảng FTS5 ở một migration sau — chưa làm vì SPEC
nói rõ không cần tìm toàn văn ở v0.1.
