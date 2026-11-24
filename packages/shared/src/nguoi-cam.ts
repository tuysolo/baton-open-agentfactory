/**
 * **Người đang cầm** ticket — SPEC mục 4 ("tự tính từ mục 5, **không sửa tay**")
 * và SPEC 19.1 (thứ tự ưu tiên 5 bậc).
 *
 * Một hàm duy nhất cho cả hệ thống. Các bậc phụ thuộc **lượt giao** (phần 2) vào
 * bằng tham số `boi_canh`, không tự tra: phần 2 chỉ cần đổi nguồn dữ liệu, không
 * sửa luật, và lượt này vẫn test được từng bậc bằng dữ liệu dựng tay.
 *
 * Bậc 4 ("chủ bấm Tôi làm" — SPEC 19.10) làm được ngay ở lượt này: nó chỉ cần
 * cột `ticket.chu_tu_lam`.
 */

import type { TacGia } from './kieu.js';

/**
 * Dữ liệu lượt giao của một ticket, như SPEC 19.1 định nghĩa.
 * Lượt **mở** = `pending` hoặc `in_progress`; lượt `submitted` không còn mở mà
 * đang **chờ nghiệm thu**.
 */
export interface BoiCanhNguoiCam {
  /** Bậc 1 — agent của lượt `review` **mở**. */
  luot_review_mo?: TacGia | null | undefined;
  /** Bậc 2 — agent của lượt `worker` **mở**. */
  luot_worker_mo?: TacGia | null | undefined;
  /** Bậc 3 — người **giao** của lượt đang ở `submitted` (chờ nghiệm thu). */
  nguoi_giao_luot_submitted?: TacGia | null | undefined;
}

export interface KetQuaNguoiCam {
  /** `null` = trống (bậc 5 của SPEC 19.1). */
  nguoi: TacGia | null;
  /** Bậc nào của SPEC 19.1 đã quyết. 5 = trống. */
  bac: 1 | 2 | 3 | 4 | 5;
  /** Bậc 3: màn hình hiện "chờ <tên> nghiệm thu" (SPEC 19.1). */
  cho_nghiem_thu: boolean;
}

/**
 * Người đang cầm, theo đúng thứ tự ưu tiên của SPEC 19.1:
 *   1. Agent của lượt `review` mở.
 *   2. Agent của lượt `worker` mở.
 *   3. Có lượt `submitted` chờ nghiệm thu → **người giao** lượt đó.
 *   4. Chủ, nếu chủ bấm "Tôi làm" (SPEC 19.10).
 *   5. Không có ai → trống.
 */
export function nguoiDangCam(
  ticket: { chu_tu_lam: boolean },
  boi_canh: BoiCanhNguoiCam = {},
): KetQuaNguoiCam {
  const review = boi_canh.luot_review_mo ?? null;
  if (review !== null) return { nguoi: review, bac: 1, cho_nghiem_thu: false };

  const worker = boi_canh.luot_worker_mo ?? null;
  if (worker !== null) return { nguoi: worker, bac: 2, cho_nghiem_thu: false };

  const nguoi_giao = boi_canh.nguoi_giao_luot_submitted ?? null;
  if (nguoi_giao !== null) return { nguoi: nguoi_giao, bac: 3, cho_nghiem_thu: true };

  if (ticket.chu_tu_lam) return { nguoi: { loai: 'owner' }, bac: 4, cho_nghiem_thu: false };

  return { nguoi: null, bac: 5, cho_nghiem_thu: false };
}
