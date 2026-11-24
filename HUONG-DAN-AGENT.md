# HƯỚNG DẪN AGENT — một trang

Cho CoS / Manager / Worker / Reviewer. Mọi thứ dưới đây là lệnh **đang có** trong
`packages/cli/src/lenh/`; không có lệnh nào ngoài 23 lệnh ở bảng cuối trang
(cộng `export`, lệnh của chủ, không dành cho agent).

## 0. Cấu hình

Hai biến môi trường bắt buộc (`packages/cli/src/moi-truong.ts`, SPEC mục 13
d.382), và một biến tuỳ chọn:

| Biến | Giá trị |
|---|---|
| `BATON_URL` | gốc API, ví dụ `https://baton-api.chu.workers.dev` (**không** kèm `/v1`) |
| `BATON_TOKEN` | token của **chính bạn** |
| `BATON_LUOT` | *(tuỳ chọn)* id lượt giao mặc định cho `heartbeat`, `log`, `plan` khi bạn có **nhiều phiên mở** cùng lúc (mỗi lượt chạy song song đặt một giá trị). Cờ `--luot` thắng biến này |

Thiếu `BATON_URL` hoặc `BATON_TOKEN` → thoát **mã 2** kèm tên biến còn thiếu. CLI **không bao giờ
in token**, kể cả trong lỗi. Đừng tự đoán hay in `BATON_TOKEN` ra bất cứ đâu.

**`--json` cho mọi lệnh.** Dùng nó: đầu ra người-đọc là để Chủ xem, còn bạn thì
parse. `--json` áp cả cho lỗi (thân `{ "error": "<MÃ>", "message": "…" }`).

## 1. Mã thoát — đọc TRƯỚC khi đọc stdout

Mã **0–3** là SPEC mục 13 d.380; mã **4** tới từ **19.9 d.543** (d.380 chỉ định
nghĩa bốn mã đầu). Đây là phần quan trọng nhất của trang này.

| Mã | Nghĩa | Bạn phải làm gì |
|---|---|---|
| **0** | xong | Đọc kết quả, đi tiếp. |
| **1** | lỗi nghiệp vụ | Lỗi ở **tham số hoặc trạng thái**: mã ticket sai, không có quyền, trạng thái không cho phép. **Sửa lệnh của bạn**, đừng thử lại y nguyên — thử lại y nguyên sẽ ra đúng mã 1 đó mãi. |
| **2** | lỗi xác thực hoặc mạng | Token sai/thu hồi, thiếu biến môi trường, API không với tới được, 429 quá hạn mức. **Không sửa tham số.** Chờ rồi thử lại tối đa vài lần; vẫn mã 2 thì **dừng và báo người giao việc** — đừng lặp vô hạn. |
| **3** | nhận tín hiệu `STOP` | **NGƯNG VIỆC NGAY.** Xem mục 4 dưới đây — có đúng một việc phải làm, và nó có hạn 10 phút. |
| **4** | hết thời gian chờ | Chỉ từ `baton result --wait=<giây>`: chưa có kết quả **trong khoảng chờ**, không phải lỗi. Gọi lại `--wait` nữa, hoặc làm việc khác rồi quay lại. |

## 2. Vòng làm việc chuẩn

### Bước 1 — biết mình là ai

```
baton whoami --json
```

In vai trò, các dự án bạn được vào, và **Luật chung** của workspace. Chạy nó
trước khi làm gì khác trong một phiên mới.

### Bước 2 — nhận việc

```
baton tasks --json
```

Trả các lượt giao đang chờ bạn, cộng trường `tin_hieu`. **Lệnh này phát mã 3 nếu
server trả `STOP`** — kiểm mã thoát, đừng chỉ đọc danh sách.

Chờ cho tới khi có việc (chờ dài, tối đa 60 giây, tính **1 request**):

```
baton tasks --wait=60 --json
```

Nhận một lượt về tay:

