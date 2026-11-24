/**
 * **Phiên đang mở của chính mình** — thứ ba lệnh `heartbeat` (d.362), `log`
 * (d.363) và `plan` (d.364) cần, mà bảng lệnh SPEC mục 13 không cho tham số nào
 * để chỉ (`cau-hoi-spec.md` **#83**).
 *
 * Ba lệnh đó trong bảng mục 13 không nhận mã lượt giao hay mã phiên:
 * `baton heartbeat [ghi chú]`, `baton log <type> "<nội dung>"`,
 * `baton plan <file.json>`. Nhưng cả ba đường API đều cần một id
 * (`/v1/luot-giao/:id/heartbeat`, `/v1/phien/:id/hoat-dong`,
 * `/v1/phien/:id/ke-hoach`).
 *
 * **Cách tìm phiên: luôn tra `GET /v1/tasks`**, đường đọc duy nhất trả `phien` —
 * "phiên còn mở của **chính mình**" (`doc-viec.ts`). Rồi chọn:
 *
 *   1. **Có chỉ định lượt** (BAT-56) — cờ `--luot <lượt>` (MCP: tham số `luot`),
 *      không có cờ thì biến môi trường `BATON_LUOT` (đọc ở `moi-truong.ts`); **cờ
 *      thắng biến**. Chọn phiên đang mở có `luot_giao_id` khớp, trong danh sách
 *      của chính mình. Không khớp → `NOT_FOUND`, **một thông điệp** cho mọi ca
 *      (lượt không tồn tại, lượt của agent khác, lượt của mình mà phiên đã đóng) —
 *      đúng nếp 404-không-lộ của SPEC mục 13. Id người gõ **không bao giờ** đi
 *      thẳng vào đường API: id gửi lên là id **lấy từ danh sách của mình**. (Máy
 *      chủ vẫn tự chặn chéo agent — `FORBIDDEN` ở `lenh-phien.ts`,
 *      `lenh-hoat-dong.ts` — đây là lớp thứ hai, không phải lớp duy nhất.)
 *   2. **Không chỉ định** — hành vi cũ:
 *        * **không có phiên nào** → `NOT_FOUND`, chỉ đường gọi `baton claim`;
 *        * **đúng một** → phiên đó;
 *        * **nhiều hơn một** → `INVALID_INPUT` kể các phiên và chỉ cách dùng
 *          `--luot`/`BATON_LUOT`. Không chọn hộ: gửi nhịp tim hay một mục
 *          `result` **nhầm phiên** là ghi sai vào dòng hoạt động của một việc
 *          khác, và mục đã gửi **không sửa được** (d.190).
 *
 * Sinh ra từ một lỗi thật: một Manager chạy song song 2–3 lượt (mỗi lượt một
 * phiên) thì cả ba lệnh đều bị chặn ở nhánh "nhiều hơn một", không có lối ra.
 *
 * **Giá phải trả, khai thẳng:** ba lệnh này tốn **2 request** thay vì 1 (d.387
 * cho 600 request/phút cho mỗi token). `tasks` là lệnh **đọc** nên nó không
 * nhích tín hiệu của phiên (19.12 câu 53) — tức bước tra này không tự nó giữ
 * phiên sống, đúng ý SPEC.
 */

import { batonFetch, type CauHinhClient } from '@baton/client';
import { BatonError } from '@baton/shared';
import type { PhienCuaToiRa, ViecCuaToiRa } from './kieu-api.js';
import type { ThamSoDaPhanTich } from './phan-tich.js';

/** Tên cờ chọn lượt của `heartbeat`, `log`, `plan` (MCP: tham số cùng tên). */
export const CO_LUOT = 'luot';

/**
 * Lượt người gọi chỉ định: cờ `--luot` nếu có, không thì `BATON_LUOT`, không thì
 * `undefined`. **Cờ thắng biến.**
 *
 * Cờ gõ mà rỗng (`--luot=`) là `INVALID_INPUT`: người gõ cờ là muốn chỉ định,
 * rơi về biến hay về "không chỉ định" là đoán hộ họ.
 */
export function luotChiDinh(
  ts: ThamSoDaPhanTich,
  luot_mac_dinh: string | undefined,
): string | undefined {
  const co = ts.gia_tri[CO_LUOT];
  if (co !== undefined) {
    const gon = co.trim();
    if (gon === '') {
      throw new BatonError('INVALID_INPUT', {
        message: 'Cờ --luot cần một mã lượt giao (không được để trống).',
      });
    }
    return gon;
  }
  return luot_mac_dinh;
}

/** Thông điệp `NOT_FOUND` khi lượt chỉ định không khớp — **một** câu cho mọi ca. */
export function thongDiepKhongThayLuot(luot: string): string {
  return (
    `Không tìm thấy phiên đang mở nào của bạn cho lượt "${luot}". ` +
    'Xem các phiên đang mở bằng "baton tasks"; lượt chưa nhận thì "baton claim <lượt>" trước.'
  );
}

export async function phienDangMoCuaToi(
  cauHinh: CauHinhClient,
  luot?: string,
): Promise<PhienCuaToiRa> {
  const viec = await batonFetch<ViecCuaToiRa>(cauHinh, { method: 'GET', path: '/v1/tasks' });
  const mo = viec.phien.filter((p) => p.dang_mo);

  if (luot !== undefined) {
    const khop = mo.find((p) => p.luot_giao_id === luot);
    if (khop === undefined) {
      throw new BatonError('NOT_FOUND', { message: thongDiepKhongThayLuot(luot) });
    }
    return khop;
  }

  if (mo.length === 0) {
    throw new BatonError('NOT_FOUND', {
      message:
        'Bạn không có phiên nào đang mở. Nhận một lượt giao bằng "baton claim <lượt>" trước ' +
        '(SPEC mục 6: phiên mở khi agent nhận một lượt giao).',
    });
  }
  if (mo.length > 1) {
    throw new BatonError('INVALID_INPUT', {
      message:
        `Bạn đang có ${String(mo.length)} phiên mở, không biết lệnh này thuộc phiên nào: ` +
        mo.map((p) => `${p.id} (lượt ${p.luot_giao_id})`).join(', ') +
        '. Chỉ rõ lượt bằng "--luot <lượt>" (công cụ MCP: tham số "luot"), ' +
        'hoặc đặt biến môi trường BATON_LUOT=<lượt>.',
    });
  }

  // `mo.length === 1` đã kiểm ở trên; nhánh dưới chỉ để thoả kiểu (noUncheckedIndexedAccess).
  const duy_nhat = mo[0];
  if (duy_nhat === undefined) {
    throw new BatonError('NOT_FOUND', { message: 'Bạn không có phiên nào đang mở.' });
  }
  return duy_nhat;
}
