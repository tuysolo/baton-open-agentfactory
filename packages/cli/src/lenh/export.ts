/**
 * `baton export <file>` — SPEC mục 15 d.429 ("xuất toàn bộ dữ liệu ra JSON …
 * (**chỉ chủ**)"), BAT-8.
 *
 * Gọi `GET /v1/xuat`, ghi **nguyên thân** ra một file **mới**, in đường dẫn và số
 * dòng mỗi bảng. Cổng "chỉ chủ" nằm ở **máy chủ**: chạy bằng token agent thì API trả
 * `FORBIDDEN` và lệnh thoát mã 1 — **không** có file nào được tạo (gọi API **trước**,
 * ghi file **sau**).
 *
 * Chạy với `BATON_TOKEN` = **`TOKEN_CHU`** (CoS chạy qua `op run` để token chủ không
 * nằm trong shell history). Không phải lệnh của agent.
 *
 * **`--json` KHÔNG in cả bản xuất** — chỉ in tóm tắt (file, phiên bản định dạng, số
 * dòng mỗi bảng). Cả bản đã nằm trong file; in nó ra stdout là nhân đôi một khối dữ
 * liệu điều phối vào log của người gọi.
 *
 * File đã có thì **không ghi đè** (`wx` ở `bin.ts`) — ra `INVALID_INPUT`.
 */

import { batonFetch } from '@baton/client';
import type { BanXuatRa } from '../kieu-api.js';
import type { LenhCli } from '../lenh.js';

export const GHI_CHU_EXPORT =
  'Chỉ chạy được với TOKEN_CHU làm BATON_TOKEN (token agent → FORBIDDEN). ' +
  'File đã có thì không ghi đè. File chứa dữ liệu điều phối — không commit, không gửi đi.';

export const LENH_EXPORT: LenhCli = {
  khai: { ten: 'export', vi_tri: ['file'], co: {}, ghi_chu: GHI_CHU_EXPORT },
  // Không thành công cụ MCP — lệnh của chủ, không của agent (review BAT-8).
  chi_cli: true,

  chay: async ({ cauHinh, ghiFile }, ts) => {
    const duong = ts.vi_tri[0] ?? '';
    const ban = await batonFetch<BanXuatRa>(cauHinh, { method: 'GET', path: '/v1/xuat' });
    await ghiFile(duong, `${JSON.stringify(ban, null, 2)}\n`);

    const so_dong: Record<string, number> = {};
    for (const [bang, dong] of Object.entries(ban.bang)) so_dong[bang] = dong.length;
    const tong = Object.values(so_dong).reduce((a, b) => a + b, 0);

    return {
      json: {
        file: duong,
        schema_version: ban.schema_version,
        xuat_luc: ban.xuat_luc,
        workspace_id: ban.workspace_id,
        migration_cuoi: ban.migration_cuoi,
        so_dong,
        tong_so_dong: tong,
      },
      dong: [
        `Đã ghi: ${duong}`,
        `Định dạng ${String(ban.schema_version)} · migration ${ban.migration_cuoi} · xuất lúc ${ban.xuat_luc}`,
        `Tổng: ${String(tong)} dòng, ${String(Object.keys(so_dong).length)} bảng`,
        ...Object.entries(so_dong).map(([bang, so]) => `  ${bang}: ${String(so)}`),
      ],
    };
  },
};
