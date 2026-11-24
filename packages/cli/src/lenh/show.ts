/**
 * `baton show <MÃ>` — SPEC mục 13 d.372: "In ticket, lượt giao, bằng chứng,
 * 10 bình luận cuối".
 *
 * Bốn vế, ba đường API:
 *   * ticket + **bình luận cuối**: `GET /v1/ticket/ma/:ma` khi người gõ một mã,
 *     `GET /v1/ticket/:id` khi gõ một id (trường `binh_luan_cuoi`, cắt ở
 *     **server** theo `SO_BINH_LUAN_CUOI`).
 *   * lượt giao: `GET /v1/ticket/:id/luot-giao` (cả chuỗi, theo `so_luot`).
 *   * **bằng chứng: KHÔNG CÓ đường đọc.** API chỉ có `POST
 *     /v1/ticket/:id/bang-chung` (gửi) và `POST /v1/bang-chung/:id/rut`; không
 *     route nào **liệt kê** bằng chứng của một ticket. Phần 5 là CLI, không phải
 *     chỗ thêm route — đã báo M-Baton. CLI khai thẳng `bang_chung: null` + một
 *     dòng "chưa có", cùng lý do đã viết ở `whoami.ts`.
 */

import { batonFetch } from '@baton/client';
import { tenNguoi, type LuotGiaoRa } from '../kieu-api.js';
import type { LenhCli } from '../lenh.js';
import { ticketTheoMaHoacId } from '../tra-ma.js';

/** Dòng cho vế "bằng chứng" của d.372 khi API chưa có đường đọc. */
export const DONG_BANG_CHUNG_CHUA_CO =
  'Bằng chứng: (chưa có — API chưa có đường đọc bằng chứng của một ticket)';

/** Mốc thời gian ra chữ. SPEC không định dạng; dùng ISO 8601 (đọc được, không mơ hồ). */
export function gio(ms: number): string {
  return new Date(ms).toISOString();
}

export const LENH_SHOW: LenhCli = {
  khai: { ten: 'show', vi_tri: ['MÃ'], co: {} },

  chay: async ({ cauHinh }, ts) => {
    const ticket = await ticketTheoMaHoacId(cauHinh, ts.vi_tri[0] ?? '');
    // Đường này trả `{ ticket_id, items }`, không trả mảng trần.
    const chuoi = await batonFetch<{ ticket_id: string; items: LuotGiaoRa[] }>(cauHinh, {
      method: 'GET',
      path: `/v1/ticket/${ticket.id}/luot-giao`,
    });
    const luot_giao = chuoi.items;

    const dong: string[] = [
      `${ticket.ma} — ${ticket.tieu_de}`,
      `Trạng thái: ${ticket.nhan_trang_thai} (${ticket.trang_thai})`,
      `Ưu tiên: ${ticket.nhan_uu_tien} (${ticket.uu_tien})`,
      `Người đang cầm: ${tenNguoi(ticket.nguoi_dang_cam)}`,
    ];
    if (ticket.nhan.length > 0) dong.push(`Nhãn: ${ticket.nhan.join(', ')}`);
    if (ticket.mo_ta !== null && ticket.mo_ta !== '') dong.push('', ticket.mo_ta);

    if (ticket.lien_ket.length > 0) {
      dong.push('', 'Liên kết:');
      for (const l of ticket.lien_ket) {
        dong.push(`  ${l.nhan_loai}${l.nguoc ? ' (ngược)' : ''}: ${l.ma} — ${l.tieu_de}`);
      }
    }

    dong.push('', `Lượt giao (${String(luot_giao.length)}):`);
    if (luot_giao.length === 0) dong.push('  (chưa có lượt giao nào)');
    for (const l of luot_giao) {
      dong.push(
        `  #${String(l.so_luot)} ${l.nhan_loai} (${l.loai}) · ${l.nhan_trang_thai} (${l.trang_thai})` +
          `${l.dang_mo ? ' · đang mở' : ''} · ${tenNguoi(l.nguoi_giao)} → ${tenNguoi(l.nguoi_nhan)}` +
          `${l.ly_do === null ? '' : ` · lý do: ${l.ly_do}`}`,
      );
    }

    dong.push('', DONG_BANG_CHUNG_CHUA_CO);

    /*
     * Nhan đề **không** viết cứng số 10. Số bình luận cuối là hằng của **server**
     * (`SO_BINH_LUAN_CUOI`) và không có trong thân phản hồi, nên chép nó vào chữ
     * của CLI là một nguồn sự thật thứ hai: server đổi thành 5 thì CLI in "10
     * bình luận cuối (5)". Số trong ngoặc là **số đếm thật**, một nguồn.
     */
    dong.push('', `Bình luận cuối (${String(ticket.binh_luan_cuoi.length)}):`);
    if (ticket.binh_luan_cuoi.length === 0) dong.push('  (chưa có bình luận nào)');
    for (const b of ticket.binh_luan_cuoi) {
      dong.push(
        `  [${gio(b.tao_luc)}] ${tenNguoi(b.tac_gia)}${b.da_sua ? ' (đã sửa)' : ''}: ${b.noi_dung}`,
      );
    }

    return { json: { ticket, luot_giao, bang_chung: null }, dong };
  },
};
