/**
 * **Khổ màn hình đang dùng** — SPEC mục 14 d.411 ("điện thoại 375px dùng tốt").
 *
 * ## Vì sao cần biết khổ ở LÚC CHẠY, không chỉ bằng class `sm:`
 *
 * Phần lớn việc "đổi theo khổ" làm bằng class Tailwind là đúng: nó không cần JS
 * và không nháy. Nhưng có một loại không làm được bằng CSS — **ngữ nghĩa**. Một
 * tấm panel ở `sm` trở lên là một `complementary` cạnh bảng (chủ vẫn thấy bảng
 * phía sau, vẫn Tab tới bảng được); cùng tấm ấy ở 375px **phủ kín** viewport,
 * nên nó là một dialog: phải `aria-modal`, phải khoá cuộn trang dưới, phải chặn
 * Tab chạy xuyên ra sau tấm phủ, và phải trả focus khi đóng (nếp đã chốt cho
 * menu trượt ở `App.tsx`). `role` và `aria-modal` không đổi được bằng CSS.
 *
 * ## Không có `matchMedia` ⇒ coi là khổ RỘNG
 *
 * jsdom không có `matchMedia` (và một WebView rút gọn cũng có thể thiếu). Hướng
 * sai an toàn ở đây là **rộng**: ở khổ rộng panel là một vùng phụ không phủ gì,
 * nên hiểu sai cũng không khoá cuộn và không ẩn nền của ai. Hiểu sai theo chiều
 * kia thì một màn hình desktop bị khoá cuộn và nền bị `inert` — tức bảng không
 * bấm được. Cùng kỷ luật `mayXinToi` ở `vo/theme.ts`.
 */

import { useEffect, useState } from 'react';

/**
 * Mốc hẹp = **dưới `sm` của Tailwind** (`640px`). Gõ ở đây **một lần** và class
 * `sm:` của panel đọc cùng một mốc — hai con số khác nhau sẽ cho một khoảng khổ
 * mà panel vừa phủ kín vừa không phải dialog.
 */
export const TRUY_VAN_HEP = '(max-width: 639.98px)';

export interface CoMatchMedia {
  matchMedia?: typeof window.matchMedia;
}

/** Khổ hẹp không? Hàm thuần trên một `window` truyền vào, nên test được. */
export function manHinhHep(w: CoMatchMedia = globalThis): boolean {
  try {
    return w.matchMedia?.(TRUY_VAN_HEP).matches === true;
  } catch {
    // Một `matchMedia` ném (môi trường lạ) không được làm trắng cả trang.
    return false;
  }
}

/**
 * Khổ hẹp, **và theo dõi tiếp** khi chủ đổi khổ cửa sổ hoặc quay ngang điện
 * thoại: một panel đang là dialog mà cửa sổ rộng ra thì nó phải thành vùng phụ,
 * không giữ `aria-modal` trên một tấm không phủ gì.
 *
 * `addEventListener('change')` có thể không có (Safari cũ dùng `addListener`) —
 * thiếu thì đọc một lần là xong, không ném.
 */
export function useManHinhHep(): boolean {
  const [hep, datHep] = useState(() => manHinhHep());

  useEffect(() => {
    const mql = globalThis.matchMedia?.(TRUY_VAN_HEP);
    if (mql === undefined || typeof mql.addEventListener !== 'function') return undefined;
    const nghe = (): void => {
      datHep(mql.matches);
    };
    nghe();
    mql.addEventListener('change', nghe);
    return () => {
      mql.removeEventListener('change', nghe);
    };
  }, []);

  return hep;
}
