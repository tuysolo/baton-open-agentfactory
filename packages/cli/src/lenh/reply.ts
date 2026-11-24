/**
 * `baton reply <lượt> "<nội dung>"` — SPEC mục 13 d.370 + **19.12 câu 2**: "trả
 * lời câu hỏi của agent trên lượt giao (xem 19.6); **chỉ người giao của lượt đó
 * gọi được**".
 *
 * Bốn luật của câu 2 nằm ở **server** (`handlerTraLoiCauHoi`), CLI chỉ in lại
 * kết quả: chỉ người giao (`FORBIDDEN` cho người khác); chủ trả lời từ web với
 * hành vi giống hệt; câu trả lời là **một hoạt động trên phiên của người hỏi**
 * *và* **một bình luận trên ticket**; và phiên về `running` (19.6).
 *
 * Không có tham số chọn câu hỏi: SPEC d.370 cho đúng hai tham số, và API mặc
 * định trả lời **câu hỏi chưa trả lời mới nhất** của lượt đó.
 */

import { batonFetch } from '@baton/client';
import { nhan } from '@baton/shared';
import type { TraLoiRa } from '../kieu-api.js';
import type { LenhCli } from '../lenh.js';

export const LENH_REPLY: LenhCli = {
  khai: { ten: 'reply', vi_tri: ['lượt', 'nội dung'], co: {} },

  chay: async ({ cauHinh }, ts) => {
    const luot_id = ts.vi_tri[0] ?? '';
    const noi_dung = ts.vi_tri[1] ?? '';

    const kq = await batonFetch<TraLoiRa>(cauHinh, {
      method: 'POST',
      path: `/v1/luot-giao/${encodeURIComponent(luot_id)}/tra-loi`,
      body: { noi_dung },
    });

    const dong: string[] = [
      `Đã trả lời câu hỏi ${kq.tra_loi_cho_id} trên lượt ${kq.luot_giao_id}.`,
      `Hoạt động trên phiên ${kq.phien_id}: ${kq.id}`,
      // 19.12 câu 2 đòi **cả hai**, nên cả hai đều được khai ra.
      `Bình luận trên ticket ${kq.ticket_id}: ${kq.comment_id}`,
      `Trạng thái phiên: ${nhan('trang_thai_phien', kq.trang_thai_phien)} ` +
        `(${kq.trang_thai_phien})`,
    ];

    return { json: kq, dong };
  },
};
