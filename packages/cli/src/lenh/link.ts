/**
 * `baton link <MÃ-điều-phối> <MÃ-dự-án> [--type dieu_phoi|related|blocks]` — nối
 * hai ticket (SPEC mục 4 "Liên kết", 19.4 "Ticket điều phối"). Lệnh thêm ở BAT-43
 * (Chủ chốt T-50 = A, 22/10 — `cau-hoi-spec.md` #168; bảng lệnh mục 13 đã thêm
 * dòng), để chuỗi của mục 17 bước 1 chạy trọn qua CLI.
 *
 *   * Hai mã là **mã ticket** `MÃ-số` (hoặc id) → `ticketTheoMaHoacId`, vì
 *     `POST /v1/ticket/:id/lien-ket` nhận **id** (`tu_ticket_id` trên đường dẫn,
 *     `den_ticket_id` trong thân). Mã không có / ngoài phạm vi ⇒ `NOT_FOUND` của
 *     chính API đọc ticket (mục 13: 404 cũng dùng khi ngoài phạm vi).
 *   * Bên thứ nhất là bên "từ": với `dieu_phoi` là **ticket điều phối**, với
 *     `blocks` là bên **chặn** (đúng nghĩa `tu_ticket_id` của handler
 *     `noi_ticket`). `related` thì đối xứng.
 *   * `--type` mặc định `dieu_phoi`. Mã sai bị chặn **tại CLI** (0 request), thông
 *     điệp kể các mã kèm nhãn tiếng Việt (d.381) — nhãn lấy từ bảng
 *     `loai_lien_ket_ticket` của `@baton/shared`. `parent` **không** nối được ở đây
 *     (ticket cha đặt lúc tạo: `baton create --parent`, `cau-hoi-spec.md` #21).
 *   * Quyền là của server: chỉ chủ và `coordinator` nối `dieu_phoi` (19.12 câu 16),
 *     và phải có quyền trên **cả hai** dự án — CLI không đoán, chỉ chuyển mã lỗi.
 *
 * **Không** tự sinh tiêu đề `[Giao …]` cho ticket nào: tiêu đề vẫn do người tạo
 * ticket tự gõ (#168, phương án A).
 *
 * MCP: công cụ `link` **tự có** — `mcp/cong-cu.ts` sinh mọi công cụ từ `SO_LENH`
 * (trừ lệnh `chi_cli`), và đây là một lệnh ghi của agent như `assign`/`status`.
 */

import { batonFetch } from '@baton/client';
import { BatonError, nhan } from '@baton/shared';
import type { NoiTicketRa } from '../kieu-api.js';
import type { LenhCli } from '../lenh.js';
import { ticketTheoMaHoacId } from '../tra-ma.js';

/**
 * Loại liên kết `baton link` nối được — cùng tập với `LOAI_NOI_DUOC` của handler
 * `noi_ticket` (`packages/api/src/lenh-ticket.ts`); một ca test ở
 * `packages/api/test/cli-ticket.test.ts` so hai tập để chúng không trôi khỏi nhau.
 */
export const LOAI_LINK_CLI = ['dieu_phoi', 'related', 'blocks'] as const;
export type LoaiLinkCli = (typeof LOAI_LINK_CLI)[number];

export const LOAI_LINK_MAC_DINH: LoaiLinkCli = 'dieu_phoi';

/** `--type` → loại liên kết, hoặc `INVALID_INPUT` kể đủ các loại kèm nhãn. */
export function kiemLoaiLinkCli(tho: string | undefined): LoaiLinkCli {
  if (tho === undefined) return LOAI_LINK_MAC_DINH;
  if (!(LOAI_LINK_CLI as readonly string[]).includes(tho)) {
    throw new BatonError('INVALID_INPUT', {
      message:
        `--type "${tho}" không phải loại liên kết nối được. Các mã: ` +
        LOAI_LINK_CLI.map((m) => `${m} (${nhan('loai_lien_ket_ticket', m)})`).join(', '),
    });
  }
  return tho as LoaiLinkCli;
}

export const LENH_LINK: LenhCli = {
  khai: {
    ten: 'link',
    vi_tri: ['MÃ-điều-phối', 'MÃ-dự-án'],
    co: { type: 'gia_tri' },
    ghi_chu:
      `--type: ${LOAI_LINK_CLI.join('|')} (mặc định ${LOAI_LINK_MAC_DINH}). ` +
      'Mã thứ nhất là ticket điều phối (với blocks: ticket chặn).',
  },

  chay: async ({ cauHinh }, ts) => {
    // Kiểm `--type` **trước** mọi request: mã sai không đáng tốn request nào.
    const loai_lien_ket = kiemLoaiLinkCli(ts.gia_tri['type']);
    const tu = await ticketTheoMaHoacId(cauHinh, ts.vi_tri[0] ?? '');
    const den = await ticketTheoMaHoacId(cauHinh, ts.vi_tri[1] ?? '');

    const kq = await batonFetch<NoiTicketRa>(cauHinh, {
      method: 'POST',
      path: `/v1/ticket/${encodeURIComponent(tu.id)}/lien-ket`,
      body: { den_ticket_id: den.id, loai_lien_ket },
    });

    const dong: string[] = [
      `Đã nối ${tu.ma} → ${den.ma}: ${nhan('loai_lien_ket_ticket', kq.loai_lien_ket)} (${kq.loai_lien_ket}).`,
      `${tu.ma}: ${tu.tieu_de}`,
      `${den.ma}: ${den.tieu_de}`,
    ];

    return { json: kq, dong };
  },
};
