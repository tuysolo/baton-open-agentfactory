/**
 * **Lớp của nút: nền và chữ đi THÀNH CẶP, một chỗ duy nhất.**
 *
 * Vì sao file này tồn tại: lượt BAT-6 đợt 1 đổi thang `neutral-*` thành một
 * thang **tương phản đảo chiều** (xem khối đầu `kieu.css`), và nó làm lộ một họ
 * lỗi mà bản trước đã mắc **bảy chỗ** — nền mờ và chữ **cùng nhạt**:
 *
 *   `bg-neutral-900 text-nen disabled:bg-neutral-300`
 *
 * Lúc nút mờ, nền thành `neutral-300` nhưng chữ **vẫn là `text-nen`** (nền
 * trang): sáng ≈ 1.5:1, tối ≈ 1.7:1 — nhãn "Gửi lỗi" / "Gửi dòng" / "Dừng"
 * không đọc được. Cùng kiểu, nhẹ hơn: `text-nen` trên `bg-neutral-400` (sáng
 * ≈ 2.3:1). Reviewer bắt, và phép rà cũ (liệt kê class rồi soi `text-white`)
 * **không thể** bắt được: cả hai class đều "đúng" khi đọc rời nhau.
 *
 * Nên nền và chữ không được khai rời nữa. Ba hằng dưới đây là **cặp**, và
 * `test/vo-linear.test.tsx` tính tỉ lệ tương phản WCAG thật cho từng cặp ở **cả
 * hai** chế độ, từ chính bảng màu trong `kieu.css`.
 *
 * Mức chọn: **`bg-neutral-200` + `text-neutral-500`** cho trạng thái mờ (sáng
 * ≈ 3.9:1, tối ≈ 5.0:1) thay vì một token mới "chữ mờ trên nền mờ". Lý do: nó
 * dùng đúng thang đã có (không thêm hai biến nữa phải giữ đồng bộ), và nó giữ
 * được **ý** của trạng thái mờ — nhạt hơn nút thường rõ rệt — mà vẫn đọc được.
 * Một token riêng sẽ phải đặt ở đâu đó giữa, và lúc đó nó chỉ dùng cho đúng một
 * chỗ này.
 */

/**
 * Nút hành động chính: **màu nhấn** (hệ thiết kế 29/10, `THIET-KE.md` — màu nhấn
 * dành cho nút chính, mục đang chọn, focus ring, liên kết). Chữ là token
 * `tren-nhan-manh` (không `text-white`: lưới "không mã màu cứng" của
 * `test/vo-linear.test.tsx`). Hover đậm hơn, và chỉ khi nút **bật** (`enabled:`)
 * — nút mờ không được sáng lên dưới con trỏ.
 */
export const NUT_CHINH = 'bg-nhan-manh text-tren-nhan-manh enabled:hover:bg-nhan-manh-dam';

/**
 * Nút phụ: viền mờ, nền trong suốt, hover lên lớp nổi — chỉ khi nút **bật**
 * (`enabled:`, cùng nếp `NUT_CHINH`): nút đang `disabled` không sáng dưới con trỏ.
 * Chỉ dùng trên `<button>` (`:enabled` không khớp `<a>`).
 */
export const NUT_PHU = 'border border-vien text-chu enabled:hover:bg-nen-noi';

/**
 * Nút **chỉ có icon**, nhỏ (24px), nằm trong một hàng tiêu đề (vd nút `+` ở đầu
 * cột Cần làm của bảng): không viền, chữ phụ, hover lớp nổi + chữ chính. Phải
 * mang `aria-label` và `title` (icon `aria-hidden`).
 */
export const LOP_NUT_ICON =
  'flex size-6 shrink-0 items-center justify-center rounded text-chu-mo hover:bg-nen-noi hover:text-chu';

/** Nút **mờ** (chưa đủ điều kiện bấm) khi trạng thái mờ do mã tự rẽ nhánh. */
export const NUT_MO = 'bg-neutral-200 text-neutral-500';

