/**
 * `baton project set <MÃ> [--nhom] [--uu-tien 1-5] [--dang-day on|off]
 * [--duy-tri on|off] [--ten-ngan "…"]` — SPEC 20.1; và
 * `--trang-thai dang-day|hang-cho|tam-dung|duy-tri` — SPEC 20.8.
 *
 * **Cách gắn vào CLI phẳng.** Mọi lệnh khác là `baton <lệnh> …`; SPEC 20.1 viết
 * `project set` và `ticket set`. Nên `project` là **một** lệnh của `SO_LENH` với
 * tham số vị trí đầu là **thao tác** (`set` — thao tác duy nhất hôm nay); gõ thao
 * tác khác ⇒ `INVALID_INPUT` kèm cách dùng. MCP tự sinh công cụ `project` với
 * tham số `thao_tac` (xem `mcp/cong-cu.ts`) — cùng tên, cùng bộ quyền (d.355).
 *
 * Quyền, khoảng giá trị, luật `duy_tri`/`dang_day` và lịch sử đều ở **máy chủ**
 * (`handlerSuaDuAn`); CLI chỉ đổi chữ sang JSON (`gia-tri-ban-do.ts`) và in. Gõ
 * mà **không cờ nào** ⇒ lỗi dùng sai, 0 request.
 *
 * `--nhom` giữ đúng quyền cũ của "sửa dự án": **chỉ chủ** (agent ⇒ `FORBIDDEN`).
 * `--uu-tien`, `--ten-ngan`: chủ và `coordinator`. `--trang-thai`, `--dang-day`,
 * `--duy-tri`: chủ, `coordinator` và `manager` của dự án (20.8).
 */

import { batonFetch } from '@baton/client';
import { kiemUuTienDuAn } from '@baton/shared';
import type { SuaDuAnRa } from '../kieu-api.js';
import type { LenhCli } from '../lenh.js';
import { loiThamSo, type KhaiLenh } from '../phan-tich.js';
import { duAnTheoMa } from '../tra-ma.js';
import { onOff, soNguyenHoacChu, trangThaiBanDo } from '../gia-tri-ban-do.js';

const KHAI: KhaiLenh = {
  ten: 'project',
  vi_tri: ['thao tác', 'MÃ'],
  co: {
    nhom: 'gia_tri',
    'uu-tien': 'gia_tri',
    'dang-day': 'gia_tri',
    'duy-tri': 'gia_tri',
    'ten-ngan': 'gia_tri',
    'trang-thai': 'gia_tri',
  },
  ghi_chu:
    'Thao tác: set. --uu-tien 1–5 (5 = quan trọng nhất); --dang-day/--duy-tri on|off; ' +
    '--trang-thai dang-day|hang-cho|tam-dung|duy-tri (ô Trạng thái, SPEC 20.8; không gửi cùng --dang-day/--duy-tri); ' +
    '--ten-ngan 0–24 ký tự ("" = dùng tên đầy đủ); --nhom chỉ chủ. Cần ít nhất một cờ (SPEC 20.1, 20.8).',
};

export const LENH_PROJECT: LenhCli = {
  khai: KHAI,

  chay: async ({ cauHinh }, ts) => {
    const thao_tac = ts.vi_tri[0] ?? '';
    if (thao_tac !== 'set') loiThamSo(KHAI, `Lệnh "project" chỉ có thao tác "set" (nhận được "${thao_tac}").`);

    const g = ts.gia_tri;
    const than: Record<string, unknown> = {};
    if (g['nhom'] !== undefined) than['nhom'] = g['nhom'];
    // Kiểm khoảng **tại CLI** bằng đúng hàm của máy chủ: số sai thì 0 request.
    if (g['uu-tien'] !== undefined) than['uu_tien'] = kiemUuTienDuAn(soNguyenHoacChu(g['uu-tien']));
    if (g['dang-day'] !== undefined) than['dang_day'] = onOff(g['dang-day'], 'dang-day');
    if (g['duy-tri'] !== undefined) than['duy_tri'] = onOff(g['duy-tri'], 'duy-tri');
    if (g['ten-ngan'] !== undefined) than['ten_ngan'] = g['ten-ngan'];
    // 20.8: gạch ngang (chữ của SPEC) → gạch dưới (giá trị API); sai ⇒ 0 request.
    if (g['trang-thai'] !== undefined) than['trang_thai_ban_do'] = trangThaiBanDo(g['trang-thai']);
    if (Object.keys(than).length === 0) {
      loiThamSo(
        KHAI,
        'Cần ít nhất một cờ: --nhom, --uu-tien, --dang-day, --duy-tri, --trang-thai, --ten-ngan.',
      );
    }

    const du_an = await duAnTheoMa(cauHinh, ts.vi_tri[1] ?? '');
    const kq = await batonFetch<SuaDuAnRa>(cauHinh, {
      method: 'PATCH',
      path: `/v1/du-an/${encodeURIComponent(du_an.id)}`,
      body: than,
    });

    const dong: string[] = [
      kq.da_doi.length === 0
        ? `Dự án ${du_an.ma}: không có gì đổi.`
        : `Dự án ${du_an.ma}: đã đổi ${kq.da_doi.join(', ')}.`,
    ];
    // Bật `duy_tri` tự tắt `dang_day` (20.1) — nói ra, người gõ không xin điều đó.
    if (than['duy_tri'] === true && than['dang_day'] === undefined && kq.da_doi.includes('dang_day')) {
      dong.push('Lưu ý: dự án duy trì không "đẩy" — đã tự tắt dang_day (SPEC 20.1).');
    }
    if (kq.wip !== undefined) {
      dong.push(`Đang đẩy ${String(kq.wip.dang_day)}/${String(kq.wip.gioi_han)}.`);
      // 20.1: vượt WIP **vẫn cho**, không chặn — chỉ cảnh báo (mã thoát vẫn 0).
      if (kq.wip.vuot) {
        dong.push(
          `Cảnh báo: vượt giới hạn WIP (${String(kq.wip.dang_day)} > ${String(kq.wip.gioi_han)}) — ` +
            'nên thả bớt một dự án đang đẩy.',
        );
      }
    }
    return { json: kq, dong };
  },
};
