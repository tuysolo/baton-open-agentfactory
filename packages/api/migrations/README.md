# Baton D1 migrations

Each file is one step, named `NNNN_<mo-ta>.sql`, applied in file-name order.
**Only add new files, never edit a file that has been applied.**

| File | Contents |
|---|---|
| `0001_khung_loi.sql` | workspace, agent, project, agent_project, agent_permission, bo_dem, ticket, ticket_link, ticket_label, ticket_history, comment |
| `0002_workspace_khop_va_index.sql` | Triggers forcing the `workspace_id` of 4 child tables to match `ticket.workspace_id`; indexes `ix_ticket_du_an_uu_tien`, `ix_project_ten`, `ix_agent_ten_id` |
| `0003_ticket_trang_thai.sql` | `ticket.chu_tu_lam`, `ticket.trong_tay_tu_luc`, `comment.xoa_luc`; list indexes for sections 13, 14 |
| `0004_luot_giao.sql` | Table `luot_giao` (SPEC section 5, 19.1, 19.5): 6 statuses, 2 types, the round's own brief, response deadline, return reason, `luot_truoc_id`; `ux_luot_giao_mo`, `ux_luot_giao_so`, `ix_luot_giao_nguoi_nhan`, `ix_luot_giao_ticket`, `ix_luot_giao_han_phan_hoi`; workspace-match trigger |
| `0005_bao_cao_nop.sql` | **Submitted report** of a round (SPEC section 5, 19.2): `ket_qua` (`done`/`partial`/`blocked`), 5 `bc_*` columns ("Đã làm" (Done) · "Kiểm chứng" (Verification) · "Nhánh và commit" (Branch and commit) · "Rủi ro, điều cần xem kỹ" (Risks, things to look at closely) · "Việc phát sinh" (Follow-up work)), `nop_luc`. No index added |
| `0009_bang_chung.sql` | Table `evidence` (SPEC section 7, 19.3, 19.7, 19.11, 19.12 question 5): 6 types, `xac_minh` (`pending`/`passed`/`failed`/`not_required`/`pushed`/`merged`), required `gui_luc`, 4 withdrawal columns, 5-minute retry marker + 7-day tracking marker; `ix_evidence_ticket`, `ix_evidence_thu_lai`, `ix_evidence_theo_doi`; workspace-match trigger, blocks DELETE and blocks content edits (l.222) |
| `0010_bang_chung_chua_merge.sql` | "Chưa merge sau 7 ngày" (Not merged after 7 days) (SPEC 19.7): `evidence.chua_merge_luc` (label, = when tracking stopped) and `evidence.chua_merge_bao_moc` (the anti-repeat **marker** for "Telegram notifies once", = the `theo_doi_den_luc` of the window that just expired — same pattern as `phien.canh_bao_tin_hieu_luc` of 0008); two triggers force both columns to be used only for `commit` and only once tracking has stopped. No new index: "tracking stopped" means `theo_doi_den_luc = NULL`, i.e. the row **leaves** `ix_evidence_theo_doi` |
| `0011_can_review_lai_luc.sql` | **Marker** of the "cần review lại" (needs re-review) flag (SPEC 19.3 l.494, 19.6 l.522, 19.11 l.555): `ticket.can_review_lai_luc` = when the flag **went from off to on**, and it does not advance while the flag stays on — 19.6 l.522 requires "the 'needs re-review' flag **over 24 hours**", and a 0/1 flag cannot measure "over 24 hours". Two triggers force **flag and marker to both exist or both be absent**. No new index: the "has flag" query filters on `co_can_review_lai = 1` and already uses `ix_ticket_co_co` (0003); this column is only read **after** the row has been selected |
| `0012_thong_bao.sql` | **In-app notification store** (SPEC section 12 l.339 "bell"; section 6 l.196 + 19.12 question 46): table `thong_bao` — `loai` (exactly the "Fires when" bullets of l.341–346, plus `chua_merge_7_ngay` of 19.7; `phien_dung` and `phien_loi` are **two** codes so l.348 can turn them off separately), fully built Vietnamese `noi_dung`, four related keys (`phien_id`/`ticket_id`/`agent_id`/`bang_chung_id`, nullable — l.347 builds the link from them), `tao_luc`, `doc_luc` (NULL = unread), `gui_telegram_luc` (NULL — only **part 7** writes it). `ix_thong_bao_moi` (workspace, created at, id) for the bell; `ix_phien_canh_bao` (partial: sessions **still open**) for the 5-minute Cron of question 46. Workspace-match triggers for all four keys, and `tg_thong_bao_noi_dung_bat_bien` (a message already told to the owner is not rewritten; `doc_luc`/`gui_telegram_luc` can still be updated) |

