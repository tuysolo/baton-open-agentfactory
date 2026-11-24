# THIET-KE.md — Hệ thiết kế giao diện Baton

**Nguồn sự thật cho GIAO DIỆN từ 29/10** (Chủ chốt làm lại theo hệ thiết kế kiểu
Linear). `SPEC.md` vẫn là nguồn sự thật duy nhất cho **hành vi**; file này chỉ nói
**trình bày**. Hai thứ lệch nhau ⇒ hành vi theo SPEC, rồi sửa file này.

Giá trị thật nằm ở `packages/web/src/kieu.css` (hai cột tối/sáng); bảng dưới và
file CSS phải khớp từng dòng. Tương phản được đo tự động trong
`packages/web/test/vo-linear.test.tsx` từ chính `kieu.css`.

## Tinh thần

Công cụ làm việc hằng ngày: gọn, yên, mật độ cao, **chữ là chính**, ít trang trí.
Không bóng đổ đậm, không gradient, không viền dày, không màu sặc sỡ. **Màu chỉ để
mang nghĩa** (trạng thái, mức gấp, lỗi). Mức áp dụng: NHẸ (công cụ nội bộ).

**Tối là chế độ chính** — mặc định cho người chưa chọn (`THEME_MAC_DINH = 'toi'`,
script nội tuyến `index.html`, khối `:root:not([data-theme])` của `kieu.css` khi
chưa có JS). Sáng vẫn giữ, cùng vai trò token, đảo giá trị. Nút theme vẫn chọn
được Sáng / Tối / Theo máy.

## Token màu (tên vai trò → tối / sáng)

Component **không chọn màu**: chỉ gọi tên vai trò (`bg-nen-lop`, `text-chu-mo`…).

| Token | Vai trò | Tối | Sáng |
|---|---|---|---|
| `nen` | nền trang, sidebar | `#0f1011` | `#ffffff` |
| `nen-lop` | lớp nổi: thẻ, panel, menu, modal; hover mục sidebar | `#17181a` | `#fafafa` |
| `nen-noi` | lớp nổi khi hover; mục đang chọn | `#1e1f22` | `#f1f1f2` |
| `vien` | viền 1px | trắng 8% | đen 9% |
| `chu` | chữ chính | `#ededef` | `#171717` |
| `chu-mo` | chữ phụ | `#8a8f98` | `#6e6e6e` |
| `chu-mo-hon` | chữ mờ hơn: số đếm, ngày, dấu `›` | `#7f838a` | `#737373` |
| `nhan-manh` | **màu nhấn**: nền nút chính, focus ring | `#5e6ad2` | `#5e6ad2` |
| `nhan-manh-dam` | hover nút chính | `#4e5ac0` | `#4e5ac0` |
| `nhan-manh-nen` | nền nhạt của màu nhấn | `#1f2238` | `#eef0fb` |
| `nhan-manh-chu` | chữ màu nhấn trên nền (liên kết) | `#8f98ec` | `#4c58c0` |
| `tren-nhan-manh` | chữ đặt trên nền `nhan-manh` | `#ffffff` | `#ffffff` |
| `loi` / `loi-nen` | lỗi | `#eb5757` / `#40181b` | `#b91c1c` / `#fee2e2` |
| `canh` / `canh-nen` | cảnh báo | `#f2c94c` / `#3b2a06` | `#a4530a` / `#fef3c7` |
| `tot` | sức sống xanh, agent đang làm | `#4cb782` | `#047857` |
| `lop-phu` | lớp phủ sau hộp nổi (BAT-69) — **không đảo** | đen 50% | đen 50% |

Thang `neutral-50…950` là thang **tương phản** đảo chiều (50 gần nền, 900 gần chữ
ở cả hai chế độ) — giữ để mã cũ tự ăn chế độ; mã mới ưu tiên token ngữ nghĩa ở
trên. Sáu cặp màu nhãn (`nhan1…6-nen/-chu`) giữ nguyên kiến trúc cặp.

### Màu trạng thái và mức gấp

| Token | Dùng cho | Tối | Sáng |
|---|---|---|---|
| `tt-cho` | Cần làm (`todo`, `backlog`) | `#8a8f98` | `#80848b` |
| `tt-dang-lam` | Đang làm | `#f2c94c` | `#a87b00` |
| `tt-kiem-chung` | Chờ kiểm chứng | `#4ea7fc` | `#2f7fd6` |
| `tt-xong` | Xong (= màu nhấn) | `#5e6ad2` | `#5e6ad2` |
| `tt-huy` | Huỷ (`canceled`, `duplicate`) | `#6b6f76` | `#80848b` |
| `gap-khan` | Cần Chủ — Khẩn | `#eb5757` | `#c62828` |
| `gap-hom-nay` | Cần Chủ — Hôm nay | `#f2c94c` | `#a87b00` |
| `gap-sau` | Cần Chủ — Để sau | `#8a8f98` | `#80848b` |

