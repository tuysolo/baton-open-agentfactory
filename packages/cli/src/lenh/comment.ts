/**
 * `baton comment <MÃ> "<nội dung>"` — SPEC mục 13 d.374: "Bình luận".
 *
 * `<MÃ>` là **mã ticket** → `ticketTheoMaHoacId`. Nội dung là **markdown** (mục 4
 * d.145) và đi nguyên lên server: luật độ dài / rỗng là `kiemNoiDungBinhLuan` của
 * `@baton/shared`, chạy ở cửa ghi — không chép bản thứ hai ở client.
 *
 * Giới hạn đã biết của bộ phân tích, nói ra chứ không giấu: một nội dung **bắt
 * đầu bằng `--`** bị bộ phân tích coi là tuỳ chọn (nếp chung của `phan-tich.ts`,
 * đã ghi ở `chay.ts`), nên `baton comment SAI-1 "--help"` ra cách dùng chứ không
 * tạo bình luận. Đây là nếp của cả CLI, không phải luật riêng của lệnh này.
 */

import { batonFetch } from '@baton/client';
import type { ThemBinhLuanRa } from '../kieu-api.js';
import type { LenhCli } from '../lenh.js';
import { ticketTheoMaHoacId } from '../tra-ma.js';

export const LENH_COMMENT: LenhCli = {
  khai: { ten: 'comment', vi_tri: ['MÃ', 'nội dung'], co: {} },

  chay: async ({ cauHinh }, ts) => {
    const ma_ticket = ts.vi_tri[0] ?? '';
    const noi_dung = ts.vi_tri[1] ?? '';

    const ticket = await ticketTheoMaHoacId(cauHinh, ma_ticket);

    const kq = await batonFetch<ThemBinhLuanRa>(cauHinh, {
      method: 'POST',
      path: `/v1/ticket/${encodeURIComponent(ticket.id)}/binh-luan`,
      body: { noi_dung },
    });

    return {
      json: kq,
      dong: [
        `Đã bình luận trên ${ticket.ma}: ${kq.id}`,
        `Lúc: ${new Date(kq.tao_luc).toISOString()}`,
      ],
    };
  },
};
