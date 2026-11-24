/**
 * `baton cancel <lượt> --reason "<lý do>"` — **huỷ một lượt giao** (BAT-56).
 *
 * Nguồn hành vi: SPEC mục 5 ("`canceled`: người giao huỷ, hoặc chủ huỷ"), 19.2
 * (hàng "Lượt bị `canceled`…"), 19.6 ("**Huỷ lượt** có phiên đang chạy: phiên sang
 * `stopping`, xử lý như bấm Dừng"), 19.12 câu 37 (huỷ kiểm **danh tính**: người
 * giao hoặc chủ). Đường API `POST /v1/luot-giao/:id/huy` đã có; bảng lệnh mục 13
 * chưa có dòng CLI — lệnh này là phần "kèm thêm" của phương án #83: một Manager
 * chết giữa chừng để lại lượt mở mãi, lượt mở chặn `assign` mới
 * (`ASSIGNMENT_OPEN`), và người giao cần một lối đóng nó từ dòng lệnh.
 *
 * **Lý do BẮT BUỘC ở CLI** (máy chủ nhận tuỳ chọn — SPEC chỉ bắt lý do cho
 * `returned`). Lý do vào cột `ly_do` **sẵn có** của lượt giao (hiện ở `baton
 * show`); không thêm cột, không thêm bảng. Thiếu hoặc trống → `REASON_REQUIRED`
 * (mã thoát 1), **không** gửi request nào.
 *
 * **Không** dùng `verdict return` cho lượt chưa nộp: nghiệm thu chỉ cho lượt
 * `submitted` (mục 5), máy chủ giữ nguyên luật đó.
 *
 * Mọi luật nghiệp vụ (ai được huỷ, lượt đã kết thì không huỷ được, phiên sang
 * `stopping`, ticket về Cần làm nếu không còn lượt mở) nằm ở **máy chủ**
 * (`handlerHuyLuot`); CLI chỉ in lại.
 */

import { batonFetch } from '@baton/client';
import { BatonError, nhan } from '@baton/shared';
import type { HuyLuotRa } from '../kieu-api.js';
import type { LenhCli } from '../lenh.js';
import { cachDung, type KhaiLenh } from '../phan-tich.js';

const KHAI_CANCEL: KhaiLenh = {
  ten: 'cancel',
  vi_tri: ['lượt'],
  co: { reason: 'gia_tri' },
  ghi_chu:
    '--reason là BẮT BUỘC. Chỉ người giao của lượt (hoặc chủ) huỷ được; phiên đang chạy ' +
    'của lượt sang "stopping" và agent nhận STOP (SPEC 19.6).',
};

/** `--reason` thiếu hoặc chỉ toàn khoảng trắng → `REASON_REQUIRED`, kèm cách dùng. */
export function kiemLyDoHuy(tho: string | undefined): string {
  const gon = tho?.trim() ?? '';
  if (gon === '') {
    throw new BatonError('REASON_REQUIRED', {
      message: `Huỷ lượt bắt buộc có lý do: thêm --reason "<lý do>".\n${cachDung(KHAI_CANCEL)}`,
    });
  }
  return gon;
}

export const LENH_CANCEL: LenhCli = {
  khai: KHAI_CANCEL,

  chay: async ({ cauHinh }, ts) => {
    const luot_id = ts.vi_tri[0] ?? '';
    const ly_do = kiemLyDoHuy(ts.gia_tri['reason']);

    const kq = await batonFetch<HuyLuotRa>(cauHinh, {
      method: 'POST',
      path: `/v1/luot-giao/${encodeURIComponent(luot_id)}/huy`,
      body: { ly_do },
    });

    const dong: string[] = [
      `Đã huỷ lượt ${kq.id}: ${nhan('trang_thai_luot_giao', kq.trang_thai)} (${kq.trang_thai}).`,
      `Lý do: ${ly_do}`,
      `Trạng thái ticket: ${nhan('trang_thai_ticket', kq.ticket_trang_thai)} ` +
        `(${kq.ticket_trang_thai})`,
    ];
    if (kq.phien_dang_dung) {
      dong.push(
        'Phiên của lượt đã sang "stopping": agent nhận STOP ở lần gọi kế tiếp, ' +
          'không xác nhận trong 10 phút thì phiên tự đóng (SPEC mục 6, 19.6).',
      );
    }

    return { json: kq, dong };
  },
};
