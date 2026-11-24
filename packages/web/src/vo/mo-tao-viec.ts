/**
 * **Đường để một trang mở hộp Tạo việc CỦA VỎ** — một module LÁ (chỉ nhập React
 * và kiểu).
 *
 * Hộp Tạo việc (`HopTaoViec`, `vo/tao-viec.tsx`) có **một** bản, trạng thái mở
 * nằm ở `useHopTaoViec` trong `Vo` (`App.tsx`). Nút `+` ở đầu cột Cần làm của
 * bảng (BAT-62), ở đầu nhóm Backlog của kiểu Danh sách (BAT-63) và ở đầu cột
 * Backlog của bảng (BAT-64; `trang/danh-sach-ticket.tsx`) phải mở **chính** hộp ấy, không dựng hộp thứ hai —
 * nên vỏ cấp `moHop` qua context này.
 *
 * **Trạng thái ban đầu** (BAT-63, SPEC mục 4 "Trạng thái khi tạo", T-108 = B):
 * `moHop({ trang_thai: 'backlog' })` mở hộp với Backlog chọn sẵn; gọi không kèm
 * (hoặc kèm thứ gì khác — vd một sự kiện bấm khi `moHop` được gắn thẳng vào
 * `onClick`) ⇒ Cần làm. Mỗi lần mở đặt lại theo đúng cách mở đó: mở từ Backlog,
 * đóng, mở lại bằng phím `C` ⇒ Cần làm.
 *
 * Vì sao tách khỏi `tao-viec.tsx`: cùng lý do `vo/hop-dang-mo.ts` — một module lá
 * thì không ai phải lo vòng nhập (`App.tsx` → trang → vỏ → …).
 *
 * Ngoài provider (test dựng trang không có vỏ, hay một nơi nào không có hộp) giá
 * trị là `null`: chỗ gọi **không vẽ** nút, vì một nút bấm không ra gì là nói dối.
 */

import { createContext, useContext } from 'react';
import type { TrangThaiTicket } from '../api';

/**
 * Hai trạng thái đặt được lúc tạo — **bản chép** của `TRANG_THAI_TICKET_KHI_TAO`
 * (`packages/shared/src/ma-nhan.ts`; web không nhập `@baton/shared`). Phần tử đầu
 * là mặc định. `test/tao-viec.test.tsx` ghim nó bằng câu SPEC mục 4.
 */
export const TRANG_THAI_KHI_TAO_WEB = ['todo', 'backlog'] as const satisfies readonly TrangThaiTicket[];
export type TrangThaiKhiTaoWeb = (typeof TRANG_THAI_KHI_TAO_WEB)[number];
export const TRANG_THAI_KHI_TAO_MAC_DINH_WEB: TrangThaiKhiTaoWeb = TRANG_THAI_KHI_TAO_WEB[0];

export interface TuyChonMoTaoViec {
  /** Trạng thái chọn sẵn trong hộp. Thiếu ⇒ Cần làm. */
  trang_thai?: TrangThaiKhiTaoWeb;
}

export type MoTaoViec = (tuy_chon?: TuyChonMoTaoViec) => void;

/**
 * Trạng thái ban đầu theo cách mở. Chỉ nhận đúng một object có `trang_thai` thuộc
 * hai giá trị trên; mọi thứ khác (không truyền, sự kiện bấm, giá trị lạ) ⇒ mặc định.
 */
export function trangThaiDauTuTuyChon(tuy_chon: unknown): TrangThaiKhiTaoWeb {
  if (typeof tuy_chon !== 'object' || tuy_chon === null) return TRANG_THAI_KHI_TAO_MAC_DINH_WEB;
  const tt = (tuy_chon as { trang_thai?: unknown }).trang_thai;
  return TRANG_THAI_KHI_TAO_WEB.find((x) => x === tt) ?? TRANG_THAI_KHI_TAO_MAC_DINH_WEB;
}

export const MoTaoViecContext = createContext<MoTaoViec | null>(null);

/** `moHop` của vỏ, hoặc `null` khi trang được dựng ngoài vỏ. */
export function useMoTaoViec(): MoTaoViec | null {
  return useContext(MoTaoViecContext);
}