| `0013_can_chu.sql` | **Needs Owner data core** (SPEC section 8, 19.8, 19.12 questions 4 and 18): table `can_chu` — `ma_so` (`T-number`, increasing **across the workspace** via `bo_dem` scope `workspace` key `'ask'`), `project_id` **nullable, NULL = "Chung" (General)** (question 4: General is **not a project**), `muc`/`loai`/`trang_thai` CHECK exactly 3/4/3 codes, `boi_canh`, `han_luc`, and per-type fields (`ly_do_de_xuat` for `decision`, `lenh` + `can_tty` for `run_command`) each with **an equivalence CHECK** ("only this type may have it" **and** "this type must have it"); `trung_voi_can_chu_id` is a **real key** for the "có thể trùng T-x" (possible duplicate of T-x) flag; `CHECK (loai <> 'fyi' OR muc <> 'urgent')` is the second layer of 19.8. Three child tables: `can_chu_phuong_an` (labels A–E, **1–3 lines** enforced by the count of `\n`, `ux_*_nhan`, `ux_*_thu_tu`, partial `ux_*_de_xuat` ⇒ **exactly one** recommended option), `can_chu_file` (`loai` is the key `file`/`link`), `can_chu_ticket` (join table "related tickets are **many**", `ix_can_chu_ticket_nguoc` for the reverse direction). Indexes: `ux_can_chu_ma_so`, `ix_can_chu_khoi` (the 3 blocks of l.249), `ix_can_chu_trung` (partial on `open`). Workspace-match triggers for all 4 tables, **and** `tg_phien_can_chu_them`/`_sua` pay off the `phien.can_chu_id` placeholder of 0006. **No** `qua_han` column — 19.8 says being overdue does not change the level, so it is derived |