Chấm sức sống dự án (`vo/cham-suc-song.tsx`, d.71–74): 🟢 `bg-tot`, 🟡 `bg-canh`
(phiên đứng hoặc lỗi là một cảnh báo), ⚪ `bg-neutral-300`; chưa tính = vòng rỗng.
Không mã màu Tailwind (`amber-*`…) nào.

## Icon trạng thái (`vo/icon.tsx`)

Icon tròn 16px **trước tiêu đề** — không tô nền cả dòng. Hình khác nhau ở mọi
trạng thái, nên màu không là thông tin duy nhất.

- `IconTrangThai({ trang_thai, nhan?, co? })`:
  - Cần làm = vòng rỗng xám; `backlog` = vòng rỗng xám **nét đứt**;
  - Đang làm = vòng vàng **nửa** đầy;
  - Chờ kiểm chứng = vòng xanh dương **ba phần tư** đầy;
  - Xong = tròn đầy tím có **tick**;
  - Huỷ (và `duplicate`) = tròn đầy xám có **x**.
- `ChamMucGap({ muc, nhan? })`: chấm 10px — Khẩn đỏ đầy, Hôm nay vàng đầy, Để sau
  xám **rỗng**.
- ARIA: không `nhan` ⇒ `aria-hidden` (chữ trạng thái đứng cạnh là thứ được đọc);
  có `nhan` ⇒ `role="img"` + `aria-label`. **Không bỏ chữ trạng thái** mà SPEC/test
  cần đọc chỉ vì đã có icon.
- Màu: `LOP_TRANG_THAI`, `LOP_MUC_GAP` ở `vo/mau-the.ts`.
- Icon chỉ vẽ khi thân có **mã** trạng thái (BAT-67): Chi tiết phiên vẽ icon trước
  mã ticket khi `ticket.trang_thai` là một trong bảy mã của bảng 0.1 (mã lạ ⇒ không
  icon); Báo cáo **không** vẽ — thân báo cáo chỉ mang nhãn `nhan_trang_thai` của
  bản chụp, và suy mã từ nhãn ở client là một phép dẫn xuất thứ hai.
- **Trạng thái phiên** (bảy mã `running`…`closed`) **chưa có hình**: chip trạng
  thái phiên là `LOP_CHIP` trơn, riêng mã `error` ("Lỗi") là chip lỗi
  `LOP_CHIP_LOI` (BAT-69, `lopChipTrangThaiPhien` ở `trang/phien.tsx` — đọc mã,
  không đọc nhãn) — nghĩa đi bằng màu chữ, chữ nhãn vẫn đứng đó. Thêm hình cho nó
  là một quyết định thiết kế mới, ghi ở đây trước khi vẽ.

### Chấm trạng thái agent (BAT-66)

`ChamTrangThaiAgent({ trang_thai, nhan? })` — chấm 10px đặt **trước tên agent**
(dòng "Agent đang làm gì" của Tổng quan, dòng Đội agent, trong chip trạng thái ở
trang một agent). Năm trạng thái của bảng 0.1, năm **hình**:

| Trạng thái | Hình | Màu (`LOP_TRANG_THAI_AGENT`) |
|---|---|---|
| `busy` Đang làm | chấm **đầy** | `text-tot` |
| `waiting_owner` Chờ Chủ | **vòng** có chấm nhỏ giữa | `text-canh` |
| `stalled` Đứng | **hình thoi** đầy (hình duy nhất không tròn) | `text-loi` (cùng nghĩa chấm agent của sidebar) |
| `idle` Rảnh | **vòng rỗng** | `text-chu-mo` |
| `disabled` Đã tắt | vòng có **gạch chéo** | `text-tt-huy` |

- ARIA như `IconTrangThai`: không `nhan` ⇒ `aria-hidden` (chữ `nhan_trang_thai`
  đứng cạnh là thứ được đọc — **không bỏ chữ**); có `nhan` ⇒ `role="img"`.
- Thuộc tính `data-cham-agent`, không `data-trang-thai` (ca test đọc chữ trạng thái
  theo thuộc tính đó).
- Năm màu qua lưới tương phản (≥ 3:1 trên ba nền, hai chế độ) cùng ca với màu
  trạng thái ticket (`test/vo-linear.test.tsx`).
