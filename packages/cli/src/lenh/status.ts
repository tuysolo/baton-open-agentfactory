/**
 * `baton status <MÃ> "<trạng thái>" [--reason] [--original MÃ]` — SPEC mục 13
 * d.371: "Đổi trạng thái **theo luật mục 4**".
 *
 * `<trạng thái>` nhận **mã tiếng Anh** của bảng 0.1 (d.381); mã sai bị chặn **tại
 * CLI** với thông điệp kể cả 7 mã kèm **nhãn tiếng Việt**, dùng đúng bảng của
 * `@baton/shared` (không chép bảng thứ hai).
 *
 * `--reason` trong SPEC viết **không có chỗ cho giá trị**, nhưng mục 4 đòi "vào
 * Huỷ phải có **lý do**" — một cờ bật/tắt không mang được lý do nào. Nên ở đây nó
 * là tuỳ chọn **có giá trị**, đúng như d.369 viết cho `baton verdict`
 * (`[--reason ...]`); xem `spec-questions.md` **#90**.
 *
 * ## "Theo luật mục 4" — chặn gì ở CLI, để gì cho máy chủ
 *
 * Luật mục 4 d.137: "Vào Huỷ phải có lý do (`REASON_REQUIRED`). Vào Trùng phải có
 * ticket gốc **hợp lệ** (`INVALID_DUPLICATE_TARGET`)." Hai vế, và chúng chia đôi
 * rất rõ theo **dữ liệu cần để kiểm**:
 *
 *   * **Chặn tại CLI** — hai điều kiện chỉ cần nhìn chính dòng lệnh: `canceled`
 *     mà **không gõ** `--reason`, và `duplicate` mà **không gõ** `--original`.
 *     Không cần biết gì về DB, nên một request đi rồi về cũng chỉ nói đúng câu
 *     này, với một thông điệp mơ hồ hơn (server không biết người gõ gọi cờ đó là
 *     gì). CLI ném **đúng mã lỗi của SPEC**, không phải `INVALID_INPUT`: mã lỗi là
 *     thứ agent đọc để quyết, và nó phải giống nhau dù luật bắt ở tầng nào.
 *     Vế thứ ba cùng loại: `--original` gõ **thừa** (đích không phải `duplicate`)
 *     → `INVALID_INPUT`, lý do đầy đủ ở ngay chỗ kiểm.
 *   * **Để cho máy chủ** — chữ **"hợp lệ"** của d.137: ticket gốc có tồn tại, có
 *     cùng workspace, có phải chính nó, có tạo chuỗi trùng vòng không
 *     (`ticketGocHopLe`). Cả bốn đều là dữ liệu DB. Và **toàn bộ** phần còn lại
 *     của mục 4: cổng bằng chứng (`EVIDENCE_REQUIRED`), ticket con chưa kết
 *     (`CHILDREN_OPEN`), "mở lại ticket đã kết chỉ chủ làm được". CLI **không**
 *     chép một dòng nào của những luật đó: hai bản luật sẽ lệch nhau ngay lần sửa
 *     đầu tiên, và bản ở client thì bỏ qua được.
 *
 * `--original MÃ` nhận **mã ticket** và CLI đổi sang id (`ticketTheoMaHoacId`) —
 * API nhận `ticket_goc_id` là id.
 *
 * **Lệnh này có ca "vừa ghi vừa báo lỗi"**: mục 4 d.135 nói vào Xong mà thiếu
 * bằng chứng thì bị từ chối với `EVIDENCE_REQUIRED` **và** ticket được đưa sang
 * Chờ kiểm chứng. Nên mã thoát 1 ở đây **không** có nghĩa "không có gì đổi" — dòng
 * lỗi của `loi-cli.ts` in đúng mã lỗi, và trạng thái mới đọc bằng `baton show`.
 */

import { batonFetch } from '@baton/client';
import { BatonError, danhSachMa, laMaHopLe, nhan } from '@baton/shared';
import type { DoiTrangThaiRa } from '../kieu-api.js';
import type { LenhCli } from '../lenh.js';
import { ticketTheoMaHoacId } from '../tra-ma.js';

/** `<trạng thái>` → mã 0.1, hoặc `INVALID_INPUT` kể đủ 7 mã kèm nhãn (d.381). */
export function kiemTrangThaiCli(tho: string): string {
  if (!laMaHopLe('trang_thai_ticket', tho)) {
    throw new BatonError('INVALID_INPUT', {
      message:
        `"${tho}" không phải mã trạng thái ticket. Các mã: ` +
        danhSachMa('trang_thai_ticket')
          .map((m) => `${m} (${nhan('trang_thai_ticket', m)})`)
          .join(', '),
    });
  }
  return tho;
}

