/**
 * `baton create <DỰ ÁN> "<tiêu đề>" [--brief f.md] [--parent MÃ] [--priority high] [--status backlog]`
 * — SPEC mục 13 bảng lệnh: "Tạo ticket".
 *
 * Năm tham số, năm chỗ luật khác nhau:
 *   * `<DỰ ÁN>` là **mã dự án** (2–6 chữ A–Z, mục 1) → `duAnTheoMa` đổi sang id.
 *   * `<tiêu đề>` đi thẳng lên server: luật "1–200 ký tự sau khi cắt khoảng
 *     trắng" (mục 4) là của `kiemTieuDeTicket`, **một bản duy nhất** ở
 *     `@baton/shared`, và nó phải chạy ở cửa ghi dù client nào gọi. Không chép ở
 *     đây.
 *   * `--parent MÃ` là **mã ticket** `MÃ-số` → `ticketTheoMaHoacId`. Đổi ở CLI chứ
 *     không gửi mã thô: API nhận `ticket_cha_id` là **id**.
 *   * `--priority` nhận **mã tiếng Anh** của bảng 0.1 (d.381) và mã sai bị chặn
 *     **tại CLI**, thông điệp kể các mã kèm **nhãn tiếng Việt**. Dùng đúng bảng
 *     của `@baton/shared`, không chép bảng thứ hai.
 *   * `--status` (BAT-63, mục 4 "Trạng thái khi tạo", T-108 = B): `todo` hoặc
 *     `backlog`, gửi thành `trang_thai`. Không cờ ⇒ **không gửi** trường (máy chủ
 *     ra Cần làm). Giá trị khác chặn **tại CLI** bằng **chính** hàm kiểm của máy
 *     chủ (`kiemTrangThaiKhiTao`), nên thông điệp hai bên là một câu; mã thoát 1.
 *
 * `--brief f.md` → 8 trường của mục 4, đọc bằng `brief-md.ts` (và
 * `spec-questions.md` #89 cho chỗ SPEC im lặng về hình của file).
 */

import { batonFetch } from '@baton/client';
import {
  BatonError,
  TRANG_THAI_TICKET_KHI_TAO,
  danhSachMa,
  kiemTrangThaiKhiTao,
  laMaHopLe,
  nhan,
  type TrangThaiTicketKhiTao,
} from '@baton/shared';
import { docBriefMd } from '../brief-md.js';
import type { TaoTicketRa } from '../kieu-api.js';
import type { LenhCli } from '../lenh.js';
import { duAnTheoMa, ticketTheoMaHoacId } from '../tra-ma.js';

/** `--priority` → mã 0.1, hoặc `INVALID_INPUT` kể đủ 5 mức kèm nhãn (d.381). */
export function kiemUuTienCli(tho: string | undefined): string | undefined {
  if (tho === undefined) return undefined;
  if (!laMaHopLe('uu_tien', tho)) {
    throw new BatonError('INVALID_INPUT', {
      message:
        `"${tho}" không phải mã mức ưu tiên. Các mã: ` +
        danhSachMa('uu_tien')
          .map((m) => `${m} (${nhan('uu_tien', m)})`)
          .join(', '),
    });
  }
  return tho;
}

/**
 * `--status` → `todo`/`backlog`, hoặc `undefined` khi không gõ (không gửi trường).
 * Sai ⇒ `INVALID_INPUT` với đúng câu của máy chủ (`LOI_TRANG_THAI_KHI_TAO`).
 * `--status=` (rỗng) cũng là sai — không lặng lẽ rơi về mặc định.
 */
export function kiemTrangThaiTaoCli(tho: string | undefined): TrangThaiTicketKhiTao | undefined {
  return tho === undefined ? undefined : kiemTrangThaiKhiTao(tho);
}

export const LENH_CREATE: LenhCli = {
  khai: {
    ten: 'create',
    vi_tri: ['DỰ ÁN', 'tiêu đề'],
    co: { brief: 'gia_tri', parent: 'gia_tri', priority: 'gia_tri', status: 'gia_tri' },
    ghi_chu: `--status: ${TRANG_THAI_TICKET_KHI_TAO.map(
      (m, i) => `${m} (${nhan('trang_thai_ticket', m)}${i === 0 ? ', mặc định' : ''})`,
    ).join(' hoặc ')} — trạng thái khác không đặt được lúc tạo.`,
  },

  chay: async ({ cauHinh, docFile }, ts) => {
    const ma_du_an = ts.vi_tri[0] ?? '';
    const tieu_de = ts.vi_tri[1] ?? '';
    const uu_tien = kiemUuTienCli(ts.gia_tri['priority']);
    const trang_thai = kiemTrangThaiTaoCli(ts.gia_tri['status']);
    const duong_brief = ts.gia_tri['brief'];
    const ma_cha = ts.gia_tri['parent'];

    // Đọc file **trước** khi gọi mạng: một đường dẫn sai không đáng tốn request nào.
    const brief = duong_brief === undefined ? {} : docBriefMd(await docFile(duong_brief));

    const du_an = await duAnTheoMa(cauHinh, ma_du_an);
    const cha = ma_cha === undefined ? null : await ticketTheoMaHoacId(cauHinh, ma_cha);

    const kq = await batonFetch<TaoTicketRa>(cauHinh, {
      method: 'POST',
      path: '/v1/ticket',
      body: {
        project_id: du_an.id,
        tieu_de,
        ...(uu_tien === undefined ? {} : { uu_tien }),
        ...(trang_thai === undefined ? {} : { trang_thai }),
        ...(cha === null ? {} : { ticket_cha_id: cha.id }),
        ...brief,
      },
    });

    const dong: string[] = [
      `Đã tạo ticket ${kq.ma}: ${kq.tieu_de}`,
      `Trạng thái: ${nhan('trang_thai_ticket', kq.trang_thai)} (${kq.trang_thai})`,
      `Dự án: ${du_an.ma} — ${du_an.ten}`,
      `Ưu tiên: ${uu_tien === undefined ? 'mặc định của SPEC mục 4' : `${nhan('uu_tien', uu_tien)} (${uu_tien})`}`,
    ];
    if (cha !== null) dong.push(`Ticket cha: ${cha.ma} — ${cha.tieu_de}`);
    dong.push(
      `Brief: ${Object.keys(brief).length === 0 ? '(không gửi trường nào)' : `${String(Object.keys(brief).length)} trường từ "${String(duong_brief)}"`}`,
    );

    return { json: kq, dong };
  },
};