- Chấm agent của sidebar (`vo/sidebar.tsx` `ChamAgent`) dùng component này từ
  BAT-67, **có nhãn** (`nhan` = `nhan_trang_thai` ⇒ `role="img"`) vì sidebar không
  có chữ trạng thái đứng cạnh; vỏ `span` giữ `data-trang-thai-agent`, **không**
  `title` (BAT-69 bỏ `title` lặp: nhãn chỉ nằm trên chấm — `aria-label`, và
  `<title>` của SVG cho tooltip).

## Quy tắc màu nhấn

Màu nhấn tím-chàm **chỉ** cho: nút chính (`NUT_CHINH`), focus ring (`:focus-visible`
toàn cục trong `kieu.css`), liên kết (`text-nhan-manh-chu`), và trạng thái Xong.
**Không** dùng để trang trí (logo, tiêu đề, viền, sidebar). Mục sidebar đang chọn
dùng nền lớp nổi, không dùng màu nhấn. Không có màu nhấn thứ hai.

## Chữ

- `font-family: Inter, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`.
  **Inter chỉ dùng nếu máy đã cài sẵn**: không `@font-face`, không CDN, không gói
  font (repo không có gói Inter và không thêm).
- Cỡ cơ sở **13px** (`body` và `text-sm` = 0.8125rem). `text-xs` = 12px.
- Tiêu đề trang 15–16px, đậm 500–600. Không chữ khổng lồ.
- **Thang tiêu đề** (một hằng mỗi bậc, `vo/lop-nut.ts`; không `text-lg`/`text-xl`
  nào trong `src` — có ca test đọc nguồn):
  - `h1` trang — `LOP_TIEU_DE_TRANG`: 16px, đậm 600, chữ chính. Mọi trang, kể cả
    tiêu đề ticket ở chi tiết, trang đăng nhập, giữ chỗ, "Không có trang này";
  - `h2` mục/khối — `LOP_TIEU_DE_MUC`: 13px, đậm 600 (chỉ hơn chữ thường ở độ
    đậm). Tiêu đề hộp nổi (modal) cũng ở bậc này;
  - `h3` nhỏ trong khối — `LOP_TIEU_DE_NHO`: 12px, đậm 500, chữ phụ;
  - đầu nhóm có số đếm (nhóm theo trạng thái, theo ngày): tên đậm 600 + số
    `chu-mo-hon` `tabular-nums` đậm thường, như danh sách ticket.
- Chữ phụ trong dòng/thẻ: `LOP_CHU_PHU` (12px `chu-mo`); ngày, số đếm:
  `LOP_CHU_MO_HON` (12px `chu-mo-hon`, `tabular-nums`). Mốc thời gian (`Moc`)
  luôn là `chu-mo-hon`.
- Liên kết chữ: `LOP_LIEN_KET` (`nhan-manh-chu`, gạch chân khi hover). Tên một
  thực thể bấm được (tên dự án, tên agent trong dòng) là chữ chính, gạch chân
  khi hover — không tô màu nhấn cả cột tên.
- Mã ticket / T-số (`SAI-74`, `T-105`): tiện ích `ma-ticket` — 12px, xám
  (`chu-mo`), `tabular-nums`.
- **Markdown** (`markdown.tsx` — bối cảnh Cần Chủ, bình luận ticket; BAT-69): mã
  nội dòng `LOP_MD_MA` và khối code `LOP_MD_CODE` = `bg-nen-noi` + `border
  border-vien` + `text-chu` (cùng quy ước ô chữ đơn cách trong hộp; `nen-noi` một
  nấc trên cả `nen` lẫn `nen-lop`, nên đọc được dù Markdown nằm trên nền trang
  hay trên thẻ; `chu`/`nen-noi` được lưới cặp đo ở hai chế độ). Liên kết trong /
  ngoài `LOP_MD_LIEN` = `LOP_LIEN_KET` **+ `underline` thường trực**: liên kết nằm
  giữa đoạn văn, chỉ phân biệt bằng màu là yếu (người không phân biệt màu), nên
  gạch chân là tín hiệu thứ hai — ngoại lệ có lý do của "gạch chân khi hover".
  Liên kết không an toàn (không `<a>`) chữ `chu-mo`. Danh sách không màu riêng.

## Bo góc, khoảng cách, chuyển động

- Bo góc: **6px** cho nút, ô nhập, chip (`rounded` — `--radius: 6px`); **8px** cho
  thẻ, menu, modal (`rounded-lg`).
- Khoảng cách theo bậc **4px** (thang Tailwind: `1` = 4px).
- Chuyển động **100–150ms** (`--default-transition-duration: 120ms`), chỉ cho hover
  và mở menu. Bóng: chỉ `shadow-lg` nhẹ cho tấm nổi.

