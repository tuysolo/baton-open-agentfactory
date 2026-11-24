/**
 * BAT-34 việc 2 — **đóng hộp lúc lượt gửi đang chờ mạng = HUỶ GỬI** (hộp Tạo việc,
 * hộp Giao việc).
 *
 * ## Vì sao huỷ, không "gửi khi có mạng"
 *
 * Mất mạng, bấm Gửi ⇒ mutation `isPaused` (networkMode `online` của TanStack). Để nó
 * tự gửi sau khi hộp đã đóng là một lần ghi ngầm về sau không ai nhìn, và chủ —
 * tưởng chưa gửi — dễ tạo lại (gửi trùng). Huỷ thì kết quả rõ: **không có gì được
 * tạo/giao**, và một toast nói đúng điều đó.
 *
 * ## Vì sao chắc chắn 0 request (đã đọc `@tanstack/query-core`)
 *
 *   * `retryer.start()`: `canStart()` sai (mất mạng) ⇒ `pause().then(run)` — **`fn`
 *     (tức `mutationFn`) CHƯA được gọi** cho tới khi `continue()`. Nên lúc hộp thấy
 *     `isPaused` trước lần thử đầu, chưa có byte nào bay.
 *   * Có mạng lại: `resumePausedMutations` ⇒ `continue()` ⇒ `run()` ⇒ `mutationFn`.
 *     `mutationFn` gọi `batDauLuot(co)` **đầu tiên**, trước mọi `fetch`: cờ `huy` đã
 *     bật thì ném `LoiHuyGui` — không request nào.
 *   * Mutation `retry` mặc định **0** (`mutation.ts`: `this.options.retry ?? 0`), và
 *     `src/query.ts` chỉ đặt mặc định cho **query**. Nên một mutation **không thể**
 *     tạm dừng SAU một lần thử đã bay (nhánh tạm dừng giữa hai lần thử của retryer chỉ
 *     chạy khi có retry). Dù vậy hộp vẫn phân biệt ca đó (`da_chay`): nếu một lượt sau
 *     này bật retry, lượt đã bay một lần thì hộp KHÔNG đóng được (giữ như đang gửi,
 *     chờ kết quả thật), và dòng trạng thái nói "có thể đã gửi".
 *
 * ## Quyết định đóng/huỷ theo sự thật ĐỒNG BỘ, không theo giá trị render
 *
 * (BAT-34 sửa theo reviewer.) `isPaused` của lần render trước có thể **cũ**: có
 * mạng lại ⇒ `continue()` ⇒ `run()` gọi `mutationFn` (qua `batDauLuot`, bật
 * `da_chay`) **trước** khi React render lại `isPaused=false`. Esc đúng khe đó mà dựa
 * vào `isPaused` cũ thì hộp đóng như "huỷ" trong khi request **đang bay** — và kết
 * quả thật (ticket đã tạo / lượt đã giao) về lúc hộp đã đóng, kèm một toast sai.
 * Nên `huyNeuDangCho()` chỉ đọc cờ của lượt (đồng bộ, do chính `mutationFn` bật):
 * chưa qua cổng ⇒ huỷ được (chắc chắn 0 request); đã qua cổng ⇒ trả `false`, hộp
 * giữ như đang gửi (Esc/Huỷ không làm gì) cho tới khi kết quả thật về.
 *
 * ## Cờ theo LƯỢT, trong biến của `mutate`
 *
 * Mỗi lần bấm Gửi một `CoLuotGui` mới, đi trong biến (`mutationFn` chỉ đọc biến —
 * nếp BAT-29). Huỷ là bật cờ của **đúng** lượt đang chờ; lượt sau (hộp mới) có cờ
 * riêng nên không bị huỷ lây. `LoiHuyGui` không phải lỗi máy chủ: `onError` của hộp
 * bỏ qua nó (không toast lỗi, không làm mới cache).
 */

import { useCallback, useEffect, useRef } from 'react';

export interface CoLuotGui {
  /** Hộp đã đóng lúc lượt này còn chờ mạng ⇒ `mutationFn` phải dừng. */
  huy: boolean;
  /** `mutationFn` đã qua cổng và bắt đầu gọi máy chủ. */
  da_chay: boolean;
}

export const taoCoLuot = (): CoLuotGui => ({ huy: false, da_chay: false });

/** Lỗi huỷ riêng — KHÔNG là lỗi máy chủ. */
export class LoiHuyGui extends Error {
  constructor() {
    super('Lượt gửi đã huỷ vì hộp đóng lúc mất mạng.');
    this.name = 'LoiHuyGui';
  }
}

/** Gọi **đầu tiên** trong `mutationFn`, trước mọi `fetch`. */
export function batDauLuot(co: CoLuotGui): void {
  if (co.huy) throw new LoiHuyGui();
  co.da_chay = true;
}

export const CAU_CHO_MANG = 'Mất mạng — lượt gửi đang chờ có mạng. Đóng hộp để huỷ gửi.';
export const CAU_CHO_MANG_DA_THU =
  'Mất mạng sau một lần gửi — có thể đã gửi. Hộp chờ có mạng lại để biết kết quả.';
export const CAU_DA_HUY_TAO = 'Đã huỷ gửi vì mất mạng — chưa tạo gì.';
export const CAU_DA_HUY_GIAO = 'Đã huỷ gửi vì mất mạng — chưa giao gì.';

/**
 * Giữ lượt đang gửi của một hộp; `huyNeuDangCho()` (gọi khi Esc/Huỷ/bấm nền) và lúc
 * hộp **bị tháo** (vd thẻ đổi trong panel) huỷ đúng lượt đó nếu nó chưa bay.
 * Trả `true` nếu hộp **được đóng**:
 *
 *   * không có lượt nào đang giữ ⇒ `true`;
 *   * chưa bay (`!da_chay`) ⇒ bật `huy`, báo `cau_da_huy` (chắc chắn chưa có gì), `true`;
 *   * đã bay (`da_chay`) ⇒ không làm gì, `false` — giữ như đang gửi để kết quả thật
 *     về (nếp BAT-33: đích đã chụp trong biến, không đổi đích ngầm). Lúc hộp bị
 *     tháo thì lượt cứ đi tiếp như trước.
 *
 * Không nhận `isPaused`: giá trị render có thể cũ (xem đầu file).
 */
export function useHuyGuiKhiDong(
  bao: (cau: string) => void,
  cau_da_huy: string,
): { ghi: (co: CoLuotGui) => void; xong: (co: CoLuotGui) => void; huyNeuDangCho: () => boolean } {
  const luot = useRef<CoLuotGui | null>(null);
  const ngoai = useRef({ bao, cau_da_huy });
  ngoai.current = { bao, cau_da_huy };

  const huyNeuDangCho = useCallback((): boolean => {
    const co = luot.current;
    if (co === null || co.huy) return true;
    if (co.da_chay) return false;
    co.huy = true;
    luot.current = null;
    ngoai.current.bao(ngoai.current.cau_da_huy);
    return true;
  }, []);

  useEffect(
    () => () => {
      huyNeuDangCho();
    },
    [huyNeuDangCho],
  );

  const ghi = useCallback((co: CoLuotGui) => {
    luot.current = co;
  }, []);
  const xong = useCallback((co: CoLuotGui) => {
    if (luot.current === co) luot.current = null;
  }, []);
  return { ghi, xong, huyNeuDangCho };
}
