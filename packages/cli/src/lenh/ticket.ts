/**
 * `baton ticket set <MÃ> [--khoi-lon <stt>|off] [--doi 0-100]` — SPEC 20.1.
 *
 * Cùng cách gắn với `baton project set` (xem `project.ts`): `ticket` là một lệnh
 * của `SO_LENH`, tham số vị trí đầu là thao tác `set`.
 *
 *   * `--khoi-lon <stt>` — số thứ tự khối việc lớn 1–99; `off` ⇒ bỏ khối lớn (máy
 *     chủ cũng xoá `doi` của ticket đó, câu hỏi SPEC (c)).
 *   * `--doi 0-100` — vị trí trên đồi. CLI **chỉ nhận số** (SPEC viết `0-100`);
 *     xoá `doi` về trống là việc của API (`doi: null`).
 *
 * Khoảng kiểm tại CLI bằng đúng hàm của máy chủ (`kiemKhoiLon`, `kiemDoi`), nên sai
 * khoảng ⇒ `INVALID_INPUT` kèm khoảng, 0 request. Luật "`doi` chỉ cho ticket có
 * `khoi_lon`" và quyền (chủ, `coordinator`, `manager` của dự án) ở máy chủ.
 */

import { batonFetch } from '@baton/client';
import { kiemDoi, kiemKhoiLon } from '@baton/shared';
import type { SuaTicketRa } from '../kieu-api.js';
import type { LenhCli } from '../lenh.js';
import { loiThamSo, type KhaiLenh } from '../phan-tich.js';
import { ticketTheoMaHoacId } from '../tra-ma.js';
import { soNguyenHoacChu } from '../gia-tri-ban-do.js';

const KHAI: KhaiLenh = {
  ten: 'ticket',
  vi_tri: ['thao tác', 'MÃ'],
  co: { 'khoi-lon': 'gia_tri', doi: 'gia_tri' },
  ghi_chu:
    'Thao tác: set. --khoi-lon 1–99 hoặc off; --doi 0–100 (chỉ cho ticket có khối lớn). ' +
    'Cần ít nhất một cờ (SPEC 20.1).',
};

export const LENH_TICKET: LenhCli = {
  khai: KHAI,

  chay: async ({ cauHinh }, ts) => {
    const thao_tac = ts.vi_tri[0] ?? '';
    if (thao_tac !== 'set') loiThamSo(KHAI, `Lệnh "ticket" chỉ có thao tác "set" (nhận được "${thao_tac}").`);

    const g = ts.gia_tri;
    const than: Record<string, unknown> = {};
    const khoi = g['khoi-lon'];
    if (khoi !== undefined) than['khoi_lon'] = khoi === 'off' ? null : kiemKhoiLon(soNguyenHoacChu(khoi));
    if (g['doi'] !== undefined) {
      // `kiemDoi` nhận `null` (đường API); CLI không có cách gõ null, nên chữ
      // không phải số luôn rơi vào nhánh báo khoảng.
      than['doi'] = kiemDoi(soNguyenHoacChu(g['doi']));
    }
    if (Object.keys(than).length === 0) {
      loiThamSo(KHAI, 'Cần ít nhất một cờ: --khoi-lon, --doi.');
    }

    const ticket = await ticketTheoMaHoacId(cauHinh, ts.vi_tri[1] ?? '');
    const kq = await batonFetch<SuaTicketRa>(cauHinh, {
      method: 'PATCH',
      path: `/v1/ticket/${encodeURIComponent(ticket.id)}`,
      body: than,
    });

    const dong: string[] = [
      kq.da_doi.length === 0
        ? `Ticket ${ticket.ma}: không có gì đổi.`
        : `Ticket ${ticket.ma}: đã đổi ${kq.da_doi.join(', ')}.`,
    ];
    if (than['khoi_lon'] === null && than['doi'] === undefined && kq.da_doi.includes('doi')) {
      dong.push('Lưu ý: bỏ khối lớn thì vị trí trên đồi cũng được xoá.');
    }
    return { json: kq, dong };
  },
};