## Bố cục vỏ

- Sidebar trái cố định **240px** (`w-60`), nền `nen`, ngăn vùng chính bằng viền
  mờ. Mục cao 28px (`h-7`), icon 16px + chữ. Đang chọn = `nen-noi`; hover =
  `nen-lop`. Nhóm (Dự án, Đội agent) có tiêu đề nhỏ xám, thu gọn được.
- Thanh trên mảnh (40px): breadcrumb (Dự án › Ticket) → nút hành động bên phải
  (`data-o="thanh-tren-hanh-dong"`, nút sáng/tối ở cuối). **Bộ lọc dạng
  tab-pill không lên thanh trên**: nó ở hàng tiêu đề của chính trang (danh sách
  ticket) hoặc ở đầu khối (Vừa xong 24 giờ / 7 ngày). Đưa lên thanh trên cần
  portal/context từ trang lên vỏ và đổi thứ tự Tab — tức đổi hành vi; BAT-61 gỡ
  chỗ trống `thanh-tren-loc` cũ.
- Nút tên workspace đầu sidebar mở một menu ⇒ có **mũi tên xuống nhỏ** (12px,
  `chu-mo-hon`, `aria-hidden`) ở cuối nút. Nút nào mở menu thì có dấu này.
- Lớp dùng chung (`vo/lop-nut.ts`): `NUT_CHINH`, `NUT_PHU`, `LOP_NUT_ICON` (nút
  chỉ có icon 24px trong hàng tiêu đề, vd `+` đầu cột Cần làm và cột Backlog), `NUT_MO*`,
  `LOP_O_NHAP`, `LOP_CHIP`, `LOP_CHIP_CANH`, `LOP_CHIP_LOI`, `LOP_KBD`,
  `LOP_TAB_PILL*`, `LOP_MUC_MENU`, `LOP_TAM_NOI`, và các lớp trang ở mục dưới.

### Chip

