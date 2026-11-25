# Baton: SPEC v0.1

**Baton** là nơi điều hành công việc cho **một người chủ cùng một đội agent AI**, trải trên **nhiều dự án**.
Người chủ quyết định và duyệt. Agent nhận việc, làm, chuyền việc cho nhau và nộp bằng chứng.
Tên lấy từ gậy tiếp sức: việc được chuyền tay qua nhiều chặng, nhưng luôn biết đang ở tay ai.

Tài liệu này là thứ **duy nhất** phiên build được đọc. Nó mô tả hành vi, không mô tả cách cài đặt.
Mỗi tính năng ghi: người dùng nhận được gì · kích hoạt · vào và ra · trạng thái · lỗi · KHÔNG làm.

---

## 0. Nguyên tắc sản phẩm
1. **Không giới hạn** số dự án, số ticket, số agent. Mục tiêu hiệu năng: 200 dự án, 200.000 ticket, 100 agent mà vẫn mượt.
2. **"Không có ticket Đang làm = dự án đang đứng."** Trạng thái trên Baton phải phản ánh đúng việc thật.
3. **Xong phải có bằng chứng.** "Xong" nghĩa là đã merge hoặc đã live, và có bằng chứng kèm theo.
4. **Người chủ không bị hỏi lẻ tẻ.** Mọi thứ cần người chủ nằm ở một chỗ duy nhất (**Cần Chủ**), duyệt theo phiên sáng và tối.
5. **Agent là công dân hạng nhất.** Agent có danh tính, quyền, lịch sử, nhịp tim riêng. Agent chạy CLI trên máy vẫn dùng được, không cần máy chủ nhận webhook.
6. **Người luôn chịu trách nhiệm cuối cùng.** Agent làm và đề xuất, người chủ quyết những việc nằm trong danh sách phải hỏi.
7. **Nhanh.** Mọi thao tác hiện kết quả ngay trên màn hình. Mọi việc thường dùng đều có phím tắt.
8. Giao diện **tiếng Việt** mặc định (có sẵn chỗ cho tiếng Anh sau này), giờ Việt Nam (UTC+7), **nền sáng**.

## 0.1 Mã máy (tiếng Anh) và nhãn hiển thị (tiếng Việt)
Mọi mã trong API, CLI, MCP, cơ sở dữ liệu và log dùng **tiếng Anh**. Giao diện, thông báo và thông điệp lỗi hiển thị **nhãn tiếng Việt** theo bảng này.

| Nhóm | Mã → Nhãn |
|---|---|
| Vai trò agent | `coordinator` Điều phối · `manager` Quản lý · `worker` Người làm · `reviewer` Người duyệt |
| Trạng thái dự án | `active` Đang chạy · `paused` Tạm dừng · `archived` Lưu trữ |
| Trạng thái agent | `busy` Đang làm · `waiting_owner` Chờ Chủ · `stalled` Đứng · `idle` Rảnh · `disabled` Đã tắt |
| Trạng thái ticket | `backlog` Backlog · `todo` Cần làm · `in_progress` Đang làm · `verifying` Chờ kiểm chứng · `done` Xong · `canceled` Huỷ · `duplicate` Trùng |
| Nhóm trạng thái ticket | `planned` chờ (backlog, todo) · `active` chạy (in_progress, verifying) · `closed` kết (done, canceled, duplicate) |
| Ưu tiên | `urgent` Khẩn · `high` Cao · `medium` Vừa · `low` Thấp · `none` Không |
| Loại lượt giao | `work` Làm · `review` Review |
| Trạng thái lượt giao | `pending` Chờ nhận · `in_progress` Đang làm · `submitted` Đã nộp · `accepted` Đạt · `returned` Trả lại · `canceled` Đã huỷ |
| Kết quả nộp | `done` Xong · `partial` Xong một phần · `blocked` Không làm được |
| Trạng thái phiên | `running` Đang chạy · `waiting_owner` Chờ Chủ · `waiting_assigner` Chờ người giao · `stalled` Đứng · `error` Lỗi · `stopping` Đang dừng · `closed` Đã đóng |
| Loại hoạt động | `thought` Suy nghĩ · `action` Thao tác · `question` Hỏi · `result` Kết quả · `error` Lỗi |
| Tín hiệu gửi agent | `STOP` Dừng |
| Loại bằng chứng | `commit` · `deploy` · `review` · `test` · `file` · `note` Ghi chú · `bao_cao` Báo cáo |
| Cờ "không code" | `project.khong_code` Dự án không code · `ticket.khong_code` Ticket không code |
| Xác minh bằng chứng | `pending` Đang kiểm · `passed` Đạt · `failed` Trượt · `withdrawn` Đã rút; riêng commit: `pushed` · `merged` |
| Kết luận review | `pass` Đạt · `fail` Không đạt |
| Mức Cần Chủ | `urgent` 🔴 Gấp · `today` 🟡 Trong ngày · `later` ⚪ Không gấp |
| Loại Cần Chủ | `decision` Quyết định · `run_command` Chủ chạy lệnh · `review` Chủ review · `fyi` Chỉ để biết |
| Trạng thái Cần Chủ | `open` Chờ · `resolved` Đã xử lý · `skipped` Bỏ qua |

Trong SPEC, các chữ như "Đang làm", "Chờ kiểm chứng", "🔴 Gấp" là **nhãn**; mã tương ứng tra ở bảng trên.

## 1. Khái niệm
| Khái niệm | Là gì |
|---|---|
| **Workspace** | Không gian của một người chủ. v0.1 chỉ có 1 workspace, nhưng dữ liệu phải tách theo workspace từ đầu để sau này ship nhiều khách. |
| **Chủ** | Người thật duy nhất, quyền cao nhất, tên hiển thị tuỳ đặt (mặc định "Chủ"). Mục "Cần Chủ" dùng tên này: đổi tên chủ thì tên mục đổi theo. |
| **Agent** | Danh tính máy: tên (vd `CoS`, `M-Sample`, `W-builder`, `W-reviewer`), **vai trò**, model (chữ tự do), mô tả, danh sách dự án được vào, quyền, token. |
| **Vai trò agent** | `coordinator` (kiểu CoS), `manager` (Manager một dự án), `worker` (Worker làm), `reviewer` (Worker review). Một agent có đúng 1 vai trò. |
| **Dự án** | Có tên, **mã** 2–6 chữ in hoa (vd `SAI`, `INC`, `COS`), mô tả, màu, trạng thái (đang chạy, tạm dừng, lưu trữ), agent quản lý, **hồ sơ dự án** (mục 9). |
| **Ticket** | Đơn vị việc, thuộc đúng 1 dự án. Mã `MÃ-số`, số tăng dần trong dự án, không tái dùng. |
| **Lượt giao** | Một lần chuyền việc: ai giao, cho ai, kèm brief nào, lúc nào, kết quả ra sao. Một ticket có thể có nhiều lượt. |
| **Phiên** | Khoảng thời gian một agent thực sự làm một lượt giao. Có trạng thái sống và dòng hoạt động. |
| **Bằng chứng** | Thứ chứng minh việc đã làm: commit, deploy, kết quả test, review đạt, file, ghi chú. |
| **Cần Chủ (mục T)** | Việc chỉ người chủ quyết hoặc làm được. Mã `T-số`. |
| **Quyết định** | Một dòng trong Nhật ký quyết định. Chỉ thêm, không sửa. |

## 2. Dự án
**Người dùng nhận được:** bao nhiêu dự án cũng được. Mỗi dự án có trang riêng cho biết đang chạy hay đang đứng, ai quản lý, cần đọc gì trước.

- **Tạo:** chủ tạo (UI hoặc CLI). Tên và mã bắt buộc. Mã duy nhất trong workspace và **không đổi được** sau khi tạo; tên đổi được.
- **Trạng thái:**
  - `active`: bình thường.
  - `paused`: agent không nhận việc mới trong dự án.
  - `archived`: ẩn khỏi sidebar, chỉ đọc.
- **Chỉ báo sức sống** (tự tính, hiện ở sidebar và Tổng quan):
  - 🟢 có ít nhất 1 ticket Đang làm, và phiên của nó đang chạy hoặc có nhịp tim trong ngưỡng.
  - 🟡 có ticket Đang làm nhưng phiên bị đứng hoặc lỗi.
  - ⚪ không có ticket Đang làm nào. Hiện chữ "Dự án không chạy".
- **Nhóm dự án** (tuỳ chọn): gom dự án vào nhóm để xếp sidebar, ví dụ "Sample", "INC", "Nội bộ". Chỉ để hiển thị.
- **Lỗi:** mã trùng hoặc sai định dạng thì báo "Mã dự án đã có" hoặc "Mã chỉ gồm 2–6 chữ A–Z".
- **KHÔNG làm:** team; phân quyền theo người (chỉ có 1 người); giới hạn số dự án.

## 3. Agent
**Người dùng nhận được:** biết đội mình có ai, mỗi agent đang làm gì, được phép làm gì, lần cuối lên tiếng lúc nào.

- **Tạo agent:** chủ nhập tên (duy nhất), vai trò, model, mô tả, danh sách dự án được vào (hoặc "tất cả"), quyền.
- **Token:** hiện **một lần duy nhất** khi tạo. Sau đó chỉ hiện 4 ký tự cuối. Có nút tạo lại token (token cũ hết hiệu lực ngay) và nút thu hồi. Server chỉ lưu token dạng băm.
- **Quyền theo vai trò** (mặc định; chủ chỉnh được từng agent):

| Việc | coordinator | manager | worker | reviewer |
|---|---|---|---|---|
| Tạo ticket | mọi dự án được vào | dự án mình quản lý | ticket con của lượt mình đang làm | — |
| Giao việc (tạo lượt giao) | cho manager, worker, reviewer | cho worker, reviewer trong dự án | — | — |
| Đổi trạng thái ticket | có | trong dự án | ticket của lượt mình | — |
| Nộp bằng chứng | có | có | có | có |
| Ghi kết quả review | có, trừ ticket mình đã nhận lượt `work` | trong dự án, bắt buộc kèm đường dẫn báo cáo của reviewer độc lập | — | có |
| Tạo mục Cần Chủ | có | có | — | — |
| Ghi Nhật ký quyết định | có | có | — | — |
| Xoá bất cứ thứ gì | không bao giờ | không bao giờ | không bao giờ | không bao giờ |
| Quyết mục Cần Chủ | không bao giờ | không bao giờ | không bao giờ | không bao giờ |

- **Trạng thái agent** (tự tính):
  - `busy`: có phiên đang chạy.
  - `waiting_owner`: có phiên đang chờ một mục Cần Chủ.
  - `stalled`: có phiên bị đứng.
  - `idle`: không có phiên mở.
  - `disabled`: chủ đã tắt agent. Agent bị tắt gọi API sẽ bị từ chối.
- **Trang agent:** thông tin, phiên đang mở, lịch sử lượt giao (dạng bảng), tỉ lệ nộp lại đạt review, lần cuối lên tiếng.
- **KHÔNG làm:** Baton không chạy agent, không gọi model, không giữ API key của model. Agent chạy ở nơi khác và nói chuyện với Baton qua CLI, MCP hoặc API.

## 4. Ticket
**Người dùng nhận được:** mỗi việc có mã ngắn để người và agent cùng gọi tên, có đủ bối cảnh để giao, và luôn biết đang ở tay ai.

**Trường:**
- Mã (tự sinh), tiêu đề (bắt buộc, 1–200 ký tự sau khi cắt khoảng trắng), mô tả (markdown).
- **Brief** (có cấu trúc, tuỳ chọn): Mục tiêu · Bối cảnh · Phạm vi · File và nguồn liên quan · Điều cấm · Xong là gì · Cách kiểm chứng · Nộp lại.
- Trạng thái, ưu tiên, nhãn.
- **Người chịu trách nhiệm** (chủ hoặc một agent `manager`/`coordinator`; mặc định là agent quản lý của dự án, nếu dự án không có thì là chủ). Không đặt được agent đã tắt (`FORBIDDEN`); ticket đã gán trước khi agent bị tắt **hoặc đổi vai trò** giữ nguyên, và sửa ticket gửi lại đúng người chịu trách nhiệm hiện tại thì không kiểm lại tắt/vai trò — chỉ kiểm khi đổi sang người khác (Chủ chốt T-58 = A, 22/10; BAT-50).
- **Người đang cầm** (agent đang cầm lượt giao mở; tự tính từ mục 5, không sửa tay).
- Ticket cha, ticket con, liên quan (hai chiều, **được khác dự án** — với người thấy cả hai dự án, 19.12 câu 15), chặn và bị chặn.
- Hạn (tuỳ chọn), người tạo, các mốc thời gian (tạo, cập nhật, bắt đầu, xong).

**Ưu tiên:** 5 mức cố định theo thứ tự: `Khẩn`, `Cao`, `Vừa`, `Thấp`, `Không`. Mặc định `Không`.

**Trạng thái** (7, cố định ở v0.1):

| Trạng thái | Nhóm | Nghĩa |
|---|---|---|
| Backlog | chờ | Giai đoạn xa, ý tưởng |
| Cần làm | chờ | Đã lên kế hoạch (mặc định khi tạo) |
| Đang làm | chạy | Có lượt giao đang mở, hoặc chủ đang tự làm |
| Chờ kiểm chứng | chạy | Người làm báo xong; chưa đủ bằng chứng hoặc chưa qua review |
| Xong | kết | Đủ bằng chứng hợp lệ (mục 7) |
| Huỷ | kết | Không làm nữa; bắt buộc có lý do |
| Trùng | kết | Trùng ticket khác; bắt buộc trỏ tới ticket gốc |

**Trạng thái khi tạo:** mặc định **Cần làm**; người tạo được chọn **Backlog**. Mọi trạng thái khác không đặt được lúc tạo (`INVALID_INPUT`) — tạo rồi chuyển theo luật dưới đây. Quyền tạo không đổi theo trạng thái chọn. (Chủ chốt T-108 = B, 29/10; BAT-63)

**Luật chuyển trạng thái** (server kiểm, client không được bỏ qua):
- Mở một lượt giao cho ticket ở nhóm `planned` thì ticket tự sang **Đang làm**.
- Vào **Xong** phải qua cổng bằng chứng (mục 7). Thiếu thì bị từ chối với lỗi `EVIDENCE_REQUIRED`, và ticket được đưa sang Chờ kiểm chứng.
- Ticket cha không vào Xong khi còn ticket con chưa kết (`CHILDREN_OPEN`).
- Vào Huỷ phải có lý do (`REASON_REQUIRED`). Vào Trùng phải có ticket gốc hợp lệ (`INVALID_DUPLICATE_TARGET`).
- Mở lại ticket nhóm `closed` (về Cần làm) chỉ chủ làm được.
- Ticket ở Đang làm quá 24 giờ mà không có lượt giao mở và không phải chủ tự làm thì gắn cờ **"Đang làm mà không ai cầm"** và hiện ở Tổng quan.

**Ticket điều phối:** agent `coordinator` giao việc cho `manager` bằng cách tạo ticket trong dự án điều phối (vd `COS`), tiêu đề tự đặt dạng `[Giao M-Sample] <tiêu đề>`, và nối loại `dieu_phoi` (19.4) với ticket của dự án. Cả hai ticket cùng đổi trạng thái theo lượt giao. Xem ticket nào cũng thấy ticket kia.

**Lịch sử:** mọi thay đổi ghi 1 dòng (ai, lúc nào, trường, cũ → mới). Không sửa hay xoá được.

**Bình luận:** markdown, của chủ hoặc agent. Tác giả tự sửa được (có ghi "đã sửa"). Agent không xoá được.

**Xoá ticket:** chỉ chủ. Ticket đã xoá khôi phục được trong 30 ngày; mã không bao giờ dùng lại.

**Lỗi:** tiêu đề rỗng bị từ chối (`INVALID_INPUT`); dự án đang tạm dừng hoặc lưu trữ thì agent không tạo được ticket (`PROJECT_NOT_ACCEPTING`).

**KHÔNG làm v0.1:** ước lượng điểm; sprint hoặc cycle; trường tuỳ biến (`khoi_lon`, `doi` của mục 20 là trường cố định, không phải trường tuỳ biến); trạng thái tuỳ biến; nhiều người chịu trách nhiệm.

## 5. Lượt giao (chuyền việc)
**Người dùng nhận được:** thấy cả chuỗi việc được chuyền: CoS giao Manager, Manager giao Worker, Worker nộp, Reviewer duyệt, Manager nghiệm thu. Ai giao, lúc nào, kèm brief gì, kết quả ra sao.

- **Tạo lượt giao:** người giao (chủ hoặc agent có quyền) chọn ticket và người nhận (agent), gửi kèm brief. Brief lấy từ ticket nếu có, cho sửa riêng cho lượt này. Có thể đặt **hạn phản hồi** (mặc định 15 phút).
- Mỗi ticket chỉ có tối đa **1 lượt giao mở** tại một thời điểm, trừ lượt review (mục 7) được mở song song với lượt làm đã nộp.
- **Trạng thái lượt giao:**
  - `pending`: vừa giao, người nhận chưa nhận.
  - `in_progress`: người nhận đã nhận.
  - `submitted`: người nhận đã nộp báo cáo.
  - `accepted`: người giao nghiệm thu đạt.
  - `returned`: người giao trả lại, bắt buộc có lý do. Tạo lượt mới cùng người nhận, số lượt tăng.
  - `canceled`: người giao huỷ, hoặc chủ huỷ.
- **Nhận việc:** người nhận gọi lệnh "nhận". Quá hạn phản hồi mà chưa nhận thì lượt hiện **"Không phản hồi"** ở Tổng quan (lượt không tự huỷ).
- **Báo cáo nộp** (có cấu trúc, bắt buộc khi nộp):
  - Kết quả: `done` (Xong), `partial` (Xong một phần) hoặc `blocked` (Không làm được).
  - Đã làm · Kiểm chứng · Nhánh và commit · Rủi ro, điều cần xem kỹ · Việc phát sinh (không tự làm).
- **Việc phát sinh** trong báo cáo có nút (cho người giao) "Tạo ticket từ việc phát sinh".
- **Nghiệm thu:** người giao chọn `accepted` hoặc `returned`. `accepted` không tự làm ticket Xong; ticket Xong chỉ khi qua cổng bằng chứng.
- **Luật:**
  - Agent `worker` không tạo được lượt giao.
  - Không giao cho agent đang `disabled`, hoặc agent không có quyền vào dự án đó (`FORBIDDEN`).
  - Không giao cho chính mình.
- **KHÔNG làm:** Baton không tự khởi động agent khi có lượt giao. Agent phải tự hỏi việc (mục 13). Tự khởi động để v0.2.

## 6. Phiên và nhịp tim
**Người dùng nhận được:** biết agent **có thật đang chạy** hay đã chết giữa chừng, không phải chờ tới khi chính mình nhận ra.

