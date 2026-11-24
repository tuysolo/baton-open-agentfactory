/**
 * `baton plan <file.json>` — SPEC mục 13 d.364: "Cập nhật kế hoạch phiên".
 *
 * Mục 6 d.191: "Kế hoạch của phiên: danh sách bước, mỗi bước có trạng thái chờ,
 * đang làm, xong hoặc huỷ. Agent gửi lại **toàn bộ danh sách** mỗi lần cập
 * nhật." Nên file là **cả danh sách**, và lệnh **thay** kế hoạch, không vá.
 *
 * **Hình của file.** SPEC chỉ nói `<file.json>`, không nói hình. CLI nhận đúng
 * hai hình mà `kiemKeHoach` của `@baton/shared` (nguồn sự thật, dùng chung với
 * API) đã nhận: một **mảng chuỗi** `["bước 1", "bước 2"]`, hoặc một **mảng
 * object** `[{ "noi_dung": "...", "trang_thai": "pending" }]`. Thêm một lối vào
 * cho `{ "buoc": [...] }` vì đó là đúng tên trường API, nên một người đọc thân
 * request rồi lưu thành file không bị chặn. Kiểm **nội dung** vẫn do server làm
 * — không dựng một bộ luật thứ hai ở CLI.
 *
 * JSON hỏng hoặc file không có → `INVALID_INPUT` (**mã thoát 1**), thông điệp
 * nêu **đường dẫn** đúng như người gõ.
 *
 * Phiên nào: xem `phien-hien-tai.ts` (#83). Một phiên mở thì tự suy ra; nhiều
 * phiên mở thì chỉ rõ bằng `--luot <lượt>` hoặc `BATON_LUOT` (BAT-56).
 */

import { batonFetch } from '@baton/client';
import { BatonError, nhan } from '@baton/shared';
import type { KeHoachRa } from '../kieu-api.js';
import type { LenhCli } from '../lenh.js';
import { CO_LUOT, luotChiDinh, phienDangMoCuaToi } from '../phien-hien-tai.js';

/** Thân file kế hoạch → danh sách bước gửi lên API. */
export function docKeHoach(chu: string, duong: string): unknown {
  let than: unknown;
  try {
    than = JSON.parse(chu);
  } catch (e: unknown) {
    throw new BatonError('INVALID_INPUT', {
      message: `File "${duong}" không phải JSON hợp lệ: ${e instanceof Error ? e.message : String(e)}`,
    });
  }

  if (Array.isArray(than)) return than;
  if (than !== null && typeof than === 'object' && 'buoc' in than) {
    return than.buoc;
  }
  throw new BatonError('INVALID_INPUT', {
    message:
      `File "${duong}" phải là một danh sách bước (mảng JSON), hoặc một object có trường ` +
      '"buoc" là danh sách đó (SPEC mục 6 d.191: agent gửi lại toàn bộ danh sách).',
  });
}

export const LENH_PLAN: LenhCli = {
  khai: { ten: 'plan', vi_tri: ['file.json'], co: { [CO_LUOT]: 'gia_tri' } },

  chay: async ({ cauHinh, docFile, luotMacDinh }, ts) => {
    const duong = ts.vi_tri[0] ?? '';
    const buoc = docKeHoach(await docFile(duong), duong);

    const phien = await phienDangMoCuaToi(cauHinh, luotChiDinh(ts, luotMacDinh));

    const kq = await batonFetch<KeHoachRa>(cauHinh, {
      method: 'PUT',
      path: `/v1/phien/${encodeURIComponent(phien.id)}/ke-hoach`,
      body: { buoc },
    });

    const dong: string[] = [
      `Đã cập nhật kế hoạch phiên ${kq.phien_id} (phiên bản ${String(kq.phien_ban)}, ` +
        `${String(kq.so_buoc)} bước):`,
    ];
    if (kq.buoc.length === 0) dong.push('  (kế hoạch trống)');
    for (const [i, b] of kq.buoc.entries()) {
      dong.push(
        `  ${String(i + 1)}. [${nhan('trang_thai_buoc', b.trang_thai)} (${b.trang_thai})] ${b.noi_dung}`,
      );
    }

    return { json: kq, dong };
  },
};