- `LOP_CHIP`: bo 6px, viền mờ, 12px, chữ phụ, không nền.
- **Chip cảnh báo** `LOP_CHIP_CANH` (lý do "Cần chú ý", phiên "Đứng" và "Chờ người
  giao quá hạn", cờ của ticket và hai cờ d.300 của hồ sơ, nhãn loại ở vế "Rủi ro và
  lệch" của Báo cáo, "đã có quyết định mới" của Nhật ký — BAT-68) và **chip lỗi**
  `LOP_CHIP_LOI` (agent "Đã tắt", "Token đã thu hồi" — BAT-68; chip trạng thái
  phiên mã `error` "Lỗi" ở Chi tiết phiên — BAT-69): **cùng
  dáng** `LOP_CHIP`, chỉ khác màu chữ (`canh` / `loi`). **Không tô nền** (`bg-canh-nen`, `bg-loi-nen`): nghĩa đi
  bằng chữ màu. Không có cặp nền–chữ mới; `canh`/`loi` trên ba nền đã được đo
  ≥ 4.5:1 ở hai chế độ (ca "chữ mờ thừa hưởng nền" của `vo-linear.test.tsx`).
- Quy ước chip áp cho **chip**; nơi trạng thái phiên là một **liên kết** (dòng
  phiên của trang agent, lý do có phiên ở "Cần chú ý" của Tổng quan) thì giữ
  `LOP_LIEN_KET` — màu liên kết là quy tắc màu nhấn, tô đỏ một liên kết là phá nó.

### Hộp nổi

- Tấm hộp `LOP_TAM_NOI` (bo 8px, `nen-lop`, viền mờ, `shadow-lg`); tiêu đề
  `LOP_TIEU_DE_MUC`; khung không tắt outline (mục "Bàn phím trước").
- **Lớp phủ** sau hộp: `absolute inset-0 bg-lop-phu` ở cả bảy hộp (bảng phím
  `?`, Tạo việc, Giao việc, command menu, menu trượt, xác nhận áp hàng loạt, Token
  agent). Token `lop-phu` (BAT-69) = đen 50% ở **cả hai** chế độ — cùng giá trị
  `bg-black/50` cũ, không đổi hình ảnh: lớp phủ **không đảo** theo chế độ nên làm
  tối trang ở cả tối lẫn sáng; `bg-neutral-950/50` thì đảo thành lớp phủ gần trắng
  ở chế độ tối. Không phải màu chữ/nền của cặp nào nên lưới tương phản không đo
  nó (giá trị có alpha, lưới chỉ đọc `#hex`). Hộp mới dùng `bg-lop-phu`, không mã
  màu.
- Ô chữ đơn cách trong hộp (token mới của Token agent, BAT-68): `bg-nen-noi`
  (một nấc trên tấm `nen-lop`) + `border border-vien` + `text-chu`, `break-all`
  — token ngữ nghĩa, không thang `neutral-*`.

## Trang

- Vùng chính dưới thanh trên: `LOP_VUNG_TRANG` — lề 16px (24px từ `sm`), các
  khối cách nhau 24px, `min-w-0` (375px không cuộn ngang). Mọi trang, cả lúc
  đang tải.
- Hàng tiêu đề: `LOP_HANG_TIEU_DE` — `h1` → dấu làm mới → nút/tab của trang.
  Dòng phụ (trạng thái, vai trò, mã, cờ) nằm **dưới** `h1`, không trên.
- Trang chi tiết (agent, phiên, hồ sơ): `h1` + một hàng chip (`LOP_CHIP`:
  trạng thái, vai trò) + một hàng chữ phụ (mốc, ngưỡng), rồi các khối `h2`.
- **Đầu khối** (BAT-66): mỗi khối là `section` có `aria-label` + `data-khoi`, đầu
  khối là `<header>` `LOP_DAU_KHOI` (`min-h-7`, căn giữa dọc, hai đầu, `flex-wrap`
  từ BAT-67) chứa `h2` `LOP_TIEU_DE_MUC` bên trái và phần phụ (tab-pill, link, nút
  "Sửa hồ sơ") bên phải — ở 375px phần phụ xuống hàng dưới tiêu đề thay vì đẩy
  đầu khối tràn ngang. Component chung `vo/khoi.tsx` (module lá, chỉ nhập
  `lop-nut`) — Tổng quan, Đội agent, trang agent (BAT-66), Chi tiết phiên, Hồ sơ
  dự án (BAT-67), khối Luật chung của Bản đồ dự án, bốn mục Cài đặt (BAT-68) dùng
  nó. Các vế của Báo cáo là `h3` trong `article` của một báo cáo (đã có `h2` là
  tên báo cáo), nên không dùng `Khoi`. Phần phụ có nhiều món (mốc + nút của Luật
  chung) gói trong một `div` `flex flex-wrap min-w-0`; `h2` chỉ mang tên khối.
- Trang dạng cột chữ (Cài đặt): rộng tối đa `max-w-3xl`; các mục ngăn nhau bằng
  **viền mờ trên** (`border-t border-vien pt-5`), không thẻ nổi; câu giải thích
  chữ phụ 13px. Viền nằm ở vỏ `div` bọc `Khoi` (BAT-68, `MucCaiDat`).
- Ô nhập trong trang luôn `LOP_O_NHAP`; nút không phải hành động chính của mục
  là `NUT_PHU`. Một khối (`h2`/`h3`) chỉ có **một** `NUT_CHINH` (vd "Lưu",
  "Gửi", "Đăng nhập"); nút lặp theo từng dòng (vd "Tải" từng bản sao lưu) là
  `NUT_PHU`.
- Biểu mẫu mở ra trong trang (ghi Nhật ký, thêm lỗi, Luật chung, ô trọng tâm,
  đăng nhập): thẻ lớp nổi (`LOP_THE` + `p-3`/`p-4`).

## Thẻ số liệu

- Ô số nằm **trong** một `LOP_THE` (nền `nen-lop`, viền `vien`, bo 8px, đệm
  12px). Con số `LOP_SO_LIEU` (16px đậm 600, `tabular-nums`) đứng **trên**; nhãn
  `LOP_NHAN_SO_LIEU` (12px chữ phụ) dưới. Không màu nền theo con số; nghĩa (mức
  gấp) đi bằng chấm `ChamMucGap` cạnh nhãn. Chưa có thẻ số đứng riêng nên không
  có hằng cho nó (BAT-62 gỡ `LOP_THE_SO_LIEU`); trang nào cần thì thêm lại ở
  `vo/lop-nut.ts` và ghi ở đây.
- Ô Cần Chủ của Tổng quan là thẻ này: ba ô số theo mức (lưới 3 cột ở mọi khổ),
  link "Xem tất cả" màu liên kết, một `NUT_CHINH`.

## Bảng và danh sách

- **Danh sách dòng** (`LOP_DS_DONG` + `LOP_DONG`): khung bo 8px viền mờ, các dòng
  ngăn bằng viền mờ (`divide-vien`), không nền; dòng ~36px (`min-h-9`), chữ
  13px, hover `nen-lop`. **Không tô nền cả dòng** theo trạng thái — nghĩa đi bằng
  icon/chấm/chip. Phần phụ (mốc, người) **dồn phải** (`ml-auto`), xám. Dòng cần
  xuống hàng ở 375px thêm `flex-wrap`, không bỏ khung.
- Dòng nhiều phần cần **xếp dọc** ở 375px (dòng Dự án của Tổng quan):
  `LOP_DONG_XEP_DOC` — cột dưới `sm`, một dòng `LOP_DONG` từ `sm`. Không ghép
  `LOP_DONG` + lớp đè (`items-*` cùng thuộc tính, thứ tự CSS quyết lớp thắng).
- Dòng agent (Tổng quan, Đội agent): `flex-wrap`; chấm trạng thái → tên
  (`truncate`, `title` = tên đầy đủ) → vai trò `LOP_CHU_PHU` → trạng thái → model
  `LOP_CHU_MO_HON` → mốc dồn phải. Để các dòng thẳng cột ở khổ rộng, tên có bề
  rộng cố định — Tổng quan **chỉ từ `sm`** (`sm:w-32`, chữ trạng thái
  `sm:min-w-16`, không cắt), vì dòng còn cột việc đang cầm (`basis-40`, xuống hàng
  ở 375px); Đội agent `w-40` (dòng ngắn, đã `flex-wrap`). Bề rộng cố định không
  tiền tố `sm:` trên một dòng không `flex-wrap` là lỗi tràn 375px (BAT-66).
- Dòng Vừa xong: `IconTrangThai` Xong (`aria-hidden`) trước mã ticket.
- Dòng nhiều tầng (Nhật ký, Lỗi đã gặp, Quyết định mới của Báo cáo): cùng khung,
  mỗi dòng `px-3 py-2.5`, hàng trên chữ phụ (mốc · ai · dự án), dưới là nội dung
  chữ chính. Hằng `LOP_DONG_NHIEU_TANG` (BAT-67, có `min-w-0`); Nhật ký và công
  tắc Telegram của Cài đặt dùng nó từ BAT-68.
- **Chữ tự do dài trong dòng** (tiêu đề ticket, nội dung hoạt động, lỗi, chi tiết
  rủi ro — BAT-67): `min-w-0 break-words` (tên công cụ, id liền: `break-all`), để
  một chuỗi liền (đường dẫn, lệnh) xuống hàng ở 375px. Chữ một dòng có cột cố
  định (người sửa ở Lịch sử) thì `truncate` + `title` = chữ đầy đủ. Một dòng có
  cột bề rộng cố định (số thứ tự bước `w-5`) thì thêm `flex-wrap`.
- Báo cáo (BAT-67): mỗi vế là `LOP_DS_DONG`, dòng `flex-wrap` + `LOP_DONG`: mã
  `ma-ticket` → tiêu đề chữ chính → phần phụ chữ phụ; vế rỗng vẫn là câu
  `LOP_CAU_CHO` của SPEC; danh sách không mục nào thì không dựng khung rỗng.
- **Bảng** `<table>` (Bản đồ, lượt giao, quyền): khung `LOP_THE` +
  `overflow-x-auto` (d.411); `LOP_BANG`; đầu cột `LOP_DAU_COT` (12px chữ phụ
  đậm 500, viền dưới mờ); ô `LOP_O_BANG` (đệm `px-3 py-2`, viền dưới mờ);
  `tbody` `LOP_THAN_BANG` bỏ viền dòng cuối; dòng hover `nen-noi`
  (`LOP_DONG_BANG` — bảng nằm trên lớp nổi nên hover lên một nấc).
- Mã ticket trong dòng/bảng: tiện ích `ma-ticket`, hover chữ chính.
- Thẻ đứng riêng (Việc đang chạy): `LOP_THE` + `p-2.5`.

## Trạng thái rỗng / lỗi / đang tải

- **Một kiểu cho mọi trang**: `LOP_CAU_CHO` (13px `chu-mo`) cho đang tải và rỗng,
  `LOP_CAU_LOI` (13px `loi`) cho lỗi. Câu đứng **ở đầu vùng nội dung** (dưới
  tiêu đề trang/khối), không căn giữa màn hình, không icon, không khung.
- Role giữ nguyên chỗ gọi đặt: đang tải `role="status"`, lỗi `role="alert"`,
  rỗng không role. Chữ là câu của SPEC/máy chủ, không đổi.
- Lỗi in **nguyên văn** câu máy chủ (mục 13 d.379) — chỉ đổi màu, không đổi chữ.

## Bàn phím trước

Giữ nguyên mọi phím tắt (SPEC d.413, d.414, d.416). Gợi ý phím (`<kbd>` nhỏ xám,
`LOP_KBD`) hiện trong menu/tooltip nơi đã có phím: command menu (`⌘/Ctrl K`) có
`G T`/`G O`/`G N` cạnh lệnh tương ứng và chân hộp `↑ ↓ · Enter · Esc`; bảng phím
`?`; title nút Tìm / Tạo việc.

**Focus nhìn thấy được** (BAT-67): khung hộp nhận focus (`tabIndex=-1` của dialog,
menu trượt, ngăn phải) **không được tắt outline** (`outline-none`,
`focus:outline-none`) — vòng `:focus-visible` chung của `kieu.css` (2px màu nhấn)
phải hiện khi mở bằng bàn phím. Phần tử **sát mép** khung nhìn (`inset-0`,
`inset-y-0 right-0`) dùng offset âm `focus-visible:-outline-offset-2` để vòng vẽ vào
trong. Khung phủ cả màn hình mà con che kín (menu trượt `App.tsx`: lớp mờ + tấm
sidebar) thì vòng của chính khung không thấy được dù offset nào ⇒ khung là
`group`, vòng vẽ lên tấm nhìn thấy được bằng `group-focus-visible:outline-2
group-focus-visible:-outline-offset-2 group-focus-visible:outline-nhan-manh` (cùng
nét, cùng màu vòng chung). **Ngoại lệ duy nhất**: ô tìm của command menu giữ
`focus-visible:outline-none` — ô nhập duy nhất của hộp, luôn nhận focus khi mở, con
trỏ nháy luôn hiện; ô sát mép trên/trái/phải của khung `overflow-hidden` bo 8px nên
vòng offset dương bị cắt ba cạnh, offset âm bị hai góc bo trên cắt lẹm. jsdom
không vẽ nên ca test chỉ ghim lớp; thấy tận mắt là việc chủ thử tay.

## Mức hoàn thiện từng trang

Hai mức:
- **Làm kỹ** — đã đối chiếu **từng mục** của file này: icon/chấm trạng thái, dòng
  và ô số liệu, rỗng/lỗi/tải, hover/focus, hai chế độ.
- **Chỉ đổi token/hằng chung** — BAT-61 đã quy về token và hằng chung (tiêu đề,
  vùng trang, câu chờ/lỗi, nút, ô nhập, bảng) nhưng **chưa rà từng mục**.

| Trang / vùng | Mức | Ghi chú |
|---|---|---|
| Vỏ: sidebar, thanh trên, command menu, toast | Làm kỹ | BAT-60/61. BAT-67: chấm agent sidebar dùng `ChamTrangThaiAgent`; khung command menu, bảng phím `?`, menu trượt không tắt outline. BAT-69: tiêu đề bảng phím `?` và hộp Giao việc `LOP_TIEU_DE_MUC`; chấm agent sidebar bỏ `title` lặp (một nguồn nhãn); lớp phủ mọi hộp `bg-lop-phu`; Markdown rà xong (mục "Chữ") |
| Danh sách ticket | Làm kỹ | BAT-60. BAT-67: ngăn phải và hộp xác nhận áp hàng loạt không tắt outline; tiêu đề hộp xác nhận `LOP_TIEU_DE_MUC` |
| Bảng | Làm kỹ | BAT-60, BAT-64 (6 cột) |
| Chi tiết ticket | Làm kỹ | BAT-60. BAT-67: chip cờ `LOP_CHIP_CANH` (bỏ `bg-canh-nen`) |
| Cần Chủ | Làm kỹ | BAT-60 |
| Tổng quan | Làm kỹ | BAT-66 |
| Đội agent + trang một agent | Làm kỹ | BAT-66 |
| Chi tiết phiên | Làm kỹ | BAT-67: `vo/khoi.tsx`; "Đứng"/"Chờ người giao quá hạn" `LOP_CHIP_CANH`; icon trạng thái trước mã ticket; chip trạng thái phiên `LOP_CHIP` không hình (chưa có quy ước hình cho trạng thái phiên). BAT-69: trạng thái phiên `error` ("Lỗi") `LOP_CHIP_LOI` |
| Báo cáo | Làm kỹ | BAT-67: mọi vế `LOP_DS_DONG` + `LOP_DONG` `flex-wrap`; Quyết định mới dòng nhiều tầng; nhãn rủi ro `LOP_CHIP_CANH`; không icon trạng thái (thân không có mã trạng thái) |
| Hồ sơ dự án | Làm kỹ | BAT-67: `vo/khoi.tsx` (đầu khối `flex-wrap`); chip cờ `LOP_CHIP_CANH`; Lỗi đã gặp `LOP_DONG_NHIEU_TANG`. BAT-68: `MucVan` (chín mục) `min-w-0 break-words` |
| Nhật ký | Làm kỹ | BAT-68: dòng `LOP_DONG_NHIEU_TANG`; "đã có quyết định mới" `LOP_CHIP_CANH` (bỏ chữ `canh` trần); quyết định / vì sao / ai / dự án / căn cứ `min-w-0` + ngắt; ô lọc `LOP_O_NHAP` + `max-w-full`, hàng lọc `flex-wrap` |
| Bản đồ dự án | Làm kỹ | BAT-68: Luật chung dùng `vo/khoi.tsx` (`h2` chỉ còn tên khối; mốc + nút ở phần phụ), nội dung và biểu mẫu sửa trong `LOP_THE`; `MucVan` co được. Chấm sức sống giữ đúng quy ước (`bg-tot`/`bg-canh`/`bg-neutral-300`, `role="img"` có nhãn) — THIET-KE chưa có quy ước **hình** riêng cho ba mức, nên không thêm. Câu "Còn N dự án…" giữ chữ `canh` (câu cảnh báo, không phải nhãn; chưa có quy ước câu cảnh báo) |
| Token agent (hộp) | Làm kỹ | BAT-68: ô token `bg-nen-noi` + viền mờ + `text-chu`; "Token đã thu hồi" `LOP_CHIP_LOI`; lớp phủ `bg-lop-phu` (BAT-69, token của quy ước chung mọi hộp — mục "Hộp nổi"). Khung hộp không tắt outline (BAT-67) |
| Cài đặt | Làm kỹ | BAT-68: bốn mục là `vo/khoi.tsx` trong vỏ viền mờ trên (`MucCaiDat`); sao lưu và phiên `flex-wrap LOP_DONG`; công tắc Telegram `LOP_DONG_NHIEU_TANG`; khung xác nhận đăng xuất `LOP_THE`; tên thiết bị / nhãn / lý do khoá ngắt được. "Đang tải…" giữ không `role` (đổi role là đổi hành vi) |
| Đăng nhập | Làm kỹ | BAT-68 rà, **không đổi mã**: `h1` `LOP_TIEU_DE_TRANG`, thẻ `LOP_THE`, hai ô `LOP_O_NHAP`, một `NUT_CHINH`, lỗi `LOP_CAU_LOI` `role="alert"`, cột `w-full max-w-sm` — đã đúng; ca BAT-68 ghim |
| Giữ chỗ | Làm kỹ | BAT-68 rà, không đổi: `LOP_VUNG_TRANG`, `h1` `LOP_TIEU_DE_TRANG`, câu `LOP_CAU_CHO` — không lệch mục nào |
| "Không có trang này" | Làm kỹ | BAT-68 rà, không đổi: `LOP_VUNG_TRANG` + một `h1` `LOP_TIEU_DE_TRANG` — không lệch mục nào |

**Mọi trang / vùng đã ở mức "Làm kỹ"** (BAT-68); BAT-69 khép phần "Còn:" của
dòng Vỏ, rà xong bên trong `Markdown` (mục "Chữ"), thêm token lớp phủ và chip
phiên "Lỗi". Việc còn mở chỉ là hai quyết định thiết kế mới đã ghi ở trên: **hình
cho trạng thái phiên** và **quy ước câu cảnh báo**. (Khối lệnh riêng của Cần Chủ
— `pre` `bg-neutral-100 text-neutral-900` ở `trang/can-chu.tsx`, ngoài Markdown —
chưa đổi sang token; cặp ấy đã được lưới đo ở hai chế độ.)

## Ghi chú tương phản (lý do các giá trị lệch bản mô tả)

- `chu-mo-hon` tối = `#7f838a`, **không** `#62666d` của bản mô tả: `#62666d` chỉ
  đạt ~3.3:1 trên nền trang, mà số đếm và ngày vẫn là chữ chủ cần đọc. Nâng tới
  ≥ 4.5:1 trên `nen`/`nen-lop` (≥ 3:1 trên lớp hover) theo tinh thần "chữ đọc
  được"; thứ bậc với `chu-mo` vẫn còn (tối hơn một nấc).
- `nhan-manh-chu` tối sáng hơn `nhan-manh`: `#5e6ad2` trên nền tối chỉ ~4:1 —
  đủ cho vòng focus (3:1), không đủ cho chữ liên kết (4.5:1).
- Huy hiệu Cần Chủ giữ đỏ đậm chữ trắng: mang nghĩa, đọc tốt cả hai nền.
