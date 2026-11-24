/**
 * Đổi **mã người gõ** thành thứ API nhận.
 *
 * SPEC mục 13 cho người gõ mã hiển thị: `baton show <MÃ>` (d.372, mã ticket
 * `MÃ-số` của mục 1/mục 4), `baton profile <DỰ ÁN>` (d.378) và
 * `baton list [--project X]` (d.373).
 *
 * **Ticket thì có đường thật.** `GET /v1/ticket/ma/:ma` nhận đúng `MÃ-số` và trả
 * ticket đầy đủ, nên `baton show <MÃ>` tốn **một** request — không cuộn danh
 * sách. Bản đầu cuộn `GET /v1/ticket`, và cuộn hỏng hai lần: mất ticket đã xoá
 * mềm (danh sách có cứng `xoa_luc IS NULL`, còn đường đọc một ticket thì **cố
 * ý** cho đọc — mục 4, khôi phục 30 ngày), và ~2000 request cho một lệnh ở mốc
 * 200.000 ticket, tự đập vào trần 600 request/phút (d.387). Lý do đầy đủ ở khối
 * chú thích của `layTicketTheoMa` (`packages/api/src/doc-ticket.ts`).
 *
 * **Dự án thì vẫn cuộn** `GET /v1/du-an`: không có bộ lọc theo mã, nhưng mốc là
 * 200 dự án (hai trang), nên đây là một chỗ chậm chấp nhận được, không phải một
 * lệnh không chạy nổi. Đã báo M-Baton.
 */

import { BatonError, MAU_MA_DU_AN, tachMaTicket } from '@baton/shared';
import { batonFetch, type CauHinhClient } from '@baton/client';
import type { AgentDongRa, DuAnRa, TicketRa, TrangRa } from './kieu-api.js';

const LIMIT_CUON = 100;

/** Một dự án theo **mã**. Không có (hoặc ngoài phạm vi) → `NOT_FOUND`. */
export async function duAnTheoMa(cauHinh: CauHinhClient, ma: string): Promise<DuAnRa> {
  if (!MAU_MA_DU_AN.test(ma)) {
    throw new BatonError('INVALID_INPUT', {
      message: `"${ma}" không phải mã dự án (mã gồm 2–6 chữ A–Z).`,
    });
  }
  let cursor: string | undefined;
  do {
    const trang = await batonFetch<TrangRa<DuAnRa>>(cauHinh, {
      method: 'GET',
      path: '/v1/du-an',
      // Dự án lưu trữ mặc định bị ẩn (SPEC mục 2), nhưng `baton profile SAI` của
      // một dự án đã lưu trữ phải đọc được — hồ sơ là thứ để đọc lại.
      query: { gom_luu_tru: 'co', limit: LIMIT_CUON, cursor },
    });
    const thay = trang.items.find((d) => d.ma === ma);
    if (thay !== undefined) return thay;
    cursor = trang.cursor_sau ?? undefined;
  } while (cursor !== undefined);

  throw new BatonError('NOT_FOUND', { message: `Không tìm thấy dự án ${ma}.` });
}

/**
 * Một agent từ tham số người gõ — **tên hoặc ID** (BAT-47, Chủ chốt T-55 = A,
 * `cau-hoi-spec.md` #171).
 *
 * Cuộn **hết các trang** của `GET /v1/agent` — danh sách mà máy chủ đã lọc theo
 * phạm vi người gọi (`locPhamViAgent` ở `packages/api/src/doc-du-an.ts`). Không
 * thêm endpoint: thứ người gọi "thấy" là đúng thứ đường đó trả, nên tra trên nó
 * không thể lộ một agent ngoài quyền.
 *
 * Tập khớp = agent có `id === dau_vao` **hoặc** `ten === dau_vao` (so đúng, phân
 * biệt hoa thường — như `ux_agent_ten` UNIQUE (workspace_id, ten)):
 *   * đúng 1 ⇒ trả agent đó;
 *   * > 1 (vd đầu vào là ID của A đồng thời là tên của B) ⇒ `INVALID_INPUT` liệt
 *     kê các ID khớp — **không đoán**. `INVALID_INPUT` là mã sẵn có đúng nghĩa
 *     nhất: tham số người gõ không xác định được một người nhận; không có mã
 *     "mơ hồ" riêng trong `@baton/shared`, và thêm mã là đổi hợp đồng lỗi mục 13;
 *   * 0 ⇒ `null`: người gọi để nguyên đầu vào đi lên máy chủ như ID (hành vi cũ).
 */
export async function agentTheoTenHoacId(
  cauHinh: CauHinhClient,
  dau_vao: string,
): Promise<AgentDongRa | null> {
  const khop: AgentDongRa[] = [];
  let cursor: string | undefined;
  do {
    const trang = await batonFetch<TrangRa<AgentDongRa>>(cauHinh, {
      method: 'GET',
      path: '/v1/agent',
      query: { limit: LIMIT_CUON, cursor },
    });
    for (const a of trang.items) {
      if (a.id === dau_vao || a.ten === dau_vao) khop.push(a);
    }
    cursor = trang.cursor_sau ?? undefined;
  } while (cursor !== undefined);

  if (khop.length > 1) {
    throw new BatonError('INVALID_INPUT', {
      message:
        `"${dau_vao}" khớp ${String(khop.length)} agent (tên hoặc ID): ` +
        `${khop.map((a) => a.id).join(', ')} — không đoán người nhận, chưa tạo lượt giao.`,
    });
  }
  return khop[0] ?? null;
}

/**
 * Một ticket đầy đủ từ tham số người gõ — **mã hiển thị hoặc id**.
 *
 * Khớp `MÃ-số` (`tachMaTicket` của `@baton/shared` — một định nghĩa hai chiều,
 * dùng chung với `maTicket()` dựng mã ở server) thì đi đường `/v1/ticket/ma/:ma`;
 * **không** khớp thì coi là **id** và để API trả lời. Nhận cả hai là chủ ý:
 * `--json` của mọi lệnh trả `id`, nên một agent đọc JSON rồi gọi lệnh sau bằng
 * chính `id` đó không phải ghép lại mã.
 *
 * Trả **cả ticket**, không chỉ `id`: hai đường API đều trả cùng một hình, nên
 * lấy id rồi gọi lại là một request thừa.
 */
export async function ticketTheoMaHoacId(
  cauHinh: CauHinhClient,
  ma_hoac_id: string,
): Promise<TicketRa> {
  const duong =
    tachMaTicket(ma_hoac_id) === null
      ? `/v1/ticket/${encodeURIComponent(ma_hoac_id)}`
      : `/v1/ticket/ma/${encodeURIComponent(ma_hoac_id)}`;
  return await batonFetch<TicketRa>(cauHinh, { method: 'GET', path: duong });
}