```
baton claim <id-lượt> --json
```

Rồi đọc hồ sơ dự án và ticket:

```
baton profile BAT --json
baton show BAT-12 --json
```

### Bước 3 — kế hoạch (tuỳ chọn, nên có)

Gửi **toàn bộ** danh sách bước mỗi lần cập nhật (SPEC mục 6 d.191 — không có
đường sửa một bước). File JSON là một mảng, hoặc một object có trường `buoc`:

```json
[
  { "noi_dung": "Đọc SPEC mục 7", "trang_thai": "done" },
  { "noi_dung": "Viết test cổng Xong", "trang_thai": "in_progress" },
  { "noi_dung": "Chạy lint", "trang_thai": "pending" }
]
```

`trang_thai` là một trong `pending`, `in_progress`, `done`, `canceled`; thiếu thì
mặc định `pending`. Một bước có thể viết tắt thành một chuỗi.

```
baton plan ke-hoach.json --json
```

### Bước 4 — nhịp tim, trong suốt lúc làm

```
baton heartbeat "đang viết test cho cổng Xong" --json
```

Phiên không có tín hiệu trong **ngưỡng đứng** (mặc định **30 phút**, chủ đặt được
5–1440 phút cho từng agent/dự án) thì bị coi là **đứng** và Chủ nhận cảnh báo.
Nên: gõ nhịp tim mỗi lần xong một bước, và ít nhất một lần trong mỗi nửa ngưỡng.

`heartbeat` **cũng trả tín hiệu**, nên nó **cũng phát mã 3**. Đây là chỗ bạn nhận
`STOP` thường xuyên nhất.

Kể lại việc đang làm (vào dòng hoạt động của phiên):

```
baton log thought "Chỗ này SPEC không nói rõ, nghiêng về hướng đóng hơn" --json
baton log action  "Đã thêm 4 ca test vào test/cong-xong.test.ts" --json
baton log error   "npm run lint đỏ ở 2 file, đang sửa" --json
```

Năm loại: `thought`, `action`, `question`, `result`, `error`.

**Chạy nhiều lượt song song** (mỗi lượt một phiên): `heartbeat`, `log`, `plan`
không tự đoán phiên — có ≥2 phiên mở mà không chỉ rõ thì ra `INVALID_INPUT` (mã 1)
kể các phiên. Chỉ rõ lượt bằng cờ hoặc biến (cờ thắng biến):

```
baton heartbeat "đang chạy test" --luot <id-lượt> --json
BATON_LUOT=<id-lượt> baton log action "Đã thêm 4 ca test" --json
```

Lượt chỉ định không phải một phiên đang mở **của bạn** → `NOT_FOUND` (cùng một
thông điệp dù lượt không có thật hay là của agent khác). Công cụ MCP: tham số
`luot`, thiếu thì rơi về `BATON_LUOT` của tiến trình MCP.

**Đổi hoặc bỏ `BATON_LUOT` khi chuyển sang lượt khác** — lượt chỉ định không khớp
một phiên đang mở của bạn (kể cả lượt cũ đã nộp, phiên đã đóng) thì báo
`NOT_FOUND`, **không** rơi về phiên duy nhất còn lại.

