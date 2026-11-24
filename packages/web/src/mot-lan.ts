/**
 * BAT-32 — chặn gửi trùng ĐỒNG BỘ.
 *
 * `mutation.isPending` đọc từ lần vẽ trước: react-query báo đổi qua
 * `notifyManager` (setTimeout 0) nên hai sự kiện bấm trong cùng một nhịp vẫn lọt.
 * Hook này giữ một `useRef` — đặt `true` NGAY khi bắt đầu, thả khi `onSettled`
 * của lệnh gọi (thành công lẫn lỗi). Giao diện vẫn dùng `disabled={…isPending}`
 * để người dùng thấy nút khoá; ref là chốt thật.
 *
 * Dùng: `const mot = useMotLan();`
 *       `mot((tha) => m.mutate(bien, { onSettled: tha }));`
 * Lần gọi khi chốt đang đóng bị bỏ qua. `bat_dau` ném lỗi ⇒ chốt được thả.
 */

import { useCallback, useRef } from 'react';

export function useMotLan(): (bat_dau: (tha: () => void) => void) => void {
  const dang_chay_ref = useRef(false);
  return useCallback((bat_dau) => {
    if (dang_chay_ref.current) return;
    dang_chay_ref.current = true;
    try {
      bat_dau(() => {
        dang_chay_ref.current = false;
      });
    } catch (e) {
      dang_chay_ref.current = false;
      throw e;
    }
  }, []);
}