| `0021_can_chu_tra_loi_tu_do.sql` | **A `decision` item can be sent a FREE-TEXT answer** (section 8 l.244 "and/or free text" vs l.259 + 19.9 l.539 "must choose 1 option" — `spec-questions.md` **#121**, a **relaxation** at the owner's direct request on 11 Oct). `DROP` then re-`CREATE` `tg_can_chu_xu_ly_them`/`_sua` of 0015 **unchanged except clause 6** (`resolved` + `decision` ⇒ must have `phuong_an_da_chon_id`). Not replaced by a new clause: **clause 1** already enforces `resolved` ⇔ has `ket_qua` for every type, so "no option means `ket_qua` is required" is already enforced; adding `AND ket_qua IS NULL` would be a clause that never fires. No table touched, no data touched, 0015 not edited |

| `0023_can_chu_lenh_moi_loai.sql` | **Needs Owner items of EVERY TYPE can carry a command** (section 8 l.250 "commands have a Copy button" — written generally for every card — versus l.237 which only says `run_command` **must** have a command; `spec-questions.md` **#130**, a real bug the owner hit on 13 Oct: the command of a `decision` item was **silently dropped**). The two **table-level** CHECKs of 0013 (`(loai = 'run_command') = (lenh IS NOT NULL)`, `loai = 'run_command' OR can_tty = 0`) cannot be removed without rebuilding the table, i.e. a `DROP TABLE can_chu` — which is on the forbidden list (same reasoning as 0015, 0016). So it **only adds** two columns: `lenh_kem` (the command of types **other than** `run_command`) and `can_tty_kem`; `lenh`/`can_tty` of 0013 keep the meaning "the required command of `run_command`". `tg_can_chu_lenh_kem_them`/`_sua` enforce that **each row has a command in exactly one place** and no dangling TTY flag. The read path merges with `COALESCE(ct.lenh, ct.lenh_kem)` in `COT_MUC`, so every screen and every CLI command still sees **one** `lenh` field. `COMMAND_REQUIRED` (l.287) and the button table l.257–262 are **unchanged** |

| `0026_cai_dat_thong_bao_bao_mat.sql` | **Per-type notification switches + account security messages** (SPEC section 12 l.348, l.350; 19.12 questions 3, 6 — BAT-16). Table `cai_dat_thong_bao` (no row = on; CHECK rejects the code `bao_mat_tai_khoan`). `thong_bao.bao_mat` (event code; security messages borrow `loai = 'can_chu_do'`, forcing `uu_tien = 'khan'`) and `thong_bao.bo_qua_gui_luc` (marker "not sent because the owner turned it off", set only once, forbidden on security messages/messages already sent). Rebuilds `ix_thong_bao_cho_gui` adding `bo_qua_gui_luc IS NULL`; extends `tg_thong_bao_noi_dung_bat_bien` to `bao_mat`. Does **not** rebuild the `thong_bao` table. Rollback: `rollback/0026_cai_dat_thong_bao_bao_mat.rollback.sql` — a subdirectory, **not** applied automatically |

| `0027_bang_chung_bao_cao.sql` | **"Báo cáo" (Report) evidence (`bao_cao`) + the "ticket không code" (no-code ticket) flag** (BAT-37 task 2, T-31 question 3.4 A, `spec-questions.md` #161). `ticket.khong_code` (NOT NULL DEFAULT 0, CHECK 0/1; only the owner changes it; the gate treats a ticket as no-code when the project flag **or** the ticket flag is on). `evidence.bao_cao_nguon` (report mark + signing source `reviewer`/`manager`/`coordinator`/`owner`; NULL = not a report) and `evidence.bao_cao_reviewer` (independent reviewer report, required when the source is `manager`). Does **not** rebuild the `evidence` table: a report borrows `loai = 'note'` (has content) or `'file'` (path only); every read path maps back to `bao_cao` via `api/src/loai-bang-chung.ts`. Triggers `tg_evidence_bao_cao_them` (valid combinations) and `tg_evidence_bao_cao_bat_bien` (l.222). Rollback: `rollback/0027_bang_chung_bao_cao.rollback.sql` — a subdirectory, **not** applied automatically |

| `0028_can_chu_tu_dong_xac_nhan.sql` | **Auto-generated confirmation items close themselves when the ticket moves to Done** (BAT-40, `spec-questions.md` #163, the Owner decided T-38 = A, T-43 = A; SPEC sections 7, 8, 19.12 question 57). `DROP` then re-`CREATE` `tg_can_chu_xu_ly_them`/`_sua` of 0021 **unchanged except clause 7**: it now adds the term `AND NEW.xac_nhan_ticket_id IS NULL`, i.e. only **manually created** `review` items must have "Đạt"/"Cần sửa" (Pass/Needs fixing) when `resolved`; **auto-generated** items (marker of 0016) may be `resolved` with `ket_luan_review` NULL (result "ticket đã Xong" (ticket is Done)). No table, CHECK or data touched. There is a test comparing the trigger text with 0021. Rollback: `rollback/0028_can_chu_tu_dong_xac_nhan.rollback.sql` — a subdirectory, **not** applied automatically |

| `0029_ban_do_du_an.sql` | **Project map round 1 — data** (SPEC 20.1, the Owner decided T-127 = A on 04 Nov). Additions only: `project.uu_tien` (1–5, default 3), `project.dang_day`, `project.duy_tri` (0/1, default 0), `project.ten_ngan` (≤ 24 characters, NULL = full name); `ticket.khoi_lon` (1–99/NULL), `ticket.doi` (0–100/NULL); `workspace.gioi_han_wip` (1–10, default 3). Triggers `tg_project_duy_tri_them/_sua` (`duy_tri = 1 ⇒ dang_day = 0`) and `tg_ticket_doi_them/_sua` (`doi` ⇒ has `khoi_lon`). Append-only table `project_history` (history of project fields + WIP; `project_id` NULL = WIP row) + `ix_project_history_du_an` + 3 triggers (no update, no delete, workspace match). Does **not** rebuild tables; no index for counting `dang_day`. Rollback: `rollback/0029_ban_do_du_an.rollback.sql` — a subdirectory, **not** applied automatically, leaves `project_history` in place |

The `rollback/` directory holds undo files that are **run by hand** (require the Owner's approval). `readD1Migrations`
and `wrangler d1 migrations apply` only read `*.sql` in this directory, not subdirectories.

The table above **has no rows yet for `0006`–`0008`** (sessions, activity, plan,
`phien.error_luc`) — an omission of the part 2 rounds, outside the scope of this round.

Part 4 round 2 and later parts add new migrations for the **handling path** of Needs Owner items
(result, skip, reopen — 19.9), the Decision Log (section 10) and the project profile.

## Why every WRITE command goes through a Durable Object

D1 **has no interactive transactions**: you cannot open a transaction, then read, decide,
and write within the same transaction. There is only `batch()` — a group of statements known
in advance that succeed together or fail together.

Every SPEC rule is read-check-write: issuing the next ticket number (section 4, "never
reused"), checking the evidence gate before entering Done (section 7), "each ticket has at most 1
open `worker` round" (section 19.1), issuing the `T-number` (section 8). Done directly on D1, two
parallel requests both read and then both write → two tickets with the same number.

So each workspace has **one Durable Object `WorkspaceGate`** as the single write gate:
a DO runs single-threaded so write commands queue up by themselves, the decision part runs inside the DO,
and the write part is gathered into one `env.DB.batch()`. READ commands go straight to D1, not through the DO.

## Timestamps and data types

- Every timestamp is **epoch milliseconds** (`INTEGER`). Vietnam time (UTC+7) is only
  a display matter — SPEC section 0 principle 8, section 14.
- Every table uses `STRICT` so SQLite rejects wrong types right at the DB.
- Booleans are `INTEGER` 0/1 with a `CHECK`.
- `workspace_id` is in **every** data table from the start, even though v0.1 has only one
  workspace — SPEC sections 1, 18.

## SPEC rules enforced at the DB layer (not only in code)

| SPEC rule | How it is enforced |
|---|---|
| Section 2 — project code is 2–6 letters A–Z, unique within the workspace | `CHECK (length(ma) BETWEEN 2 AND 6)` + `ux_project_ma`; the A–Z format is checked in `@baton/shared` (`MAU_MA_DU_AN`) |
| Section 2 — project code **cannot be changed after creation** | trigger `tg_project_ma_bat_bien` |
| Section 4 — title is 1–200 characters | `CHECK (length(tieu_de) BETWEEN 1 AND 200)` |
| Section 4 — ticket numbers increase, **never reused** | `bo_dem` + trigger `tg_bo_dem_chi_tang` + `ux_ticket_so`; deleting a ticket is a soft delete (`xoa_luc`), the counter is not lowered |
| Section 4 — history is **append-only, no edit, no delete** | triggers `tg_ticket_history_khong_sua`, `tg_ticket_history_khong_xoa` |
| Section 4 — 7 fixed statuses, 5 priority levels | `CHECK (trang_thai IN (...))`, `CHECK (uu_tien IN (...))` |
| Section 4 + 19.4 — "coordination" is its own link type | `ticket_link.loai IN ('parent','related','blocks','dieu_phoi')` |
| Sections 3, 15 — tokens are **stored only as hashes** | table `agent` has no raw token column; only `token_bam`, `token_bon_cuoi`, `token_tao_luc`, `token_thu_hoi_luc` |
| Section 7 — "review required" is on by default | `project.bat_buoc_review INTEGER NOT NULL DEFAULT 1` |
| Sections 1, 18 — data is **separated by workspace**: no linking tickets across workspaces | `0002`: triggers `tg_ticket_link_ws_*`, `tg_ticket_label_ws_*`, `tg_comment_ws_*`, `tg_ticket_history_ws_them` force `workspace_id` to match `ticket.workspace_id` (0001 only has two **separate** foreign keys and does not force them to match) |
| Section 5 + 19.1 — each ticket has at most **1 open `work` round** and **1 open `review` round** | `0004`: partial UNIQUE index `ux_luot_giao_mo (ticket_id, loai) WHERE trang_thai IN ('pending','in_progress')`; the write gate also checks, to return `ASSIGNMENT_OPEN` with a Vietnamese message |
| Section 5 — `returned` **must have a reason** | `0004`: `CHECK (trang_thai <> 'returned' OR ly_do IS NOT NULL)` |
| Section 5 — exactly **6** round status codes, **2** type codes | `0004`: `CHECK (trang_thai IN (...))`, `CHECK (loai IN ('work','review'))` |
| 19.5 — **round numbers increase** within a ticket, never reused | `0004`: `ux_luot_giao_so (workspace_id, ticket_id, so_luot)`; issuing `max+1` is in the **same batch** as the round row in the write gate |
| Section 7 (l.222) — evidence is **not edited, not deleted**, it can only be withdrawn | `0009`: triggers `tg_evidence_khong_xoa` (blocks every DELETE), `tg_evidence_noi_dung_bat_bien` (blocks edits to type, ticket, sender, `gui_luc` and every value of the six rows of the table at l.204–211), `tg_evidence_rut_mot_chieu` (once withdrawn it cannot be un-withdrawn). UPDATE **stays open** for the verification result — that is the server's conclusion, not content the sender asserts |
| Section 7 (l.206) — for a commit only **`merged`** opens the gate, `pushed` does not | `0009`: `xac_minh` keeps `pushed` and `merged` as **two** different values; the CHECK does not let `commit` take `passed`, so there is no second "pass" value for the gate to misread |
| 19.7 — Telegram notifies **once** for "not merged after 7 days" | `0010`: `chua_merge_bao_moc` is a **marker** (the `theo_doi_den_luc` value the message was fired for), not a boolean flag — same pattern as `phien.canh_bao_tin_hieu_luc`/`error_luc` of `0007`/`0008`. However many times the same window is rescanned, nothing more is fired; a **new** tracking window has a different marker → it fires again, matching the sentence "resend the same commit to track for 7 more days" |
| 19.7 — the label is only for commits, and only once **tracking has stopped** | `0010`: `tg_evidence_chua_merge_them` / `tg_evidence_chua_merge_sua` block `chua_merge_luc` on types other than `commit`, and block `chua_merge_bao_moc` when there is no `chua_merge_luc` yet (a fired marker without a label would **turn the message off forever** for that row, leaving no trace) |
| 19.3 l.494 + 19.6 l.522 — the "needs re-review" flag must be able to measure **"over 24 hours"** | `0011`: `tg_ticket_can_review_lai_them` / `tg_ticket_can_review_lai_sua` force `co_can_review_lai = 1` to be **equivalent** to `can_review_lai_luc IS NOT NULL`. A row with the flag on and no marker makes l.522 uncomputable and **fails silently** (the project indicator never turns 🟡) |
| Section 6 l.196 + 19.12 question 46 — a stalled/errored session fires **1** message; if it recovers and then stalls again it fires **again** | `0007`/`0008`: `phien.canh_bao_tin_hieu_luc` is a **marker** (the value the latest message was fired for), `phien.error_luc` is the marker of **the entry into `error`** (19.12 question 50). `0012`: `ix_phien_canh_bao` for the 5-minute Cron scanning the whole system, and the `thong_bao` table is where messages **go in** — so "1 message fired" is verifiable from data, not from the return count of a command. The rule is in the pure function `canhBaoDung`, and it runs a **second time** in the write gate (`WorkspaceGate.ghiMocCanhBao`) so two overlapping cron runs still produce one message |
| Section 12 — a fired message is something **already told to the owner** | `0012`: `tg_thong_bao_noi_dung_bat_bien` blocks edits to `loai`, `noi_dung`, `tao_luc` and the four related keys; only `doc_luc` and `gui_telegram_luc` stay open. Same reasoning as `tg_evidence_noi_dung_bat_bien` (l.222) |
| Section 8 — `T-number` increases **across the workspace**, never reused | `0013`: `bo_dem` scope `workspace` key `'ask'` + `tg_bo_dem_chi_tang` (0001) + `ux_can_chu_ma_so (workspace_id, ma_so)`; issuing the number is in the **same batch** as the `can_chu` row in the write gate, so 6 parallel requests get 6 different numbers (there is a real race case in `test/can-chu.test.ts`) |
| Section 8 — `decision` has **2–5** options, each option **1–3 lines**, labels A, B, C… | `0013`: the number **2–5** is a rule of the whole group so it is in `kiemPhuongAn` (`OPTIONS_REQUIRED`); the rules of **each** row are all enforced by the DB — `CHECK (nhan IN ('A'…'E'))` (cap of 5 ⇒ there is no label `F`), `CHECK (length(noi_dung) - length(replace(noi_dung, char(10), '')) <= 2)` for "1–3 lines", `ux_can_chu_phuong_an_nhan` for unique labels, `ux_can_chu_phuong_an_de_xuat` (partial `WHERE de_xuat = 1`) for **exactly one** recommended option |
| Section 8 — `run_command` **must** have a command; `decision` **must** have a recommendation reason | `0013`: two **equivalence** CHECKs `(loai = 'run_command') = (lenh IS NOT NULL)` and `(loai = 'decision') = (ly_do_de_xuat IS NOT NULL)` — they block both "missing" (the second layer of `COMMAND_REQUIRED` / `OPTIONS_REQUIRED`) and "another type that has it" (an `fyi` item carrying `lenh` is meaningless data that part 6 would build a Copy button from) |
| 19.8 — type `Chỉ để biết` (FYI) is **at most 🟡** | `0013`: `CHECK (loai <> 'fyi' OR muc <> 'urgent')`. The first layer is `haMucNeuCan` (lowers it automatically **and reports back to the agent** in the returned result — the second half of the sentence, the half easily lost); the CHECK is the second layer, so that if a write path in a later round forgets to lower it, it breaks right at the DB instead of quietly creating an item that violates SPEC |
| 19.12 question 4 — "Chung" (General) is an **empty value**, not a project | `0013`: `can_chu.project_id` **allows NULL**, and there is **no** `project` row named "Chung" (there is a case checking exactly that). The "General" filter of section 8 is `project_id IS NULL` |
| Sections 1, 18 — Needs Owner items do not cross workspaces | `0013`: `tg_can_chu_ws_*` (project, creating agent, the "possible duplicate" item), `tg_can_chu_phuong_an_ws_*`, `tg_can_chu_file_ws_*`, `tg_can_chu_ticket_ws_*` (the join table forces **three** workspaces to match). Same mold as 0002/0004/0009/0012: `REFERENCES` does not force `workspace_id` to match |
| Section 6 l.183 — `waiting_owner` must point to a Needs Owner item that **really exists** | `0006`: `CHECK (trang_thai <> 'waiting_owner' OR can_chu_id IS NOT NULL)` guards "has a key". `0013`: `tg_phien_can_chu_them`/`_sua` guard "that key **points to a real item in the same workspace**" — SQLite has no `ADD CONSTRAINT` so this is the only way that does not require rebuilding the `phien` table (see `decisions.md` 03 Oct) |
| 20.1 — value ranges of the Map (`uu_tien` 1–5, `ten_ngan` ≤ 24, `khoi_lon` 1–99, `doi` 0–100, WIP 1–10, flags 0/1) | `0029`: column CHECK on each `ADD COLUMN`; the first layer is the `kiem*` functions of `@baton/shared` (`ban-do.ts`) — `INVALID_INPUT` message with the range |
| 20.1 — "Turning on `duy_tri` automatically turns off `dang_day`" | `0029`: `tg_project_duy_tri_them`/`_sua` block `duy_tri = 1 AND dang_day = 1`; the write gate (`handlerSuaDuAn`) turns off `dang_day` in the same batch |
| 20.1 — "Setting `doi` on a ticket without `khoi_lon`: `INVALID_INPUT`" | `0029`: `tg_ticket_doi_them`/`_sua`; the write gate evaluates the ticket **after applying the whole command**, turning off `khoi_lon` clears `doi` in the same command |
| 20.1 → section 4 — project field history is **append-only** | `0029`: `tg_project_history_khong_sua`, `tg_project_history_khong_xoa`, `tg_project_history_ws_them` |
| Section 3 — the two "never" rows of the permission table | `agent_permission.viec` CHECK **does not accept** `delete_anything` and `resolve_ask`: there is nowhere in the data to override those two rows |

## Pagination: keyset (cursor), no `OFFSET`

The acceptance mark is **200 projects + 200,000 tickets**, with lists and the Overview under
1 second. `LIMIT ... OFFSET 100000` forces SQLite to count through 100,000 rows every time, so
Baton does not use `OFFSET`.

The canonical order of the ticket list, which is also the cursor key:

```
ORDER BY hang_uu_tien ASC, tao_luc DESC, id DESC
```

`hang_uu_tien` is a number (0 "Khẩn" (Urgent) … 4 "Không" (None)) so that the priority order of SPEC section 4 sits
right in the index, instead of being sorted with a `CASE` at run time. A `CHECK` on `ticket` keeps
`hang_uu_tien` always matching `uu_tien`.

The next page does not use `OFFSET` but filters on exactly that triple. **The directions are mixed** (priority
ascending, `tao_luc` and `id` descending) so it cannot be written as a single row-value comparison:

```sql
WHERE hang_uu_tien > ?                                  -- next priority levels
   OR (hang_uu_tien = ? AND (tao_luc, id) < (?, ?))     -- within the same level
ORDER BY hang_uu_tien, tao_luc DESC, id DESC
```

`id` is in the key so that the order is **total** — two tickets with the same priority and the same
`tao_luc` still have a unique order, so the cursor skips nothing and returns no duplicates.

**The direction of `ORDER BY` must match the direction of the index.** Writing
`ORDER BY hang_uu_tien, tao_luc, id` (all three ascending) still lets SQLite match the index
prefix for the `WHERE`, but it must `USE TEMP B-TREE FOR LAST 2 TERMS OF ORDER BY`, i.e.
re-sort in memory. `test/phan-trang.test.ts` measures with `EXPLAIN QUERY PLAN` and
keeps that wrong case too, so later rounds do not fall into it.

The **project** and **agent** lists use a simpler key, in a single direction, so they can be
compared with a row value:

```sql
WHERE workspace_id = ? AND (ten, id) > (?, ?)  ORDER BY ten, id
```

Grouping by `nhom` for the sidebar is the UI's job after fetching the data: `nhom` allows
`NULL`, so putting it in the cursor key only adds complexity for no gain.

## Which index serves which query

| Index | Query | SPEC |
|---|---|---|
| `ix_ticket_du_an` (workspace, project, status, priority rank, created at ↓, id ↓) | Ticket list of one project, filtered by status, grouped by status or viewed as a board; the cursor lies entirely within the index | 14 |
| `ix_ticket_ws_trang_thai` (workspace, status, priority rank, created at ↓, id ↓) | "Tất cả dự án" (All projects) list; counting In progress / Awaiting verification for the Overview | 11, 14 |
| `ix_ticket_chiu_trach_nhiem` | Filter by the responsible person | 14 |
| `ix_ticket_han` (partial: has a deadline) | Tickets due soon, overdue | 4, 11 |
| `ix_ticket_xong_luc` (partial: done) | "Vừa xong" (Just done) and "work done in the last 24 hours" on the Overview and the morning report | 11 |
| `ix_ticket_cap_nhat` | "Cập nhật cuối" (Last update) on the Project Map | 9 |
| `ix_ticket_ma_cu` (partial) | Find a ticket by its old code after import | 16 |
| `ix_ticket_da_xoa` (partial) | Trash, restore within 30 days | 4 |
| `ux_ticket_so` (project, number) | Look up a ticket by its `CODE-number`; guarantees numbers do not collide | 1, 4 |
| `ix_ticket_link_nguoc` (to, type, from) | Child tickets, "blocked by", the project tickets of a coordination ticket | 4, 19.4 |
| `ix_ticket_label_theo_nhan` | Filter by label, including the system label "xong không bằng chứng" (done without evidence) | 14 |
| `ix_ticket_history_ticket` (ticket, at ↓) | History of one ticket, newest first | 4 |
| `ix_comment_ticket` (ticket, created at ↓) | The last 10 comments of `baton show` | 13 |
| `ux_agent_token_bam` | Authentication: look up the agent by token hash, one key lookup per request | 3, 15 |
| `ux_agent_ten` | Agent name unique within the workspace | 3 |
| `ux_project_ma` | Project code unique within the workspace ("Mã dự án đã có" (Project code already exists)) | 2 |
| `ix_project_trang_thai` (workspace, status, group, name) | Sidebar: projects by group, excluding `archived` projects | 2, 14 |
| `ix_agent_project_theo_du_an` | "Which agents have access to this project" | 3 |
| `ix_ticket_du_an_uu_tien` (workspace, project, priority rank, created at ↓, id ↓) — **0002** | "Every ticket of one project, sorted by priority", **without** a status filter. `ix_ticket_du_an` leads with `trang_thai` so it cannot be used for the `ORDER BY` when that filter is absent | 4, 14 |
| `ix_project_ten` (workspace, name, id) — **0002** | Listing projects, keyset on `(ten, id)`. `ix_project_trang_thai` leads with `trang_thai` so it cannot be used for "every project sorted by name" | 2, 14 |
| `ix_agent_ten_id` (workspace, name, id) — **0002** | Listing agents ("Đội agent" (Agent Team)), keyset on `(ten, id)` | 3, 11 |
| `ix_luot_giao_nguoi_nhan` (workspace, recipient, status, ticket) — **0004** | `phamViLuotGiao` ("the ticket of my own round" on every write command of a `worker`); `baton tasks` | 3, 5, 13 |
| `ix_luot_giao_ticket` (workspace, ticket, type, status) — **0004** | Chain of rounds of one ticket; "does this ticket already have an open round" | 5, 14, 19.1 |
| `ix_luot_giao_han_phan_hoi` (partial: still `pending` and has a deadline) — **0004** | "Không phản hồi" (No response) rounds on the Overview | 5, 19.6 |
| `ix_evidence_ticket` (workspace, ticket, sent at, id) — **0009** | The Done gate reads **all evidence of one ticket in time order**; `gui_luc` comes right after `ticket_id` because 19.3 asks "is the review after the **last** commit/deploy" | 7, 19.3 |
| `ix_evidence_thu_lai` (partial: `pending` and has a retry marker) — **0009** | Cron scans evidence due for a **retry** (5 minutes, at most 3 times). Does **not** lead with `workspace_id`: the Cron runs for the whole system. The real Cron query (`quetThuLai`, P3 round 3) adds `rut_luc IS NULL` as a **filter** condition — it still uses the index, and there is an `EXPLAIN QUERY PLAN` case measuring exactly that query | 7 (l.220, l.222) |
| `ix_thong_bao_moi` (workspace, created at, id) — **0012** | The in-app bell reads the messages of **one** workspace, newest first. Leads with `workspace_id` (unlike the two Cron indexes above) because this is the owner's read path within one workspace | 12 (l.339) |
| `ix_phien_canh_bao` (partial: `trang_thai <> 'closed'`) — **0012** | Cron **every 5 minutes** scans sessions that may be stalled or errored (section 6 l.196, 19.12 question 46). Does not lead with `workspace_id`: the Cron runs system-wide. Partial on "still open" rather than on `stalled`, because `stalled` is a **derived status, not written to the DB** (19.12 question 42) — the number of open sessions is always small however many rows the `phien` table has. The leading key is `tin_hieu_cuoi_luc` because the scan sorts by it: the session **silent the longest** goes first, so when the cap is reached the part pushed to the next run is the sessions with recent signals | 6 (l.196), 19.12 question 46 |
| `ix_evidence_theo_doi` (partial: `pushed` commit and has a 7-day marker) — **0009** | Cron rechecks `pushed` commits (every 10 minutes for 7 days) and stops tracking when expired — **one** query for **two** jobs, the expiry marker comes first in the `ORDER BY`. Also does not lead with `workspace_id`. "Stop tracking" = `theo_doi_den_luc = NULL`, i.e. the row **leaves** this index, so no second scan ever sees it again | 7 (l.221), 19.7 |

| `ux_can_chu_ma_so` (workspace, `ma_so`) — **0013** | `T-number` unique within the workspace; also the path for looking up an item by `T-number` (`baton result T-x`, section 13) | 8, 13 |
| `ix_can_chu_khoi` (workspace, status, level, deadline, created at, id) — **0013** | **Needs Owner screen: 3 blocks 🔴/🟡/⚪, sorted within a block by DEADLINE then CREATION TIME** (l.249). The first three keys are equality filters, the last three are exactly the `ORDER BY` and in the **same direction** ⇒ no `TEMP B-TREE`. `muc` comes **after** `trang_thai` because all three blocks filter on `open`, so one index serves all three queries. **Not** partial `WHERE trang_thai = 'open'`: the "Đã xử lý" (Handled) table (l.251) shares the prefix `(workspace_id, trang_thai)` | 8 (l.249, l.251) |
| `ix_can_chu_trung` (workspace, title, created at) — **0013**, partial `WHERE trang_thai = 'open'` | The "**có thể trùng T-x**" (possible duplicate of T-x) flag (section 8, Errors part) — runs on **every creation**, so it must not be a table scan. `tieu_de` comes right after `workspace_id` because it is the most selective equality condition; `tao_luc` for the 24-hour window. Partial on "**đang Chờ**" (Waiting) because SPEC only examines `Chờ` (Waiting) items, and the number of Waiting items is always small (that is what the owner must read in full every day) — same reasoning as `ix_phien_canh_bao`. `project_id` is **not** in the key: it allows NULL ("General") so it would only bloat the index, and it is a **filter** condition after the index has selected the rows | 8 (Errors part) |
| `ix_project_history_du_an` (project, at ↓, id ↓) — **0029** | History of the Map fields of one project, newest first (`GET /v1/du-an/:id/lich-su`), keyset `(luc, id)` — same pattern as `ix_ticket_history_ticket` | 20.1, 4 |
| `ix_can_chu_ticket_nguoc` (ticket, item) — **0013** | Reverse direction of the join table: "which Needs Owner items is this ticket waiting on" (ticket detail page, part 6), and round 2 needs it to "automatically add a comment to **every** related ticket" (l.280) | 8 (l.240, l.280) |

Every index on `ticket` is **partial** `WHERE xoa_luc IS NULL` (except the indexes
dedicated to deleted tickets): soft-deleted tickets are not in the list indexes,
so the indexes do not bloat with the trash.

## Where there is no index yet, and why

The command menu `Cmd/Ctrl+K` searches by **substring** of the title (SPEC section 14;
`spec-questions.md` #8 provisionally settles on ticket code, ticket title, T-number only). `LIKE
'%x%'` cannot use a B-tree. The data scope is 200,000 rows so scanning titles
is still tolerable; if it is slow, add an FTS5 table in a later migration — not done yet because SPEC
states explicitly that full-text search is not needed in v0.1.