/**
 * Nút mờ khi trạng thái mờ do **thuộc tính `disabled`** của chính thẻ `<button>`.
 *
 * Phải khai **cả** `disabled:text-…`, không chỉ `disabled:bg-…`: biến thể chỉ
 * đổi nền thì chữ rơi về màu của trạng thái thường — đúng cái lỗi ở đầu file.
 */
export const NUT_MO_KHI_DISABLED = 'disabled:bg-neutral-200 disabled:text-neutral-500';

/* ================================================================== *
 * Ô nhập, chip, phím, tab-pill, mục menu — dùng chung (THIET-KE.md)
 * ================================================================== */

/** Ô nhập / ô chọn: bo 6px, viền mờ, nền trang; focus = vòng màu nhấn (kieu.css). */
export const LOP_O_NHAP =
  'rounded border border-vien bg-nen px-2 py-1 text-sm text-chu placeholder:text-chu-mo-hon';

/** Chip (nhãn nhỏ, bộ lọc đã áp): bo 6px, viền mờ, chữ phụ. */
export const LOP_CHIP =
  'inline-flex items-center gap-1 rounded border border-vien px-1.5 py-0.5 text-xs text-chu-mo';

/**
 * Chip **cảnh báo** (lý do Cần chú ý, phiên "Đứng"): cùng dáng `LOP_CHIP` — viền
 * mờ, bo 6px, 12px — chỉ khác **màu chữ** (`canh`). **Không tô nền** (THIET-KE
 * "màu chỉ để mang nghĩa"; BAT-66 bỏ `bg-canh-nen`). Không có cặp nền–chữ mới:
 * chữ `canh` nằm trên nền thừa hưởng, và `test/vo-linear.test.tsx` đo `canh` trên
 * cả ba nền (`nen`, `nen-lop`, `nen-noi`) ở cả hai chế độ, mức 4.5:1.
 */
export const LOP_CHIP_CANH =
  'inline-flex items-center gap-1 rounded border border-vien px-1.5 py-0.5 text-xs text-canh';

/** Chip **lỗi** (agent "Đã tắt"): cùng dáng chip, chữ `loi`, không tô nền. */
export const LOP_CHIP_LOI =
  'inline-flex items-center gap-1 rounded border border-vien px-1.5 py-0.5 text-xs text-loi';

/**
 * Gợi ý phím (`<kbd>`): nhỏ, xám, nằm trong menu/tooltip nơi đã có phím. Không
 * nền — chỉ viền: một phím gợi ý không được nổi hơn chữ nó đi kèm.
 */
export const LOP_KBD =
  'inline-flex h-4 min-w-4 items-center justify-center rounded-[4px] border border-vien px-1 font-sans text-[11px] leading-none text-chu-mo';

/**
 * Tab-pill (bộ lọc dạng tab ở hàng tiêu đề của trang hoặc đầu khối): bo 6px.
 * Đang chọn ⇒ nền lớp nổi + chữ chính; chưa chọn ⇒ chữ phụ, hover chữ chính.
 */
export const LOP_TAB_PILL = 'rounded px-2 py-0.5 text-sm transition-colors';
export const LOP_TAB_PILL_DANG_CHON = 'bg-nen-noi text-chu';
export const LOP_TAB_PILL_THUONG = 'text-chu-mo hover:text-chu';

/**
 * Mục trong menu nổi (menu workspace, command menu): cao ~30px nhờ `py-1.5`,
 * hover lớp nổi. Không `min-h-*`: một tiện ích `min-h` đè luật vùng chạm 2.75rem
 * dưới `md` của `kieu.css` (d.411).
 */
export const LOP_MUC_MENU =
  'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-chu hover:bg-nen-noi';

/** Tấm menu / modal nổi: bo 8px, lớp nổi, viền mờ, bóng nhẹ. */
export const LOP_TAM_NOI = 'rounded-lg border border-vien bg-nen-lop text-chu shadow-lg';

