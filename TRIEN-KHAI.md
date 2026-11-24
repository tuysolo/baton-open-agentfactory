# TRIỂN KHAI BATON — sổ tay cho Chủ

Sổ tay này viết cho **người**, không cho agent. Từng bước đánh số, mỗi bước một
lệnh, copy-paste được. Chạy từ gốc repo trừ khi bước đó nói khác.

## ĐỌC TRƯỚC: lệnh nào trong đây CHƯA AI CHẠY THỬ

`wrangler` **bị chặn** trong môi trường agent làm ra dự án này (quyet-dinh.md
01/10). Nên:

* Mọi lệnh bắt đầu bằng `wrangler` trong tài liệu này **chưa chạy lần nào**. Cú
  pháp đọc từ `node_modules/wrangler` (bản đang cài trong repo) chứ không từ một
  lần chạy thật. Lệnh nào báo lỗi cú pháp thì `wrangler <nhóm> --help` là nguồn
  đúng hơn tài liệu này.
* Ba khoá `[assets]` trong `packages/api/wrangler.toml` cũng **chưa được một lần
  `wrangler deploy --dry-run` nào nhận** — khối chú thích ngay trên chúng khai rõ
  điều đó.
* Những gì **đã** chạy thật: `npm run build`, `npm run lint`,
  `npm run typecheck`, và hơn 3.100 ca test trên Miniflare (`npm test`). Phần
  hành vi của phần mềm là có bằng chứng; phần *đưa nó lên Cloudflare* thì chưa.
* **Mục §i (Telegram) cũng chưa qua một lần chạy thật nào.** Nó viết từ tài liệu
  Bot API và từ đường gửi đã có test (với một kênh **giả lập**), không từ một lần
  nhắn thật. Lệnh `curl` ở bước 38a là lệnh **bạn** chạy — agent không chạy nó
  (danh sách cấm `CLAUDE.md` mục 3: không gửi Telegram tới ai).

Hệ quả thực tế: dành cho bước 1–3 nhiều thời gian hơn bạn nghĩ, và đừng bất ngờ
nếu phải sửa một tên khoá trong `wrangler.toml`.

---

## a. Tạo cơ sở dữ liệu D1

**1.** Đăng nhập Cloudflare (bỏ qua nếu đã đăng nhập):

```
npx wrangler login
```

**2.** Tạo DB tên `baton`:

```
npx wrangler d1 create baton
```

**3.** Lệnh trên in ra một khối cấu hình có `database_id = "…"`. Mở
`packages/api/wrangler.toml`, tìm **dòng 12** trong khối `[[d1_databases]]`:

```
database_id = "00000000-0000-0000-0000-000000000000"
```

Thay chuỗi toàn số 0 đó bằng `database_id` thật. **Không đổi** `binding = "DB"`,
`database_name = "baton"`, `migrations_dir = "migrations"` — mã và test trông vào
đúng ba giá trị này.

`database_id` **không phải secret** (nó chỉ định danh một DB, không mở được DB);
commit nó là bình thường.

---

## b. Build, áp migration, deploy

**4.** Build toàn bộ (TypeScript + giao diện web):

```
npm run build
```

**Bắt buộc, và bắt buộc TRƯỚC `wrangler deploy`.** Giao diện được chính Worker
phục vụ: `packages/api/wrangler.toml` khai `[assets] directory = "../web/dist"`,
và `packages/web/dist/` **không có trong git** (`.gitignore`). Không build thì
thư mục asset rỗng, `wrangler deploy` đẩy lên một Worker không có `index.html`
nào, và mở trang chỉ thấy **màn hình trắng** — API vẫn chạy, nên lỗi này rất dễ
tưởng là lỗi khác. `npm run build` chạy cả `build:ts` và `build:web`.

**5.** Áp migration lên DB **thật** (`--remote`; thiếu cờ này là áp vào DB local
của `wrangler dev`, không phải DB trên Cloudflare):

```
npx wrangler d1 migrations apply baton --remote
```

**6.** Deploy. Lệnh này chạy **từ `packages/api`** (đó là nơi có
`wrangler.toml`). **Từ BAT-8:** bucket R2 `baton-sao-luu` phải có trước — nếu chưa,
làm §j1 trước bước này:

```
cd packages/api && npx wrangler deploy
```

**7.** Output của bước 6 in một dòng dạng
`https://baton-api.<tên-tài-khoản>.workers.dev` ngay dưới chữ
`Deployed baton-api`. Đó là **địa chỉ của hệ**: cả giao diện web của bạn và gốc
API (`BATON_URL`) của mọi agent. Cất lại.

**8.** Kiểm Worker còn sống (đường này không cần token):

```
curl https://baton-api.<tên-tài-khoản>.workers.dev/v1/health
```

Mong đợi: `{"ok":true}`.

---

## c. Secret

Secret đặt bằng `wrangler secret put` (hỏi giá trị trên stdin, **không** hiện lại,
**không** vào git). Vẫn chạy từ `packages/api`.

### BẮT BUỘC để dùng được: `TOKEN_CHU`

**9.** Sinh một chuỗi ngẫu nhiên dài:

```
openssl rand -base64 48
```

**10.** Cất chuỗi đó vào 1Password **ngay** (một mục riêng, tên ví dụ
"Baton TOKEN_CHU"), rồi đặt làm secret:

```
npx wrangler secret put TOKEN_CHU
```

Dán chuỗi khi nó hỏi.

`TOKEN_CHU` quan trọng vì hai việc **không có đường nào khác** làm được:

* **Khởi tạo lần đầu** (`POST /v1/khoi-tao`, bước 12) — đường duy nhất tạo được
  workspace, tức đường duy nhất vào hệ từ một DB rỗng.
* **Cửa thoát khi bạn bị khoá đăng nhập** (`POST /v1/chu/mo-khoa`,
  `packages/api/src/chu-dang-nhap.ts` hàm `moKhoaChu`). Hạn mức chống dò mật khẩu
  khoá theo **tài khoản**, nên một kẻ *không biết* mật khẩu vẫn giữ được tài
  khoản ở trạng thái khoá bằng cách đoán sai liên tục. Không có `TOKEN_CHU` thì
  không ai mở ra được.

`TOKEN_CHU` **rỗng hoặc chưa đặt = không có đường nào vào với tư cách chủ**
(fail-closed, cố ý). Nên nếu bạn đánh mất nó: `wrangler secret put TOKEN_CHU` lần
nữa với một chuỗi mới. Nó không phải mật khẩu đăng nhập của bạn.

### Để sau: `GITHUB_TOKEN`

```
npx wrangler secret put GITHUB_TOKEN
```

Dùng để xác minh bằng chứng `commit` (SPEC mục 7). **Thiếu nó thì hành vi thật là
thế này** (đọc từ `src/nguon-github.ts`, `src/xac-minh-bang-chung.ts`,
`src/cron-bang-chung.ts`):

1. Agent gửi bằng chứng commit → server thấy token rỗng → kết luận
   **`pending`** kèm lý do `Chưa cấu hình token GitHub trên server (secret
   GITHUB_TOKEN).` Đây là nhánh "token GitHub có vấn đề" của SPEC d.220, **không**
   phải `failed` ngay.
2. Cron mỗi phút thử lại khi đã đến hạn 5 phút, **tối đa 3 lần**. Mỗi lần vẫn
   thấy token rỗng.
