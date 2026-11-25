/**
 * `baton submit <lượt> <file-bao-cao.md>` — SPEC mục 13 d.366: "Nộp báo cáo
 * (file theo mẫu 5 mục ở mục 5); **đóng phiên**".
 *
 * Phiên đóng ở **server**, trong cùng lệnh nộp (mục 6 d.180 "đóng khi nộp"), nên
 * CLI không gọi thêm đường nào — `phien_da_dong` trong phản hồi là lời khai của
 * server về việc đó.
 *
 * Đọc file: `bao-cao-md.ts` (và `spec-questions.md` #84 cho chỗ SPEC im lặng).
 * Ba luật nghiệp vụ ở server, CLI chỉ in lại: lượt phải đang `in_progress`
 * (19.12 câu 38), chỉ **người nhận** nộp được (câu 37), và lượt `review` tự
 * `accepted` (19.3).
 */

import { batonFetch } from '@baton/client';
import { NHAN_MUC_BAO_CAO, MUC_BAO_CAO, nhan } from '@baton/shared';
import { docBaoCaoMd } from '../bao-cao-md.js';
import type { NopBaoCaoRa } from '../kieu-api.js';
import type { LenhCli } from '../lenh.js';

export const LENH_SUBMIT: LenhCli = {
  khai: { ten: 'submit', vi_tri: ['lượt', 'file-bao-cao.md'], co: {} },

  chay: async ({ cauHinh, docFile }, ts) => {
    const luot_id = ts.vi_tri[0] ?? '';
    const duong = ts.vi_tri[1] ?? '';
    const bao_cao = docBaoCaoMd(await docFile(duong), duong);

    const kq = await batonFetch<NopBaoCaoRa>(cauHinh, {
      method: 'POST',
      path: `/v1/luot-giao/${encodeURIComponent(luot_id)}/nop`,
      body: { ket_qua: bao_cao.ket_qua, ...bao_cao.muc },
    });

    const dong: string[] = [
      `Đã nộp báo cáo cho lượt ${kq.id}: ${nhan('ket_qua_nop', kq.ket_qua)} (${kq.ket_qua}).`,
      `Trạng thái lượt: ${nhan('trang_thai_luot_giao', kq.trang_thai)} (${kq.trang_thai})`,
      `Trạng thái ticket: ${nhan('trang_thai_ticket', kq.ticket_trang_thai)} ` +
        `(${kq.ticket_trang_thai})`,
      kq.phien_da_dong ? 'Phiên đã đóng (SPEC mục 6).' : 'Phiên chưa đóng.',
    ];
    if (kq.tu_accepted) {
      dong.push('Lượt review tự nghiệm thu Đạt, không cần người giao nghiệm thu (SPEC 19.3).');
    }

    dong.push('', 'Các mục đã gửi:');
    for (const m of MUC_BAO_CAO) {
      const v = bao_cao.muc[m];
      dong.push(`  ${NHAN_MUC_BAO_CAO[m]}: ${v === null ? '(để trống)' : 'có'}`);
    }

    return { json: { ...kq, bao_cao: { ket_qua: bao_cao.ket_qua, ...bao_cao.muc } }, dong };
  },
};
