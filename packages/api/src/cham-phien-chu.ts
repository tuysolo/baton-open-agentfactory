/**
 * **Ghi lần dùng cuối của phiên chủ, theo nhịp** — BAT-11 (SPEC mục 15 d.425,
 * d.428: màn hình "các phiên đang mở" nói được máy nào còn dùng).
 *
 * Trả món nợ đã khai ở `phienChuConSong`: cột `chu_phien.dung_cuoi_luc` đứng yên
 * từ lúc đăng nhập. Ba ràng buộc, và cách file này giữ từng cái:
 *
 *   * **Không thêm lượt ghi ở mỗi request.** Quyết định "có ghi không" dùng giá
 *     trị `dung_cuoi_luc` mà lượt tra phiên của `xacThuc` đã đọc **kèm** (cùng
 *     câu `CAU_TRA_PHIEN_CHU`, cùng một lần tra khoá — không thêm truy vấn). Chỉ
 *     khi mốc cũ hơn `NHIP_GHI_DUNG_CUOI_MS` (1 giờ) mới đi tới cửa ghi: tối đa
 *     một lượt ghi mỗi giờ cho mỗi phiên.
 *   * **Đúng nếp cổng ghi.** Mọi ghi lên `chu_phien` đi qua `WorkspaceGate`
 *     (`/chu/cham-phien`), như đăng xuất và đổi mật khẩu.
 *   * **Lỗi ghi không làm hỏng request.** Lần dùng cuối là dấu vết phụ; một cửa
 *     ghi đang lỗi mà làm 500 mọi trang của chủ là đổi một dòng thông tin lấy cả
 *     giao diện. Nên lỗi bị **nuốt** ở đây, và request đi tiếp.
 *
 * Middleware riêng (gắn sau `xacThuc` ở `index.ts`), không nằm trong `xacThuc`:
 * `workspace-gate.ts` đã import `xac-thuc.ts`, nên gọi cửa ghi từ trong đó là
 * một vòng import.
 */

import type { MiddlewareHandler } from 'hono';
import { canGhiDungCuoi } from './chu-dang-nhap.js';
import { goiChamPhienChu } from './workspace-gate.js';
import type { MoiTruongHono } from './xac-thuc.js';

export const chamPhienChuTheoNhip: MiddlewareHandler<MoiTruongHono> = async (c, next) => {
  const phien = c.get('phien_chu');
  if (phien !== undefined && canGhiDungCuoi(phien.dung_cuoi_luc, Date.now())) {
    try {
      await goiChamPhienChu(c.env, { workspace_id: c.get('workspace_id'), bam: phien.bam });
    } catch {
      // Cố ý nuốt — xem đầu file. Mốc chưa đổi, nên request kế tiếp sẽ thử lại.
    }
  }
  await next();
};
