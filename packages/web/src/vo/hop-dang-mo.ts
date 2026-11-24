/**
 * **"Command menu đang mở không?"** — một module LÁ (không nhập gì của dự án).
 *
 * Vì sao tách ra: `vo/phim-vo.tsx` cần hỏi câu này (listener vỏ nhường phím khi
 * hộp đang mở), còn `vo/command-menu.tsx` cần `DICH_CHUOI_G` của `phim-vo.tsx`
 * (gợi ý phím `G T`/`G O`/`G N`). Trước BAT-61 hai file nhập lẫn nhau — một vòng
 * nhập mà thứ tự nạp module quyết định biến nào đã khởi tạo. Nay `phim-vo.tsx`
 * hỏi qua file này, `command-menu.tsx` lấy bộ chọn từ đây (và xuất lại cho mọi
 * chỗ đã nhập từ nó), nên không còn vòng.
 */

/** Bộ chọn của hộp trên DOM — listener phím của trang thoát sớm khi nó mở. */
export const CHON_COMMAND_MENU = '[data-o="command-menu"]';

export function commandMenuDangMo(): boolean {
  return document.querySelector(CHON_COMMAND_MENU) !== null;
}