3. Hết 3 lần → bằng chứng thành **`failed`**, giữ nguyên lý do trên.
4. **Cổng Xong BỊ CHẶN.** `pending` và `failed` đều không mở cổng
   (`packages/shared/src/cong-xong.ts`, `moDuocCong`: `commit` chỉ mở cổng khi
   `merged`). Nên một ticket có code mà **chỉ** có bằng chứng commit sẽ **không
   bao giờ tự vào Xong** khi thiếu `GITHUB_TOKEN`.
5. Đường đi vòng vẫn còn: bạn đổi trạng thái kèm cờ ép và lý do
   (`POST /v1/ticket/:id/trang-thai` với `{"trang_thai":"done","ep":true,
   "ly_do":"…"}`, SPEC d.216). Nhưng làm thế cho mọi ticket là bỏ hẳn mục 7.

Kết luận thực tế: dùng Baton cho việc *không* code thì hoãn được; dùng cho việc
có code thì nên đặt `GITHUB_TOKEN` sớm. Token chỉ cần quyền **đọc** repo liên
quan.

### Để sau: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`

Hai secret này **đã có handler thật** (phần 7): cảnh báo phiên đứng, mục 🔴 mới,
lời nhắc 🔴 sau 2 giờ và tin "ticket Xong" được gửi ra Telegram bởi một Cron
Trigger chạy mỗi phút. Cách lấy chúng và cách kiểm một tin thử: **§i** ở dưới —
đọc cả mục đó rồi hãy đặt, vì có một bước (**bấm Start với bot**) mà quên là tin
đầu tiên chắc chắn trượt.

**Thiếu hai secret này thì Baton KHÔNG gửi và KHÔNG lỗi**, cố ý: tin vẫn nằm
trong **kho thông báo trong app** (bảng `thong_bao`), chuông và Tổng quan vẫn đủ,
và **không lệnh nào của agent bị trượt** vì chưa cấu hình Telegram. Nên hoãn mục
này là an toàn — nó chỉ đổi việc "muốn biết có việc gấp thì phải tự mở trang".

### KHÔNG cần đặt: `PBKDF2_SO_VONG`

Mật khẩu chủ băm bằng PBKDF2-SHA256 (SPEC mục 15, `quyet-dinh.md` 01/10 Q6). Số
vòng mặc định của sản phẩm là **100.000** (`SO_VONG_PBKDF2` trong
`packages/shared/src/mat-khau.ts`), và bạn **không phải đặt gì cả** để
`POST /v1/khoi-tao` chạy.

100.000 là **trần của Cloudflare Workers**: runtime từ chối PBKDF2 với
`iterations > 100000`. Lịch sử của con số này nên biết, vì nó giải thích vì sao
đừng nâng — **ngày 06/10 hằng còn là 600.000 và `POST /v1/khoi-tao` trả 500 ngay
lần deploy đầu**; bản đang chạy khởi tạo được chỉ vì chủ đặt tay secret
`PBKDF2_SO_VONG=100000`.

* **Bản deploy mới, sạch:** bỏ qua mục này. Mặc định đã đúng.
* **Bản đang chạy từ 06/10:** secret `PBKDF2_SO_VONG` vẫn còn ở đó. Nó **không
  còn cần thiết**, và **để nguyên cũng vô hại** — giá trị `100000` trùng đúng mặc
  định mới, nên hành vi không đổi. (Muốn dọn secret ấy thì đó là việc của chủ,
  tài liệu này không hướng dẫn xoá.)
* **Đừng đặt nó CAO hơn 100.000.** Nặng hơn lỗi 500 của 06/10: một dòng chủ có
  `so_vong > 100000` **khoá chính bạn ra khỏi hệ, không đường tự chữa**.

  Vì sao: `kiemMatKhau` băm lại bằng `so_vong` **của dòng**
  (`packages/shared/src/mat-khau.ts:133`), và con số đó đi thẳng vào
  `deriveBits({ iterations })` (:100-101) — nên đường **đăng nhập** ném, không
  chỉ `POST /v1/khoi-tao`. Đường tự chữa thì khoá: trigger
  `tg_chu_tai_khoan_so_vong_chi_tang` (`migrations/0017_chu_dang_nhap.sql:237`)
  ABORT mọi câu hạ `so_vong`, và đường duy nhất ghi lại cả ba cột — đổi mật khẩu
  — đòi đăng nhập trước, thứ vừa bất khả. Còn lại đúng một đường: tay vào D1 bỏ
  dòng `chu_tai_khoan` rồi khởi tạo lại. Đó là **xoá dữ liệu**, thuộc danh sách
  cấm mục 4 của `CLAUDE.md` — **cần Chủ duyệt**, và tài liệu này dừng ở đây,
  không hướng dẫn.

  **Bản đang chạy an toàn:** nó khởi tạo *với* `PBKDF2_SO_VONG=100000`, nên dòng
  thật là 100.000. Lỗ chỉ mở cho một bản khởi tạo **trước** khi đặt secret, hoặc
  cho ai đặt secret lên > 100.000 **rồi đổi mật khẩu**.

Thật thà một điều: mức khuyến nghị của OWASP cho PBKDF2-SHA256 **cao hơn**
100.000 vòng, nên ở riêng chỉ số này Baton **không đạt** mức khuyến nghị. Cái bù
lại: đăng nhập chủ còn **yếu tố thứ hai là TOTP**, có **khoá tài khoản sau n lần
sai**, và hệ chỉ có **một** tài khoản chủ — không một bảng người dùng để dò hàng
loạt.

### KHÔNG đặt: `CHO_DUONG_TEST`

Cờ này mở đường `/v1/_loi/:ma` — một đường dựng ra để kiểm middleware lỗi, chỉ
Miniflare lúc chạy test bật nó. Trên bản deploy, không đặt thì đường đó là 404.
**Đừng đặt.**

### Nhắc

* Không commit secret, không `.env*` vào git, không in secret ra log (SPEC mục
  15).
* `wrangler secret list` cho biết **tên** các secret đã đặt, không cho biết giá
  trị. Đó là tất cả những gì bạn xem lại được.

---

## d. Khởi tạo lần đầu và đăng nhập

Chạy đúng một lệnh. Nó tạo workspace, đặt mật khẩu + TOTP cho bạn, tạo dự án,
tạo agent, cấp token. **Chạy lại được**: gõ sai thì sửa thân và gõ lại, nó không
nhân bản gì và không cấp lại secret nào.

**11.** Soạn file thân ở **ngoài repo** (`/tmp`, để không có nguy cơ commit mật
khẩu). Mở editor và lưu thành `/tmp/baton-khoi-tao.json`:

```json
{
  "ten_chu": "Chủ",
  "mat_khau": "DAT-MOT-MAT-KHAU-DAI-CUA-RIENG-BAN",
  "du_an": [
    { "ten": "Baton",   "ma": "BAT" },
    { "ten": "Sample", "ma": "SAI" },
    { "ten": "INC",     "ma": "INC" }
  ],
  "agent": [
    { "ten": "CoS",        "vai_tro": "coordinator", "vao_tat_ca_du_an": true },
    { "ten": "M-Sample",  "vai_tro": "manager",  "du_an_duoc_vao": ["SAI"] },
    { "ten": "M-Baton",    "vai_tro": "manager",  "du_an_duoc_vao": ["BAT"] },
    { "ten": "M-INC",      "vai_tro": "manager",  "du_an_duoc_vao": ["INC"] },
    { "ten": "W-builder",  "vai_tro": "worker",   "vao_tat_ca_du_an": true },
    { "ten": "R-reviewer", "vai_tro": "reviewer", "vao_tat_ca_du_an": true }
  ]
}
```