/* ================================================================== *
 * Trang: vùng chính, tiêu đề, thẻ, danh sách dòng, câu trạng thái
 * (THIET-KE.md — "Trang", "Bảng và danh sách", "Trạng thái rỗng / lỗi / đang tải")
 * ================================================================== */

/**
 * Vùng chính của một trang dưới thanh trên: lề 16px (24px từ `sm`), các khối
 * cách nhau 24px — bậc 4px. `min-w-0`: con flex trong vỏ không được đẩy trang
 * cuộn ngang ở 375px (d.411).
 */
export const LOP_VUNG_TRANG = 'flex min-w-0 flex-col gap-6 p-4 sm:p-6';

/** Hàng tiêu đề trang: tiêu đề → dấu làm mới / chữ phụ → nút (nếu có). */
export const LOP_HANG_TIEU_DE = 'flex flex-wrap items-center gap-3';

/**
 * Tiêu đề trang (`h1`): 16px, đậm 600, chữ chính — thang chữ THIET-KE (15–16px,
 * 500–600). **Một** hằng cho mọi trang; không `text-xl`/`text-lg`.
 */
export const LOP_TIEU_DE_TRANG = 'text-base font-semibold text-chu';

/** Tiêu đề mục/khối trong trang (`h2`): 13px, đậm 600 — chỉ hơn chữ thường ở độ đậm. */
export const LOP_TIEU_DE_MUC = 'text-sm font-semibold text-chu';

/**
 * Đầu khối (`<header>` của một `section` có `h2`): cao tối thiểu 28px, tiêu đề
 * `LOP_TIEU_DE_MUC` bên trái, phần phụ (tab-pill, link, nút) dồn phải. Một dáng
 * cho mọi khối — `vo/khoi.tsx`.
 *
 * `flex-wrap` (BAT-67): phần phụ là một nút ("Sửa hồ sơ", "Thêm một lỗi" của Hồ
 * sơ dự án) hay hàng tab-pill thì ở 375px nó **xuống hàng** dưới tiêu đề thay vì
 * đẩy đầu khối tràn ngang. Khi đủ chỗ thì vẫn một hàng như cũ (`justify-between`).
 * Khoảng dọc khi xuống hàng nhỏ (`gap-y-1`), khoảng ngang giữ 12px.
 */
export const LOP_DAU_KHOI = 'flex min-h-7 flex-wrap items-center justify-between gap-x-3 gap-y-1';

/** Tiêu đề nhỏ trong một khối (`h3`): 12px, đậm 500, chữ phụ. */
export const LOP_TIEU_DE_NHO = 'text-xs font-medium text-chu-mo';

/** Thẻ / khung lớp nổi: bo 8px, viền mờ, nền lớp nổi. Không bóng. */
export const LOP_THE = 'rounded-lg border border-vien bg-nen-lop';

/*
 * Ô số liệu (THIET-KE "Thẻ số liệu"): ô số nằm **trong** một `LOP_THE` — con số
 * `LOP_SO_LIEU` trên, nhãn `LOP_NHAN_SO_LIEU` dưới. Không có hằng thẻ số liệu
 * đứng riêng: chưa trang nào có thẻ số đứng một mình (BAT-62 gỡ `LOP_THE_SO_LIEU`
 * không ai dùng).
 */
/** Con số của ô số liệu: 16px đậm, chữ số cùng bề rộng. */
export const LOP_SO_LIEU = 'text-base font-semibold text-chu tabular-nums';
/** Nhãn của ô số liệu: 12px chữ phụ. */
export const LOP_NHAN_SO_LIEU = 'text-xs text-chu-mo';

/**
 * Khung của một danh sách dòng: bo 8px, viền mờ, dòng ngăn bằng viền mờ
 * (`divide-vien`). Không nền: dòng nằm thẳng trên nền trang.
 */
export const LOP_DS_DONG = 'flex flex-col divide-y divide-vien rounded-lg border border-vien';

