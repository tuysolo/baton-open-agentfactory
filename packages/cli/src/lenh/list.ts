/**
 * `baton list [--project X] [--status ...]` — SPEC mục 13 d.373: "Liệt kê ticket".
 *
 * `--project X` nhận **mã dự án** (như `baton profile <DỰ ÁN>` của d.378), đổi
 * sang `project_id` ở `tra-ma.ts`.
 *
 * `--status` nhận **mã tiếng Anh** — d.381: "Trạng thái, mức, loại nhận **mã
 * tiếng Anh** (bảng mục 0.1); UI và thông điệp lỗi hiển thị nhãn tiếng Việt".
 * Mã sai bị chặn **tại CLI** bằng đúng bảng 0.1 của `@baton/shared` (không chép
 * bảng thứ hai), và thông điệp lỗi kể các mã kèm **nhãn tiếng Việt**.
 */

import { batonFetch } from '@baton/client';
import { BatonError, danhSachMa, laMaHopLe, nhan } from '@baton/shared';
import { tenNguoi, type TicketDongRa, type TrangRa } from '../kieu-api.js';
import type { LenhCli } from '../lenh.js';
import { duAnTheoMa } from '../tra-ma.js';

export const LENH_LIST: LenhCli = {
  khai: { ten: 'list', vi_tri: [], co: { project: 'gia_tri', status: 'gia_tri' } },

  chay: async ({ cauHinh }, ts) => {
    const ma_du_an = ts.gia_tri['project'];
    const trang_thai = ts.gia_tri['status'];

    if (trang_thai !== undefined && !laMaHopLe('trang_thai_ticket', trang_thai)) {
      throw new BatonError('INVALID_INPUT', {
        message:
          `"${trang_thai}" không phải mã trạng thái ticket. Các mã: ` +
          danhSachMa('trang_thai_ticket')
            .map((m) => `${m} (${nhan('trang_thai_ticket', m)})`)
            .join(', '),
      });
    }

    const du_an = ma_du_an === undefined ? null : await duAnTheoMa(cauHinh, ma_du_an);
    const trang = await batonFetch<TrangRa<TicketDongRa>>(cauHinh, {
      method: 'GET',
      path: '/v1/ticket',
      query: {
        project_id: du_an === null ? undefined : du_an.id,
        trang_thai,
      },
    });

    const dong: string[] = [];
    if (trang.items.length === 0) {
      dong.push('(không có ticket nào khớp)');
    } else {
      for (const t of trang.items) {
        dong.push(
          `${t.ma}  ${t.nhan_uu_tien} (${t.uu_tien})  ${t.nhan_trang_thai} (${t.trang_thai})  ` +
            `${tenNguoi(t.nguoi_dang_cam)}  ${t.tieu_de}`,
        );
      }
      dong.push(
        `— ${String(trang.items.length)} ticket${trang.cursor_sau === null ? '' : ' (còn trang sau; dùng --json để lấy cursor_sau)'}`,
      );
    }

    return { json: trang, dong };
  },
};