export const LENH_STATUS: LenhCli = {
  khai: {
    ten: 'status',
    vi_tri: ['MÃ', 'trạng thái'],
    co: { reason: 'gia_tri', original: 'gia_tri' },
  },

  chay: async ({ cauHinh }, ts) => {
    const ma_ticket = ts.vi_tri[0] ?? '';
    const dich = kiemTrangThaiCli(ts.vi_tri[1] ?? '');
    const ly_do = ts.gia_tri['reason'];
    const ma_goc = ts.gia_tri['original'];

    // Hai luật mục 4 chặn được **bằng chính dòng lệnh** — xem khối chú thích trên.
    if (dich === 'canceled' && ly_do === undefined) {
      throw new BatonError('REASON_REQUIRED', {
        message:
          `Vào ${nhan('trang_thai_ticket', 'canceled')} (canceled) bắt buộc có lý do ` +
          '(SPEC mục 4): thêm --reason "<lý do>".',
      });
    }
    /*
     * `--original` **thừa** → `INVALID_INPUT`, chặn tại CLI trước mọi request.
     *
     * Chọn báo lỗi thay vì im lặng bỏ qua (máy chủ vốn bỏ qua `ticket_goc_id` khi
     * đích không phải `duplicate`): `baton status SAI-7 canceled --original SAI-3`
     * là một dòng chỉ có hai cách đọc — gõ nhầm **đích** (định `duplicate`) hoặc
     * gõ nhầm **cờ** — và cả hai đều là việc người gõ phải sửa. Bỏ qua lặng lẽ thì
     * ticket sang Huỷ mà người gõ tin là đã đánh Trùng. Ngoài ra nó còn tiết kiệm
     * đúng một request: `ticketTheoMaHoacId` của ticket gốc không phải chạy.
     */
    if (dich !== 'duplicate' && ma_goc !== undefined) {
      throw new BatonError('INVALID_INPUT', {
        message:
          `--original chỉ dùng khi đổi sang ${nhan('trang_thai_ticket', 'duplicate')} ` +
          `(duplicate); trạng thái đích đang là ${nhan('trang_thai_ticket', dich)} (${dich}).`,
      });
    }
    if (dich === 'duplicate' && ma_goc === undefined) {
      throw new BatonError('INVALID_DUPLICATE_TARGET', {
        message:
          `Vào ${nhan('trang_thai_ticket', 'duplicate')} (duplicate) bắt buộc trỏ tới ticket ` +
          'gốc (SPEC mục 4): thêm --original <MÃ>.',
      });
    }

    const ticket = await ticketTheoMaHoacId(cauHinh, ma_ticket);
    const goc = ma_goc === undefined ? null : await ticketTheoMaHoacId(cauHinh, ma_goc);

    const kq = await batonFetch<DoiTrangThaiRa>(cauHinh, {
      method: 'POST',
      path: `/v1/ticket/${encodeURIComponent(ticket.id)}/trang-thai`,
      body: {
        trang_thai: dich,
        ...(ly_do === undefined ? {} : { ly_do }),
        ...(goc === null ? {} : { ticket_goc_id: goc.id }),
      },
    });

    const dong: string[] = [
      kq.trang_thai === kq.trang_thai_cu
        ? `Ticket ${ticket.ma} giữ nguyên ${nhan('trang_thai_ticket', kq.trang_thai)} ` +
          `(${kq.trang_thai}).`
        : `Ticket ${ticket.ma}: ${nhan('trang_thai_ticket', kq.trang_thai_cu)} ` +
          `(${kq.trang_thai_cu}) → ${nhan('trang_thai_ticket', kq.trang_thai)} (${kq.trang_thai}).`,
    ];
    /*
     * Trạng thái **thật sau lệnh** có thể khác chữ người gõ, và nói ra là bắt buộc:
     * luật mục 4 có thể giữ ticket lại (cổng bằng chứng, ticket con chưa kết). Im
     * lặng ở đây là để agent tin ticket đã sang chỗ nó xin.
     */
    if (kq.trang_thai !== dich) {
      dong.push(
        `Lưu ý: luật mục 4 không cho sang ${nhan('trang_thai_ticket', dich)} (${dich}) lúc này.`,
      );
    }
    if (goc !== null) dong.push(`Ticket gốc: ${goc.ma} — ${goc.tieu_de}`);

    return { json: kq, dong };
  },
};
