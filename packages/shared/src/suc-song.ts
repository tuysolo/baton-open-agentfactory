/**
 * **Chỉ báo sức sống của một dự án** — SPEC mục 2 d.71–74.
 *
 * Nguyên văn ba dòng của SPEC:
 *   🟢 "có ít nhất 1 ticket Đang làm, **và** phiên của nó đang chạy hoặc có nhịp
 *      tim trong ngưỡng" (d.72)
 *   🟡 "có ticket Đang làm nhưng phiên **bị đứng hoặc lỗi**" (d.73)
 *   ⚪ "**không có** ticket Đang làm nào. Hiện chữ *Dự án không chạy*" (d.74)
 *
 * Module **thuần**: không I/O, không `Date.now()`. Cùng kỷ luật với `phien.ts` —
 * và nó nhận **trạng thái phiên đã dẫn xuất**, vì "nhịp tim trong ngưỡng" của
 * d.72 chính là thứ `trangThaiPhienDanXuat` đã tính (`running` = có tín hiệu
 * trong ngưỡng; quá ngưỡng đã là `stalled`). Tính lại ngưỡng ở đây là hai bản
 * của một luật.
 *
 * **Một chỗ duy nhất cho cả hai đường đọc**: sidebar (`GET /v1/du-an`, d.393) và
 * Tổng quan (`GET /v1/tong-quan`, d.317) gọi đúng hàm này. Hai bản tính sẽ lệch
 * nhau ở đúng chỗ khó thấy nhất, và chủ sẽ thấy 🟢 ở một chỗ, 🟡 ở chỗ kia.
 *
 * -------------------------------------------------------------------------
 * **Chỗ SPEC KHÔNG nói, và lựa chọn tạm đang cài** (`cau-hoi-spec.md` #102):
 *
 * Ba dòng trên không phủ hết các ca có thật. Một dự án có ticket **Đang làm** mà
 * ticket đó **không có phiên mở nào** (chưa ai nhận lượt, hoặc phiên đã đóng) thì
 * không rơi vào d.72 (không có phiên đang chạy) **cũng không** d.73 (không có
 * phiên đứng hay lỗi), và chắc chắn không d.74 (có ticket Đang làm). Tương tự với
 * ba trạng thái phiên mà mục 2 không nhắc: `waiting_owner`, `waiting_assigner`,
 * `stopping`.
 *
 * Chốt tạm, và nó là hướng **không nói quá**:
 *   * `running` · `waiting_owner` · `waiting_assigner` · `stopping` → 🟢. Cả bốn
 *     là phiên **còn mở và còn tín hiệu trong ngưỡng** (một `running` quá ngưỡng
 *     đã thành `stalled` trước khi tới đây), tức đúng vế "hoặc **có nhịp tim
 *     trong ngưỡng**" của d.72. Riêng `waiting_owner` thì 19.6 nói thẳng nó
 *     "không bao giờ bị tính đứng".
 *   * `stalled` · `error` → 🟡, đúng chữ d.73 ("đứng **hoặc lỗi**").
 *   * **Có ticket Đang làm mà không phiên nào → 🟡**, không 🟢 và không ⚪. Không
 *     🟢 vì không có gì chứng minh dự án đang chạy, mà vẽ 🟢 là nói sai với chủ.
 *     Không ⚪ vì d.74 dành riêng cho "không có ticket Đang làm nào", và chữ của
 *     nó — "Dự án không chạy" — sẽ che mất đúng thứ chủ cần thấy: một ticket Đang
 *     làm mà **không ai cầm** là một dòng của *Cần chú ý* (mục 11 ý 4).
 *
 * 🟢 **thắng** 🟡 khi dự án có cả hai: một phiên thật đang chạy nghĩa là dự án
 * đang chạy, dù một ticket khác của nó đã đứng — phiên đứng vẫn hiện riêng ở
 * *Cần chú ý*. Cùng hướng mà `trangThaiAgentTuPhien` đã chọn cho `busy` trước
 * `stalled`.
 * -------------------------------------------------------------------------
 */

import type { TrangThaiPhien } from './ma-nhan.js';

/**
 * Ba giá trị của d.71–74. Mã **tiếng Việt không dấu**, không `xanh`/`vang` kiểu
 * màu CSS: đây là một kết luận nghiệp vụ, và giao diện chọn màu từ nó.
 */
export type SucSong = 'xanh' | 'vang' | 'trang';

/** d.74 chốt **đúng câu này** cho ⚪. Hằng để không ai gõ lại một biến thể. */
export const CAU_DU_AN_KHONG_CHAY = 'Dự án không chạy';

/**
 * **Nhãn tiếng Việt của ba mức sức sống** — mục 0.1 (mã máy + nhãn hiển thị).
 *
 * Ở `@baton/shared` vì từ phần 7 có **hai** chỗ đọc nó: chấm sức sống của giao
 * diện (`packages/web/src/vo/cham-suc-song.tsx`, d.317 + d.393) và **handoff tối**
 * (mục 11 d.332 "Trạng thái từng dự án" — một dòng chữ trong markdown, không một
 * chấm màu). Hai bản gõ tay sẽ lệch, và khi chúng lệch thì báo cáo nói một đằng,
 * màn hình nói một nẻo về cùng một dự án.
 *
 * `trang` dùng **đúng** `CAU_DU_AN_KHONG_CHAY` của d.74, không một biến thể.
 */
export const NHAN_SUC_SONG: Record<SucSong, string> = {
  xanh: 'Đang chạy',
  vang: 'Phiên đứng hoặc lỗi',
  trang: CAU_DU_AN_KHONG_CHAY,
};

/** Trạng thái phiên nào được coi là "đang chạy hoặc còn nhịp tim" — xem khối trên. */
const PHIEN_CON_SONG = [
  'running',
  'waiting_owner',
  'waiting_assigner',
  'stopping',
] as const satisfies readonly TrangThaiPhien[];

/** Trạng thái phiên nào là "đứng hoặc lỗi" — d.73. */
const PHIEN_DUNG_HOAC_LOI = ['stalled', 'error'] as const satisfies readonly TrangThaiPhien[];

export interface NguonSucSong {
  /** Số ticket **Đang làm** (`in_progress`) của dự án — vế đếm của d.72/d.74. */
  so_ticket_dang_lam: number;
  /**
   * Trạng thái **đã dẫn xuất** của các phiên **còn mở** trên chính những ticket
   * Đang làm đó. Dẫn xuất trước khi vào đây (xem `trangThaiPhienDanXuat`).
   */
  trang_thai_phien: readonly TrangThaiPhien[];
}

export function sucSongDuAn(nguon: NguonSucSong): SucSong {
  // d.74 — vế duy nhất SPEC viết hết: không có ticket Đang làm nào.
  if (nguon.so_ticket_dang_lam <= 0) return 'trang';

  if (nguon.trang_thai_phien.some((t) => (PHIEN_CON_SONG as readonly string[]).includes(t))) {
    return 'xanh';
  }

  // d.73 — có ticket Đang làm, phiên đứng hoặc lỗi.
  if (nguon.trang_thai_phien.some((t) => (PHIEN_DUNG_HOAC_LOI as readonly string[]).includes(t))) {
    return 'vang';
  }

  /*
   * Còn lại: có ticket Đang làm mà **không phiên mở nào**. SPEC không nói ca này
   * (xem khối đầu file) — chốt tạm 🟡, vì không có gì chứng minh dự án đang chạy
   * mà cũng không đúng để nói "Dự án không chạy".
   */
  return 'vang';
}