/**
 * Một dòng của danh sách: ~36px (`min-h-9`), chữ 13px, hover lớp nổi — **không**
 * tô nền cả dòng theo trạng thái.
 */
export const LOP_DONG = 'flex min-h-9 min-w-0 items-center gap-2 px-3 py-1.5 text-sm hover:bg-nen-lop';

/**
 * Biến thể của `LOP_DONG` cho dòng **nhiều phần** (dòng Dự án của Tổng quan):
 * dưới `sm` các phần **xếp dọc** trong cùng dòng (375px không tràn), từ `sm` là
 * một dòng `LOP_DONG` (~36px, căn giữa dọc). Không ghép `LOP_DONG` + lớp đè:
 * `items-center`/`items-stretch` cùng thuộc tính, và lớp nào thắng do thứ tự CSS
 * của Tailwind quyết, không do thứ tự trong chuỗi.
 */
export const LOP_DONG_XEP_DOC =
  'flex min-w-0 flex-col gap-1 px-3 py-2 text-sm hover:bg-nen-lop sm:min-h-9 sm:flex-row sm:items-center sm:gap-3 sm:py-1.5';

/**
 * Dòng **nhiều tầng** của `LOP_DS_DONG` (THIET-KE "Bảng và danh sách"): hàng trên
 * chữ phụ (mốc · ai), dưới là nội dung chữ chính; đệm `px-3 py-2.5`, hover lớp nổi.
 * `min-w-0` để nội dung `break-words` co được ở 375px. Hồ sơ dự án (Lỗi đã gặp)
 * và Báo cáo (Quyết định mới) dùng nó từ BAT-67; Nhật ký từ BAT-68.
 */
export const LOP_DONG_NHIEU_TANG = 'flex min-w-0 flex-col gap-1 px-3 py-2.5 text-sm hover:bg-nen-lop';

/** Chữ phụ trong dòng/thẻ (người, nhãn phụ): 12px, `chu-mo`. */
export const LOP_CHU_PHU = 'text-xs text-chu-mo';

/** Chữ mờ hơn (ngày, số đếm): 12px, `chu-mo-hon`, chữ số cùng bề rộng. */
export const LOP_CHU_MO_HON = 'text-xs text-chu-mo-hon tabular-nums';

/** Liên kết chữ: màu nhấn (một trong bốn chỗ được dùng màu nhấn), gạch chân khi hover. */
export const LOP_LIEN_KET = 'text-nhan-manh-chu hover:underline';

/** Bảng `<table>`: chữ 13px, đầu cột chữ phụ, dòng ngăn viền mờ (xem `LOP_O_BANG`). */
export const LOP_BANG = 'w-full border-collapse text-left text-sm';
/** Ô đầu cột của bảng: 12px chữ phụ, đậm 500, viền dưới mờ. */
export const LOP_DAU_COT = 'border-b border-vien px-3 py-2 text-xs font-medium text-chu-mo';
/** Ô thân của bảng: đệm gọn, viền dưới mờ. */
export const LOP_O_BANG = 'border-b border-vien px-3 py-2 align-top';
/** `<tbody>` trong khung bo góc: dòng cuối bỏ viền dưới (khung đã có viền). */
export const LOP_THAN_BANG = '[&>tr:last-child>*]:border-b-0';
/** Dòng của bảng nằm trong khung lớp nổi: hover lên lớp hover (`nen-noi`). */
export const LOP_DONG_BANG = 'hover:bg-nen-noi';

/**
 * **Câu trạng thái dùng chung** — đang tải / rỗng (`LOP_CAU_CHO`) và lỗi
 * (`LOP_CAU_LOI`): 13px, ở đầu vùng nội dung. Một kiểu cho mọi trang; role/aria
 * (`status`, `alert`) do chỗ gọi đặt, không đổi.
 */
export const LOP_CAU_CHO = 'text-sm text-chu-mo';
export const LOP_CAU_LOI = 'text-sm text-loi';
