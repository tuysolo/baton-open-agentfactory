/**
 * `baton verdict <lượt> accept|return [--reason ...]` — SPEC mục 13 d.369:
 * "Nghiệm thu".
 *
 * **Hai chữ SPEC cho hai kết quả không trùng nhau, và cả hai đều là SPEC.**
 * Bảng lệnh d.369 viết `accept|return`; bảng mã 0.1 (nhóm `trang_thai_luot_giao`,
 * thứ d.381 bắt "nhận mã tiếng Anh") viết `accepted`/`returned`, và đó là thứ
 * API nhận. Nhận **cả hai dạng** là hướng tạm — ghi `spec-questions.md` **#86** —
 * vì chọn một dạng là làm nửa kia của SPEC thành lỗi gõ. Cách dùng in ra dạng
 * của d.369; thân request luôn mang mã 0.1.
 *
 * Mã sai bị chặn **tại CLI** (d.381), thông điệp kể các mã kèm **nhãn tiếng
 * Việt**. Hai luật còn lại ở server: chỉ **người giao** nghiệm thu được (19.12
 * câu 37), và `returned` **bắt buộc có lý do** (mục 5 → `REASON_REQUIRED`).
 */

import { batonFetch } from '@baton/client';
import { BatonError, nhan } from '@baton/shared';
import type { NghiemThuRa } from '../kieu-api.js';
import type { LenhCli } from '../lenh.js';

/** Chữ người gõ → mã 0.1 mà API nhận. Khoá của bảng này là **cả hai** dạng. */
export const DANG_NGHIEM_THU: Readonly<Record<string, 'accepted' | 'returned'>> = {
  accept: 'accepted',
  accepted: 'accepted',
  return: 'returned',
  returned: 'returned',
};

export function kiemKetQuaNghiemThu(tho: string): 'accepted' | 'returned' {
  const ma = DANG_NGHIEM_THU[tho];
  if (ma === undefined) {
    throw new BatonError('INVALID_INPUT', {
      message:
        `"${tho}" không phải kết quả nghiệm thu. Các mã: ` +
        `accept hoặc accepted (${nhan('trang_thai_luot_giao', 'accepted')}), ` +
        `return hoặc returned (${nhan('trang_thai_luot_giao', 'returned')}).`,
    });
  }
  return ma;
}

export const LENH_VERDICT: LenhCli = {
  khai: { ten: 'verdict', vi_tri: ['lượt', 'accept|return'], co: { reason: 'gia_tri' } },

  chay: async ({ cauHinh }, ts) => {
    const luot_id = ts.vi_tri[0] ?? '';
    const ket_qua = kiemKetQuaNghiemThu(ts.vi_tri[1] ?? '');
    const ly_do = ts.gia_tri['reason'];

    const kq = await batonFetch<NghiemThuRa>(cauHinh, {
      method: 'POST',
      path: `/v1/luot-giao/${encodeURIComponent(luot_id)}/nghiem-thu`,
      body: { ket_qua, ...(ly_do === undefined ? {} : { ly_do }) },
    });

    const dong: string[] = [
      `Đã nghiệm thu lượt ${kq.id}: ${nhan('trang_thai_luot_giao', kq.trang_thai)} ` +
        `(${kq.trang_thai}).`,
      `Trạng thái ticket: ${nhan('trang_thai_ticket', kq.ticket_trang_thai)} ` +
        `(${kq.ticket_trang_thai})`,
    ];
    if (kq.luot_moi !== null) {
      // 19.5: trả lại tạo lượt mới `pending`, cùng người nhận, hạn áp lại.
      dong.push(
        `Lượt mới do trả lại: ${kq.luot_moi.id} · #${String(kq.luot_moi.so_luot)} · ` +
          `${nhan('trang_thai_luot_giao', kq.luot_moi.trang_thai)} (${kq.luot_moi.trang_thai}) · ` +
          `người nhận ${kq.luot_moi.nguoi_nhan_agent_id}`,
      );
    }

    return { json: kq, dong };
  },
};