- **Phiên** mở khi agent nhận một lượt giao, đóng khi nộp, bị huỷ hoặc bị dừng.
- **Tự đóng:** phiên đóng ngay khi **lượt giao của nó nộp báo cáo**, và khi **ticket của lượt đó sang Chờ kiểm chứng hoặc Xong** — kể cả khi phiên đang `stalled` hoặc `error`. Lý do đóng ghi vào lịch sử phiên ("việc đã xong"). Hệ quả bắt buộc: một việc đã xong **không bao giờ** còn hiện ở "Cần chú ý" dưới dạng phiên đứng, và agent không còn "cầm" nó.
- **Trạng thái phiên:**
  - `running`: có tín hiệu trong ngưỡng.
  - `waiting_owner`: phiên gắn với một mục Cần Chủ đang chờ; không tính đứng.
  - `waiting_assigner`: agent đã gửi hoạt động `question` và đang chờ người giao trả lời; không tính đứng, nhưng quá 60 phút thì hiện ở "Cần chú ý" (19.6). Có câu trả lời thì phiên về `running`.
  - `stalled`: quá ngưỡng không có tín hiệu.
  - `error`: agent báo lỗi.
  - `stopping`: chủ bấm dừng, chờ agent xác nhận.
  - `closed`.
- **Tín hiệu** = mọi lệnh ghi của agent trên phiên đó (nhịp tim, hoạt động, bằng chứng, bình luận, nộp). Lệnh đọc không tính. Lệnh nhích phiên nào khi agent có nhiều phiên mở: 19.12 câu 41.
- **Ngưỡng đứng:** mặc định 30 phút; chỉnh theo dự án hoặc theo agent (5–1440 phút).
- **Dòng hoạt động của phiên:** agent gửi các mục loại `thought`, `action` (tên, tham số, kết quả), `question` (hỏi người giao; nếu cần chủ thì tạo mục Cần Chủ), `result`, `error`. Mục có thể đánh dấu tạm thời (bị mục kế thay chỗ trên màn hình; vẫn lưu trong lịch sử). Mục đã gửi không sửa được.
- **Kế hoạch của phiên:** danh sách bước, mỗi bước có trạng thái chờ, đang làm, xong hoặc huỷ. Agent gửi lại toàn bộ danh sách mỗi lần cập nhật.
- **Dừng:**
  - Chủ bấm "Dừng" thì phiên sang `stopping`. Lần gọi kế tiếp của agent nhận về tín hiệu `STOP`; agent phải ngưng việc và gửi một mục `result` hoặc `error`.
  - Sau 10 phút không xác nhận, phiên tự đóng với lý do "agent không xác nhận dừng".
  - Mọi lệnh ghi sau khi phiên đóng bị từ chối (`SESSION_CLOSED`).
- **Cảnh báo:** phiên chuyển sang `stalled` hoặc `error` thì bắn 1 thông báo (mục 12). Phiên hồi lại rồi đứng lần nữa thì bắn lại.
- **KHÔNG làm:** đọc log hay màn hình của agent; tự khởi động lại agent.

## 7. Bằng chứng và cổng kiểm chứng
**Người dùng nhận được:** "Xong" trên Baton là xong thật.

**Loại bằng chứng:**

