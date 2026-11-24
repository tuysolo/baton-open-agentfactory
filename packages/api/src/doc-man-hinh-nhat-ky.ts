/**
 * **Màn hình Nhật ký quyết định** — SPEC mục 10 d.306–312, mục 14 d.392.
 *
 * Mỏng, và cố tình mỏng: nó là `lietKeNhatKy` cộng `bay_gio` cộng cổng "chỉ chủ".
 *
 * ## Vì sao một đường riêng chứ không thêm `bay_gio` vào `GET /v1/nhat-ky`
 *
 * Cùng lý lẽ `manHinhDanhSachTicket`: thân của `GET /v1/nhat-ky` **cũng là đầu ra
 * `baton decision --json`** của mục 13, và một mốc đổi theo từng lần gọi làm đầu
 * ra CLI không so lại được giữa hai lần chạy.
 *
 * ## `bay_gio` để làm gì ở một màn hình "gom theo ngày"
 *
 * d.412 áp cho **mọi** mốc trên giao diện, và dòng Nhật ký có một mốc (`luc`,
 * d.308 "lúc"). Ngày gom (`ngay`) vẫn do **máy chủ** đổi theo múi giờ nghiệp vụ
 * (19.12 câu 60) — giao diện không tự đổi mốc thành ngày, nên hai chỗ không thể
 * lệch múi giờ.
 *
 * ## Tầm nhìn
 *
 * Phạm vi dòng (gồm lớp "Chung" của 19.12 câu 61) nằm trong `lietKeNhatKy`, một
 * chỗ duy nhất. Màn hình **không** thêm điều kiện nào: chủ thấy mọi dòng.
 */

import { BatonError, type AiGoi } from '@baton/shared';
import { lietKeNhatKy, type TrangNhatKy, type YeuCauLietKeNhatKy } from './doc-nhat-ky.js';

export const CAU_CHI_CHU_NHAT_KY = 'Màn hình này chỉ dành cho chủ.';

export interface ManHinhNhatKyRa extends TrangNhatKy {
  /** Mốc mà **mọi** chữ tương đối của thân này đếm từ — d.412. */
  bay_gio: number;
}

export async function manHinhNhatKy(
  db: D1Database,
  ai: AiGoi,
  workspace_id: string,
  yeu_cau: YeuCauLietKeNhatKy,
  bay_gio: number,
): Promise<ManHinhNhatKyRa> {
  if (ai.loai !== 'chu') {
    throw new BatonError('FORBIDDEN', { message: CAU_CHI_CHU_NHAT_KY });
  }
  return { ...(await lietKeNhatKy(db, ai, workspace_id, yeu_cau)), bay_gio };
}
