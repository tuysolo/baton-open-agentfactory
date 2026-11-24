/**
 * `baton heartbeat [ghi chú]` — SPEC mục 13 d.362: "Nhịp tim; trả về tín hiệu
 * nếu có (`STOP`, kết quả Cần Chủ mới)".
 *
 * Đây là **đường thật đầu tiên tới mã thoát 3** (d.380): phiên ở `stopping` thì
 * phản hồi mang `tin_hieu: ["STOP"]`, và `tin-hieu.ts` đổi nó thành mã 3. Lệnh
 * vẫn **thành công** và vẫn in đủ — mã 3 không phải một lỗi, nên nó không đi
 * đường ngoại lệ.
 *
 * `[ghi chú]` trong ngoặc vuông = **tuỳ chọn** (một tham số vị trí tuỳ chọn, ca
 * duy nhất tới giờ — xem `vi_tri_tuy_chon` của `phan-tich.ts`).
 *
 * Lượt giao nào: xem `phien-hien-tai.ts` (#83). Một phiên mở thì tự suy ra;
 * nhiều phiên mở thì chỉ rõ bằng `--luot <lượt>` hoặc `BATON_LUOT` (BAT-56).
 */

import { batonFetch } from '@baton/client';
import type { HeartbeatRa } from '../kieu-api.js';
import type { LenhCli } from '../lenh.js';
import { CO_LUOT, luotChiDinh, phienDangMoCuaToi } from '../phien-hien-tai.js';
import { dongTinHieu, maThoatCuaTinHieu } from '../tin-hieu.js';

export const LENH_HEARTBEAT: LenhCli = {
  khai: {
    ten: 'heartbeat',
    vi_tri: [],
    vi_tri_tuy_chon: ['ghi chú'],
    co: { [CO_LUOT]: 'gia_tri' },
  },

  chay: async ({ cauHinh, luotMacDinh }, ts) => {
    const phien = await phienDangMoCuaToi(cauHinh, luotChiDinh(ts, luotMacDinh));
    const ghi_chu = ts.vi_tri[0];

    const kq = await batonFetch<HeartbeatRa>(cauHinh, {
      method: 'POST',
      path: `/v1/luot-giao/${encodeURIComponent(phien.luot_giao_id)}/heartbeat`,
      body: ghi_chu === undefined ? {} : { ghi_chu },
    });

    const dong: string[] = [
      `Nhịp tim đã gửi cho phiên ${kq.phien_id} (lượt ${kq.luot_giao_id}).`,
      `Trạng thái phiên: ${kq.trang_thai}`,
    ];

    // 19.6: "lần gọi kế tiếp của agent nhận được câu trả lời".
    if (kq.tra_loi_moi.length > 0) {
      dong.push('', `Trả lời của người giao (${String(kq.tra_loi_moi.length)}):`);
      for (const t of kq.tra_loi_moi) {
        dong.push(`  ${t.tac_gia_agent_id ?? t.tac_gia_loai}: ${t.noi_dung}`);
      }
    }

    // Mục 8 d.268 — "kết quả Cần Chủ mới" của chính d.362.
    if (kq.resolved_asks.length > 0) {
      dong.push('', `Kết quả Cần Chủ (${String(kq.resolved_asks.length)}):`);
      for (const m of kq.resolved_asks) {
        dong.push(`  ${m.ma} ${m.tieu_de} — ${m.ket_qua ?? m.ly_do_bo_qua ?? '(không có chữ)'}`);
      }
    }

    const tin_hieu = dongTinHieu(kq.tin_hieu);
    if (tin_hieu.length > 0) dong.push('', ...tin_hieu);

    const ma_thoat = maThoatCuaTinHieu(kq.tin_hieu);
    return { json: kq, dong, ...(ma_thoat === undefined ? {} : { ma_thoat }) };
  },
};
