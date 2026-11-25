/**
 * `baton log <type> "<nội dung>"` — SPEC mục 13 d.363: "Gửi hoạt động: thought,
 * action, question, result, error".
 *
 * `<type>` nhận **mã tiếng Anh** (d.381), kiểm **tại CLI** bằng đúng bảng 0.1 của
 * `@baton/shared` (nhóm `loai_hoat_dong`) — không chép một danh sách thứ hai —
 * và thông điệp lỗi kể các mã **kèm nhãn tiếng Việt**. Cùng khuôn với `--status`
 * của `baton list`.
 *
 * Ba hệ quả nghiệp vụ của lệnh này nằm ở **server**, CLI chỉ in lại:
 *   * `question` đưa phiên sang `waiting_assigner` (19.6);
 *   * `result`/`error` sau khi chủ bấm Dừng là **lời xác nhận dừng** và đóng
 *     phiên (mục 6 d.193) — `da_xac_nhan_dung` trong phản hồi;
 *   * phiên đã đóng thì mọi lệnh ghi bị từ chối `SESSION_CLOSED` (d.195).
 *
 * Phiên nào: xem `phien-hien-tai.ts` (#83). Một phiên mở thì tự suy ra; nhiều
 * phiên mở thì chỉ rõ bằng `--luot <lượt>` hoặc `BATON_LUOT` (BAT-56).
 *
 * **Không có cờ `--tam-thoi`, cố ý.** Mục 6 d.190 cho một mục được "đánh dấu tạm
 * thời" và API nhận `tam_thoi`, nhưng bảng lệnh mục 13 d.363 viết đúng hai tham
 * số (`<type>` và `"<nội dung>"`) — thêm một cờ SPEC không viết là tự đặt cú
 * pháp. Hệ quả: từ CLI chưa gửi được mục tạm thời; đã ghi `spec-questions.md` #85.
 * (`--luot` là cờ thêm **có giao việc** — BAT-56, phương án của #83 — không phải
 * tiền lệ để tự thêm cờ.)
 */

import { batonFetch } from '@baton/client';
import { BatonError, danhSachMa, laMaHopLe, nhan } from '@baton/shared';
import type { HoatDongRa } from '../kieu-api.js';
import type { LenhCli } from '../lenh.js';
import { CO_LUOT, luotChiDinh, phienDangMoCuaToi } from '../phien-hien-tai.js';

/** Mã loại hoạt động sai → `INVALID_INPUT` kể đủ 5 mã kèm nhãn (d.381). */
export function kiemLoaiHoatDongCli(tho: string): string {
  if (!laMaHopLe('loai_hoat_dong', tho)) {
    throw new BatonError('INVALID_INPUT', {
      message:
        `"${tho}" không phải loại hoạt động. Các mã: ` +
        danhSachMa('loai_hoat_dong')
          .map((m) => `${m} (${nhan('loai_hoat_dong', m)})`)
          .join(', '),
    });
  }
  return tho;
}

export const LENH_LOG: LenhCli = {
  khai: { ten: 'log', vi_tri: ['type', 'nội dung'], co: { [CO_LUOT]: 'gia_tri' } },

  chay: async ({ cauHinh, luotMacDinh }, ts) => {
    const loai = kiemLoaiHoatDongCli(ts.vi_tri[0] ?? '');
    const noi_dung = ts.vi_tri[1] ?? '';

    const phien = await phienDangMoCuaToi(cauHinh, luotChiDinh(ts, luotMacDinh));

    const kq = await batonFetch<HoatDongRa>(cauHinh, {
      method: 'POST',
      path: `/v1/phien/${encodeURIComponent(phien.id)}/hoat-dong`,
      // Thân gọi trường là `loai`, đúng như SPEC (server tự đổi tên nội bộ).
      body: { loai, noi_dung },
    });

    const dong: string[] = [
      `Đã gửi hoạt động ${nhan('loai_hoat_dong', kq.loai)} (${kq.loai}) ` +
        `#${String(kq.thu_tu)} lên phiên ${kq.phien_id}.`,
      `Trạng thái phiên: ${kq.trang_thai_phien}`,
    ];
    if (kq.loai === 'question') {
      dong.push('Phiên đang chờ người giao trả lời (SPEC 19.6).');
    }
    if (kq.da_xac_nhan_dung) {
      dong.push('Đây là lời xác nhận dừng: phiên đã đóng (SPEC mục 6 d.193).');
    }

    return { json: kq, dong };
  },
};