| Loại | Giá trị | Xác minh | Mở cổng Xong? |
|---|---|---|---|
| `commit` | hash (≥7 ký tự) + repo (lấy từ hồ sơ dự án nếu không ghi) | Server kiểm qua GitHub API: commit truy cập được từ **nhánh mặc định** thì là **merged**; chỉ có trên nhánh khác thì là **pushed**; không tìm thấy thì trượt. **Ngoại lệ repo chưa push:** nếu GitHub **đã được hỏi về chính commit này** và trả lời "không có", mà CLI gửi kèm lời khai `merged_cuc_bo` (chính CLI đã chạy `git merge-base --is-ancestor <sha> <nhánh mặc định>` trong repo), thì kết luận là **merged** với **nguồn xác minh `local`**; nguồn đó phải hiện ra ở API, web và CLI. Lời khai **không** được nhận ở mọi ca khác: repo sai hình dạng, `GET /repos/<repo>` trả 404, lỗi mạng, kết luận `pushed`, hay server thiếu `GITHUB_TOKEN` | Chỉ khi là **merged** (kể cả merged nguồn `local`) |
| `deploy` | URL + mã phiên bản tuỳ chọn (vd `e91efbeb`) | Server gọi URL; mã 2xx hoặc 3xx là đạt. Chỉ nhận `https://`, không nhận IP nội bộ hay localhost. **URL trỏ vào chính Baton** (host **bằng đúng** host công khai của Baton) thì không gọi mạng mà định tuyến vào chính router của app và lấy mã HTTP thật từ đó; chỉ mã của một **route thật** được nhận (không đi qua bước rơi về `index.html` của SPA), nên một URL trỏ tới đường giao diện sẽ **trượt** | Có |
| `review` | Kết luận ĐẠT hoặc KHÔNG ĐẠT + ghi chú, do agent `reviewer` **khác** người làm gửi; hoặc do agent `manager` của dự án gửi **kèm đường dẫn báo cáo của reviewer độc lập** (xem bảng quyền mục 3); hoặc do agent `coordinator` gửi (không bắt buộc báo cáo) | Kiểm vai trò và danh tính người gửi; review do `manager` gửi mang **nguồn `manager`**, do `coordinator` gửi mang **nguồn `coordinator`**, và nguồn đó hiện ra ở mọi đường đọc | Không tự mở cổng; là điều kiện phụ (xem dưới) |
| `test` | Tóm tắt (vd "42 passed, 0 failed") + cờ đạt | Không xác minh | Không |
| `file` | Đường dẫn hoặc link (vd link file:// trên máy chủ) | Không | Không |
| `note` | Chữ | Không | Không |
| `bao_cao` (Báo cáo) | Đường dẫn báo cáo và/hoặc nội dung báo cáo (ít nhất một). Người ký = người gửi, **quyền ký giống hệt `review`**: agent `reviewer` khác người làm; agent `manager` của dự án **kèm đường dẫn báo cáo của reviewer độc lập**; agent `coordinator`; hoặc chủ. Nguồn ký (`reviewer` · `manager` · `coordinator` · `owner`) hiện ra ở mọi đường đọc | Không (chỉ kiểm vai trò và danh tính người ký, như `review`) | Không tự mở cổng; với **ticket không code** thì mở cổng **thay** cho chủ xác nhận (xem dưới). Với ticket có code: không mở gì |

**Cổng vào Xong:**
- Cần **ít nhất 1** bằng chứng `commit` đã merged, hoặc `deploy` đạt.
- Nếu dự án bật "bắt buộc review" (mặc định **bật**) thì cần thêm 1 `review` ĐẠT gửi sau commit hoặc deploy cuối cùng.
- **Chủ được ép Xong** kèm lý do. Ticket đó mang nhãn hệ thống "xong không bằng chứng".
- **Ticket không code** (cờ dự án **hoặc** cờ ticket, **chỉ chủ đổi**; ví dụ việc HR, giấy tờ, hay một ticket nghiên cứu trong dự án có code): cổng đổi thành **một trong hai** đường:
  - 1 `file` hoặc `note` cộng **chủ xác nhận**, tức một mục Cần Chủ loại Review tự sinh (19.12 câu 57); hoặc
  - **≥1 `bao_cao` chưa rút do người khác người làm ký** (người làm = người nhận của bất kỳ lượt `work` nào trên ticket, như luật "khác người làm" của `review`). Khi cổng đã đủ nhờ báo cáo thì **không** sinh mục xác nhận.
  - Cờ **dự án** nằm ở hồ sơ dự án (mục 9). Cờ **ticket** (`ticket.khong_code`) chỉ chủ bật/tắt (agent ⇒ `FORBIDDEN`), có ghi Lịch sử, và **không kéo trạng thái** (19.12 câu 58). Cả hai cờ đọc **tại thời điểm kiểm** (19.10).
  - Một `bao_cao` **không** được tính là `file` hay `note` của đường thứ nhất, và ngược lại.
  - Ticket sang Xong bằng **bất kỳ** đường nào (đủ nhờ `bao_cao`, chủ xác nhận, chủ ép Xong, tự lên Xong, …) thì mục xác nhận tự sinh của chính ticket đó còn `Chờ` **tự đóng** cùng lúc (xem mục 8 và 19.12 câu 57).
  - **Gửi `bao_cao` không tự đưa ticket lên Xong** từ Chờ kiểm chứng (như `file`/`note`/`review`): người có quyền "Đổi trạng thái ticket" theo bảng quyền mục 3 (người làm với ticket của lượt mình, `manager` trong dự án, `coordinator`, chủ) đổi sang Xong, cổng được kiểm lúc đổi (Chủ chốt T-38 = A, 19/10). Chi tiết: 19.12 câu 66.

**Xác minh:**
- Chạy ngay khi gửi, trả kết quả trong tối đa 10 giây. Lỗi mạng hoặc token GitHub có vấn đề thì trạng thái là `pending`, tự thử lại sau 5 phút, tối đa 3 lần, rồi thành `failed` với lý do.
- **Tự lên Xong:** ticket ở Chờ kiểm chứng mà vừa đủ điều kiện cổng (ví dụ commit từ pushed thành merged) thì tự sang Xong, lịch sử ghi người làm là "hệ thống". Server kiểm lại các commit `pushed` mỗi 10 phút trong 7 ngày.
- Bằng chứng **không sửa, không xoá**. Chỉ có thể "rút lại" kèm lý do (người gửi hoặc chủ). Bằng chứng đã rút không được tính. Ticket đã Xong không bị hạ tự động.
- **KHÔNG làm:** tự quét repo tìm commit; tự deploy; chạy test.

## 8. Cần Chủ
**Người dùng nhận được:** **một chỗ duy nhất** gom mọi thứ cần người chủ quyết hoặc làm. Nhìn là biết cái gì gấp, mỗi mục đủ bối cảnh để quyết trong một lần đọc, quyết bằng một phím, và Baton tự báo kết quả về cho agent.

**Tạo:** agent `coordinator` hoặc `manager` (CLI, MCP, API), hoặc chủ tự tạo để ghi nhớ.

**Trường:**
- Mã `T-số` tăng dần toàn workspace, không tái dùng.
- Tiêu đề; **dự án** (bắt buộc, hoặc "Chung").
- **Mức:** 🔴 `Gấp`, 🟡 `Trong ngày`, ⚪ `Không gấp`.
- **Loại:**
  - `Quyết định`: bắt buộc 2–5 phương án (mỗi phương án có nhãn A, B, C… và 1–3 dòng), cộng phương án đề xuất và lý do.
  - `Chủ chạy lệnh`: bắt buộc có lệnh hoặc script. Hiện trong khối code có nút Copy, kèm ghi chú "chạy ở terminal thật" nếu agent đánh dấu cần TTY.
  - `Chủ review`: bắt buộc có ít nhất 1 file hoặc link để xem.
  - `Chỉ để biết`: không cần làm gì, chỉ cần xác nhận đã đọc.
- **Bối cảnh** (markdown, có link file:// và link ticket); **ticket liên quan** (nhiều); **phiên liên quan** (nếu có, phiên sang `waiting_owner`).
- **Hạn** (tuỳ chọn). Nếu không đặt: 🔴 là 4 giờ, 🟡 là 20:00 cùng ngày.

**Trạng thái:**
- `Chờ` → `Đã xử lý` (có **kết quả**: phương án đã chọn và/hoặc chữ tự do, vd "đã chạy", "A, ngưỡng 500") hoặc `Bỏ qua` (có lý do).
- Chỉ chủ chuyển trạng thái. Agent chỉ đọc được kết quả. **Ngoại lệ duy nhất:** mục xác nhận tự sinh của ticket không code (19.12 câu 57) tự sang `Đã xử lý` với kết quả "ticket đã Xong", **không** mang Đạt/Cần sửa, khi ticket của nó sang Xong (Chủ chốt T-38 = A, T-43 = A; #163).
- Mở lại được: từ Đã xử lý về Chờ, có ghi lịch sử.

**Màn hình Cần Chủ** (mục thứ hai của sidebar, sau Tổng quan — xem mục 14; huy hiệu đếm số `Chờ` màu theo mức cao nhất):
- 3 khối **🔴 Gấp · 🟡 Trong ngày · ⚪ Không gấp**. Trong khối sắp theo hạn, rồi theo lúc tạo. Mục quá hạn có viền đỏ và chữ "quá hạn X giờ".
- Mỗi thẻ hiện đủ: mã, dự án, loại, tiêu đề, bối cảnh (mặc định gập sau 6 dòng), phương án thành nút (phương án đề xuất có nhãn "Đề xuất"), lệnh có nút Copy, file có link, ticket liên quan.
- Dưới cùng là bảng **Đã xử lý**: ngày, mã, tiêu đề ngắn, kết quả. Lọc được theo dự án và theo khoảng ngày.
- Lọc theo dự án, theo loại.

**Trả lời bằng nút rồi bấm Gửi** (không cần gõ gì trong terminal hay chat):
- Mỗi thẻ có đủ nút để trả lời ngay trên Baton, trên máy tính lẫn điện thoại:

| Loại | Trên thẻ có | Gửi |
|---|---|---|
| `decision` | Mỗi phương án là **một nút chọn** (A, B, C…; phương án đề xuất có nhãn "Đề xuất"). Bấm để chọn, bấm phương án khác để đổi. Ô "ghi thêm" tuỳ chọn | Nút **Gửi duyệt**, mờ cho tới khi đã chọn 1 phương án |
| `run_command` | Lệnh trong khối code có nút Copy; ô "kết quả" tuỳ chọn (vd dán mã phiên bản) | Nút **Đã chạy · Gửi** |
| `review` | Nút mở file hoặc link; 2 nút chọn **Đạt** hoặc **Cần sửa** (Cần sửa thì bắt buộc ghi chú) | Nút **Gửi duyệt** |
| `fyi` | — | Nút **Đã đọc** |

- Mọi thẻ có thêm link nhỏ "Bỏ qua", bắt buộc nhập lý do rồi Gửi.
- **Bấm Gửi là xong phía chủ.** Thẻ chuyển ngay xuống "Đã xử lý" và hiện kết quả. Chủ không phải báo lại cho agent ở bất cứ đâu.
- **Agent tự nhận kết quả:**
  - Agent đang chờ bằng `baton result T-x --wait` (hoặc công cụ MCP tương đương) nhận kết quả **trong vòng 3 giây** sau khi chủ bấm Gửi.
  - Agent không đang chờ thì nhận kết quả ở lần gọi kế tiếp (`heartbeat`, `tasks` hay bất kỳ lệnh nào), trong trường `resolved_asks`.
  - Phiên liên quan tự về `running`.
- **Phím tắt** (tuỳ chọn, cho máy tính): `1`–`5` chọn phương án; `Cmd/Ctrl+Enter` gửi; `D` là nút chính của loại lệnh, review, fyi; `S` bỏ qua; `J`/`K` lên xuống.
- **Ô trả lời hàng loạt** (tuỳ chọn, nằm trên Baton): dán nhiều dòng dạng `T-18: đã xem` hay `T-52: A, ngưỡng 500`. Baton tách từng mã, khớp phương án nếu có chữ cái đầu hợp lệ, cho xem trước rồi áp một lần. Dòng không hiểu thì báo đỏ, không áp.

**Phiên duyệt:**
- Nút "Bắt đầu phiên duyệt" hiện từng thẻ `Chờ` theo thứ tự 🔴 → 🟡 → ⚪.
- Cuối phiên hiện tóm tắt: đã xử lý N, bỏ qua M, còn lại K.
- Lịch nhắc phiên duyệt mặc định 08:00 và 20:00 (chỉnh được).

**Khi một mục được xử lý:**
- Tự ghi 1 dòng vào Nhật ký quyết định (mục 10): người là chủ, cùng dự án, nội dung là kết quả, căn cứ là `T-số`.
- Tự thêm bình luận "T-số đã xử lý: <kết quả>" vào mọi ticket liên quan.
- **Ngoại lệ (tạm):** mục xác nhận tự sinh **tự đóng vì ticket đã Xong** (19.12 câu 57, #163) **không** ghi Nhật ký và **không** thêm bình luận — chủ không xử lý mục đó, nên dòng "người là chủ" sẽ sai sự thật. Chờ chốt: `cau-hoi-spec.md` #166.
- Phiên liên quan hết `waiting_owner`. Lần gọi kế tiếp của agent nhận được kết quả (mục 13).

**Thông báo:** mục 🔴 mới thì bắn ngay (ngay = trong một nhịp cron, ≤ 60 giây — Chủ chốt T-50 = A, 22/10, `cau-hoi-spec.md` #170). 🔴 chưa xử lý sau 2 giờ thì nhắc 1 lần. 🟡 và ⚪ chỉ vào tóm tắt sáng và tối.

**Lỗi:**
- Loại `Quyết định` mà thiếu phương án: `OPTIONS_REQUIRED`.
- Loại `Chủ chạy lệnh` mà thiếu lệnh: `COMMAND_REQUIRED`.
- Agent `worker` hoặc `reviewer` tạo mục: `FORBIDDEN`.
- Trùng tiêu đề với một mục `Chờ` cùng dự án trong 24 giờ: vẫn tạo, nhưng gắn cờ "có thể trùng T-x".

**KHÔNG làm:** agent tự quyết mục Cần Chủ; tự chạy lệnh thay chủ; nhắc lặp nhiều lần.

## 9. Hồ sơ dự án (bản đồ dự án)
**Người dùng nhận được:** mỗi dự án có một trang "đọc trước" cho agent và cho chủ. Agent mới vào dự án chỉ cần đọc trang này.

- **Trường** (markdown từng mục):
  - "Là gì", thư mục hoặc nguồn (đường dẫn máy), repo GitHub (chủ sở hữu/tên, nhánh mặc định), stack.
  - "Đọc trước" (danh sách link), cách deploy và ai chạy, danh sách cấm riêng của dự án.
  - **Lỗi đã gặp** (danh sách chỉ thêm: ngày, lỗi, cách tránh).
  - Cờ "dự án không code" và cờ "bắt buộc review".
- **Chung toàn workspace:** trang "Luật chung", gồm danh sách cấm chung và checklist trước khi giao. Agent đọc được qua CLI hoặc MCP.
- **Trang Bản đồ:** bảng mọi dự án: tên, agent quản lý, thư mục, số ticket Đang làm, chỉ báo sức sống, cập nhật cuối. Bản đồ trực quan nằm trên Tổng quan (mục 20); trang này giữ dạng bảng, thêm cột Nhóm, Ưu tiên, Đang đẩy, Duy trì.
- Mỗi lần sửa hồ sơ ghi lịch sử phiên bản.

## 10. Nhật ký quyết định
**Người dùng nhận được:** trả lời được câu "ai đã quyết cái này, vì sao, lúc nào", không sợ bị sửa lén.

- **Dòng:** lúc (ngày giờ), ai (chủ hoặc agent), dự án, quyết định, vì sao, căn cứ (link T-số, mã ticket, dòng cũ).
- **Chỉ thêm.** Không sửa, không xoá, kể cả chủ. Muốn đổi thì thêm dòng mới trỏ về dòng cũ; dòng cũ hiện chữ "đã có quyết định mới".
- Ai được ghi: chủ, `coordinator`, `manager`. Riêng dòng "chủ quyết" chỉ sinh từ Cần Chủ hoặc do chủ tự ghi.
- **Màn hình:** gom theo ngày, lọc theo dự án và theo ai, tìm theo chữ.
- **Luật dữ liệu:** trường "quyết định" có cảnh báo khi phát hiện mẫu giống số CCCD, số tài khoản, lương (dãy 9–12 số, cụm "lương"). Chỉ cảnh báo, không chặn. Mục đích là nhắc không đưa dữ liệu nhân sự vào.

## 11. Tổng quan và báo cáo
**Tổng quan** (trang mặc định) là màn hình **quản lý công việc tổng quát**, không phải hộp thư của chủ. Từ trên xuống:
1. **Dự án:** Bản đồ dự án (mục 20).
2. **Việc đang chạy:** thẻ việc của **mọi** dự án đang ở Đang làm và Chờ kiểm chứng (cùng kiểu thẻ với bảng việc ở mục 14), mỗi thẻ ghi ai đang cầm và đã cầm bao lâu.
3. **Agent đang làm gì:** chỉ agent **đang làm** — mỗi agent một dòng: việc đang cầm và thời gian từ tín hiệu cuối. Agent rảnh gom **một dòng** đếm số.
4. **Vừa xong:** ticket Xong, chọn cửa sổ **24 giờ** hoặc **7 ngày**, kèm bằng chứng rút gọn (hash 7 ký tự, URL, mã phiên bản).
5. **Cần chú ý:** phiên đứng hoặc lỗi; lượt giao không phản hồi; ticket "Đang làm mà không ai cầm"; bằng chứng trượt; ticket Chờ kiểm chứng quá 24 giờ. **Gom theo ticket: mỗi ticket đúng MỘT dòng**, các lý do hiện thành nhãn trên dòng đó. Một bằng chứng trượt mà **sau đó** đã có bằng chứng cùng loại Đạt thì không báo nữa.

**Cần Chủ không nằm đầu Tổng quan.** Nó chỉ là một ô gọn (số mục Chờ theo mức + link tới trang Cần Chủ + nút "Bắt đầu phiên duyệt") ở góc hoặc thanh bên phải của trang; sidebar vẫn có mục Cần Chủ mang huy hiệu đỏ, và đó là đường chính vào việc chờ chủ.

**Báo cáo sáng** (tự sinh lúc 07:30, xem trên web và gửi thông báo):
1. Cần Chủ (đọc trước).
2. Đề xuất 3 việc trọng tâm hôm nay. Agent `coordinator` ghi qua API; nếu chưa ghi thì để trống kèm chữ "chưa có đề xuất".
3. Hôm qua đã xong.
4. Đang chạy.
5. Rủi ro và lệch (mục Cần chú ý).
6. Quyết định mới trong Nhật ký.

**Handoff tối** (tự sinh lúc 20:00):
- 3 trọng tâm hôm nay: đạt hay chưa (theo trạng thái các ticket được gắn là trọng tâm).
- Trạng thái từng dự án.
- Chuyển sang mai.
- Cần Chủ mới phát sinh.

Báo cáo lưu theo ngày, xem lại được, xuất ra markdown được.

## 12. Thông báo
- **Kênh v0.1:** Telegram (1 chat của chủ; bot token và chat id cấu hình phía server) + trong app (chuông).
- **Bắn khi:**
  - Cần Chủ 🔴 mới, hoặc 🔴 quá 2 giờ.
  - Phiên đứng hoặc lỗi.
  - Lượt giao không phản hồi.
  - Bằng chứng trượt.
  - Ticket Xong: gom, tối đa 1 tin mỗi 15 phút.
  - Báo cáo sáng và tối.
- Mỗi tin có link thẳng tới đúng thẻ hoặc ticket. Có **giờ yên lặng** (mặc định 23:00–07:00): chỉ 🔴 được gửi trong khung này.
- Tắt từng loại trong Cài đặt.

## 13. Cách agent nói chuyện với Baton
Ba đường, cùng một bộ quyền: **CLI `baton`**, **MCP server**, **HTTP API** (JSON). Agent xác thực bằng token của mình.

**Mô hình kéo việc** (không cần webhook): agent tự gọi "việc của tôi" hoặc "chờ việc". Có chế độ chờ dài tới 60 giây; có việc mới hoặc tín hiệu mới thì trả về ngay.

**Lệnh CLI** (MCP có công cụ tương đương, cùng tên):

| Lệnh | Hành vi |
|---|---|
| `baton whoami` | In agent là ai, vai trò, dự án được vào, luật chung |
| `baton tasks [--wait 60]` | Liệt kê lượt giao `pending` hoặc `in_progress` của mình; `--wait` thì chờ tới khi có |
| `baton claim <lượt>` | Nhận lượt giao, mở phiên, in brief, hồ sơ dự án và lỗi đã gặp |
| `baton heartbeat [ghi chú] [--luot <lượt>]` | Nhịp tim; trả về tín hiệu nếu có (`STOP`, kết quả Cần Chủ mới). Chọn phiên: xem ghi chú `--luot` dưới bảng |
| `baton log <type> "<nội dung>" [--luot <lượt>]` | Gửi hoạt động: thought, action, question, result, error. Chọn phiên như `heartbeat` |
| `baton plan <file.json> [--luot <lượt>]` | Cập nhật kế hoạch phiên. Chọn phiên như `heartbeat` |
| `baton cancel <lượt> --reason "<lý do>"` | Huỷ lượt giao (mục 5 `canceled`, 19.6); chỉ người giao của lượt hoặc chủ; lý do bắt buộc; phiên đang chạy sang `stopping` |
| `baton evidence <MÃ> <type> <giá trị> [...]` | Gửi bằng chứng; chờ xác minh tối đa 10 giây rồi in kết quả |
| `baton submit <lượt> <file-bao-cao.md>` | Nộp báo cáo (file theo mẫu 5 mục ở mục 5); đóng phiên |
| `baton create <DỰ ÁN> "<tiêu đề>" [--brief f.md] [--parent MÃ] [--priority high] [--status backlog]` | Tạo ticket |
| `baton assign <MÃ> <agent> [--brief f.md] [--timeout 15] [--review]` | Tạo lượt giao; `--review` thì tạo lượt loại `review` (19.3), không cờ là `work`. `<agent>` là **tên hoặc ID**, so đúng (phân biệt hoa thường) trên các agent người gọi được thấy: khớp 1 thì giao cho agent đó; khớp nhiều (vd ID của agent này là tên của agent kia) thì báo lỗi kèm các ID, không tạo lượt; không khớp thì gửi nguyên chữ đó như ID (máy chủ kiểm như cũ), máy chủ không thấy thì báo "không tìm thấy agent (tên hoặc ID)" — cùng một thông điệp dù tên không tồn tại hay là tên của agent ngoài phạm vi người gọi |
| `baton link <MÃ-điều-phối> <MÃ-dự-án> [--type dieu_phoi\|related\|blocks]` | Nối hai ticket (mục 4, 19.4); mặc định `dieu_phoi`. Tiêu đề `[Giao …]` vẫn do người tạo ticket tự gõ |
| `baton verdict <lượt> accept\|return [--reason ...]` | Nghiệm thu |
| `baton reply <lượt> "<nội dung>"` | Trả lời câu hỏi của agent trên lượt giao (xem 19.6); chỉ người giao của lượt đó gọi được |
| `baton status <MÃ> "<trạng thái>" [--reason] [--original MÃ]` | Đổi trạng thái theo luật mục 4 |
| `baton show <MÃ>` | In ticket, lượt giao, bằng chứng, 10 bình luận cuối |
| `baton list [--project X] [--status ...]` | Liệt kê ticket |
| `baton comment <MÃ> "<nội dung>"` | Bình luận |
| `baton ask --level urgent\|today\|later --type ... "<tiêu đề>" [--option "A: ..."]... [--recommend A] [--command "..."] [--file ...] [--ticket MÃ] [--context f.md]` | Tạo mục Cần Chủ, in `T-số` |
| `baton result T-<số> [--wait 60]` | In trạng thái và kết quả của mục; `--wait` thì chờ tới khi xử lý xong |
| `baton decision <DỰ ÁN> "<quyết định>" --why "..." [--ref ...]` | Ghi Nhật ký |
| `baton profile <DỰ ÁN>` | In hồ sơ dự án |

- **`--luot <lượt>` của `heartbeat`, `log`, `plan`** (MCP: tham số tuỳ chọn `luot`): chọn phiên đang mở của **chính mình** thuộc lượt đó. Không có cờ thì đọc biến môi trường **`BATON_LUOT`** (rỗng = không đặt); **cờ thắng biến**. Cờ gõ mà rỗng (`--luot=`) ⇒ `INVALID_INPUT` (không rơi về biến hay về "không chỉ định"). Lượt chỉ định không khớp phiên mở nào của mình ⇒ `NOT_FOUND`, cùng một thông điệp dù lượt không tồn tại, của agent khác hay phiên đã đóng. Không chỉ định: không có phiên mở ⇒ `NOT_FOUND`; đúng 1 ⇒ phiên đó; **từ 2 phiên mở trở lên ⇒ `INVALID_INPUT`** (không chọn hộ), thông điệp chỉ cách dùng `--luot`/`BATON_LUOT`. (Chủ chốt T-73/T-75 = A, 23–24/10; #83)
- Mọi lệnh có `--json`. **Mã thoát:** 0 là xong; 1 là lỗi nghiệp vụ (in mã lỗi); 2 là lỗi xác thực hoặc mạng; 3 là nhận tín hiệu `STOP`.
- Trạng thái, mức, loại nhận **mã tiếng Anh** (bảng mục 0.1); UI và thông điệp lỗi hiển thị nhãn tiếng Việt.
- CLI đọc `BATON_URL` và `BATON_TOKEN` từ biến môi trường, **không bao giờ in token**.
- **API:**
  - Lỗi trả `{ "error": "<CODE>", "message": "<thông điệp tiếng Việt>" }`.
  - Mã lỗi tối thiểu: `EVIDENCE_REQUIRED`, `CHILDREN_OPEN`, `REASON_REQUIRED`, `INVALID_DUPLICATE_TARGET`, `FORBIDDEN`, `NOT_FOUND`, `INVALID_INPUT`, `PROJECT_NOT_ACCEPTING`, `SESSION_CLOSED`, `OPTIONS_REQUIRED`, `COMMAND_REQUIRED`, `INVALID_TOKEN`, `RATE_LIMITED`.
  - HTTP: 401 token sai; 403 không có quyền; 404 không tìm thấy (cũng dùng khi đối tượng ngoài phạm vi, để không lộ sự tồn tại); 409 xung đột trạng thái; 422 lỗi nghiệp vụ; 429 kèm `Retry-After`.
- **Giới hạn:** 600 request mỗi phút cho mỗi token. Lệnh chờ dài tính 1 request.
- **Webhook ra** (tuỳ chọn, cho tích hợp khác): 1 URL, ký HMAC-SHA256, gửi khi ticket đổi trạng thái, Cần Chủ mới hoặc đã xử lý, phiên đứng. Thử lại 3 lần.

## 14. Giao diện web của chủ
- **Chế độ màu:** ba lựa chọn **Sáng / Tối / Theo máy** (`prefers-color-scheme`), mặc định **Tối**. Lựa chọn (kể cả "theo máy") được nhớ giữa các lần vào, và đặt **trước khi trang vẽ** — không có nhoáng trắng khi đang ở chế độ tối. Cả hai chế độ phải đọc được: chữ lỗi, viền đỏ, nhãn ⚪ của d.317 đều đủ tương phản.
- **Sidebar:**
  - Tổng quan, **Cần Chủ** (huy hiệu), Tất cả việc, Báo cáo, Nhật ký quyết định, Đội agent.
  - "Tất cả việc" là danh sách ticket của **mọi dự án**, mở ở **kiểu Bảng**. Tiêu đề nhóm "Đội agent" bấm được để vào trang Đội agent, và không có link thứ hai tới cùng trang.
  - **Bản đồ dự án** không có mục riêng ở sidebar; trang vẫn còn và vào từ một dự án.
  - Rồi danh sách dự án theo nhóm, mỗi dự án có chấm sức sống.
  - Dưới cùng: Cài đặt.
  - Tên workspace mở một menu chứa **Đăng xuất** và **Đăng xuất mọi nơi** (mục 15); hai nút này không nằm trần trên thanh trên.
- **Danh sách ticket** (theo dự án hoặc "Tất cả dự án"):
  - Hai kiểu xem: danh sách gom theo trạng thái, và bảng (cột là trạng thái, kéo thả; kéo vào Xong mà thiếu bằng chứng thì thẻ bật về chỗ cũ và báo lý do). Trang việc của **một dự án** mặc định là kiểu **Bảng**; Danh sách là kiểu xem phụ. Bảng có **sáu cột** theo thứ tự **Backlog · Cần làm · Đang làm · Chờ kiểm chứng · Xong · Huỷ** (Trùng hiện trong cột Huỷ); nút `+` ở đầu cột Backlog (tạo vào Backlog) và đầu cột Cần làm (tạo vào Cần làm) (Chủ chốt T-111 = A, 29/10; BAT-64).
  - Thẻ việc **không** có ô "Chuyển cột": đổi trạng thái bằng kéo thả, panel chi tiết, hoặc phím `S`. Ưu tiên "Không" **không** in chữ trên thẻ. Mọi chỗ hiện người làm đều hiện **tên agent**, không bao giờ id.
  - **Cột (ở Bảng) và nhóm (ở Danh sách) rỗng:** cột rỗng thu hẹp nhưng vẫn hiện tiêu đề và số 0; nhóm rỗng ở Danh sách thì ẩn.
  - Lọc theo dự án, trạng thái, ưu tiên, người chịu trách nhiệm, người đang cầm, nhãn, "có cờ", "cần Chủ", "xong không bằng chứng". Bộ lọc ghi trên URL. Lưu thành view riêng.
  - Thanh lọc **không mở sẵn**: trên đầu danh sách chỉ có các **tab nhanh** (Đang chạy · Backlog · Tất cả) và một nút **"Lọc"** mở menu chứa mọi ô lọc trên, cùng với "Lưu thành view".
  - **Tạm (BAT-41):** danh sách không có ô tìm chữ; gõ đúng dạng mã ticket (vd `sai-5`) vào ô lọc **Nhãn** thì ngay dưới ô hiện thêm dòng "Mở SAI-5" dẫn tới `/t/SAI-5`; lọc nhãn giữ nguyên. Chờ chốt: `cau-hoi-spec.md` #167.
- **Chi tiết ticket** `/t/<MÃ>`:
  - Bên trái: tiêu đề và mô tả (sửa tại chỗ), brief (8 mục gập được), ticket con, **chuỗi lượt giao** dạng dòng thời gian (người giao → người nhận, trạng thái, báo cáo nộp, nghiệm thu), bằng chứng, bình luận xen lịch sử (lịch sử thu gọn).
  - Bên phải: thuộc tính, ticket liên quan (kể cả ticket điều phối), mục Cần Chủ liên quan.
- **Chi tiết phiên:** dòng hoạt động, kế hoạch, nút "Dừng".
- **Phím tắt:**
  - `C` tạo ticket; `G` rồi `T` tới Cần Chủ; `G` rồi `O` tới Tổng quan; `G` rồi `N` tới Nhật ký.
  - `Cmd/Ctrl+K` mở command menu: tìm mã, tiêu đề, T-số, chạy lệnh.
  - Trên ticket đang chọn: `S` trạng thái, `P` ưu tiên, `L` nhãn, `A` giao (chọn agent).
  - `J`/`K` di chuyển; `X` chọn; áp một phím cho nhiều ticket; `?` hiện bảng phím.
  - **Chọn nhiều và áp cho nhiều thẻ** (Chủ chốt T-38 = A, 19/10; chi tiết ở 19.12 câu 67–71): có thẻ đã chọn thì `S`/`P`/`L`/`A` áp cho **tập chọn**, không cho thẻ đang focus. Ô trạng thái, ưu tiên, nhãn của thanh chọn nhiều **chỉ đặt giá trị chờ**; `Enter`, mũi tên, Space, gõ chữ trong ô không gửi request; **chỉ nút "Áp"** cạnh mỗi ô mới áp (CoS/Chủ chốt 20/10, câu 70). Áp cho **N ≥ 10** thẻ thì hỏi lại "Áp cho N thẻ?" trước khi gửi; N < 10 áp luôn. `A` mở **một** hộp "Giao N thẻ" (đã có nút gửi tường minh, không hỏi thêm). Bấm chuột vào ô tick của một thẻ ở màn rộng thì thẻ đó thành thẻ đang focus và mở panel; ở khổ hẹp thì không mở panel.
- **Tốc độ:**
  - Mọi thao tác sửa hiện ngay trên màn hình trước khi server trả lời; server từ chối thì hoàn lại và báo lỗi dạng toast ghi rõ lý do.
  - Sau lần tải đầu, chuyển trang không có màn hình chờ toàn trang. Danh sách 5.000 ticket cuộn mượt.
  - Thay đổi do agent tạo hiện lên trong vòng 3 giây, không cần tải lại trang.
- **Điện thoại (375px):** Tổng quan, Cần Chủ (kể cả phiên duyệt và ô trả lời hàng loạt), chi tiết ticket và báo cáo dùng tốt. Bảng kéo thả không bắt buộc.
- **Thời gian** hiển thị dạng tương đối ("12 phút trước"), rê chuột thấy giờ đầy đủ theo giờ Việt Nam.
- **Có bản mới:** tab đang chạy bản web cũ sau một lần deploy thì hiện một dòng nhỏ "Có bản mới — tải lại trang" dưới thanh trên; bấm thì tải lại trang. Giao diện **không bao giờ tự tải lại** (chủ có thể đang gõ dở). Tab kiểm khi quay lại hiện, khi được focus lại và định kỳ mỗi 5 phút; kiểm lỗi (mất mạng, …) thì im lặng, không hiện gì (BAT-39).

## 15. Bảo mật
- **Chủ đăng nhập** bằng mật khẩu cộng mã TOTP (2 lớp). Passkey để sau. Phiên đăng nhập 30 ngày, có nút đăng xuất mọi nơi.
- Agent chỉ dùng token, không đăng nhập web.
- Token GitHub và Telegram lưu phía server, **không bao giờ trả ra API hay UI**.
- Mọi hành động có dấu vết ai làm (mục 4 Lịch sử). Nhật ký truy cập của agent (lệnh gì, lúc nào) giữ 30 ngày.
- **Sao lưu:** xuất toàn bộ dữ liệu ra JSON bằng một nút (chỉ chủ). Có sao lưu tự động hằng ngày, giữ 14 bản.

## 16. Nhập dữ liệu (chuyển từ công cụ cũ)
- **Nhập ticket** từ file JSON theo định dạng Baton công bố. Mỗi mục gồm: mã cũ, dự án đích, tiêu đề, mô tả, trạng thái cũ, ưu tiên, nhãn, mã cha cũ, mã liên quan cũ, các mốc thời gian, bình luận.
  - Bảng ánh xạ trạng thái cũ sang trạng thái Baton do người nhập chọn trên màn hình xem trước.
  - Ticket nhận mã mới; mã cũ lưu trong trường "mã cũ", tìm được.
  - Ticket cũ ở trạng thái "xong" thì vào Xong, gắn nhãn "nhập, không bằng chứng", không bị chặn.
- **Nhập Cần Chủ** từ markdown theo cấu trúc: các khối mức 🔴, 🟡, ⚪; mỗi mục có tiêu đề bắt đầu bằng `T-số · dự án · loại — tiêu đề`; cộng bảng "Đã xử lý" (ngày | mục | kết quả).
  - Giữ nguyên số T. Bộ đếm T tiếp tục từ số lớn nhất.
- **Nhập Nhật ký quyết định** từ markdown: các mục ngày, mỗi ngày một bảng (giờ | ai | dự án | quyết định | vì sao | căn cứ).
- Chạy lại lần nữa thì bỏ qua mục đã nhập (so theo mã cũ, T-số, hoặc cặp ngày giờ và nội dung). Cuối lượt nhập in báo cáo: đã nhập, bỏ qua, lỗi (kèm lý do từng dòng).
- Nhập không bắn thông báo và không ghi đè dữ liệu đang có.

## 17. Định nghĩa xong của v0.1
1. Tạo 3 dự án và 4 agent (coordinator, manager, worker, reviewer). Chuỗi đầy đủ chạy qua CLI:
   - coordinator tạo ticket điều phối và giao manager.
   - manager tạo ticket dự án và giao worker.
   - worker nhận, gửi nhịp tim, gửi commit, rồi nộp báo cáo.
   - manager giao reviewer; reviewer gửi review `pass`.
   - Commit được merge, và ticket **tự lên Xong**. Cả hai ticket (điều phối và dự án) phản ánh đúng.
2. Commit chưa merge: ticket ở Chờ kiểm chứng. Merge xong: trong 10 phút ticket tự lên Xong.
3. Agent worker im 30 phút: Tổng quan hiện phiên đứng, dự án thành 🟡, Telegram nhận 1 tin.
4. manager gọi `ask` loại Quyết định, mức 🔴, 3 phương án:
   - Telegram báo ngay (ngay = trong một nhịp cron, ≤ 60 giây).
   - Trên điện thoại, chủ chạm nút phương án B rồi chạm **Gửi duyệt**.
   - `result --wait` của agent trả về phương án B trong vòng 3 giây.
   - Nhật ký có dòng mới; ticket liên quan có bình luận tự động.
5. Ô trả lời hàng loạt: dán 3 dòng `T-x: ...`, cả 3 mục được xử lý đúng. Dòng sai mã thì báo đỏ.
6. Dự án không có ticket Đang làm hiện "Dự án không chạy".
7. Token agent worker thử giao việc: `FORBIDDEN`. Token agent không có quyền dự án `INC` đọc ticket INC: `NOT_FOUND`.
8. Chủ bấm Dừng: lệnh `heartbeat` kế tiếp của agent thoát mã 3.
9. Nhập được file `can-chu.md` và `decision-log.md` mẫu (định dạng mục 16), giữ nguyên số T. **Hoãn theo T-119 (mục 16).**
10. Tạo **200 dự án và 200.000 ticket** giả: danh sách và Tổng quan vẫn mở trong dưới 1 giây sau lần tải đầu. Thiết kế còn phải chịu được tiếp **300 dự án** (và mọi tổ hợp nhỏ hơn 200.000 ticket) mà không đổi kiến trúc (xem 19.12 câu 1).
11. Tổng quan, Cần Chủ, chi tiết ticket dùng tốt ở bề rộng 375px.

## 18. Để sau (không làm ở v0.1, nhưng không được chặn đường)
- Baton tự khởi động agent khi có lượt giao (gọi script cục bộ hoặc cloud).
- Nhiều workspace và nhiều khách hàng, đăng ký, thanh toán (ship công khai).
- Giao diện tiếng Anh.
- Document dài gắn dự án; milestone.
- Tích hợp GitHub hai chiều (tự liên kết PR theo mã ticket trong tên nhánh).
- Xuất `can-chu.md` tự động để xem bằng trình xem markdown ngoài.
- Passkey; thông báo qua email.

---

## 19. Làm rõ hành vi (sau lần kiểm SPEC đầu, 30/09)
Mục này **ưu tiên hơn** các mục trên nếu có chỗ lệch. Đây là quyết định sản phẩm do CoS đề xuất, chờ chủ duyệt.

### 19.1 Lượt giao "mở" và người đang cầm
- Lượt **mở** là lượt ở `pending` hoặc `in_progress`. Lượt `submitted` không còn mở, mà đang **chờ nghiệm thu**.
- Mỗi lượt có **loại**: `work` hoặc `review` (đúng mã máy ở 0.1; xem 19.12 câu 29). Mỗi ticket có tối đa 1 lượt `work` mở và 1 lượt `review` mở cùng lúc.
- **Người đang cầm**, tính theo thứ tự ưu tiên:
  1. Agent của lượt `review` mở.
  2. Agent của lượt `work` mở.
  3. Nếu có lượt `submitted` chờ nghiệm thu: người giao lượt đó, hiện "chờ <tên> nghiệm thu".
  4. Chủ, nếu chủ bấm "Tôi làm".
  5. Nếu không có ai: trống.
- Cờ **"Đang làm mà không ai cầm"** chỉ bật khi ticket ở nhóm `active`, người đang cầm trống, và tình trạng này kéo dài 24 giờ.

### 19.2 Ticket đổi trạng thái theo kết quả nộp và nghiệm thu

| Sự kiện | Ticket |
|---|---|
| Nộp `done` | Kiểm cổng: đủ thì **Xong**, thiếu thì **Chờ kiểm chứng** |
| Nộp `partial` | Giữ **Đang làm**. Người giao chọn trả lại, hoặc tách việc còn lại thành ticket con rồi nghiệm thu đạt |
| Nộp `blocked` | Về **Cần làm**. Hiện ở "Cần chú ý" cho người giao |
| Nghiệm thu `accepted` | Ticket chưa Xong thì sang **Chờ kiểm chứng**, và Baton kiểm cổng ngay |
| Nghiệm thu `returned` | Giữ **Đang làm**. Lượt mới được tạo (xem 19.5) |
| Lượt bị `canceled`, không còn lượt mở nào | Về **Cần làm** |

- Đổi tay sang Xong mà thiếu bằng chứng: từ chối với `EVIDENCE_REQUIRED`. Ticket đang ở nhóm `active` thì sang Chờ kiểm chứng; đang ở nhóm `planned` thì giữ nguyên.
- **Tự lên Xong** chỉ áp cho ticket ở **Chờ kiểm chứng**. Commit được merge khi ticket còn Đang làm thì chưa có gì xảy ra; cổng được kiểm lúc nộp.

### 19.3 Review và bằng chứng mới
- Review chỉ tính khi là `review` ĐẠT được gửi **sau** bằng chứng `commit` hoặc `deploy` cuối cùng.
- Có commit hoặc deploy mới sau review thì review cũ **hết hiệu lực**. Ticket ở hoặc về Chờ kiểm chứng, gắn cờ **"cần review lại"** (hiện ở "Cần chú ý"). Người giao, hoặc agent `coordinator`, mở lượt `review` mới.
- Ticket đã Xong không bị hạ. Bằng chứng gửi sau khi Xong vẫn được lưu và hiện nhãn "sau khi xong".
- **"Khác người làm"** nghĩa là agent gửi review không phải người nhận của bất kỳ lượt `work` nào trên ticket đó. Sai thì bị từ chối với `REVIEWER_IS_WORKER`.
- Lượt `review` do `manager` hoặc `coordinator` tạo. Reviewer có phiên riêng như mọi lượt.
- Reviewer nộp lượt review bằng cách gửi bằng chứng `review` cộng báo cáo. Lượt review **tự `accepted`**, không cần nghiệm thu, vì kết luận đã nằm trong review.

### 19.4 Ticket điều phối
- Liên kết giữa ticket điều phối (ở dự án điều phối, vd `COS`) và ticket dự án là loại riêng: **"điều phối"**, khác "liên quan". Một ticket điều phối nối được **1 hoặc nhiều** ticket dự án.
- Ticket điều phối **không qua cổng bằng chứng**. Trạng thái của nó **tự theo** các ticket dự án:
  - Có ít nhất 1 ticket dự án ở nhóm `active`: ticket điều phối là **Đang làm**.
  - Tất cả đã kết, và ít nhất 1 Xong: **Xong**.
  - Tất cả Huỷ hoặc Trùng: **Huỷ**, lý do "mọi ticket dự án đã huỷ".
- Chủ ép trạng thái ticket điều phối thì chỉ ticket đó đổi, không lan sang ticket dự án. Ticket điều phối không có lượt `work` của `manager` riêng; lượt giao cho `manager` gắn trên chính ticket điều phối.

### 19.5 Trả lại
- `returned` tạo lượt mới trạng thái `pending`, cùng người nhận. Người nhận phải `nhan` lại, mở **phiên mới**. Hạn phản hồi áp lại.
- Brief của lượt mới = brief cũ, cộng mục **"Lý do trả lại"** đặt ở đầu.
- **Tỉ lệ đạt lần đầu** của agent (hiện ở trang agent, tính 30 ngày gần nhất) = số ticket mà lượt `work` đầu tiên của agent được `accepted` ÷ số ticket agent đã nộp ít nhất 1 lần.

### 19.6 Phiên khi huỷ, khi chờ Chủ, khi hỏi người giao
- **Huỷ lượt** có phiên đang chạy: phiên sang `stopping`, xử lý như bấm Dừng (mục 6).
- **Phiên `waiting_owner`:** không bao giờ bị tính đứng. Khi mục Cần Chủ được xử lý hoặc bỏ qua, phiên về `running` và ngưỡng đứng tính lại từ lúc đó.
- **Hỏi người giao:** agent gửi hoạt động `question` thì phiên sang `waiting_assigner`. Trạng thái này không bị tính đứng, nhưng quá 60 phút thì hiện ở "Cần chú ý".
  - Người giao là agent: câu hỏi hiện trong `baton tasks` của người giao. Người giao trả lời bằng `baton reply <lượt> "<nội dung>"`.
  - Người giao là chủ: trả lời trên trang ticket.
  - Có câu trả lời thì phiên về `running`, và lần gọi kế tiếp của agent nhận được câu trả lời.
- **Chỉ báo dự án** (thay thế mục 2):
  - 🟢 có ít nhất 1 ticket nhóm `active`, và không có điều kiện 🟡 nào.
  - 🟡 có phiên `stalled` hoặc `error`; có lượt "Không phản hồi"; có cờ "không ai cầm"; hoặc có cờ "cần review lại" quá 24 giờ.
  - ⚪ không có ticket nhóm `active`.
  - Phiên `waiting_owner` vẫn tính 🟢, nhưng dòng dự án ghi thêm "chờ Chủ: T-x".

### 19.7 Commit chưa merge và bằng chứng trượt
- `failed` **không chặn vĩnh viễn**: gửi bằng chứng mới là được. Server chỉ tự thử lại khi lỗi là lỗi mạng hoặc lỗi GitHub.
- Commit `pushed` quá 7 ngày chưa merge: dừng theo dõi. Bằng chứng mang nhãn "chưa merge sau 7 ngày"; hiện ở "Cần chú ý"; Telegram báo 1 lần. Gửi lại cùng commit để theo dõi thêm 7 ngày.

### 19.8 Hạn và thông báo của Cần Chủ
- Quá hạn: **không đổi mức**. Thẻ có viền đỏ, chữ "quá hạn X", và được đưa lên đầu khối của nó.
- **Hạn mặc định của 🟡:** tạo trước 18:00 thì hạn là 20:00 cùng ngày; từ 18:00 trở đi thì hạn là 20:00 hôm sau. 🔴 luôn là 4 giờ kể từ lúc tạo.
- Loại `Chỉ để biết` tối đa là 🟡. Gửi 🔴 thì server tự hạ về 🟡 và báo lại cho agent trong kết quả trả về.
- **Giờ yên lặng:** 🔴 mới vẫn gửi ngay (ngay = trong một nhịp cron, ≤ 60 giây). Lời nhắc sau 2 giờ mà rơi vào giờ yên lặng thì hoãn tới cuối giờ yên lặng.

### 19.9 Kết quả, bỏ qua, mở lại
- **Kết quả:**
  - Loại `Quyết định`: bắt buộc chọn 1 phương án, ghi thêm là tuỳ chọn.
  - Các loại khác: chữ là tuỳ chọn. Để trống thì Baton tự điền "đã chạy" (loại lệnh), "đã xem" (loại review), "đã đọc" (loại chỉ để biết).
- **Bỏ qua:** bắt buộc lý do. Ghi Nhật ký ("T-x bỏ qua: lý do"), bình luận lên ticket liên quan, agent nhận trạng thái `skipped`.
- **Mở lại:** thêm dòng Nhật ký mới "T-x mở lại" và bình luận "T-x mở lại". Xử lý lần sau lại thêm dòng mới và bình luận mới. Dòng cũ không bị sửa.
- **`baton result --wait`** hết thời gian mà mục chưa xử lý: in "chưa xử lý", thoát **mã 4**. Bảng mã thoát ở mục 13 được bổ sung: 4 = hết thời gian chờ.

### 19.10 Các điểm "nên rõ"
- **Chủ tự làm:** nút "Tôi làm" chuyển ticket sang Đang làm, người đang cầm là chủ, không có nhịp tim. Vào Xong vẫn qua cổng; chủ ép được.
- **Ticket con do agent `worker` tạo:** qua cổng như ticket thường. Lượt trên ticket cha bị huỷ thì ticket con không đổi, và hiện cảnh báo "lượt cha đã huỷ".
- **Dự án không code:** chủ bỏ qua mục xác nhận thì ticket ở lại Chờ kiểm chứng. Cổng áp theo cờ "có code hay không" **tại thời điểm kiểm**.
- **Ô trả lời hàng loạt:**
  - Dòng trỏ tới mục đã xử lý: báo đỏ "đã xử lý, mở lại trước".
  - Nhiều dòng cùng mã trong một lần dán: báo đỏ tất cả các dòng đó, không áp dòng nào.
- **Nút và phím trên thẻ:** theo bảng "Trả lời bằng nút rồi bấm Gửi" ở mục 8. Điện thoại dùng nút, không cần phím.
- **Mã lỗi thêm:** `REVIEWER_IS_WORKER`, `ALREADY_RESOLVED`.

### 19.11 Mặc định bổ sung (sau lần kiểm SPEC thứ hai)
- **Review KHÔNG ĐẠT:** lượt review vẫn tự `accepted`, nhưng review đó không mở cổng. Ticket giữ Chờ kiểm chứng và hiện ở "Cần chú ý" cho người giao, kèm ghi chú của reviewer.
- **Ticket điều phối:** chưa có ticket dự án nào ở nhóm `active`, và chưa phải tất cả đã kết, thì ticket điều phối giữ trạng thái hiện tại.
- **Huỷ lượt `work` khi lượt `review` đang mở:** lượt review không bị huỷ theo.
- **Ticket cha ở Chờ kiểm chứng vì còn ticket con:** hiện dòng "chờ N ticket con". Con cuối cùng kết thì cha tự kiểm cổng lại.
- **Kết quả Cần Chủ khi phiên đã đóng, hoặc agent đã bị tắt:** kết quả vẫn lưu, lấy được qua `baton result`. Không gửi thêm tín hiệu nào.

### 19.12 Chốt của phiên spec
Mục này gom chốt của chủ qua ba đợt, trả lời các câu trong `cau-hoi-spec.md`:
- **Đợt 01/10/2026** — câu **#1–#8**, là các câu **1–8** dưới đây.
- **Đợt 02/10/2026 (T-64)** — câu **#18–#27**, là các câu **9–18** dưới đây.
- **Đợt 03/10/2026 (T-69)** — câu **#9–#17** và **#28–#54**, là các câu **19–54** dưới đây.
- **Đợt 04/10/2026 (T-76)** — câu **#57–#59** và **#66–#69**, là các câu **55–61** dưới đây.
- **Đợt 04/10/2026 (T-80 + T-80b)** — câu **#71**, **#73**, **#74**, **#75**, là các câu **62–65** dưới đây.

Mục này **ưu tiên hơn** chữ cũ ở các mục trên nếu có chỗ lệch.

1. **Mốc hiệu năng nghiệm thu (thay cho số cũ ở 17.10).** v0.1 nghiệm thu đạt khi có **200 dự án và 200.000 ticket** mà danh sách ticket và Tổng quan vẫn mở **dưới 1 giây** sau lần tải đầu. Thiết kế còn phải chịu được tiếp **300 dự án** (và mọi tổ hợp nhỏ hơn 200.000 ticket) mà **không đổi kiến trúc**.

2. **Lệnh `baton reply` (bổ sung bảng lệnh mục 13).** `baton reply <lượt> "<nội dung>"` trả lời câu hỏi mà agent gửi trên lượt giao (mục 19.6).
   - **Chỉ người giao của lượt đó** gọi được. Agent khác gọi → `FORBIDDEN`.
   - Chủ trả lời từ web ở trang chi tiết ticket; hành vi giống hệt.
   - Câu trả lời được ghi thành **một hoạt động trên phiên của người hỏi** (phiên của agent đã gửi `question`), **đồng thời** là một **bình luận trên ticket**.

3. **Khởi tạo chủ, và lấy lại 2FA (bổ sung mục 15).** Chủ được tạo bằng **lệnh chạy trên máy chủ** `baton-admin init` — **không có trang web công khai** nào làm việc này.
   - `baton-admin init` đặt tên chủ và mật khẩu, hiện **mã QR TOTP một lần**, và in **10 mã khôi phục dùng một lần**.
   - Lệnh chỉ chạy được khi **chưa có chủ** nào.
   - Mất thiết bị TOTP: đăng nhập bằng **mật khẩu + 1 mã khôi phục**, rồi đặt lại TOTP.
   - Mất cả mã khôi phục: `baton-admin reset-2fa` trên máy chủ.
   - **Mọi lần đặt lại** (TOTP hoặc mật khẩu) ghi một dòng Lịch sử và bắn một thông báo Telegram.

4. **"Chung" trong Cần Chủ là giá trị rỗng (mục 8).** "Chung" **không phải một dự án**; nó là trường dự án để **rỗng**.
   - Giao diện hiện nhãn **"Chung"** cho giá trị rỗng.
   - Bộ lọc theo dự án có một lựa chọn **"Chung"** (lọc các mục có trường dự án rỗng).
   - `baton ask` không truyền dự án → mục là Chung.
   - Dòng Nhật ký tự sinh từ một mục Chung để **trống** trường dự án.

5. **Mã phiên bản của bằng chứng `deploy` (mục 7).** Mã phiên bản **chỉ được lưu và hiện**, server **không kiểm** nó. Xác minh deploy chỉ dựa trên mã HTTP **2xx hoặc 3xx**.

6. **Gửi Telegram thất bại (mục 12).** Thử lại **3 lần** giãn cách: **10 giây, 60 giây, 5 phút**.
   - Vẫn trượt: tin được **giữ trong chuông thông báo trong app**, và hiện ở **"Cần chú ý"** dòng `Không gửi được thông báo Telegram (lý do)`.
   - Thất bại gửi Telegram **không bao giờ chặn luồng chính** (lệnh gây ra thông báo vẫn thành công).

7. **Sao lưu (mục 15).** Bản sao lưu đặt ở **nơi lưu trữ khác DB chính** (R2).
   - Màn hình Cài đặt liệt kê **14 bản**, mỗi bản có **ngày** và **dung lượng**, kèm **nút tải về**.
   - **Phục hồi là việc tay, có tài liệu hướng dẫn** — v0.1 **không** có nút phục hồi.

8. **Phạm vi tìm của `Cmd/Ctrl+K` (mục 14).** Command menu tìm **chỉ** trong: **mã ticket**, **tiêu đề ticket**, **mã cũ** (với ticket được nhập, mục 16), **T-số**, và **tiêu đề mục Cần Chủ**. Khớp theo **chuỗi con**, không cần tìm toàn văn. Tìm trong **mô tả, brief, bình luận** để v0.2. (Việc "tìm theo chữ" của Nhật ký quyết định ở mục 10 vẫn giữ nguyên.)

9. **"Mở lại" là mọi lần rời nhóm `closed` (sửa mục 4 dòng 138; chốt cho `cau-hoi-spec.md` #18).** Mục 4 chỉ nói ca "về Cần làm"; nay **mọi** lần rời nhóm `closed` đều tính là "mở lại", nên **chỉ chủ** làm được.
   - Gồm cả Xong → Đang làm, Huỷ → Backlog, Xong → Huỷ — không riêng ca về Cần làm.
   - Rộng hơn chữ cũ của SPEC, **có chủ ý**: đây là hướng an toàn, agent không bao giờ sửa được kết luận của một ticket đã kết.

10. **"Ticket gốc hợp lệ" của trạng thái Trùng (bổ sung mục 4 dòng 137; chốt cho #19).** Mục 4 nêu mã lỗi `INVALID_DUPLICATE_TARGET` nhưng không định nghĩa "hợp lệ". Hợp lệ là **đủ bốn** điều kiện:
    - **Tồn tại và chưa xoá mềm.**
    - **Cùng workspace** (dữ liệu tách theo workspace — mục 1); **khác dự án thì được**, vì mục 4 nói liên kết ticket "được khác dự án".
    - **Không phải chính nó.**
    - **Không tạo chuỗi trùng vòng** — ticket gốc không được trỏ về chính ticket đang đánh trùng, trực tiếp hay qua chuỗi. Thiếu điều kiện này thì mọi chỗ "đi theo ticket gốc" lặp vô tận.

11. **"Xoá bất cứ thứ gì" nói về xoá đối tượng (giải nghĩa mục 3 so với mục 4; chốt cho #20).** Hàng "Xoá bất cứ thứ gì — không bao giờ" của bảng quyền mục 3 áp cho xoá **đối tượng**: ticket, bằng chứng, dòng lịch sử, mục Cần Chủ.
    - **Bỏ một nhãn không thuộc hàng đó.** Bỏ nhãn là đặt lại giá trị của một trường, cùng loại việc với đổi ưu tiên, và vẫn để lại dấu vết trong lịch sử.
    - Gắn nhãn **và** bỏ nhãn đều đi qua hàng **"Đổi trạng thái ticket"**.

12. **Ticket cha chỉ đặt lúc tạo (bổ sung mục 4, trường "Ticket cha"; chốt cho #21).** Ticket cha đặt **lúc tạo ticket**, và **không có đường đổi cha hay bỏ cha về sau**.
    - Lý do: đổi cha là đổi luật `CHILDREN_OPEN` của hai cây cùng lúc (cây cũ có thể vừa đủ điều kiện vào Xong, cây mới thì ngược lại).
    - Lệnh nối liên kết ticket cố ý **không nhận** loại `parent`.

13. **Quyền bình luận (bổ sung mục 3; liên quan mục 4, 6; chốt cho #22).** Bảng quyền mục 3 không có hàng nào cho bình luận. Điều kiện là **"agent được vào dự án"**, cộng **không bị `disabled`** — **không phân biệt vai trò**.
    - Kể cả **`reviewer`** bình luận được, vì mục 6 đòi reviewer gửi được tín hiệu trên phiên của nó.
    - **Không mượn** một hàng nào khác của bảng quyền (vd "Đổi trạng thái ticket"): mượn là âm thầm đổi nghĩa của hàng đó, và sẽ chặn `reviewer` bình luận.

14. **Xoá và sửa bình luận (bổ sung mục 4, phần Bình luận; chốt cho #23).** Mục 4 nói "Tác giả tự sửa được (có ghi 'đã sửa'). Agent không xoá được", nhưng không nói về chủ.
    - **Chủ xoá được** bình luận, và là xoá **mềm** (còn dấu vết) — mục 15 đòi "mọi hành động có dấu vết ai làm", nên một bình luận biến mất không dấu vết là sai hướng. Đường đọc lọc bình luận đã xoá.
    - "**Tác giả** tự sửa được" hiểu **đúng chữ**: **chủ cũng không sửa được** bình luận của agent, vì một bình luận của agent bị chủ sửa thì lịch sử hội thoại không còn đáng tin.

15. **Ngoài phạm vi: đường ĐỌC trả 404; đường GHI: không thấy được đối tượng ⇒ 404 giống hệt id bịa, thấy được mà không có quyền ⇒ 403 (bổ sung mục 13 và 17.7; chốt cho #24, sửa theo #175–#177).** Mục 13 và 17.7 chỉ nói về đường đọc; nay chốt cho cả hai đường.
    - **Đường ĐỌC → `NOT_FOUND`/404** — để **không lộ sự tồn tại**.
    - **Đường GHI → `FORBIDDEN`/403** khi người gọi thấy được đối tượng mà không có quyền. Mã lỗi còn là tín hiệu cho CLI: 404 làm agent tưởng mình gõ sai id và đi sửa dữ liệu gửi lên, còn 403 nói đúng việc phải làm là xin quyền. Id của đối tượng người gọi **không thấy được** thì ra 404 giống hệt id bịa — hai gạch dưới.
    - **Quyền phải kiểm trước khi tra đối tượng, hoặc đối tượng phải được tra ngay trong phạm vi người gọi** (ngoài phạm vi thì câu tra rỗng, đi cùng đường với id bịa). Tra dự án trước rồi mới kiểm quyền thì 404 ("không có thật") khác 403 ("có thật, không được vào") — đó là một máy dò sự tồn tại. Với agent ngoài phạm vi, **cả hai ca phải ra phản hồi giống hệt nhau**.
    - **Agent được tham chiếu bằng ID trong thân lệnh ghi** (người nhận lượt giao `nguoi_nhan_agent_id`, người chịu trách nhiệm `chiu_trach_nhiem_agent_id`) mà nằm **ngoài phạm vi quyền người gọi** → `NOT_FOUND`/404, **giống hệt** ID không tồn tại (cùng mã, thông điệp, status), **không** trả 403 — để không lộ sự tồn tại của agent. Agent người gọi **thấy được** mà đã tắt hoặc không vào dự án thì vẫn `FORBIDDEN` (mục 5). (Chủ chốt T-58 = A, 22/10; #172)
    - **Id đối tượng mà cửa ghi chỉ biết dự án sau khi tra** — id **lượt giao, phiên, ticket, bình luận, bằng chứng, dự án** — ở **mọi lệnh ghi** (trên đường dẫn hay trong thân): đối tượng **ngoài phạm vi người gọi** → `NOT_FOUND`/404 **giống hệt** id không tồn tại (cùng mã, thông điệp, status, thân), và **không ghi gì** (không Lịch sử, Nhật ký, thông báo, tín hiệu phiên, "lần cuối lên tiếng"). Người gọi **thấy được** đối tượng mà không có quyền làm việc đó → vẫn `FORBIDDEN`/403. Lý do không trả 403 cho cả hai: cửa ghi không biết dự án của một id trước khi tra nó, nên 403 cho id bịa sẽ báo "không có quyền" cho người **trong** phạm vi chỉ gõ sai id. Lệnh **chỉ chủ** (hoặc kiểm vai trò/cửa dự án **trước** khi tra) trả 403 cho mọi id — không lộ gì, giữ nguyên. (Chủ chốt T-73/T-75 = A, 23–24/10; #175, #176, #177)
      - "Thấy được" một **lượt giao** trên đường ghi = ticket của lượt trong phạm vi đọc của người gọi, **hoặc** người gọi là người nhận hay người giao của chính lượt đó. Một **phiên**: ticket trong phạm vi đọc, **hoặc** người gọi là agent của phiên, **hoặc** là người giao của lượt của phiên. Nên người nhận/người giao bị gỡ khỏi dự án vẫn làm tiếp lệnh trên lượt **của mình** (`claim`, `heartbeat`, `log`, `plan`, `submit`, `cancel`, `verdict`, `reply`; câu 37, 44). Đường **đọc** phiên vẫn theo luật đọc ticket.
      - "Thấy được" một **ticket** = ticket trong phạm vi đọc. Một **bình luận / bằng chứng**: ticket của nó trong phạm vi đọc, **hoặc** người gọi là tác giả bình luận / người gửi bằng chứng. Người nhận lượt bị gỡ khỏi dự án nhận 404 trên lệnh theo id ticket (sửa, đổi trạng thái, bình luận, gửi bằng chứng…).
      - "Thấy được" một **dự án** = dự án người gọi được vào (chủ và agent "tất cả dự án" thấy mọi dự án).
      - **Ticket gốc của Trùng** (mục 4) ngoài phạm vi người gọi coi như không có → `INVALID_DUPLICATE_TARGET`, giống id bịa. `coordinator` chỉ được vào một số dự án **không** đánh Trùng với ticket ngoài các dự án đó, và **không** đề xuất trọng tâm (mục 11) với ticket ngoài các dự án đó (404).

16. **Ai nối được liên kết `dieu_phoi` (bổ sung 19.4 và bảng quyền mục 3; chốt cho #25).** **Chỉ chủ và agent vai `coordinator`** nối được liên kết loại `dieu_phoi`.
    - Lý do: liên kết `dieu_phoi` là thứ **định nghĩa** một ticket là ticket điều phối, mà ticket điều phối **không qua cổng bằng chứng** (19.4) — nên để một `manager` tự nối là mở một đường vòng qua cổng bằng chứng.
    - Luật mới là điều kiện **cộng thêm**: các điều kiện quyền và phạm vi dự án sẵn có vẫn áp (phải có quyền trên **cả hai** đầu nối).
    - **`related` và `blocks` giữ như hiện tại** — không siết, không nới.

17. **Ticket dự án xoá mềm và ticket điều phối (bổ sung 19.4 so với mục 4; chốt cho #26).** Trạng thái ticket điều phối tự theo các ticket dự án nối bằng `dieu_phoi`; nay chốt cách tính khi chủ xoá mềm hoặc khôi phục.
    - Ticket **đã xoá mềm không tính** vào tập ticket dự án mà ticket điều phối theo.
    - Xoá ticket **cuối cùng** của tập (không còn ticket nào) ⇒ ticket điều phối **giữ nguyên** trạng thái, cùng tinh thần 19.11 ("chưa đủ dữ kiện thì giữ nguyên").
    - **Khôi phục** một ticket ⇒ **tính lại** trạng thái ticket điều phối theo tập mới.

18. **Quyền của hai lệnh cấp số (bổ sung mục 3; liên quan mục 4, 8; chốt cho #27).** Bảng quyền mục 3 không có hàng nào cho "cấp số", nhưng cấp số là lệnh **ghi** thật: gọi một lần là đốt vĩnh viễn một số. Dùng hàng **gần nhất theo mục đích**:
    - Cấp **số ticket** (mục 4, "tăng dần trong dự án, không tái dùng") đi qua hàng **"Tạo ticket"**.
    - Cấp **`T-số`** (mục 8) đi qua hàng **"Tạo mục Cần Chủ"**.
    - Không truyền cờ phạm vi lượt giao nào, nên `worker` bị từ chối — mặc định an toàn.

19. **Mã lỗi thuộc lớp HTTP nào (bổ sung bảng mục 13; chốt cho #9).** Mục 13 nêu các lớp HTTP nhưng không nói mã lỗi nào thuộc lớp nào. Nay chốt theo nghĩa của lớp:
    - **409** cho "trạng thái hiện tại không cho phép": `PROJECT_NOT_ACCEPTING`, `SESSION_CLOSED`, `CHILDREN_OPEN`, `ALREADY_RESOLVED`.
    - **422** cho "dữ liệu hoặc điều kiện nghiệp vụ chưa đạt": `EVIDENCE_REQUIRED`, `REASON_REQUIRED`, `INVALID_DUPLICATE_TARGET`, `INVALID_INPUT`, `OPTIONS_REQUIRED`, `COMMAND_REQUIRED`, `REVIEWER_IS_WORKER`.
    - **500 `INTERNAL`** cho lỗi máy chủ không lường trước; CLI thoát **mã 2**. Mã này là mã **thêm**, vì bảng mục 13 tự khai là "mã lỗi tối thiểu".
    - Bảng ánh xạ nằm **một chỗ** và có test phủ từng mã.

20. **Chủ chỉnh được gì của quyền một agent (bổ sung mục 3; chốt cho #10).** Chủ chỉnh được **cả hai**: `cho_phep` (bật/tắt ô) **và** `pham_vi` của ô.
    - Chủ bật một ô vốn là `—` mà **không** ghi phạm vi thì hiểu là **"có"** — vẫn phải qua cửa dự án.
    - Hai hàng "**không bao giờ**" **không nhận ghi đè** ở cả ba tầng: code, module quyền, và `CHECK` của cơ sở dữ liệu.

21. **Agent `disabled` gọi API trả `FORBIDDEN`/403 (bổ sung mục 3 so với mục 13; chốt cho #11).** Token *đúng*, chỉ danh tính bị tắt, nên là **`FORBIDDEN`/403** — không phải `INVALID_TOKEN`/401.
    - Lý do: xác thực đã thành công; chỉ là không được phép hành động.
    - Thông điệp nói rõ "Agent đã bị tắt", để người đọc log hiểu ngay.

22. **Sửa các trường khác của ticket đi qua hàng "Đổi trạng thái ticket" (bổ sung mục 3; chốt cho #12).** Bảng quyền mục 3 chỉ có hàng "Đổi trạng thái ticket"; hàng đó dùng chung cho **mọi lần sửa trường** của ticket (tiêu đề, mô tả, ưu tiên, nhãn, brief, hạn), **cùng phạm vi**: `worker` chỉ ticket của lượt mình, `manager` trong dự án, `coordinator` có, `reviewer` không.

23. **"Lần cuối lên tiếng" của agent và "tín hiệu" của phiên là hai mốc khác nhau (giải nghĩa mục 3 so với mục 6; chốt cho #13).**
    - **"Lần cuối lên tiếng"** (mục 3, trang agent) = **mọi lệnh ghi thành công** của agent, **có gắn phiên hay không**. Lệnh đọc không tính.
    - **"Tín hiệu phiên"** (mục 6, ngưỡng đứng) chỉ tính lệnh ghi liên quan **phiên đó** (xem thêm câu 41).

24. **Agent đọc được thông tin agent nào (bổ sung mục 3 so với mục 13; chốt cho #14).** Một agent đọc được: **chính nó**, các agent **dùng chung ít nhất một dự án** với nó, và agent có cờ "tất cả dự án".
    - Chủ đọc được **mọi** agent.
    - Ngoài phạm vi → **`NOT_FOUND`**, như mọi đường đọc khác (câu 15).

25. **Dự án `archived` mở lại được (bổ sung mục 2; chốt cho #15).** "Chỉ đọc" không phải cửa một chiều: **chủ mở lại được** một dự án đã lưu trữ.
    - Mọi lệnh **ghi** lên dự án `archived` bị từ chối (`PROJECT_NOT_ACCEPTING`), **trừ** chính việc **chủ đổi `trang_thai`**.

26. **Chủ tạo được ticket trong dự án `paused` (giải nghĩa mục 2 so với mục 4; chốt cho #16).** `paused` là luật dành cho **agent**: agent không nhận việc mới và không tạo được ticket. **Chủ vẫn tạo được** — chủ phải lên kế hoạch trước được cho một dự án đang tạm dừng.
    - `archived` thì **chỉ đọc với mọi người** (trừ ca ở câu 25).

27. **Dự án `archived` bị ẩn ở tầng API, không chỉ ở UI (bổ sung mục 2 và mục 13; chốt cho #17).** Đường đọc danh sách dự án **ẩn dự án `archived` mặc định**.
    - Có cờ **`?gom_luu_tru=co`** để lấy cả, và **`?trang_thai=archived`** vẫn lấy đúng nhóm đó — không dữ liệu nào bị khoá tầm nhìn.
    - **Đọc từng dự án lưu trữ vẫn được** (chỉ đọc thì phải đọc được).
    - Lý do ẩn ở API: để UI tự lọc thì web, CLI và MCP đều phải nhớ lọc, và `baton list` sẽ hiện dự án lưu trữ trong khi sidebar thì không — "ẩn" là **một** luật, không phải ba lần cài giống nhau.

28. **Hai mã lỗi mới cho xung đột trạng thái của lượt giao (bổ sung bảng mục 13; chốt cho #28).** Hai ca của mục 5 chưa có mã nào; nay thêm hai mã, **cả hai 409** (nhóm "trạng thái hiện tại không cho phép", câu 19):
    - **`ASSIGNMENT_OPEN`**: ticket đã có một lượt **mở cùng loại** mà vẫn xin tạo thêm (mục 5, 19.1).
    - **`ASSIGNMENT_NOT_PENDING`**: gọi lệnh **nhận** trên một lượt không còn `pending`.
    - Hai mã này là mã **thêm**, khai riêng, **không** trộn vào bảng tối thiểu của mục 13.

29. **Loại lượt giao là `work` (sửa chữ ở 19.1; chốt cho #29).** Mục 0.1 ghi loại lượt giao là `work` / `review`, còn 19.1 viết "`worker` hoặc `review`". Nay chốt theo **`work`**, và **sửa chữ ở 19.1 — không đổi 0.1**.
    - Lý do: 0.1 là bảng mã máy **duy nhất** của SPEC và tự khai áp cho "API, CLI, MCP, **cơ sở dữ liệu** và log"; chữ ở 19.1 là văn xuôi.
    - Thêm nữa, `worker` **trùng tên một vai trò agent**; một trường của lượt giao mang đúng tên một vai trò là nguồn nhầm lẫn lâu dài.

30. **"Ticket con của lượt mình đang làm" dùng đúng định nghĩa "mở" của 19.1 (giải nghĩa mục 3; chốt cho #30).** Chữ "**đang làm**" trong hai ô phạm vi của `worker` ở bảng quyền mục 3 nghĩa là lượt **mở** = `pending` **hoặc** `in_progress`.
    - Lý do: cả hệ chỉ có **một** khái niệm "lượt của mình", không phải hai khái niệm lệch nhau một trạng thái.

31. **Chỉ đúng người nhận gọi được lệnh "nhận" (bổ sung mục 5; chốt cho #31).** **Kể cả chủ** gọi hộ cũng `FORBIDDEN`.
    - Lý do: "nhận" không phải thao tác quản trị mà là **lời khai của agent rằng nó đang chạy** — nó mở phiên và khởi động đồng hồ ngưỡng đứng (mục 6). Chủ nhận hộ là tạo một phiên không có ai ở đầu kia, tức làm hỏng đúng thứ mục 6 sinh ra để bảo đảm.
    - Cùng khuôn với câu 2 (`baton reply` chỉ người giao). Chủ vẫn **huỷ** được lượt (mục 5).

32. **Lượt giao không đặt hạn phản hồi (giải nghĩa mục 5; chốt cho #32).** Chữ "**có thể** đặt hạn phản hồi (mặc định 15 phút)" nghĩa là được phép không đặt:
    - **Không đặt hạn** là một giá trị thật (`null`), và lượt đó **không bao giờ** bị tính là "Không phản hồi".
    - **Trần 30 ngày**, để một giá trị gõ nhầm không thành hạn vô hạn trá hình. Giá trị vô lý → `INVALID_INPUT`.

33. **Huỷ lượt khi ticket đã kết thì ticket giữ nguyên (sửa hàng cuối bảng 19.2; chốt cho #33).** Hàng "Lượt bị `canceled`, không còn lượt mở nào → **Về Cần làm**" **chỉ áp cho ticket chưa kết**.
    - Ticket ở nhóm `closed` thì huỷ lượt **giữ nguyên trạng thái ticket**.
    - Hai luật cụ thể hơn **thắng** chữ tổng quát của bảng 19.2: 19.3 "ticket đã Xong không bị hạ", và câu 9 "mọi lần rời nhóm `closed` chỉ chủ làm được" — mà huỷ lượt là việc của người giao.

34. **"Báo cáo nộp bắt buộc" chỉ bắt buộc trường `Kết quả` (giải nghĩa mục 5 dòng 166; chốt cho #34).** Chữ "bắt buộc khi nộp" nghĩa là **nộp thì phải kèm một báo cáo có cấu trúc**, không phải cả 6 trường đều bắt buộc.
    - **`Kết quả` bắt buộc** — bảng 19.2 lái trạng thái ticket theo nó. Thiếu → `INVALID_INPUT`.
    - **Năm mục còn lại** (Đã làm · Kiểm chứng · Nhánh và commit · Rủi ro · Việc phát sinh) **được để trống**.
    - Lý do: "Nhánh và commit" vô nghĩa với dự án không code (19.10) và "Việc phát sinh" vô nghĩa khi không có việc phát sinh — bắt buộc chúng là buộc agent điền chữ rác, làm báo cáo kém tin hơn.

35. **"Lý do trả lại" nằm ở đầu trường mục tiêu của brief (bổ sung 19.5 so với mục 4; chốt cho #35).** Brief ở mục 4 là 8 trường cố định, không có trường "Lý do trả lại". Lý do trả lại được **chèn vào đầu trường `muc_tieu`** dạng khối `Lý do trả lại: <lý do>`, rồi tới mục tiêu cũ.
    - Lý do: `muc_tieu` là trường đầu tiên agent đọc, nên "đặt ở đầu" giữ được đúng ý của 19.5.
    - **Hệ quả đã biết và chấp nhận:** `muc_tieu` của lượt mới không còn là mục tiêu thuần. Hướng sạch hơn (thêm một trường brief thứ 9) là đổi cấu trúc brief của mục 4, **không làm ở v0.1**.

36. **Ticket tạo từ "Việc phát sinh" không nối liên kết nào (bổ sung mục 5 dòng 169; chốt cho #36).** Nút "Tạo ticket từ việc phát sinh" tạo một **ticket thường trong cùng dự án**, **không** nối liên kết gì với ticket gốc.
    - Không chọn `parent`: nó kéo theo luật `CHILDREN_OPEN`, tức ticket gốc không vào Xong được cho tới khi việc phát sinh xong — trái định nghĩa "việc phát sinh là việc **không tự làm**".
    - Không chọn `related`: đó là một liên kết tự sinh mà SPEC không yêu cầu.
    - Người giao **nối tay** bằng lệnh nối liên kết nếu muốn.

37. **Nộp báo cáo, nghiệm thu, huỷ lượt kiểm theo danh tính (bổ sung mục 3 so với mục 5; chốt cho #37).** Ba lệnh này **không đi qua bảng quyền** mục 3; chúng kiểm **danh tính** đúng như mục 5 viết: **người nhận** nộp, **người giao** nghiệm thu, **người giao hoặc chủ** huỷ.
    - Hướng này chặt hơn: một `manager` có mọi quyền vẫn **không** nghiệm thu được lượt của người khác. Chủ cũng không nghiệm thu được lượt mình không giao.
    - **Không mượn** hàng nào của bảng quyền — mượn là âm thầm đổi nghĩa hàng đó (cùng lý do câu 13).
    - Ba lệnh vẫn là lệnh ghi, nên vẫn bị luật "agent `disabled` bị từ chối" (câu 21).

38. **Nộp lần thứ hai trên một lượt đã `submitted` bị từ chối (bổ sung mục 5 so với 19.1; chốt cho #38).** Lượt phải đang `in_progress` mới nộp được; nộp lại → **`ASSIGNMENT_STATE_INVALID`/409**.
    - Lý do: nộp là một **sự kiện** lái bảng 19.2 (có thể đã kéo ticket sang Xong rồi kiểm cổng) — cho nộp lại là cho **phát lại** sự kiện đó.
    - Đường đúng cho "làm lại" đã có: nghiệm thu `returned` → lượt mới (19.5).
    - Mục 15 đòi mọi hành động có dấu vết, mà ghi đè báo cáo là xoá dấu vết.

39. **Trạng thái phiên có đủ 7 mã (sửa chữ ở mục 6; chốt cho #39).** Mục 6 liệt kê 6 mã, thiếu **`waiting_assigner`** (Chờ người giao) mà cả 0.1 và 19.6 đều dùng. Nay chốt theo **0.1 (đủ 7 mã)**, và **sửa chữ ở mục 6 — không đổi 0.1**.
    - Cùng hình huống và cùng lý do với câu 29: 0.1 là bảng mã máy **duy nhất**, tự khai áp cho cả cơ sở dữ liệu; danh sách ở mục 6 là văn xuôi.

40. **Ngưỡng đứng: bậc agent thắng bậc dự án (giải nghĩa mục 6 dòng 189; chốt cho #40).** Chữ "chỉnh theo dự án **hoặc** theo agent" không nói bậc nào thắng khi cả hai đều đặt. Nay chốt: **agent thắng dự án**, rồi rơi về **mặc định 30 phút** nếu cả hai để trống.
    - Lý do: ngưỡng đứng là tính chất của **nhịp chạy thật của một agent** (một agent build lâu cần ngưỡng rộng ở mọi dự án), còn dự án chỉ là mặc định cho cả nhóm.

41. **Lệnh ghi nhích tín hiệu phiên nào của chính agent gọi lệnh (giải nghĩa mục 6 dòng 188; chốt cho #41, sửa theo #174 — Chủ chốt T-73/T-75 = A, 23–24/10).** Nhiều lệnh ghi **không gắn lượt giao nào** (bình luận một ticket khác, `coordinator` tạo ticket, đổi ưu tiên), nên không có "phiên đó". Nay chốt, cho một lệnh ghi thành công của agent:
    - Lệnh **gắn một lượt giao** (`heartbeat`, gửi hoạt động `log`, `plan`, `submit`, `claim`) chỉ làm mới tín hiệu sống của **phiên của lượt đó**, và chỉ khi đó là phiên của **chính agent gọi lệnh**. Phiên khác của cùng agent **không** được nhích. (Áp cả khi lệnh bị từ chối `SESSION_CLOSED` của câu 45.)
    - Lệnh **không gắn lượt nào** (bình luận, tạo/sửa ticket, bằng chứng, giao, nghiệm thu, huỷ, trả lời…) chỉ làm mới tín hiệu khi agent có **đúng 1 phiên mở**; agent có **từ 2 phiên mở trở lên** thì lệnh đó **không nhích phiên nào**. "Phiên mở" = chưa `closed` và không phải `stopping` đã quá 10 phút (mục 6). Phép đếm "đúng 1 phiên mở" **tính cả phiên vừa đóng trong chính lệnh đó**: agent có phiên A mở, một lệnh chung của nó đóng phiên B (vd agent đổi ticket của B sang Chờ kiểm chứng hoặc Xong bằng `baton status` — mục 6 "phiên đóng khi ticket sang Chờ kiểm chứng hoặc Xong") ⇒ đếm được 2 ⇒ A **không** được nhích: lệnh đó là bằng chứng về B, không về A. Agent nhiều phiên giữ từng phiên sống bằng `baton heartbeat --luot <lượt>` (mục 13).
    - Căn cứ: mục 6 sinh ra để biết "agent **có thật đang chạy**" — một agent vừa ghi gì đó **rõ ràng đang chạy**, nên để nó bị tính đứng là sai đúng việc mục 6 phải làm. Nhưng khi agent giữ nhiều phiên, một lệnh của phiên này **không** chứng minh phiên kia còn sống: nhích mọi phiên thì một phiên đã chết giữa chừng được "cứu" mãi bởi phiên còn chạy, và cảnh báo đứng của mục 6 không bao giờ bắn.
    - "Lần cuối lên tiếng" của agent (câu 23) và mốc chống bắn lặp (câu 46) không đổi.
    - Lệnh của **chủ**, và lệnh của **agent khác**, không nhích tín hiệu của phiên nào.
    - Luật này áp ở **cửa ghi chung**, không rắc tay vào từng lệnh — rắc tay thì lệnh ghi thêm về sau sẽ quên, im lặng.

42. **Chỉ phiên `running` mới dẫn xuất sang `stalled` (bổ sung mục 6 dòng 182–187; chốt cho #42).** Phiên ở `error` hoặc `stopping` im quá ngưỡng **không** thành `stalled`.
    - Lý do: để `stalled` ăn mất `error` là **che một thông tin cụ thể hơn bằng một thông tin mơ hồ hơn** — chủ cần biết agent **báo lỗi**, không phải "agent im". Mục 11 và 19.6 đều xếp "đứng **hoặc** lỗi" cạnh nhau như hai việc ngang hàng.
    - `stopping` đã có đồng hồ riêng 10 phút của mục 6 dòng 194. `waiting_owner` và `waiting_assigner` đã được 19.6 miễn.

43. **Ánh xạ 7 mã phiên về 5 mã trạng thái agent (bổ sung mục 3 dòng 98–103; chốt cho #43).** Trạng thái agent có 5 mã, phiên có 7; nay chốt đường về cho ba mã còn thiếu, và chốt ca agent có **nhiều phiên mở**:
    - **`waiting_assigner` và `stopping` → `busy`** (agent vẫn đang chạy, chỉ là đang chờ hoặc đang thu dọn).
    - **`error` → `stalled`**, theo cách mục 11 và 19.6 gộp "đứng **hoặc** lỗi" thành một mức cần chú ý. Đây là chỗ **duy nhất** trong hệ mà `error` bị gộp vào `stalled` — ngược hướng câu 42, **có chủ ý**: câu 42 nói về **phiên** (cần chính xác), đây nói về một **nhãn tóm tắt của agent** (chỉ có 5 ô).
    - **Nhiều phiên mở:** lấy theo **đúng thứ tự liệt kê của mục 3** làm thứ tự ưu tiên, và **`disabled` thắng mọi thứ**.

44. **Nhịp tim và nút Dừng kiểm theo danh tính (bổ sung mục 3 so với mục 6; chốt cho #44).** Bảng quyền mục 3 không có hàng nào cho hai việc này; chúng **không mượn** hàng nào của bảng quyền:
    - **Nhịp tim: chỉ agent của phiên đó** — kể cả chủ cũng `FORBIDDEN`, cùng lý do câu 31 (nhịp tim là lời khai "tôi đang chạy", chủ gửi hộ là làm hỏng đúng thứ mục 6 bảo đảm).
    - **Dừng: chỉ chủ**, đúng chữ mục 6 dòng 192 ("Chủ bấm Dừng").

45. **`SESSION_CLOSED` chỉ áp cho lệnh gắn rõ một lượt giao (giải nghĩa mục 6 dòng 195; chốt cho #45).** "Mọi lệnh ghi sau khi phiên đóng bị từ chối" **không** đọc rộng ra mọi lệnh ghi của agent:
    - **Bị chặn:** lệnh gắn rõ một lượt giao (nhịp tim, nộp báo cáo, dòng hoạt động, bằng chứng của lượt).
    - **Không bị chặn:** lệnh ghi chung (bình luận, sửa ticket) — chỉ là chúng không nhích tín hiệu cho một phiên đã đóng.
    - Lý do: `SESSION_CLOSED` sinh ra để chặn agent **tiếp tục làm việc của một lượt đã kết**, không phải để tước danh tính của agent. Đọc rộng nhất thì nó chặn cả reviewer và chặn agent bình luận một ticket nó không có lượt nào.

46. **Ai phát hiện phiên chuyển sang `stalled` hoặc `error` để bắn cảnh báo (bổ sung mục 6 dòng 196; chốt cho #46).** `stalled` là trạng thái **dẫn xuất, không ghi vào cơ sở dữ liệu** (câu 42), nên phải chốt ai phát hiện "lần chuyển":
    - Cảnh báo được phát hiện bằng một **Cron Trigger quét mỗi 5 phút**, **không** dựa vào việc có ai mở Tổng quan.
    - Giữ một **mốc "đã bắn cảnh báo cho tín hiệu nào"** để chống bắn lặp — không phải một cờ bật/tắt: cờ thì "hồi lại rồi đứng **lần nữa**" không phân biệt được với "vẫn đang đứng từ lần trước". Mốc gắn với tín hiệu cuối thì mỗi lần im lặng mới là **một** lần bắn, đúng chữ dòng 196.
    - Mốc được ghi **qua cửa ghi** (Durable Object), như mọi lần ghi khác.
    - Thông báo **ghi vào kho thông báo trong app**; **gửi Telegram thật là phần 7**.

47. **Nộp báo cáo tính là xác nhận dừng (bổ sung mục 6 dòng 193 so với 19.6; chốt cho #47).** Agent đang `stopping` mà **nộp báo cáo** thì phiên **đóng** với lý do "đã nộp báo cáo" — không đòi thêm một mục `result`.
    - Lý do: nộp là một kết luận **đầy đủ hơn** `result`; từ chối nó để đòi `result` là bắt agent làm lại việc vừa làm.
    - **Hai đường vào `stopping` không đối xứng, và đó là chốt:** bấm Dừng thì lượt vẫn mở nên nộp được; **huỷ lượt** (19.6) thì lượt đã `canceled` nên **`result`/`error` là lối duy nhất**, đúng như mục 6 viết.

48. **60 phút của `waiting_assigner` đếm từ lúc gửi `question` (giải nghĩa 19.6 dòng 516; chốt cho #48).** Mốc đếm là **lúc agent gửi hoạt động `question`**, **không** phải tín hiệu cuối của phiên.
    - Lý do: cái 60 phút này đo **người giao chậm trả lời**, không đo agent im. Agent đang chờ trả lời mà vẫn gửi nhịp tim là chuyện bình thường và đúng — đếm từ tín hiệu cuối làm luật **tự vô hiệu hoá** đúng trong ca nó cần chạy.

49. **Đổi ngưỡng đứng áp ngay cho phiên đang chạy (bổ sung mục 6 dòng 189; chốt cho #49).** Chủ đổi ngưỡng đứng của dự án hoặc agent thì **áp ngay** cho các phiên đang chạy, không chỉ từ phiên sau. Mỗi lần tính lấy **cấu hình hiện hành**, không chụp ảnh ngưỡng vào phiên lúc mở.
    - Lý do: chủ nới ngưỡng thường là **đang** nhìn một phiên bị báo đứng oan và muốn nó thôi báo ngay; phải chờ phiên sau thì nút đó vô dụng đúng lúc cần.
    - **Hệ quả chấp nhận:** nhãn đứng của một phiên có thể đổi mà **không có lệnh nào chạm phiên đó**.

50. **Phiên `error` hồi lại bằng đường nào, và mốc chống bắn lặp của nó (bổ sung mục 6 dòng 196 và 19.6; chốt cho #50).** `error` là trạng thái **ghi trong cơ sở dữ liệu**, nên một tín hiệu mới (nhịp tim, mục `thought`) **không** đưa phiên ra khỏi `error`.
    - Đường **duy nhất** ra khỏi `error`: agent gửi mục `question` → phiên sang `waiting_assigner`; có câu trả lời của người giao thì về `running`.
    - Mốc chống bắn lặp của `error` **không** gắn tín hiệu cuối mà gắn **lần vào `error`**: agent lỗi mà vẫn đập nhịp tim thì vẫn là **một** lần chuyển sang, nên chỉ **1** tin; ra khỏi `error` rồi vào lại là một lần chuyển mới ⇒ **bắn lại**.

51. **Token bị thu hồi hoặc agent bị tắt giữa lúc một lệnh chờ dài đang treo thì cắt ngay (bổ sung mục 13 so với mục 3; chốt cho #51).** Mục 3 nói token cũ hết hiệu lực "**ngay**", mà một lệnh chờ dài đã xác thực xong còn treo thêm tới một phút. Nay chốt: **cắt ngay**, không chạy nốt.
    - Mỗi lần lệnh chờ tỉnh thì **kiểm lại token**: mất hiệu lực → `INVALID_TOKEN`/401; agent `disabled` → `FORBIDDEN`/403 (câu 21).
    - Việc thu hồi token **tự đánh thức** lệnh đang treo của agent đó, nên không có khoảng hở "đọc được dữ liệu thêm một phút".

52. **`baton tasks` dùng được cho chủ (bổ sung bảng lệnh mục 13; chốt cho #52).** Chủ không bao giờ là *người nhận* của một lượt giao (mục 5), nhưng 19.6 nói câu hỏi của agent hiện trong `baton tasks` của **người giao**, mà người giao có thể là chủ.
    - Chủ gọi được: trả **danh sách lượt giao rỗng**, cộng đúng các **câu hỏi đang chờ chủ trả lời**. Chế độ chờ dài cũng tỉnh khi có câu hỏi mới.
    - Lý do: đường API là **một** đường cho cả web, CLI và MCP (mục 13), nên dựng một đường thứ hai chỉ để chủ đọc câu hỏi là hai lần cài cùng một luật.

53. **Lệnh chờ dài không phải tín hiệu của phiên (giải nghĩa mục 13 dòng 352 so với mục 6 dòng 188; chốt cho #53).** `baton tasks --wait` là **lệnh đọc**, nên **không nhích tín hiệu**, đúng chữ "lệnh đọc không tính".
    - Agent muốn giữ phiên sống thì gửi **`baton heartbeat`**.
    - Ghi chú: một agent *giữa hai lượt giao* không có phiên nào mở nên không có gì để tính đứng; ca đáng lo chỉ là agent **có phiên mở** mà lại đi chờ việc khác.

54. **Ticket điều phối đã xoá mềm thì bỏ qua khi lan toả (bổ sung 19.4 và 19.11 so với mục 4; chốt cho #54).** Câu 17 chốt đầu **con** (ticket dự án xoá mềm không tính vào tập); nay chốt đầu **cha**: một ticket điều phối **đã xoá mềm** thì việc lan toả **bỏ qua nó** — không tính lại, không ghi gì cho nó, và **không báo lỗi**.
    - Lý do: ticket đã xoá thì trạng thái của nó không còn nghĩa với ai; để nó **chặn** một lệnh trên một ticket dự án đang sống là lấy cái đã bỏ chặn cái đang dùng.
    - Áp cho **mọi** đường lan toả: đổi trạng thái, xoá, khôi phục.

55. **Xác minh deploy không theo chuyển hướng, và không đọc nội dung trả về (bổ sung mục 7 dòng 207 và 219; chốt cho #57).** Lớp chặn của d.207 chỉ chặn được **cú pháp host**, nên hai lỗ còn lại được đóng như sau:
    - **Không theo chuyển hướng.** Mã **3xx** tính là **đạt** theo đúng chữ d.207, rồi **dừng** — server **không** gọi lần thứ hai theo `Location`. Nhờ vậy không có lần gọi nào đi qua lớp chặn host.
    - **Không đọc nội dung trả về.** Không dòng nào của SPEC dùng tới nội dung, và đọc nó là mời một phản hồi dài vô hạn ăn bộ nhớ.
    - **Kiểm lại cú pháp host ngay trước khi gọi**, dư thừa **có chủ ý**: đường thử lại định kỳ (d.221) đọc URL **từ cơ sở dữ liệu** và không đi qua bước kiểm nội dung nữa.
    - **Hạn chế được chấp nhận, khai thẳng:** Baton **không** chặn được một tên miền công khai **phân giải ra** địa chỉ nội bộ, vì nơi chạy không có API phân giải DNS và không ghim được IP cho lần gọi. Hướng "phân giải qua DNS-over-HTTPS rồi kiểm IP" **bị bỏ**: nó vẫn không ghim được IP (còn nguyên khoảng hở giữa lúc kiểm và lúc gọi) và thêm một lần gọi mạng vào hạn 10 giây của d.219.

56. **Bốn hậu tố tên miền chỉ-nội-bộ bị chặn, khớp theo nhãn (bổ sung mục 7 dòng 207; chốt cho #58).** "Không nhận IP nội bộ hay localhost" của d.207 **không** phủ được một tên miền đúng cú pháp như `metadata.google.internal` — thứ phân giải ra đúng máy chủ metadata mà d.207 sinh ra để chặn. Nay chặn thêm bốn hậu tố: **`.internal`, `.local`, `.home.arpa`, `.localhost`**.
    - Khớp theo **NHÃN** (tách theo dấu chấm rồi so đuôi nhãn), **không** theo chuỗi con. Khớp chuỗi con thì `notinternal.com`, `myinternal.example.com`, `mail.notlocal` bị **chặn oan** — tức từ chối một URL deploy thật của chủ vì tên nó tình cờ chứa mấy chữ ấy.
    - Áp **sau** khi đã bỏ dấu chấm cuối, nên `metadata.google.internal.` cũng bị chặn.
    - **Hệ quả được chấp nhận:** một dịch vụ thật đặt ở tên miền `.internal` nội bộ thì **không gửi được bằng chứng deploy**. Đó đúng ý d.207: một URL mà chỉ mạng nội bộ mở được thì Baton gọi nó cũng không chứng minh được gì cho chủ.

57. **Mục Cần Chủ "tự sinh" của dự án không code sinh lúc KIỂM CỔNG (bổ sung mục 7 dòng 217, 19.10 và mục 8; chốt cho #59).** d.217 nói dự án không code cần "một mục Cần Chủ loại Review **tự sinh**" nhưng không nói ai sinh và khi nào. Nay chốt:
    - Sinh **lúc cổng được kiểm** và cổng thiếu đúng phần chủ xác nhận — đó là chỗ **duy nhất** biết được điều đó. Áp cho **mọi** đường kiểm cổng, kể cả đường tự lên Xong định kỳ (d.221), nơi không có ai gõ lệnh nào.
    - **Một** mục cho mỗi ticket, không sinh trùng.
    - Mục đã bị **Bỏ qua** (19.10) thì **chỉ** dựng lại khi có bằng chứng `file` hoặc `note` **mới hơn** lần bỏ qua. Nhờ vậy "Bỏ qua" giữ được cho tới khi thật sự có việc mới để xem, chứ không mất nghĩa ở lần kiểm cổng kế tiếp.
    - **Bổ sung (T-31 câu 3.4 A; Chủ chốt T-38 = A, 19/10; chốt cho #161):** câu này áp cho **mọi ticket không code** — cờ dự án **hoặc** cờ ticket (mục 7). Khi cổng **đã đủ nhờ một `bao_cao`** hợp lệ thì phần "chủ xác nhận" không còn thiếu, nên **không** sinh (và không dựng lại) mục xác nhận. Một `bao_cao` cũng **không** là "bằng chứng `file`/`note` mới hơn" của gạch trên.
    - **Bổ sung (Chủ chốt T-38 = A, T-43 = A; chốt cho #163):** ticket sang `done` bằng **mọi** đường (đủ nhờ `bao_cao`, chủ xác nhận, chủ ép Xong, tự lên Xong, cha tự kiểm cổng, …) ⇒ mục tự sinh **của chính ticket đó** (nhận theo mốc của mục, **không** theo "ticket liên quan") mà còn `Chờ` chuyển `Đã xử lý`, kết quả "ticket đã Xong", **không** kết luận Đạt/Cần sửa — nên nó **không** tính là chủ xác nhận. Ghi **cùng một lượt** với lệnh đưa ticket sang Xong (cùng thành, cùng hỏng). Mục tạo tay, mục của ticket khác, mục đã `Bỏ qua`/`Đã xử lý`: không đụng.

58. **"Ticket ở hoặc về Chờ kiểm chứng" chỉ áp khi bằng chứng THAY ĐỔI (giải nghĩa 19.3 dòng 494 so với mục 4 và 19.10; chốt cho #66).** d.494 treo câu đó vào một **sự kiện** ("có commit hoặc deploy mới sau review"), không vào một **trạng thái**. Nay chốt:
    - Nhánh **kéo trạng thái** chỉ chạy ở lượt ghi **thật sự thêm hoặc đổi bằng chứng** (gửi bằng chứng, rút bằng chứng). Mọi đường khác — đổi trạng thái tay, nút "Tôi làm", mở lượt giao, nộp, nghiệm thu, huỷ lượt, lan toả 19.4, kiểm lại cổng của ticket cha 19.11, đường định kỳ — **chỉ bật hoặc tắt cờ**.
    - Lý do: đọc theo "mỗi lượt ghi" thì chủ **không bao giờ** đưa được một ticket mang cờ về Đang làm để đi sửa mã, và `baton status` sẽ cư xử **ngược** với nút "Tôi làm" (19.10) trên **cùng một** chuyển trạng thái — mà SPEC không có chữ nào phân biệt hai đường đó.
    - **Hệ quả có chủ ý:** cờ **vẫn bật** trên một ticket chủ vừa đưa về Đang làm — đúng vậy, vì việc cần làm chưa xong. Cờ tắt khi có bằng chứng mới hợp lệ, hoặc khi review KHÔNG ĐẠT bị rút.
    - **Ticket điều phối giữ nguyên trạng thái**, chỉ **cờ** bật/tắt. 19.4 d.502 nói trạng thái ticket điều phối "tự theo các ticket dự án" và nó "không qua cổng bằng chứng"; để d.494 kéo được nó sang Chờ kiểm chứng là làm hai câu đó trái nhau. Nó **gửi** bằng chứng được, nên nó **mang cờ** được.

59. **Gửi và rút bằng chứng là lệnh ghi CHUNG, không bị `SESSION_CLOSED` (giải nghĩa câu 45 ở trên so với mục 6 dòng 195 và mục 7; chốt cho #67).** Câu 45 kể "bằng chứng của lượt" vào nhóm bị chặn, nhưng một dòng bằng chứng **không gắn lượt giao nào** — nó chỉ gắn ticket cộng người gửi, và mục 7 không có trường lượt. Nay chốt: **không** chặn theo phiên.
    - Hai căn cứ: nó **khớp mô hình dữ liệu** (không phải đoán ra một liên kết lượt↔bằng chứng mà SPEC chưa có), và nó là hướng **không thêm chặn mới** — siết quyền của agent dựa trên một suy đoán là hướng khó lùi hơn nhiều so với nới sau.
    - Nếu phiên spec sau muốn chặn, việc phải làm **không** phải sửa một điều kiện mà là **thêm một trường lượt vào mục 7**.

60. **Mọi giờ-trên-tường của SPEC tính theo UTC+7 (bổ sung mục 8 dòng 241, 19.8 dòng 533, và nguyên tắc 8 của mục 0; chốt cho #68).** "18:00", "20:00", "08:00", "23:00–07:00" là giờ đồng hồ trên tường, nên chúng chỉ có nghĩa trong một múi giờ — mà các phép tính này chạy **phía server**.
    - Lấy **UTC+7** của nguyên tắc 8 (giờ Việt Nam) làm múi giờ **nghiệp vụ**, không chỉ múi giờ hiển thị. Tính theo UTC thì một mục 🟡 tạo lúc 22:00 giờ Việt Nam nhận hạn "20:00 hôm nay" — một hạn **đã qua từ 2 giờ trước**.
    - Khai ở **đúng một chỗ**, và mọi luật dùng giờ-trên-tường đi qua nó: hạn mặc định 🟡 (19.8), lịch nhắc phiên duyệt 08:00/20:00 (mục 8), handoff tối 20:00 (mục 11), giờ yên lặng 23:00–07:00 (mục 12). **Bốn luật phải dùng cùng một múi giờ**, nếu không chúng lệch nhau.
    - Dùng một **độ lệch cố định**, không dùng cơ sở dữ liệu múi giờ: Việt Nam không có giờ mùa hè nên đó là mô hình đúng, và nó kiểm chứng được bằng số học. Nếu phiên spec sau muốn múi giờ là một **cài đặt của workspace** thì việc phải làm là đọc độ lệch từ cài đặt rồi truyền vào — một chỗ.

61. **Tầm nhìn của lớp "Chung" rẽ theo VAI, không theo cờ dự án (bổ sung mục 8 dòng 229 và 233, bảng quyền mục 3, và câu 4 ở trên; chốt cho #69).** Câu 4 chốt "Chung" là trường dự án để **rỗng**, nên mọi đường đọc có một lớp dòng mà **cửa dự án không có gì để kiểm** (`project_id` rỗng). Nay chốt cho **cả hai** mục có lớp đó: mục 8 (Cần Chủ) và mục 10 (Nhật ký quyết định — câu 4 nói dòng tự sinh từ một mục Chung để trống trường dự án).
    - **Đường TẠO: mở.** `coordinator`, `manager` và **chủ** đều tạo được mục Chung; luật duy nhất là ô "Tạo mục Cần Chủ" của bảng quyền mục 3, nên `worker` và `reviewer` vẫn bị từ chối. Căn cứ là **chữ SPEC**: d.229 nói mục Cần Chủ do `coordinator` **hoặc `manager`** tạo, và câu 4 nói `baton ask` không truyền dự án → mục là Chung. Ghép hai câu, "`manager` gửi `baton ask` không dự án" là một đường SPEC **cho phép tường minh**.
    - **Đường ĐỌC: rẽ theo vai.** **Chủ** và agent vai **`coordinator`** đọc **mọi** mục và dòng Chung. Agent vai **`manager`** chỉ đọc cái do **chính mình tạo** — kể cả một dòng Chung **do chủ ghi** cũng là ngoài tầm nhìn. Vai khác (`worker`, `reviewer`) không đọc cái nào.
    - Ngoài tầm nhìn → **`NOT_FOUND`**, không 403, theo nếp "không lộ sự tồn tại" của mục 13.
    - Rẽ theo **vai** chứ không theo cờ "vào mọi dự án" là **có chủ ý**: lớp dòng này không thuộc dự án nào, nên một cờ về dự án không nói gì về nó. Một `coordinator` **không** bật cờ vẫn đọc được mọi dòng Chung; cờ chỉ quyết lớp dòng **có** dự án.
    - Luật này phải nằm ở **một chỗ duy nhất**, và mọi module truy vấn **gọi** nó chứ không tự dựng điều kiện cho lớp này.

62. **Trường "vì sao" của dòng Nhật ký là BẮT BUỘC, không rỗng (bổ sung mục 10 dòng 306 và 308; chốt cho #71).** d.306 đặt mục tiêu của cả mục 10 là trả lời "ai đã quyết cái này, **vì sao**, lúc nào", và d.308 liệt kê "vì sao" là một trường của dòng, nhưng không câu nào nói nó có được để trống không. Nay chốt theo hướng **chặt**:
    - **Mọi** dòng Nhật ký phải có "vì sao" **không rỗng** — cả dòng chủ tự ghi, cả dòng **tự sinh** từ một mục Cần Chủ (câu 64 dưới đây cho chữ mặc định của dòng tự sinh).
    - Luật này áp ở **cả ba tầng**: lệnh CLI (`--why` của d.377 không trong ngoặc vuông, tức bắt buộc), API, và **ràng buộc của DB**.
    - Lý do chọn hướng chặt chứ không hướng mở: dòng Nhật ký **không sửa được** (d.309), nên một dòng lỡ ghi thiếu "vì sao" là vĩnh viễn. **Nới ra về sau dễ hơn siết vào** — nới là bỏ một ràng buộc; siết thì không vá được dữ liệu đã ghi.
    - **Đường nhập của mục 16:** bảng "giờ · ai · dự án · quyết định · vì sao · căn cứ" có ô "vì sao" **trống** thì dòng đó là **lỗi**, vào mục "lỗi (kèm lý do từng dòng)" của báo cáo nhập — **không** được nhập với "vì sao" rỗng, và **không** được tự điền một chữ thay chủ.

63. **Một mục đã Bỏ qua phải được MỞ LẠI trước khi xử lý, và đường mở lại nhận cả mục Bỏ qua (bổ sung mục 8 dòng 244 và 246, 19.9 và 19.10; chốt cho #73 vế (a)).** d.244 chỉ vẽ một mục `Chờ` đi ra **hai** nhánh ("xử lý" hoặc "bỏ qua"), và d.246 chỉ nói mở lại **từ Đã xử lý**, nên hai việc "xử lý một mục đang Bỏ qua" và "mở lại một mục đang Bỏ qua" đều là chỗ SPEC **im lặng**. Nay chốt, và **hai nửa đi cùng nhau**:
    - **Xử lý thẳng một mục đang `Bỏ qua` → bị từ chối** bằng `ALREADY_RESOLVED`, với thông điệp nói đúng việc phải làm: **mở lại trước**. Đây là cùng khuôn chữ mà 19.10 đã dùng cho mục đã xử lý.
    - **Đường mở lại nhận CẢ mục `Bỏ qua`**, không riêng mục `Đã xử lý` của d.246. Mở lại đưa mục về **`Chờ`** và **có ghi lịch sử**, giống hệt ca của d.246.
    - **Nửa sau là điều kiện để nửa đầu có nghĩa:** nếu chỉ cấm xử lý mà không nới đường mở lại thì chính câu "mở lại trước" **không thực hiện được**, và một mục bị bỏ qua **nhầm** là vĩnh viễn — mất đường sửa sai duy nhất. Nên không được cài nửa đầu mà thiếu nửa sau.
    - Chốt này **không** nói gì về **chữ** của bình luận khi bỏ qua (19.9 d.541 nói có bình luận nhưng không cho chữ) — vế đó vẫn ở `cau-hoi-spec.md` **#73(b)**, chờ phiên spec.

64. **Dòng Nhật ký TỰ SINH lấy "vì sao" là `"Trả lời mục T-x: <tiêu đề mục>"` (bổ sung mục 8 dòng 279 và mục 10; chốt cho #74; đi cùng câu 62).** d.279 liệt kê đúng **bốn** vế của dòng tự sinh khi một mục Cần Chủ được xử lý — người là **chủ**, cùng **dự án** với mục, nội dung là **kết quả**, căn cứ là **`T-số`** — và **không có** vế "vì sao"; nhưng câu 62 làm vế đó **bắt buộc**, nên đường tự sinh phải điền một chữ. Nay chốt:
    - Mặc định là **`"Trả lời mục T-x: <tiêu đề mục>"`**, với `T-x` là `T-số` của mục và `<tiêu đề mục>` là tiêu đề của chính nó.
    - Tiêu đề mục **luôn có** (trường bắt buộc của d.233), nên mặc định này không bao giờ rơi vào rỗng và không bao giờ vỡ câu 62.
    - Chủ gửi "vì sao" **rõ** thì **tôn trọng chữ của chủ**, không ghi đè bằng mặc định.
    - Công thức này theo đúng **nếp SPEC đã tự dùng** cho các chuỗi sinh tự động ở d.280 và 19.9 d.542: `<mã> <việc>: <nội dung>`.

65. **Chủ xử lý / bỏ qua / mở lại một mục Cần Chủ của dự án ĐÃ LƯU TRỮ thì ĐƯỢC (bổ sung câu 25 ở trên; chốt cho #75).** Câu 25 nói **tường minh** rằng mọi lệnh **ghi** lên dự án `archived` bị từ chối (`PROJECT_NOT_ACCEPTING`), **trừ** chính việc chủ đổi `trang_thai`; nhưng 19.6 d.516 và mục 8 d.281 đòi một mục được xử lý (hoặc bỏ qua) thì phiên liên quan **phải** thoát `waiting_owner`, và đó là **đường duy nhất** SPEC cho để thoát. Nay chốt mở, tức **thêm một ngoại lệ thứ hai** vào câu 25:
    - **Chủ** xử lý, bỏ qua và mở lại được mục Cần Chủ của một dự án `archived` — kể cả các việc đi kèm mà mục 8 d.279–281 đòi: **dòng Nhật ký** tự sinh, **bình luận** trên ticket liên quan, và **thả phiên** khỏi `waiting_owner`.
    - **Agent vẫn bị chặn như cũ.** Câu 25 áp đủ cho **mọi** lệnh ghi của agent lên dự án `archived`, gồm cả việc **tạo** mục Cần Chủ mới. Ngoại lệ này chỉ cho **chủ**, và chỉ cho các mục **đã tồn tại**.
    - Lý do: "trả lời một câu hỏi **đã hỏi**" không phải "ghi việc **mới** vào dự án" — nó **đóng** một việc đang treo, tức cùng chiều với mục đích của lưu trữ. Hướng đóng thì một mục tạo lúc dự án còn sống, sau đó dự án bị lưu trữ, sẽ **không ai trả lời được**: nó nằm mãi ở khối `Chờ`, **và** phiên liên quan kẹt `waiting_owner` vĩnh viễn — đúng trạng thái "**không bao giờ** bị tính đứng" của 19.6, tức một agent đứng im mà **không cảnh báo nào bắn**.
    - Giao diện mục 14 **hiện và cho bấm** các nút của một mục thuộc dự án đã lưu trữ; không có nút nào luôn trả lỗi.

66. **Ticket không code ở mức TICKET và bằng chứng `bao_cao` (Báo cáo) (bổ sung mục 7, bảng 0.1, 19.10 và câu 57; T-31 câu 3.4 A; Chủ chốt T-38 = A, 19/10; chốt cho #161 và #162).** Một ticket không có code nằm trong dự án **có** code (vd một ticket nghiên cứu) trước đây không đóng được: cờ "không code" chỉ có ở hồ sơ dự án, và không loại bằng chứng nào nói "báo cáo đã có người khác kiểm". Nay chốt:
    - **Cờ `ticket.khong_code`**: chỉ **chủ** bật/tắt (agent ⇒ `FORBIDDEN`), có ghi Lịch sử, **không kéo trạng thái** (câu 58). Ticket là "không code" khi cờ dự án **hoặc** cờ ticket bật, đọc **tại thời điểm kiểm** (19.10). Cờ dự án giữ nguyên nghĩa.
    - **Loại bằng chứng `bao_cao`** (nhãn "Báo cáo"): đường dẫn và/hoặc nội dung (ít nhất một); người ký là người gửi; **quyền ký giống hệt `review`** (dòng `review` của bảng "Loại bằng chứng" mục 7 và bảng quyền mục 3: `reviewer` khác người làm; `manager` kèm đường dẫn báo cáo của reviewer độc lập; `coordinator`; chủ); nguồn ký hiện ở mọi đường đọc; không xác minh; không sửa, không xoá, rút theo mục 7, gạch "Bằng chứng không sửa, không xoá".
    - **Cổng của ticket không code** đủ khi **(1 `file`/`note` + chủ xác nhận)** HOẶC **≥1 `bao_cao` chưa rút do người khác người làm ký**. Đủ nhờ báo cáo thì không sinh mục xác nhận (câu 57). Ticket **có code**: `bao_cao` không mở gì, luật cũ y nguyên.
    - **Gửi `bao_cao` không tự đưa ticket lên Xong** từ Chờ kiểm chứng, giống `file`/`note`/`review`. Người **có quyền "Đổi trạng thái ticket"** theo bảng quyền mục 3 (worker là người làm với ticket của lượt mình; `manager` trong dự án; `coordinator`; chủ) đổi sang Xong; cổng được kiểm lúc đổi. Người gửi `bao_cao` thường là agent `reviewer`, vốn **không** có quyền đổi trạng thái, nên việc đổi là của người khác. Lý do giữ: "Tự lên Xong" (mục 7, gạch "Tự lên Xong") chỉ gắn với bước **xác minh** chạy nền (commit pushed → merged); `bao_cao` không có bước xác minh chạy nền nào.

67. **`L` (nhãn) áp cho nhiều thẻ: gắn hay bỏ (bổ sung mục 14, gạch "Phím tắt"; Chủ chốt T-38 = A, 19/10; chốt cho #156).** Gõ nhãn rồi bấm nút "Áp" cạnh ô nhãn ở thanh chọn nhiều (`Enter` trong ô không áp — câu 70): **mọi** thẻ đã chọn đều có nhãn đó ⇒ **bỏ** ở tất cả; ngược lại ⇒ **gắn** cho các thẻ chưa có, thẻ đã có **không gửi request**. Một thẻ (panel) giữ nguyên: ô "Thêm nhãn" gắn, nút × bỏ.

68. **Tập chọn sau khi áp, bộ lọc, `Esc` và đích của phím khi có thẻ đã chọn (bổ sung mục 14, gạch "Phím tắt" và gạch "Danh sách ticket" (bộ lọc); Chủ chốt T-38 = A, 19/10; chốt cho #157).**
    - Áp xong: bỏ chọn thẻ **thành công**, **giữ đúng thẻ lỗi** để sửa và thử lại; tất cả thành công ⇒ tập chọn rỗng.
    - Chọn theo id, gắn với bộ lọc lúc chọn (bộ lọc + tab nhanh + "Ẩn Xong cũ"): đổi bộ lọc/tab/view ⇒ tập chọn **rỗng hẳn** (quay lại bộ lọc cũ không sống lại); mỗi lần áp chỉ lấy thẻ **đang hiện**.
    - `Esc` khi có thẻ đã chọn ⇒ bỏ chọn hết trước; `Esc` nữa mới đóng panel.
    - Có thẻ đã chọn ⇒ `S`/`P`/`L`/`A` áp cho **tập chọn**, không cho thẻ đang focus.

69. **`A` cho nhiều thẻ (bổ sung mục 14, gạch "Phím tắt", và mục 5; Chủ chốt T-38 = A, 19/10; chốt cho #158).** **Một** hộp "Giao N thẻ": chọn agent và brief **một lần**, gửi **tuần tự từng thẻ** (mỗi thẻ một lượt giao riêng), không hiện lạc quan. Có thẻ lỗi ⇒ **một** thông báo "k/N thẻ lỗi: MÃ — câu máy chủ"; thẻ thành công được bỏ chọn; hộp **giữ mở** với đúng các thẻ lỗi, giữ agent/brief để gửi lại. Đi hết các thẻ, không dừng ở thẻ lỗi đầu tiên. Mất mạng trước lần gửi đầu ⇒ đóng hộp là huỷ cả lượt; mất mạng giữa lượt ⇒ các thẻ còn lại báo lỗi mạng trong thông báo đó.

70. **Bước xác nhận khi áp cho nhiều thẻ (bổ sung mục 14, gạch "Phím tắt"; Chủ chốt T-38 = A, 19/10; chốt cho #159).**
    - Ô trạng thái, ưu tiên, nhãn của thanh chọn nhiều **chỉ đặt giá trị chờ**. Đổi giá trị bằng chuột, mũi tên, Space, gõ chữ, hay bấm `Enter` trong ô đều **không gửi request**. **Chỉ nút "Áp"** cạnh mỗi ô mới áp (nút "Áp" khoá khi ô còn trống; nhãn trống sau khi bỏ khoảng trắng tính là trống). Lý do: trên nhiều trình duyệt `↑`/`↓` trên ô chọn đang đóng đổi giá trị ngay, nên "áp khi đổi" biến một phím lỡ tay thành thao tác trên N thẻ; và `Enter` để **đóng danh sách đã mở** trên Chromium cũng tới ô, nên "áp khi `Enter`" đã áp nhầm "Đang làm" cho 2 thẻ trên production ngày 19/10 (CoS/Chủ chốt 20/10, BAT-39, #164). Áp dụng cho cả N < 10 và N ≥ 10.
    - **N ≥ 10** (N = số thẻ đã chọn **đang hiện**, tức đúng số thẻ lượt áp sẽ xét) ⇒ trước khi gửi hiện hộp **"Áp cho N thẻ?"** với nút xác nhận và nút Huỷ. Hộp ghi lượt này làm gì; với nhãn thì nói rõ là **gắn** hay **bỏ** theo luật câu 67 (vd `Bỏ nhãn "x" khỏi 10 thẻ`, `Gắn nhãn "x" cho 7 thẻ (3 thẻ đã có, không đổi)`). Huỷ (nút, `Esc`, bấm nền) ⇒ **không gửi request nào**, giữ tập chọn và giá trị chờ. **N < 10** ⇒ áp luôn.
    - `A` **không** thêm bước hỏi: hộp "Giao N thẻ" đã là bước xác nhận (chọn agent rồi bấm gửi tường minh), hỏi thêm là hỏi hai lần cho cùng một việc.
    - Panel một thẻ giữ nguyên hành vi áp-khi-đổi.

71. **Bấm ô tick của một thẻ (bổ sung mục 14, gạch "Phím tắt" (`J`/`K`, `X`); Chủ chốt T-38 = A, 19/10; chốt cho #160).** Ở trang danh sách, "thẻ đang focus" và "panel đang mở" là **một** trạng thái (`?the=<mã>`). Nay chốt giữ:
    - **Màn rộng:** bấm ô tick ⇒ ngoài bật/tắt chọn, thẻ đó thành thẻ đang focus, tức **mở panel của thẻ** — giống `J`/`K`; `X` kế tiếp tác động đúng thẻ vừa bấm. Mỗi lần tick thêm một mục lịch sử trình duyệt, như `J`/`K`/nút "Mở".
    - **Khổ hẹp:** bấm ô tick **không** đặt focus và **không** mở panel — ở đó panel là hộp phủ kín, mở ra thì không tick được thẻ thứ hai.

## 20. Bản đồ dự án trên Tổng quan
**Người dùng nhận được:** mở Tổng quan là thấy ngay mình đang ôm những dự án nào, dự án nào đang được đẩy, cái nào đang chờ mình, và không ôm quá 3 thứ cùng lúc. (Chủ chốt 04/11/2026, T-127 = A.)

### 20.1 Trường mới
| Trường | Ở đâu | Giá trị | Mặc định | Ai sửa |
|---|---|---|---|---|
| `uu_tien` | dự án | số nguyên 1–5 (5 = quan trọng nhất) | 3 | chủ, `coordinator` |
| `dang_day` | dự án | có/không: dự án "đang đẩy mạnh" | không | chủ, `coordinator`, `manager` của dự án (20.8) |
| `duy_tri` | dự án | có/không: việc duy trì dài hạn, không có đích (PARA "Area") | không | chủ, `coordinator`, `manager` của dự án (20.8) |
| `ten_ngan` | dự án | chuỗi 0–24 ký tự | trống ⇒ dùng tên đầy đủ | chủ, `coordinator` |
| `khoi_lon` | ticket | số thứ tự khối 1–99, hoặc trống | trống | chủ, `coordinator`, `manager` của dự án |
| `doi` | ticket có `khoi_lon` | số nguyên 0–100 (vị trí trên đồi) | trống | chủ, `coordinator`, `manager` của dự án |
| Giới hạn WIP | Cài đặt workspace | số nguyên 1–10 | 3 | chủ |

- "Mảng" của bản đồ chính là **Nhóm dự án** (mục 2). Dự án không có nhóm nằm ở mảng "Khác".
- Khối việc lớn là ticket có `khoi_lon`; ticket con của nó (mục 4) là việc nhỏ. Tiến độ khối của dự án = số khối Xong / tổng khối không Huỷ, không Trùng.
- Đặt `doi` cho ticket không có `khoi_lon`: `INVALID_INPUT`. Giá trị ngoài khoảng: `INVALID_INPUT` kèm khoảng đúng.
- Bật `dang_day` khi đã đủ giới hạn WIP: **vẫn cho**, không chặn; đồng hồ WIP chuyển đỏ.
- Bật `duy_tri` thì tự tắt `dang_day` (dự án duy trì không "đẩy").
- Mọi thay đổi các trường trên ghi Lịch sử như trường khác (mục 4).
- CLI: `baton project set <MÃ> [--nhom] [--uu-tien 1-5] [--dang-day on|off] [--duy-tri on|off] [--ten-ngan "…"]`; `baton ticket set <MÃ> [--khoi-lon <stt>|off] [--doi 0-100]`. API và MCP có thao tác tương ứng.
- Dữ liệu cũ: mọi dự án nhận giá trị mặc định; không dự án nào tự thành "đang đẩy" hay "duy trì". Hành vi cũ không đổi.

### 20.2 Bố cục Tổng quan
Khối **"1. Dự án"** của mục 11 được thay bằng bản đồ, từ trên xuống:
1. **Thanh đầu:** đồng hồ WIP "Đang đẩy n/<giới hạn>" (đỏ khi n > giới hạn) và ô Cần Chủ gọn (mục 11).
2. **Bản đồ (trái) + thẻ dự án (phải)**. Dưới 768px thì bản đồ ở trên, thẻ xếp dưới.
3. **Dải "Khu vực duy trì · n"** cuối khối: mỗi dự án `duy_tri` là một chip (tên ngắn + chấm: xanh bình thường, vàng có Cần Chủ Chờ). Bấm chip mở trang dự án.

Các khối 2–5 của mục 11 (Việc đang chạy, Agent, Vừa xong, Cần chú ý) giữ nguyên, nằm dưới.

### 20.3 Cây tròn
- Tâm là tên chủ → vòng 1 là mảng → vòng 2 là dự án. Chỉ dự án **không** lưu trữ và **không** duy trì lên cây.
- **Kích thước bong bóng** theo `uu_tien`. **Màu bong bóng:** vàng = có mục Cần Chủ Chờ; xám = dự án Tạm dừng; còn lại xanh. Màu mảng lấy từ bảng màu cố định theo tên nhóm (không thêm trường), dùng cho nhánh và nhãn mảng.
- Dự án `dang_day`: viền đậm. Dự án không `dang_day`: mờ đi (hàng chờ).
- Dự án có khối lớn: **vòng tiến độ** quanh bong bóng + chữ "Xong/Tổng" khối.
- **Thu gọn/mở mảng:** bấm mảng để gập/mở. Mảng gập thành một bong bóng to bằng tổng ưu tiên các dự án con, ghi "+n". Ba nút nhanh: "Chỉ giữ dự án đang đẩy", "Mở hết", "Thu gọn hết". **Mặc định khi mở trang:** mảng không có dự án đang đẩy thì gập.
- **Phóng vào dự án:** bấm bong bóng dự án → dự án vào tâm, các khối lớn thành vòng ngoài đánh số 01, 02… theo `khoi_lon` (Xong = xanh; Đang làm/Chờ kiểm chứng = vàng viền đậm; còn lại = xám nét đứt). Bấm tâm để quay lại. Không bao giờ vẽ ba tầng cùng lúc.
- Bấm mảng cũng lọc thẻ dự án bên phải theo mảng đó; bấm lại để bỏ lọc.
- Rê chuột/chạm giữ một bong bóng: hiện tên đầy đủ, trạng thái, "Đang làm".

### 20.4 Thẻ dự án
- Ba làn: **Đang đẩy** (dự án `dang_day`) · **Hàng chờ** (còn lại, đang chạy) · **Tạm dừng** (dự án Tạm dừng).
- Mỗi thẻ: tên, chấm sức sống (mục 2), ưu tiên, người cầm (agent quản lý, không có thì tên chủ), **Đang làm** = việc nổi bật nhất (mục 11), **Chờ Chủ** = tiêu đề mục Cần Chủ Chờ mới nhất của dự án (bấm mở mục), **Mốc tới** = khối lớn nhỏ số nhất chưa Xong.
- **Hill Chart** trong thẻ: một đường đồi, mỗi khối lớn đang Đang làm/Chờ kiểm chứng là một chấm tại `doi`. Dưới 50 ghi "chưa rõ cách làm", từ 50 trở lên ghi "đã rõ cách, đang làm". Khối chưa có `doi` thì không vẽ chấm.
- Bấm thẻ đi tới bảng việc của dự án.

### 20.5 Ô Cần Chủ trên Tổng quan
Giữ ô gọn của mục 11; danh sách mở ra xếp **mục của dự án đang đẩy lên đầu**, gắn nhãn "· đang đẩy". Sidebar Cần Chủ không đổi.

### 20.6 Hiệu năng và điện thoại
- 200 dự án vẫn mở dưới 1 giây sau lần tải đầu (mục 17.10). Cây chỉ vẽ dự án không duy trì; mảng mặc định gập theo 20.3.
- 375px: Tổng quan dùng được — bản đồ thu vừa bề ngang, chạm thay rê chuột, thẻ xếp dưới.

### 20.7 KHÔNG làm
4 kiểu nhìn phụ của mockup (ô vuông, thanh tầng, mind map, vòng tròn); kéo thả đổi ưu tiên; tự tính vị trí trên đồi; tự đổi tên dự án cũ; cấp "milestone/epic" riêng; chặn cứng khi vượt WIP.

### 20.8 Thanh công cụ dự án (Chủ chốt 04/11/2026, T-131)
**Người dùng nhận được:** đổi mức ưu tiên và trạng thái của dự án ngay trên giao diện, không phải sửa file hay gõ lệnh.

- **Trạng thái bản đồ** — một ô chọn 4 giá trị, ghi xuống trường đã có:

| Chọn | `trang_thai` | `dang_day` | `duy_tri` |
|---|---|---|---|
| Đang đẩy | `active` | có | không |
| Hàng chờ | `active` | không | không |
| Tạm dừng | `paused` | không | không |
| Duy trì | `active` | không | có |

  Lưu trữ (`archived`) không nằm trong ô này; vẫn chỉ chủ làm ở chỗ cũ (mục 2).
- **Nơi hiện:** thẻ dự án trên bản đồ Tổng quan (20.4) và đầu trang dự án. Ô **Ưu tiên** 1–5, ô **Trạng thái**; chủ thấy thêm ô **Nhóm**.
- **Ai đổi được:**

| Ai | Ưu tiên | Trạng thái bản đồ | Nhóm |
|---|---|---|---|
| Chủ | được | được | được |
| `coordinator` | được | được | không |
| `manager` **của dự án đó** | không | được | không |
| `manager` dự án khác, `worker`, `reviewer` | không | không | không |

- **Chủ là cấp cao nhất:** chủ đổi được mọi lúc, kể cả đè lên giá trị agent vừa đặt. Agent đổi được giá trị chủ đã đặt, nhưng mỗi lần đổi ghi Lịch sử dự án (ai, lúc, cũ → mới) và thẻ hiện dòng "Đặt bởi <tên> · <thời gian>" của lần đổi cuối, để chủ thấy và đổi lại.
- Chọn "Đang đẩy" khi đã đủ giới hạn WIP: vẫn cho, đồng hồ đỏ (20.1).
- Đổi hiện ngay trên màn hình; server từ chối thì hoàn lại và báo lý do (mục 14).
- CLI: `baton project set <MÃ> --trang-thai dang-day|hang-cho|tam-dung|duy-tri`.
- **KHÔNG làm:** khoá "chủ đã đặt thì agent không đổi được"; đổi mã dự án.