Luật của các trường (do chính máy chủ kiểm, nên sai thì nó nói ngay):

* `mat_khau`: **12–256 ký tự**. Dùng 1Password sinh và cất luôn.
* `ma` dự án: **2–6 chữ A–Z**, duy nhất.
* `vai_tro`: đúng một trong `coordinator`, `manager`, `worker`, `reviewer`.
* `du_an_duoc_vao` ở đây nhận **mã dự án** (`"BAT"`), không nhận id — khác
  `POST /v1/agent`. Cố ý: lúc gõ file này thì dự án còn chưa có id nào.
  `vao_tat_ca_du_an: true` thì bỏ `du_an_duoc_vao`.

**12.** Gọi đường khởi tạo:

```
curl -sS -X POST https://baton-api.<tên-tài-khoản>.workers.dev/v1/khoi-tao -H "authorization: Bearer $(op read 'op://Private/Baton TOKEN_CHU/password')" -H 'content-type: application/json' --data @/tmp/baton-khoi-tao.json
```

(Không dùng 1Password CLI thì thay `$(op read …)` bằng chuỗi `TOKEN_CHU`. Biết
rằng làm vậy là đưa `TOKEN_CHU` vào history của shell.)

Mong đợi `200` và một thân JSON có:

* `workspace.vua_tao: true`
* `chu.otpauth: "otpauth://totp/Baton:Ch%E1%BB%A7?secret=…"` (tên chủ được mã hoá URL)
* mỗi dự án `vua_tao: true`
* mỗi agent `vua_tao: true` kèm một `token: "…"`

**13. `otpauth://` chỉ hiện ĐÚNG LẦN NÀY.** Máy chủ chỉ giữ secret để kiểm mã,
không có đường nào đọc lại. Làm ngay, theo thứ tự:

1. Mở ứng dụng xác thực (1Password, Authy, Google Authenticator), thêm một mục
   bằng cách **dán URI `otpauth://…`** (1Password: dán vào trường "one-time
   password").
2. Kiểm nó sinh được một mã 6 số.
3. Rồi mới sang bước 14.

**Mất URI, hoặc mất ứng dụng xác thực sau này** — xem §h ngay dưới. Có một đường
cứu thật, đừng đi xoá bảng.

**14.** Cất ngay vào 1Password, mỗi thứ một mục:

* mật khẩu chủ
* mục TOTP vừa quét ở bước 13
* **từng token agent** (6 mục: CoS, M-Sample, M-Baton, M-INC, W-builder,
  R-reviewer). Token hiện đúng một lần; mất thì phải cấp lại (bước 17).

**15.** Xoá file thân (nó chứa mật khẩu):

```
rm /tmp/baton-khoi-tao.json
```

**16.** Mở `https://baton-api.<tên-tài-khoản>.workers.dev/` trên trình duyệt. Nó
hiện **trang đăng nhập**; nhập mật khẩu + mã 6 số từ ứng dụng xác thực (một
form, hai lớp, SPEC d.415). Vào được là thấy **Tổng quan**. Phiên 30 ngày.

---

## h. CỨU HỘ — ba tình huống, ba lệnh

Đọc mục này **trước khi cần tới nó**. Cả ba lệnh đều cần `TOKEN_CHU`, nên hệ quả
quan trọng nhất là: **mất `TOKEN_CHU` là mất cả ba đường cứu.** Cất nó ở nơi
không mất cùng lúc với điện thoại.

### h1. Mất ứng dụng xác thực (mất/đổi điện thoại, xoá nhầm mục TOTP)

Đây là tình huống dễ xảy ra nhất và trước lượt này **không có đường ra nào**.

```
curl -sS -X POST https://baton-api.<tên-tài-khoản>.workers.dev/v1/chu/dat-lai-totp -H "authorization: Bearer $(op read 'op://Private/Baton TOKEN_CHU/password')" -H 'content-type: application/json' -d '{}'
```

Trả một `otpauth://` **mới** — quét ngay, nó cũng chỉ hiện một lần. Lệnh này:

* **giữ nguyên mật khẩu** của bạn (nên ai nắm `TOKEN_CHU` mà không biết mật khẩu
  thì vẫn không vào được — hai lớp của d.415 còn đủ hai);
* **đá mọi phiên web đang mở** (trả `so_phien_da_huy`). Cố ý: lý do bạn gọi lệnh
  này là "yếu tố thứ hai đã rời khỏi tay tôi", nên mọi phiên cũ phải chết thay vì
  sống thêm tới 30 ngày. Bạn đăng nhập lại bằng mật khẩu cũ + mã mới.

Chạy lại được bao nhiêu lần cũng được; mỗi lần một secret mới.

### h2. Bị khoá vì đoán mật khẩu sai nhiều lần

```
curl -sS -X POST https://baton-api.<tên-tài-khoản>.workers.dev/v1/chu/mo-khoa -H "authorization: Bearer $(op read 'op://Private/Baton TOKEN_CHU/password')"
```

Nó chỉ đặt lại bộ đếm sai và bỏ mốc khoá; mật khẩu và mã TOTP vẫn phải đúng ở
lần đăng nhập sau.

**Vì sao bạn sẽ cần nó:** `/v1/dang-nhap` **cố ý không đi qua** bộ đếm 600
request/phút (một lần đăng nhập chưa có khoá nào để đếm) — thứ kẹp số lần đoán là
bộ đếm `so_lan_sai` **của tài khoản**. Nên một người ngoài *không biết* mật khẩu
vẫn giữ được tài khoản ở trạng thái khoá bằng cách đoán sai liên tục, và lệnh này
là đường duy nhất mở ra.

### h3. Nghi một máy lạ còn đăng nhập

**Đường chính là giao diện**: mở **Cài đặt** (`/cai-dat`), khu **Tài khoản**.

1. **Các phiên đang mở** — mỗi dòng là một phiên còn hiệu lực: nhãn thiết bị (rê
   chuột vào để thấy chuỗi User-Agent đầy đủ), lúc đăng nhập, lúc dùng gần nhất
   (ghi theo nhịp khoảng 1 giờ, nên phiên mới có thể hiện "chưa ghi"). Phiên bạn
   đang ngồi mang nhãn **Phiên này**. Không có id phiên nào hiện ra, và cũng
   **không** có nút đăng xuất riêng từng phiên.
2. Thấy một dòng lạ → bấm **Đăng xuất mọi nơi**, rồi bấm **xác nhận** ở bước hỏi
   lại (bấm Huỷ thì không có gì xảy ra). Mọi phiên bị huỷ, **kể cả phiên này**:
   bạn về trang đăng nhập và vào lại bằng mật khẩu + mã TOTP. Cùng nút đó (cũng có
   bước xác nhận) nằm trong menu bấm vào tên workspace ở đầu thanh bên.
3. Nghi lộ cả mật khẩu → dùng thêm mục **Đổi mật khẩu** ngay dưới: mật khẩu hiện
   tại + mã TOTP + mật khẩu mới nhập hai lần. Đổi xong, **mọi phiên khác** bị đăng
   xuất (trang báo số phiên đã huỷ); phiên đang ngồi được giữ.

**Đường dự phòng** (không vào được web, hay giao diện lỗi): gọi API với **cookie
phiên của bạn**:

```
curl -sS -X POST https://baton-api.<tên-tài-khoản>.workers.dev/v1/dang-xuat-moi-noi -b "baton_phien=<id-phiên-từ-trình-duyệt>"
```

Lấy cookie khó, hoặc nghi yếu tố thứ hai (mã TOTP) cũng đã lộ: chạy **h1**. Nó
không cần cookie nào, đá mọi phiên như một hiệu ứng kèm theo, và đổi luôn yếu tố
thứ hai.

---

## e. Cấp token cho agent và cấu hình CLI

Bước 12 đã cấp token cho cả 6 agent. Phần này là cách **dùng** chúng, và cách
cấp lại khi mất.

**17.** Cần một token mới cho một agent (mất token, hoặc nghi lộ):

```
curl -sS -X POST https://baton-api.<tên-tài-khoản>.workers.dev/v1/agent/<id-agent>/token -H "authorization: Bearer $(op read 'op://Private/Baton TOKEN_CHU/password')"
```

Token **cũ hết hiệu lực ngay** (SPEC mục 3). `<id-agent>` xem trên trang **Đội
agent** (`/doi-agent`) hoặc trong phản hồi của bước 12.

**Không có nút nào trên `/doi-agent` làm việc này** — trang đó chỉ hiện danh sách
và 4 ký tự cuối của token. Cấp lại token là `curl` ở trên, không phải một thao tác
trên giao diện; đừng đi tìm nút.

Dạng `$(op read …)` là cố ý, giống bước 12: nó không để `TOKEN_CHU` lại trong
history của shell và không cần một `export TOKEN_CHU` nào — đúng cùng lý lẽ với
§19 dưới đây về token agent.

**18.** Cấu hình cho một agent. CLI đọc **đúng hai** biến môi trường
(`packages/cli/src/moi-truong.ts`, SPEC mục 13 d.382):

| Biến | Giá trị |
|---|---|
| `BATON_URL` | `https://baton-api.<tên-tài-khoản>.workers.dev` (gốc, **không** kèm `/v1`) |
| `BATON_TOKEN` | token của **chính agent đó** |

Thiếu một trong hai → CLI thoát **mã 2** và nói tên biến còn thiếu. CLI **không
bao giờ in token**, kể cả trong thông báo lỗi.

**19.** Cách cho agent dùng token mà **không ghi token vào file nào** — cất trong
1Password rồi chạy qua `op run`. Tạo `~/.config/baton/env` (file này chỉ chứa
*tham chiếu*, không chứa token):

```
BATON_URL=https://baton-api.<tên-tài-khoản>.workers.dev
BATON_TOKEN=op://Private/Baton token M-Baton/credential
```

Rồi chạy agent qua nó:

```
op run --env-file=~/.config/baton/env -- claude -p "..."
```

**Đừng** `export BATON_TOKEN=bt_…` trong `~/.zshrc`: như thế là token nằm sẵn
trong mọi tiến trình của máy, dưới dạng chữ thường, trong một file được sao lưu.

**20.** CLI chạy bằng bản build trong repo (chưa publish lên npm):

```
node packages/cli/dist/bin.js whoami
```

Gõ nhiều thì thêm một alias: `alias baton='node ~/…/baton-open-agentfactory/packages/cli/dist/bin.js'`.
Từ đây tài liệu viết `baton` cho ngắn.

---

## f. Kiểm nhanh sau deploy

Mỗi dòng kèm kết quả mong đợi. Chạy với `BATON_TOKEN` của một agent
(`M-Baton` chẳng hạn).

**21.** `baton whoami` → in tên agent, vai trò, danh sách dự án được vào, và
Luật chung của workspace. Mã thoát 0.

**22.** `baton list --project BAT` → bảng ticket của dự án BAT. Ngay sau khi
khởi tạo thì danh sách **rỗng** — đúng, chưa có ticket nào.

**23.** `baton profile BAT` → hồ sơ dự án BAT (tên, mã, cờ, mục "Lỗi đã gặp").
Sai mã dự án → mã thoát 1.

**24.** `baton create BAT "Ticket thử sau deploy"` → in mã ticket mới dạng
`BAT-1`. (Quyền `create` của vai trò bạn dùng phải cho phép; `manager` thì
được.)

**25.** `baton show BAT-1` → chi tiết ticket vừa tạo cộng chuỗi lượt giao (rỗng).

**26.** `baton tasks` → việc của tôi. Rỗng lúc này vì chưa ai giao gì. Mã thoát
0.

Rồi mở trình duyệt, 3 trang:

**27.** `/` → **Tổng quan**: 5 khối (dự án, agent, Cần Chủ, …). Số đếm bằng 0 là
đúng; màn hình trắng hoặc "không tải được" thì xem lại bước 4 (build web).

**28.** `/ban-do-du-an` → **Bản đồ**: bảng 3 dự án vừa tạo cộng trang Luật chung.

**29.** `/doi-agent` → **Đội agent**: 6 agent vừa tạo, mỗi dòng có 4 ký tự cuối
của token (không bao giờ có token đầy đủ).

Nếu bước 27–29 trắng mà bước 21–26 chạy được: asset chưa lên. Chạy lại bước 4
rồi bước 6.

---

## g. Rollback

**30.** Xem các bản đã deploy:

```
cd packages/api && npx wrangler deployments list
```

**31.** Quay về một bản trước (lấy id từ bước 30):

```
cd packages/api && npx wrangler rollback <deployment-id>
```

`wrangler rollback` **chỉ đổi mã Worker**. Nó **không** hoàn tác migration D1 —
một migration đã áp thì dữ liệu ở lược đồ mới, và một bản mã cũ hơn có thể không
đọc được lược đồ đó. Nên: rollback an toàn cho một lượt deploy **không kèm
migration mới**; có migration mới thì sửa xuôi (deploy một bản vá) chứ đừng lùi.

**Từ BAT-16:** migration `0026_cai_dat_thong_bao_bao_mat` (công tắc thông báo, tin
bảo mật tài khoản) được áp ở bước 5 như mọi migration khác. Nếu **buộc** phải lùi nó,
có file hoàn tác chạy tay `packages/api/migrations/rollback/0026_cai_dat_thong_bao_bao_mat.rollback.sql`
— đọc phần đầu file trước (xoá bảng công tắc, phải lùi mã Worker trước), và chỉ chạy
khi Chủ duyệt. File này **không** bị bước 5 áp.

**32.** Tắt hẳn hệ (ngắt mọi truy cập; dữ liệu D1 vẫn còn):

```
cd packages/api && npx wrangler delete
```

Bật lại = chạy lại bước 4 và 6. Secret đã đặt **mất theo Worker**, phải
`wrangler secret put` lại từ bước 9.

---

## i. Thông báo Telegram (phần 7)

Làm mục này **sau bước 7** (cần địa chỉ Worker). Ba thứ cấu hình, và chúng
**không ở cùng một chỗ** — đặt sai chỗ là lỗi hay gặp thứ hai ở đây:

| Thứ | Là gì | Đặt ở đâu |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | **secret thật** — ai có nó thì gửi được tin dưới tên bot của bạn | `wrangler secret put` |
| `TELEGRAM_CHAT_ID` | id chat của bạn; không phải bí mật lớn nhưng là dữ liệu riêng | `wrangler secret put` |
| `BATON_URL_CONG_KHAI` | gốc URL công khai của Baton, để dựng **link** trong tin | `wrangler.toml`, mục `[vars]` — **commit được** |

Vì sao cái thứ ba không phải secret: nó chính là chuỗi sẽ nằm trong mọi tin gửi
cho bạn. Và vì sao Baton không tự biết nó: tin được bắn trong một lượt Cron, mà
một lượt Cron **không có request nào** — nên không có `Host` để suy ra tên miền.

### i1. Tạo bot

**33.** Mở Telegram, tìm **@BotFather**, gửi `/newbot`. Nó hỏi tên hiển thị rồi
hỏi username (phải kết thúc bằng `bot`). Xong, nó trả một dòng dạng:

```
8123456789:AAH4k9_Vd2qExampleExampleExampleExample
```

Đó là **bot token**: dạng `<số>:<chuỗi>`. Cất ngay vào 1Password (mục
"Baton TELEGRAM_BOT_TOKEN").

**ĐỪNG dán token này vào bất cứ file nào trong repo** — không `wrangler.toml`,
không `.env`, không một file ghi chú. Nó chỉ đi qua stdin của
`wrangler secret put` ở bước 36 (danh sách cấm `CLAUDE.md` mục 5). Dán nhầm vào
một file rồi commit thì phải `/revoke` ở BotFather và làm lại token mới, vì git
giữ nó mãi.

### i2. Lấy chat id

**34. Bấm Start với bot TRƯỚC.** Mở chat với bot vừa tạo, bấm nút **Start** (hoặc
gửi `/start`). Bỏ bước này là **lỗi hay gặp nhất** của cả mục: Telegram không cho
một bot gửi tin cho người chưa từng mở lời với nó, nên tin đầu tiên của Baton sẽ
trượt với `Telegram trả mã 403. Forbidden: bot can't initiate conversation with
a user`, và không có gì trên giao diện nói là "bạn chưa bấm Start".

**35.** Đọc chat id (không cần cài gì, chỉ cần trình duyệt):

```
https://api.telegram.org/bot<TOKEN>/getUpdates
```

Thay `<TOKEN>` bằng bot token. Trong JSON trả về, lấy
`result[].message.chat.id` — một số nguyên, ví dụ `123456789`.

**URL này MANG TOKEN.** Đừng dán nguyên nó vào Linear, vào chat nhóm, vào issue,
hay đưa cho ai xem màn hình. Đọc xong thì đóng tab.

`result` **rỗng** `[]` nghĩa là Telegram chưa thấy tin nào của bạn — về bước 34,
gửi cho bot một chữ bất kỳ, rồi tải lại URL.

Gửi vào **group** thì khác: thêm bot vào group, gửi một tin trong group, rồi id
nằm ở `result[].message.chat.id` và nó là một số **âm** (dạng `-100…`). Lấy đủ
cả dấu trừ.

### i3. Đặt cấu hình

**36.** Hai secret (chạy từ `packages/api`, dán giá trị khi nó hỏi):

```
cd packages/api && npx wrangler secret put TELEGRAM_BOT_TOKEN
```

```
cd packages/api && npx wrangler secret put TELEGRAM_CHAT_ID
```

**37.** URL công khai — **bạn phải tự điền.** Mở
`packages/api/wrangler.toml`, tìm mục `[vars]`:

```
[vars]
BATON_URL_CONG_KHAI = "https://baton-api.TEN-TAI-KHOAN.workers.dev"
```

Thay `TEN-TAI-KHOAN` bằng địa chỉ đã cất ở **bước 7** (hoặc tên miền riêng của bạn) —
**không** dấu `/` ở cuối — rồi deploy lại để nó có hiệu lực: **bước 6**.

Đây là một URL công khai, **không phải secret**: nó chính là thứ nằm trong mọi tin
gửi cho bạn, nên nó sống trong `wrangler.toml` và được commit, khác hai secret của
bước 36.

Sai hoặc thiếu giá trị này thì **tin vẫn gửi, chỉ không có link** — mọi tin tới dưới
dạng chữ trơn, bạn phải tự mở Baton và tự tìm thẻ. Lệch mục 12 d.347 nhưng không
chặn gì, nên nó dễ bị bỏ qua: nếu tin Telegram của bạn không có link, hoặc link bấm
vào ra trang lỗi, chỗ cần xem là đúng bước này.

### i4. Thử gửi MỘT tin bằng tay, trước khi tin vào Baton

Bước này tách **hai câu hỏi** mà nếu gộp thì không biết lỗi ở đâu: *"bot và chat
id của tôi có đúng không"* và *"Baton có gửi được không"*. Làm bước 38a trước, chỉ
khi nó `ok` thì mới sang bước 38.

**38a.** Lệnh dưới đây **bạn** chạy trên máy mình (agent không chạy nó — danh sách
cấm `CLAUDE.md` mục 3). Thay hai chỗ trống bằng giá trị thật:

```
curl -s -X POST "https://api.telegram.org/bot<TOKEN>/sendMessage" -H "content-type: application/json" -d '{"chat_id":"<CHAT_ID>","text":"Baton thử gửi tin. Bỏ qua tin này."}'
```

**Lệnh này MANG TOKEN** (Telegram đặt token trong đường dẫn). Đừng dán nguyên nó
vào Linear, chat nhóm, issue, hay bất kỳ đâu — và nếu shell của bạn lưu history
thì xoá dòng đó sau khi chạy.

Cách đọc kết quả:

| Trả về | Nghĩa | Làm gì |
|---|---|---|
| `{"ok":true,...}` | **Xong.** Bot và chat id đều đúng; đi tiếp bước 38 | — |
| `403` + `bot was blocked by the user` | bạn đã **chặn** bot | bỏ chặn trong Telegram, chạy lại |
| `403` + `bot can't initiate conversation` / `chat not found` | **chưa bấm Start** với bot, hoặc chat id sai | làm lại bước 34 rồi bước 35 |
| `401` + `Unauthorized` | token sai, gõ thiếu, hoặc đã `/revoke` | lấy token mới ở BotFather |

Nếu bước 38a `ok` mà Baton vẫn không gửi được, thì lỗi **không** ở Telegram — nó ở
hai secret (bước 36) hoặc ở việc chưa deploy lại (bước 6).

### i5. Kiểm một tin do chính Baton gửi

Không cần sửa code, không cần một đường test nào.

**38.** Tạo một mục Cần Chủ **🔴 (urgent)** bằng CLI của một agent (bước 18–20 đã
đặt `BATON_URL` và `BATON_TOKEN`):

```
baton ask --level urgent --type review --file TRIEN-KHAI.md "Tin thử Telegram, bỏ qua mục này"
```

Hai lựa chọn trong lệnh trên đều có lý do, đừng đổi khi thử:

* **`--level urgent`**: mục 🔴 **mới** mang `uu_tien = 'khan'`, và tin `khan` được
  gửi **ngay, kể cả trong giờ yên lặng** (23h–7h, SPEC 19.8 d.535) — nên bạn thử
  lúc nào cũng được. Mục `today`/`later` sinh tin **thường**, và thử lúc nửa đêm
  thì nó bị **hoãn tới 7h sáng**: đúng SPEC, nhưng trông y như hỏng.
* **`--type review`** (kèm `--file`, loại này bắt buộc có ít nhất một file hoặc
  link): **`--type fyi` sẽ KHÔNG gửi tin nào.** 🔴 + `fyi` là ca mà SPEC 19.8 cho
  server **tự hạ về 🟡** và báo lại trong kết quả trả về (dòng "Lưu ý: mức đã bị
  hạ…"), nên mục không còn là 🔴 và không có tin 🔴 nào sinh ra. Đừng dùng
  `--type run_command` cho một lần thử: nó tạo một mục xin bạn **chạy một lệnh**.

**39.** Chờ **tới một phút**: Cron gửi chạy nhịp `* * * * *`. Mong đợi một tin
Telegram có nội dung tiếng Việt về mục 🔴 kèm một dòng link `https://…`.

**40.** Dọn: vào `/can-chu` trên web, bấm **Bỏ qua** cho mục thử đó. (Để nó ở
`Chờ` thì sau **2 giờ** bạn nhận thêm **một** lời nhắc 🔴 — đúng SPEC mục 8
d.283, nhắc đúng một lần, không lặp.)

**Tin bảo mật tài khoản (từ BAT-16): "gửi ngay" nghĩa là gì.** Đổi mật khẩu, đặt
lại TOTP, đăng xuất mọi nơi, và nhập sai từ lần thứ 3 khi đổi mật khẩu đều sinh
một tin bảo mật. "Gửi ngay" của tin này **không** có nghĩa là request gửi Telegram:

* Request chỉ **ghi tin vào kho** (`thong_bao`, `uu_tien = 'khan'`, cột `bao_mat`
  có mã sự kiện) trong cùng batch với thay đổi. Không có lời gọi Telegram nào
  trong request, nên Telegram hỏng không làm hỏng việc đổi mật khẩu.
* Cron mỗi phút (`* * * * *`, `quetGuiThongBao` trong `cron-thong-bao.ts`) gửi nó ở
  **nhịp kế tiếp**, tức trong vòng khoảng một phút, **kể cả trong giờ yên lặng**
  (vì là tin `khan`). Tin này không tắt được trong Cài đặt.
* Gửi trượt thì thử lại theo mốc 10 giây / 60 giây / 5 phút, nhưng mỗi lần thử chỉ
  chạy ở nhịp cron đầu tiên sau mốc đó. Nên lần thử "10 giây" thực tế đi ở phút kế.
* Chưa cấu hình Telegram (bước 36) thì không gửi gì, tin nằm chờ trong kho. Tin bảo
  mật không sinh lời nhắc 🔴 sau 2 giờ.

**Không thấy tin gì?** Theo thứ tự này:

1. Mở **Tổng quan**, xem khối **Cần chú ý**. Một dòng *"Không gửi được thông báo
   Telegram (lý do)"* là chỗ xem nhanh nhất — lý do đã là một câu tiếng Việt, và
   nó **đã được lọc** nên không mang token. Dòng đó chỉ hiện sau khi Baton đã thử
   đủ **4 lần** (1 lần đầu + 3 lần thử lại giãn 10 giây / 60 giây / 5 phút), tức
   sau khoảng 6 phút.
2. Chưa đủ 6 phút, hoặc muốn xem thô, thì soi thẳng bảng:

```
cd packages/api && npx wrangler d1 execute baton --remote --command "SELECT id, loai, uu_tien, tao_luc, gui_telegram_luc, gui_so_lan_thu, gui_thu_lai_luc, gui_loi_ly_do FROM thong_bao ORDER BY tao_luc DESC LIMIT 10;"
```

Đọc ba cột: `gui_telegram_luc` có số = **đã gửi xong**;
`gui_so_lan_thu` đang tăng = đang trong vòng thử lại; `gui_so_lan_thu = 4` kèm
`gui_loi_ly_do` = đã bỏ cuộc, và lý do nằm ngay đó.

| `gui_loi_ly_do` nói gì | Thật ra là | Làm gì |
|---|---|---|
| `Telegram trả mã 403.` + `bot can't initiate conversation` | **chưa bấm Start** với bot | làm bước 34, rồi tạo lại một mục 🔴 (tin cũ đã hết lượt thử, nó không tự gửi lại) |
| `Telegram trả mã 400.` + `chat not found` | chat id **sai** — hay nhất là thiếu dấu `-` của group, hoặc lấy `from.id` thay vì `chat.id` | làm lại bước 35, `wrangler secret put TELEGRAM_CHAT_ID` |
| `Telegram trả mã 401.` + `Unauthorized` | bot token sai, gõ thiếu, hoặc đã `/revoke` | `wrangler secret put TELEGRAM_BOT_TOKEN` lại |
| `Không gọi được Telegram (lỗi mạng hoặc quá hạn chờ).` | không tới được `api.telegram.org` trong hạn chờ | thường tự khỏi ở lần thử lại; còn mãi thì xem log Worker |
| **Không dòng nào**, `gui_so_lan_thu = 0`, `gui_telegram_luc` rỗng | Baton **chưa cấu hình** Telegram nên không thử gửi lần nào | hai secret ở bước 36 chưa đặt, hoặc đặt rồi mà **chưa deploy lại** |

Hàng cuối là ca hay gặp và im lặng nhất: `wrangler secret put` **không** tự
deploy. Đặt secret xong thì chạy lại **bước 6**.

`wrangler secret list` (từ `packages/api`) cho biết **tên** hai secret đã đặt
chưa — không cho biết giá trị.

### i6. MỘT nhịp Cron, và vì sao chỉ một

`packages/api/wrangler.toml` có **đúng một** nhịp `[triggers] crons`:

```
crons = ["* * * * *"]
```

**Vì sao một, không năm — và đây là một giới hạn của tài khoản, không một lựa chọn
thẩm mỹ.** Gói **Workers Free cho 5 cron trigger mỗi TÀI KHOẢN** (không mỗi Worker).
Ngày 07/10 bản deploy bị Cloudflare từ chối:

```
This account has reached the Workers Free limit of 5 cron triggers per account
[code 10072]
```

Tài khoản lúc đó còn một Worker khác đang dùng 2 nhịp, nên Baton chỉ còn tối
đa 3 chỗ. Hậu quả thật của lần đó: hai nhịp **báo cáo** không đặt được, tức **báo
cáo sáng và handoff tối không chạy** trên bản đang sống. Nay cả năm việc nền đi
trong một nhịp mỗi phút và Worker tự chọn việc theo **mốc thời gian của nhịp**:

| Khi nào (UTC) | Giờ Việt Nam | Việc | SPEC |
|---|---|---|---|
| mỗi phút | mỗi phút | thử lại bằng chứng · **gửi Telegram** · nhắc 🔴 sau 2 giờ | 7 d.220, 12, 8 d.283 |
| phút chia hết 5 | mỗi 5 phút | cảnh báo phiên đứng hoặc lỗi | 6 d.196 |
| phút chia hết 10 | mỗi 10 phút | kiểm lại commit `pushed`, dừng theo dõi sau 7 ngày | 7 d.221, 19.7 |
| từ **00:30** | **07:30** | **báo cáo sáng** | 11 d.322 |
| từ **13:00** | **20:00** | **handoff tối** | 11 d.330 |

Nhịp **hiệu dụng** của từng việc **không đổi** so với năm nhịp cũ — chỉ đổi cách
kích. Nếu về sau bạn thấy một việc nền mới trong Baton, nó cũng **sẽ không** cần
thêm một cron: chỗ cho tài khoản được giữ nguyên từ đây.

**Hai dòng cuối là giờ UTC** — đó là chỗ dễ đọc sai nhất của cả file cấu hình. Giờ
trong SPEC là giờ **Việt Nam (UTC+7)**: 00:30 UTC **là** 07:30 giờ Việt, 13:00 UTC
**là** 20:00 giờ Việt. Đừng "sửa" chúng thành 07:30 và 20:00 UTC — đó là 14:30 và
03:00 giờ Việt.

**"Từ", không "đúng lúc".** Cloudflare không hứa nhả nhịp đúng giờ và đúng một lần.
Nên hai việc báo cáo nhận cả một **cửa sổ 60 phút** kể từ mốc, và trong cửa sổ Baton
hỏi "hôm nay đã có báo cáo loại này chưa" trước khi sinh. Hai hệ quả bạn nên biết:
nhịp 00:30 bị bỏ mà 00:31 có thì **báo cáo vẫn ra, đúng một lần**; còn nếu Cron đứng
**suốt cả giờ** 00:30–01:30 thì báo cáo sáng hôm đó **mất** (không có hàng đợi bù).

**Cron chỉ được áp lúc deploy.** `wrangler.toml` đổi mà chưa chạy lại **bước 6** thì
bản đang chạy vẫn giữ lịch cũ, và bạn sẽ không nhận báo cáo nào. Sau khi deploy,
Cloudflare Dashboard → Workers → `baton-api` → **Settings → Triggers** phải liệt kê
**đúng một** biểu thức `* * * * *` — thấy ba hay năm dòng là bản cũ chưa được thay.

Hai nhịp báo cáo **không gọi Telegram**. Chúng ghi một dòng vào bảng `bao_cao` và
một tin vào kho thông báo trong app; đưa tin đó ra Telegram là việc của nhịp mỗi
phút. Hệ quả thực tế, và nó là **có chủ ý**: chưa cấu hình Telegram thì báo cáo
**vẫn được sinh** và vẫn xem được ở `/bao-cao` trên web — bạn chỉ không nhận tin.

Kiểm nhanh sau deploy, sáng hôm sau:

```
cd packages/api && npx wrangler d1 execute baton --remote --command "SELECT ngay, loai, tao_luc FROM bao_cao ORDER BY ngay DESC, loai DESC LIMIT 5;"
```

Không có dòng nào sau 07:30 thì theo thứ tự: (1) Triggers có nhịp `* * * * *` chưa;
(2) log Worker (Dashboard → Logs) có dòng `Cron báo cáo:` nào không; (3) mở
`/bao-cao` trên web — báo cáo được sinh **không** phụ thuộc Telegram, nên có dòng ở
đó mà không có tin là một lỗi của chặng gửi, không của chặng sinh.

---

## j. Sao lưu (BAT-8)

SPEC mục 15 d.429: "xuất toàn bộ dữ liệu ra JSON bằng một nút (chỉ chủ). Có sao lưu
tự động hằng ngày, giữ 14 bản." Bản này có **cả hai vế**; **khôi phục CHƯA có** (19.12
câu 7: "v0.1 không có nút phục hồi" — phục hồi là việc tay, xem j5).

**Mọi lệnh `wrangler` trong mục này CHƯA CHẠY THỬ** (xem "ĐỌC TRƯỚC"). Cú pháp đã đối
chiếu với định nghĩa lệnh trong `node_modules/wrangler/wrangler-dist/cli.js` của bản
đang cài (`r2 bucket create <name>`; `r2 object get <bucket>/<key> --file … --remote`).

> ⚠️ **File sao lưu chứa toàn bộ dữ liệu điều phối** (ticket, Cần Chủ, nhật ký quyết
> định, báo cáo, hồ sơ dự án…). Nó **không** chứa mật khẩu, muối, secret TOTP, token
> agent hay phiên đăng nhập — nhưng vẫn là dữ liệu của bạn. **Đừng commit, đừng gửi đi**,
> đừng để trong thư mục repo.

### j1. Tạo bucket R2 — MỘT lần, TRƯỚC lần deploy đầu có BAT-8

`packages/api/wrangler.toml` nay khai `[[r2_buckets]] binding = "SAO_LUU"`,
`bucket_name = "baton-sao-luu"`. Bucket chưa có thì **`wrangler deploy` sẽ báo lỗi**.
Chạy từ `packages/api`:

```
cd packages/api && npx wrangler r2 bucket create baton-sao-luu
```

R2 có hạn mức miễn phí; một bản sao lưu JSON của Baton nhỏ, 14 bản không đáng kể. Nếu
Cloudflare đòi bật R2/thêm phương thức thanh toán thì **dừng** — đó là việc của bạn,
không của agent (danh sách cấm mục 1).

### j2. Sao lưu tự động chạy lúc nào

* **02:00 giờ Việt Nam mỗi ngày** (= 19:00 UTC), nằm trong **cùng một** Cron Trigger
  `* * * * *` đã có — không thêm cron mới (giới hạn 5 cron/tài khoản, §i6). Nhịp trễ
  tới 60 phút vẫn chạy; nhịp lặp không ghi hai lần.
* Mỗi ngày **một** object: `sao-luu/baton-<YYYY-MM-DD>.json` (ngày giờ Việt Nam). Sau
  khi ghi thành công, bản **cũ hơn 14 bản mới nhất** bị xoá. Object khác mẫu tên đó
  (bạn tự để vào bucket) **không bao giờ** bị đụng. Ghi lỗi thì **không xoá gì**.
* Báo cáo sáng 07:30 và handoff tối 20:00 có **một dòng** `⚠️ Sao lưu <ngày> …` khi
  bản gần nhất **không có** trên R2, khi R2 **lỗi** lúc kiểm, hoặc khi chưa gắn R2
  ("Sao lưu tự động chưa bật"). Không có dòng đó = bản đêm qua có.

### j3. Xuất tay bằng nút hoặc CLI

* **Web:** `Cài đặt` (cuối sidebar) → nút **"Xuất dữ liệu (JSON)"** → trình duyệt tải
  `baton-<ngày>.json`.
* **CLI** — chỉ chạy được với **`TOKEN_CHU`** làm `BATON_TOKEN` (token agent →
  `FORBIDDEN`, mã thoát 1). File đích **phải chưa có** (không ghi đè):

  ```
  BATON_URL=https://baton-api.<tên-tài-khoản>.workers.dev BATON_TOKEN=<TOKEN_CHU> node packages/cli/dist/bin.js export ~/baton-sao-luu/baton-thu.json
  ```

  (CoS chạy qua `op run` để `TOKEN_CHU` không vào lịch sử shell.) Lệnh in đường dẫn
  và số dòng mỗi bảng.
* **curl** (cùng thân): `curl -H "Authorization: Bearer <TOKEN_CHU>" -o baton.json https://baton-api.<tên-tài-khoản>.workers.dev/v1/xuat`

### j4. Lấy một bản từ R2 về và đọc

Danh sách 14 bản (ngày, dung lượng) xem ngay trong web: **Cài đặt → Bản sao lưu**.
(`wrangler` **không** có lệnh liệt kê object trong bucket — bản đang cài chỉ có `r2
object get/put/delete`.) Làm lần lượt:

1. **Lấy một bản về máy** — chọn một trong hai cách:
   * **Cách A (web, khuyên dùng):** `Cài đặt` → mục **Bản sao lưu** → bấm **Tải** ở dòng
     của ngày cần. Trình duyệt tải `baton-<ngày>.json`. (Mục này hiện "Sao lưu tự động
     chưa bật" nếu chưa gắn R2.)
   * **Cách B (wrangler, CHƯA CHẠY THỬ):**

     ```
     cd packages/api && npx wrangler r2 object get baton-sao-luu/sao-luu/baton-2026-10-16.json --remote --file ~/baton-sao-luu/baton-2026-10-16.json
     ```

     Thiếu `--remote` là đọc bucket **local** của `wrangler dev`, không phải bản thật.
2. **Kiểm file đọc được** (cần `jq`). Trước hết kiểm JSON hợp lệ — hợp lệ thì không in
   gì và mã thoát 0; hỏng thì `jq` báo lỗi cú pháp:

   ```
   jq empty ~/baton-sao-luu/baton-2026-10-16.json
   ```

   Rồi xem nhanh nội dung:

   ```
   jq '.schema_version, .migration_cuoi, .xuat_luc, (.bang | map_values(length))' ~/baton-sao-luu/baton-2026-10-16.json
   ```

   Mong đợi: `1`, tên migration cuối (vd `"0026_cai_dat_thong_bao_bao_mat"`), mốc xuất,
   rồi số dòng của từng bảng.
3. **Khôi phục vào D1:** Khôi phục vào D1 chưa có công cụ, cần CoS và Chủ làm tay.

### j5. Khôi phục — CHƯA CÓ

Không có nút, không có lệnh: **khôi phục vào D1 chưa có công cụ, cần CoS và Chủ làm
tay.** Tài liệu này không đưa lệnh ghi vào D1 vì chưa có cách nào đã được thử. Định
dạng file (`schema_version: 1`): `{ schema_version, xuat_luc, xuat_luc_ms, workspace_id,
migration_cuoi, bang: { <bảng>: [dòng…] } }` — bảng xếp **cha trước con** (theo khoá
ngoài). Hai bảng của tài khoản chủ **không** có trong file: khôi phục xong phải `POST
/v1/khoi-tao` / `/v1/chu/thiet-lap` lại (§d), và **cấp lại token mọi agent** (token
không theo bản sao lưu). Bản xuất đọc từng bảng theo trang, **không** phải một ảnh chụp
nguyên tử: một lệnh ghi lúc 02:00 có thể làm hai bảng lệch một dòng.

---

## CHƯA CÓ trong bản dùng sớm này

Để bạn không đi tìm một thứ không tồn tại:

* **3 việc trọng tâm** (SPEC mục 11 d.324): **đã có** cả hai đường (BAT-11). Agent
  `coordinator` ghi qua **API** — đúng chữ d.324: `POST /v1/trong-tam` với thân
  `{"muc":[{"ticket_id":"...","ghi_chu":"..."}]}`, tối đa 3 mục, gọi được bằng token
  của agent `coordinator` **hoặc** bằng phiên của bạn; `GET /v1/trong-tam` đọc bộ của
  hôm nay. Trên web, trang `/bao-cao` có ô ghi ba việc (mã ticket + ghi chú), nút lưu
  và nút xoá hết. Chưa ghi thì báo cáo nói đúng chữ *"chưa có đề xuất"* của SPEC.
  Đây không còn là chỗ thiếu; giữ dòng này để bạn biết nó nằm đâu.
* **Cuộn ngược sâu trong danh sách báo cáo**: **đã có** (BAT-15). Trang `/bao-cao`
  tải 50 dòng đầu; nút "Xem thêm" nối trang kế (`GET /v1/bao-cao?cursor=…`), hết thì
  ẩn nút, lỗi mạng hiện "Thử lại" và giữ nguyên danh sách. Giữ dòng này để bạn biết
  nó nằm đâu.
* **Sao lưu**: xuất bằng nút/CLI và sao lưu tự động 14 bản **đã có** (§j). **Chưa
  có:** khôi phục vào D1 chưa có công cụ, cần CoS và Chủ làm tay (§j5). Trước mỗi lần deploy có migration, một bản chụp
  SQL vẫn đáng làm:
  `cd packages/api && npx wrangler d1 export baton --remote --output baton-sao-luu.sql`
  (lệnh này **chưa chạy thử**).
* **Nhập dữ liệu cũ** (phần 8): `mau-nhap/` có dữ liệu giả, nhưng đường nhập
  can-chu / decision-log cũ **chưa có**. Lịch sử cũ không vào Baton được; bắt đầu
  từ dữ liệu mới.
* **Phím tắt bàn phím, cập nhật lạc quan, bố cục 375px** (mục 14): **đã có phần
  lớn**. Phím `J`/`K`/`S`/`Esc` ở danh sách ticket, `D`/`S`/`J`/`K`/`1`–`9`/`Ctrl+Enter`
  ở trang Cần Chủ; cập nhật lạc quan (`onMutate`) ở danh sách, chi tiết ticket,
  Cần Chủ, `/cai-dat`; bố cục 375px (menu trượt, bảng cuộn ngang). **Còn thiếu:**
  `G` (đi tới trang) và `?` (bảng phím). Tạo việc đã có (BAT-22: nút "Tạo việc" + phím `C`).
* **`/cai-dat`**: nay có nút "Xuất dữ liệu (JSON)" (BAT-8),
  danh sách bản sao lưu kèm nút tải (BAT-10), phần **Tài khoản** (BAT-11): các
  phiên đang mở, nút "Đăng xuất mọi nơi" (có bước xác nhận), form đổi mật khẩu
  (§h3), và **tắt từng loại thông báo** (BAT-16, mục 12). Các
  trang đã có nội dung thật: `/`, `/can-chu`, **`/bao-cao`**,
  `/nhat-ky`, `/ban-do-du-an`, `/doi-agent`, `/ticket`, `/t/:mã`, `/du-an/:mã`,
  `/du-an/:id/ho-so`, `/agent/:id`, `/phien/:id`.
* **Tắt từng loại thông báo** (SPEC mục 12 d.348): **đã có** (BAT-16, migration
  0026) — công tắc từng loại trong `/cai-dat`, mặc định bật hết. Riêng tin bảo mật
  tài khoản không tắt được. Giữ dòng này để bạn biết nó nằm đâu.
* **Quản trị tài khoản chủ trên web: có, nhưng chưa đủ.** `/cai-dat` có các phiên
  đang mở, "Đăng xuất mọi nơi" và đổi mật khẩu (§h3). **Chưa có** trên web: đặt lại
  TOTP và mở khoá tài khoản — hai việc đó vẫn là `curl` với `TOKEN_CHU` (§h).
* **Không có nút cấp lại token agent** trên `/doi-agent`. Chủ sẽ đi tìm; không có.
  Dùng `curl` ở bước 17.
* **Mọi đường cứu đều đi qua `TOKEN_CHU`** (§h). Nên `TOKEN_CHU` là một điểm hỏng
  đơn: mất nó thì không đặt lại được TOTP, không mở khoá được tài khoản. Cất nó
  tách khỏi điện thoại và khỏi máy tính đang dùng.
* **Đường đăng nhập cố ý không có hạn mức theo nhịp.** `/v1/dang-nhap` không đi
  qua bộ đếm 600 request/phút; thứ kẹp số lần đoán là `so_lan_sai` **của tài
  khoản**. Hệ quả vận hành: ai biết địa chỉ Worker và đoán sai liên tục sẽ làm
  bạn **bị khoá**, lặp lại được vô hạn, và mỗi lần bạn phải chạy §h2 để mở. Chưa
  có đường chặn theo IP hay theo nhịp cho đường này.
* **Đổi mật khẩu chủ**: **đã có** (BAT-11) — form trên `/cai-dat` (§h3), gọi
  `POST /v1/chu/doi-mat-khau`; đòi mật khẩu hiện tại **và** mã TOTP, chỉ làm được từ
  một phiên đăng nhập web, xong thì huỷ mọi phiên khác. Giới hạn còn lại:
  * Phải **đăng nhập được** mới đổi được. **Quên** mật khẩu thì không có đường đặt
    lại: `POST /v1/chu/thiet-lap` gọi lần hai trả `FORBIDDEN` (cố ý — nó không phải
    đường đặt lại mật khẩu), và `/v1/chu/dat-lai-totp` chỉ đổi TOTP.
  * Đổi mật khẩu **đã** ghi một dòng Nhật ký và gửi tin Telegram bảo mật
    (BAT-16, `cau-hoi-spec.md` #148); tin này không tắt được.