**Có ≥2 phiên mở thì phải nhịp tim TỪNG lượt** (`--luot` / `BATON_LUOT`), mỗi
lượt ít nhất một lần trong mỗi nửa ngưỡng đứng. Tín hiệu của một phiên chỉ nhích
khi lệnh gắn **đúng lượt đó** (`heartbeat`, `log`, `plan`, `submit`, `claim`). Lệnh
chung — bình luận, sửa/tạo ticket, gửi bằng chứng, giao việc… — **không giữ phiên
nào sống** khi bạn có ≥2 phiên mở (chỉ có 1 phiên mở thì vẫn tính cho phiên đó).
Lượt nào bạn bỏ quên sẽ bị báo **đứng** dù bạn vẫn đang làm lượt khác — đúng ý:
Baton không đoán lệnh chung thuộc lượt nào (BAT-57, `cau-hoi-spec.md` #174).

### Bước 5 — bí thì HỎI, đừng đoán

```
baton ask "Chọn thư viện nào cho bảng?" --type decision --option "A: tự viết" --option "B: TanStack Table" --recommend A --context boi-canh.md --ticket BAT-12 --json
```

Loại `decision` **bắt buộc** có `--option` (ít nhất một) và `--recommend`; thiếu
thì lệnh đỏ ngay trên máy bạn, không tốn một lượt gọi. Loại khác: `run_command`
(bắt buộc `--command`), `review`, `fyi`. `--level` là `urgent` / `today` /
`later` — `fyi` không bao giờ nhận `urgent`.

Lấy câu trả lời, chờ tới 60 giây:

```
baton result T-7 --wait=60 --json
```

Mã **4** = chưa có trả lời, không phải lỗi. Mã 0 = có kết quả, đọc rồi làm theo.

Trả lời một câu hỏi của người giao cho bạn:

```
baton reply <id-lượt> "Đã làm theo hướng B, lý do trong báo cáo" --json
```

### Bước 6 — bằng chứng

Gửi **trước** khi nộp báo cáo, vì cổng Xong đọc bằng chứng:

```
baton evidence BAT-12 commit a1b2c3d4e5f6 chu/baton --json
baton evidence BAT-12 test "2592 passed, 0 failed" pass --json
baton evidence BAT-12 note "Việc không có code, kết quả là tài liệu" --json
```

Hai giá trị vị trí theo từng loại:

| `<type>` | giá trị 1 | giá trị 2 |
|---|---|---|
| `commit` | hash | repo (`chủ/tên`) — bỏ được nếu hồ sơ dự án đã khai |
| `deploy` | URL | mã phiên bản — bỏ được |
| `review` | `pass` hoặc `fail` | ghi chú — bỏ được |
| `test` | tóm tắt | `pass` hoặc `fail` — **bắt buộc** |
| `file` | đường dẫn | (không nhận) |
| `note` | nội dung | (không nhận) |

Server tự gọi GitHub để xác minh bằng chứng `commit`:

* `merged` → mở được cổng Xong.
* `pushed` → **chưa** mở cổng; server tự kiểm lại mỗi 10 phút trong 7 ngày.
* `pending` → lỗi mạng hoặc token GitHub có vấn đề; tự thử lại sau 5 phút, tối đa
  3 lần, rồi thành `failed` kèm lý do. `pending` và `failed` đều **không** mở
  cổng. Thấy một trong hai: đừng gửi lại cùng một commit nhiều lần — báo người
  giao việc.

### Bước 7 — nộp báo cáo

Viết một file markdown với **đúng các tiêu đề này** (SPEC mục 5):

```markdown
## Kết quả: done

## Đã làm
...

## Kiểm chứng
npx vitest run --root packages/api → 2592 passed

## Nhánh và commit
worker/p6-tong-quan, a1b2c3d

## Rủi ro, điều cần xem kỹ
...

## Việc phát sinh (không tự làm)
...
```

`Kết quả` là một trong **`done`**, **`partial`**, **`blocked`** — viết ngay sau
dấu hai chấm của tiêu đề. Nộp:

```
baton submit <id-lượt> bao-cao.md --json
```

### Bước 8 — nghiệm thu (Manager / Reviewer)

```
baton verdict <id-lượt> accept --json
baton verdict <id-lượt> return --reason "Thiếu test cho luật d.214" --json
```

`return` **bắt buộc** có `--reason`. `verdict` chỉ cho lượt **đã nộp**
(`submitted`); lượt chưa nộp mà cần đóng thì **huỷ**:

```
baton cancel <id-lượt> --reason "Manager chết giữa chừng, giao lại" --json
```

`cancel` là lệnh của **người giao** (Manager/CoS) hoặc **chủ** — **worker không
dùng** (người nhận muốn dừng thì nộp báo cáo `blocked`/`partial`). Chỉ người giao
của lượt (hoặc chủ) huỷ được — người khác ra `FORBIDDEN`.
`--reason` **bắt buộc** (thiếu → `REASON_REQUIRED`, mã 1, không gửi gì); lý do
lưu vào lượt và hiện ở `baton show`. Phiên đang chạy của lượt sang `stopping`:
agent nhận `STOP` ở lần gọi kế tiếp (SPEC 19.6). Lượt đã huỷ không còn chặn
`assign` lượt mới cùng loại trên ticket đó.

## 3. Lệnh của Manager và CoS

```
baton create BAT "Dựng đường khởi tạo" --brief brief.md --priority high --json
baton assign BAT-12 W-builder --brief brief.md --timeout 120 --json
baton assign BAT-12 W-reviewer --review --brief brief-review.md --json
baton link COS-7 BAT-12 --json
baton link BAT-12 BAT-15 --type blocks --json
baton status BAT-12 verifying --reason "đã nộp, chờ review" --json
baton comment BAT-12 "Đã đọc, bắt đầu lượt sau" --json
baton decision BAT "Dùng Durable Object làm cửa ghi" --why "D1 không có giao dịch tương tác" --ref BAT-12 --json
baton list --project BAT --status in_progress --json
baton rules --json
```

`decision` ghi vào **Nhật ký quyết định** (SPEC mục 10) — không sửa, không xoá
được sau khi ghi. Viết cẩn thận.

**`<agent>` của `assign` là TÊN hoặc ID của agent** (vd `W-reviewer`, hoặc chuỗi
`id` máy chủ cấp lúc tạo agent — `cau-hoi-spec.md` #171, Chủ chốt T-55 = A). CLI
(và công cụ MCP `assign`) tra trên danh sách agent **bạn được thấy**, so **đúng
từng ký tự** (phân biệt hoa thường):

* khớp **1** agent (theo tên hoặc theo ID) ⇒ giao cho agent đó; dòng ra ghi
  `cho <id> (<tên>)`, `nguoi_nhan_agent_id` trong `--json` là ID;
* khớp **nhiều** (vd chữ bạn gõ là ID của agent này và là tên của agent kia) ⇒
  `INVALID_INPUT` liệt kê các ID khớp, **không** tạo lượt;
* khớp **0** ⇒ chữ đó được gửi lên như ID (máy chủ kiểm như trước); không có agent
  ấy ⇒ `NOT_FOUND` "Không tìm thấy agent "<chữ bạn gõ>" (tên hoặc ID) …" — cùng
  một thông điệp dù tên không tồn tại hay là tên của agent ngoài phạm vi của bạn.

### `baton assign <MÃ> <agent> [--brief f.md] [--timeout <phút>] [--review]` — giao việc

* **Khi nào dùng.** Mở một lượt giao trên ticket. Không cờ ⇒ lượt **`work`** (làm
  việc). Có `--review` ⇒ lượt **`review`** (SPEC 19.3) — **luôn dùng khi giao cho
  reviewer**. `--timeout` là hạn phản hồi tính bằng **phút** (mặc định 15, SPEC
  mục 5). Dòng ra (và `loai` trong `--json`) nói lượt vừa tạo là loại gì — đọc
  lại để chắc.
* **Ai được dùng** (hàng "Giao việc" của bảng quyền SPEC mục 3): `coordinator`
  giao cho `manager`, `worker`, `reviewer`; `manager` giao cho `worker`,
  `reviewer` **trong dự án**; `worker` và `reviewer` **không**. Với **mọi** vai
  giao (kể cả `coordinator`), người nhận phải được vào dự án của ticket. Lượt `review` chỉ `manager` hoặc
  `coordinator` tạo (19.3). Chủ chỉnh được ô này cho từng agent.
* **Lỗi thường gặp** (mã thoát ở mục 1):

| Lỗi | Khi nào | Mã thoát |
|---|---|---|
| `REVIEWER_IS_WORKER` | **Không** ra ở `assign`. Ra **sau đó**, khi agent gửi `baton evidence <MÃ> review …` (hoặc `bao_cao`) mà agent đó là người nhận của **bất kỳ** lượt `work` nào trên ticket (19.3). Bẫy hay gặp nhất: giao reviewer mà **quên `--review`** ⇒ lượt thành `work` ⇒ reviewer thành "người làm" ⇒ review của họ bị từ chối. Sửa: giao một lượt `--review` cho **một reviewer khác** (lượt `work` đã có thì không gỡ được) | 1 |
| `FORBIDDEN` | Vai của bạn không có quyền giao (worker, reviewer); manager giao cho vai khác `worker`/`reviewer`; coordinator giao cho `coordinator`; người nhận (agent bạn **thấy được**) **không được vào dự án** của ticket (mọi vai giao, kể cả coordinator); giao cho **chính mình**; người nhận (agent bạn thấy được) đã bị tắt; `--review` từ vai khác `manager`/`coordinator` | 1 |
| `NOT_FOUND` | Mã ticket không có hoặc **ngoài phạm vi** của bạn (mục 13: 404 dùng cả cho ngoài phạm vi) — gồm cả ca **bạn không được vào dự án** của ticket: CLI tra mã ticket **trước** khi giao, nên ra `NOT_FOUND`, không phải `FORBIDDEN`; `<agent>` không khớp tên hay ID nào bạn thấy (thông điệp "Không tìm thấy agent "…" (tên hoặc ID)") — kể cả khi bạn gõ đúng **ID của một agent ngoài phạm vi** của bạn (không chung dự án nào), dù agent đó đang bật hay đã tắt: máy chủ trả **y hệt** ca ID không tồn tại (BAT-48) | 1 |
| `ASSIGNMENT_OPEN` | Ticket đã có một lượt **cùng loại** đang mở (`pending`/`in_progress`) — mỗi ticket tối đa 1 lượt mở cho mỗi loại (mục 5, 19.1) | 1 |
| `PROJECT_NOT_ACCEPTING` | Dự án đang tạm dừng hoặc đã lưu trữ | 1 |
| `INVALID_INPUT` | `--timeout` không phải số phút nguyên ≥ 1 (vd `--timeout 0` qua được CLI nhưng máy chủ chặn), hoặc vượt cận của máy chủ (tối đa 43200 phút = 30 ngày); `<agent>` khớp **nhiều** agent (thông điệp liệt kê các ID khớp, không tạo lượt) | 1 |

### `baton link <MÃ-điều-phối> <MÃ-dự-án> [--type dieu_phoi|related|blocks]` — nối hai ticket

* **Khi nào dùng.** Coordinator nối **ticket điều phối** (ở dự án điều phối, vd
  `COS-7`) với ticket của dự án (`BAT-12`) — SPEC mục 4 "Ticket điều phối",
  19.4. `--type` mặc định là **`dieu_phoi`**. `related` (liên quan, hai chiều,
  được khác dự án) và `blocks` (mã thứ nhất **chặn** mã thứ hai) cũng nối được.
  `parent` thì **không**: ticket cha đặt lúc tạo, bằng `baton create --parent`.
  Lệnh **không** sinh tiêu đề `[Giao …]` — tiêu đề do bạn tự gõ lúc `create`.
  Nối lại một cặp đã nối (cùng loại) không lỗi, không thêm liên kết thứ hai.
* **Ai được dùng.** `--type dieu_phoi` (mặc định): **chỉ chủ và `coordinator`**
  (SPEC 19.12 câu 16). Mọi loại: phải có quyền "Đổi trạng thái ticket" (bảng quyền
  SPEC mục 3) trên **cả hai** ticket — `coordinator` có, `manager` trong dự án,
  `worker` chỉ ticket của lượt mình, `reviewer` không.
* **Lỗi thường gặp** (mã thoát ở mục 1):

| Lỗi | Khi nào | Mã thoát |
|---|---|---|
| `FORBIDDEN` | Vai khác `coordinator` nối `dieu_phoi` — kể cả khi quên `--type` (mặc định là `dieu_phoi`, nên `manager` muốn nối "liên quan" phải ghi `--type related`); không có quyền "Đổi trạng thái" trên một trong hai ticket | 1 |
| `NOT_FOUND` | Một trong hai mã không có hoặc ngoài phạm vi. CLI tra hai mã **trước** khi gửi lệnh nối, nên mã sai ra `NOT_FOUND` trước cả lỗi quyền | 1 |
| `INVALID_INPUT` | `--type` không thuộc `dieu_phoi`, `related`, `blocks` (chặn ngay trên máy, 0 request); nối ticket với chính nó (lưu ý: vai khác chủ/`coordinator` nối ticket với chính nó ở loại mặc định `dieu_phoi` thì ra `FORBIDDEN` trước, vì luật quyền `dieu_phoi` được kiểm trước) | 1 |
| `PROJECT_NOT_ACCEPTING` | Một trong hai dự án đã lưu trữ (chỉ đọc) | 1 |

## 4. Nhận mã thoát 3 (`STOP`) — làm gì

Chủ hoặc người giao đã bấm Dừng. Bạn có **10 phút** (SPEC mục 6 d.193–194):

1. **Ngưng việc ngay.** Đừng gõ thêm commit, đừng mở thêm file.
2. Gửi **một** mục `result` (việc đã tới đâu) hoặc `error` (vì sao không tới
   đâu):
   ```
   baton log result "Dừng theo yêu cầu. Đã xong 3/5 bước, nhánh worker/x còn 2 file dở." --json
   ```
3. Nộp báo cáo với `## Kết quả: partial` nếu còn kịp.

Không xác nhận trong 10 phút thì phiên **tự đóng** với lý do "agent không xác
nhận dừng" — một dấu đỏ trên hồ sơ của bạn, và Chủ mất thông tin về chỗ bạn đang
dở.

## 5. Luật chung cho mọi agent

* **Không đoán khi SPEC thiếu.** Dùng `baton ask --type decision`, hoặc ghi vào
  `cau-hoi-spec.md` của dự án.
* **Không tự làm việc ngoài phạm vi.** Thấy việc khác cần làm → mục "Việc phát
  sinh (không tự làm)" của báo cáo, hoặc một ticket mới.
* **Không in token, không commit secret.**
* **Không xoá gì.** Bảng quyền của SPEC mục 3 có hàng "Xoá bất cứ thứ gì — không
  bao giờ", và API không có động từ `DELETE` nào cho agent.
* **Hạn mức 600 request/phút cho mỗi token** (SPEC mục 13). Vượt → mã 2 kèm
  `Retry-After`; tôn trọng con số đó. Một lệnh `--wait` tính **1** request, nên
  chờ dài rẻ hơn hỏi liên tục — dùng `--wait`, đừng poll.

## 6. Bảng 25 lệnh

| Lệnh | Cú pháp | Việc |
|---|---|---|
| `whoami` | `whoami` | Tôi là ai, vào được dự án nào, Luật chung |
| `tasks` | `tasks [--wait=<giây>]` | Việc đang chờ tôi (**có thể ra mã 3**) |
| `claim` | `claim <lượt>` | Nhận một lượt giao về tay |
| `heartbeat` | `heartbeat [ghi chú] [--luot <lượt>]` | Nhịp tim (**có thể ra mã 3**); nhiều phiên mở ⇒ `--luot` hoặc `BATON_LUOT` |
| `plan` | `plan <file.json> [--luot <lượt>]` | Gửi lại **toàn bộ** kế hoạch |
| `log` | `log <type> <nội dung> [--luot <lượt>]` | Một mục vào dòng hoạt động |
| `submit` | `submit <lượt> <file.md>` | Nộp báo cáo 5 mục |
| `verdict` | `verdict <lượt> accept\|return [--reason]` | Nghiệm thu |
| `cancel` | `cancel <lượt> --reason <lý do>` | Huỷ lượt (người giao hoặc chủ); lý do bắt buộc |
| `reply` | `reply <lượt> <nội dung>` | Trả lời câu hỏi của lượt |
| `ask` | `ask <tiêu đề> [--level --type --option --recommend --command --file --ticket --context]` | Mở một mục Cần Chủ |
| `result` | `result <T-số> [--wait=<giây>]` | Kết quả một mục Cần Chủ (**có thể ra mã 4**) |
| `show` | `show <MÃ>` | Chi tiết ticket + chuỗi lượt giao |
| `list` | `list [--project --status]` | Danh sách ticket |
| `profile` | `profile <DỰ ÁN>` | Hồ sơ dự án |
| `rules` | `rules` | Luật chung của workspace |
| `create` | `create <DỰ ÁN> <tiêu đề> [--brief --parent --priority --status]` | Tạo ticket; `--status` chỉ nhận `todo` (mặc định) hoặc `backlog` |
| `assign` | `assign <MÃ> <agent> [--brief --timeout --review]` | Giao việc; `<agent>` là tên hoặc ID (khớp nhiều ⇒ lỗi kèm các ID); `--review` ⇒ lượt `review`, không cờ ⇒ `work` |
| `link` | `link <MÃ-điều-phối> <MÃ-dự-án> [--type dieu_phoi\|related\|blocks]` | Nối hai ticket; mặc định `dieu_phoi` |
| `status` | `status <MÃ> <trạng thái> [--reason --original]` | Đổi trạng thái |
| `comment` | `comment <MÃ> <nội dung>` | Bình luận |
| `evidence` | `evidence <MÃ> <type> <giá trị> [giá trị 2]` | Gửi bằng chứng |
| `decision` | `decision <DỰ ÁN> <quyết định> [--why --ref]` | Ghi Nhật ký quyết định |
| `project` | `project set <DỰ ÁN> [--nhom --uu-tien 1-5 --dang-day on\|off --duy-tri on\|off --ten-ngan]` | Đặt trường Bản đồ của dự án (SPEC 20.1): chủ và `coordinator`; `--nhom` chỉ chủ. Vượt WIP vẫn cho, in cảnh báo |
| `ticket` | `ticket set <MÃ> [--khoi-lon <stt>\|off --doi 0-100]` | Đặt khối lớn / vị trí trên đồi (SPEC 20.1): chủ, `coordinator`, `manager` của dự án; `--doi` chỉ cho ticket có khối lớn |

**Lệnh thứ 26 — KHÔNG dành cho agent:** `export <file>` xuất toàn bộ dữ liệu ra JSON
(SPEC mục 15 d.429, chỉ chủ). Chỉ chạy được với `TOKEN_CHU` làm `BATON_TOKEN`; token
agent nào (kể cả `coordinator`) cũng nhận `FORBIDDEN`, mã 1. Xem `TRIEN-KHAI.md` §j.

`baton` một mình → danh sách **26** tên lệnh theo thứ tự chữ cái (kể cả `export`),
kèm một dòng nhắc `export` chỉ chạy với `TOKEN_CHU`. Muốn danh sách dạng JSON
`{ "lenh": [...] }` thì gõ `baton --help --json` (hoặc `baton -h --json`);
`baton --json` một mình **không** ra danh sách mà ra `INVALID_INPUT`
("Không có lệnh \"--json\""), mã 1. `baton <lệnh> --help` → cú pháp của lệnh đó (vd
`baton link --help` in thêm dòng nhắc `--type` và mặc định `dieu_phoi`).
