/**
 * Cấu hình **riêng** cho bộ đo hiệu năng (SPEC 19.12 câu 1: 200 dự án +
 * 200.000 ticket, danh sách và Tổng quan mở dưới 1 giây).
 *
 * Vì sao tách khỏi `../vitest.config.ts`:
 *
 *  1. **`npm test` không được chậm đi.** Bộ đo sinh 200.000 dòng, mất hàng chục
 *     giây. File đo đặt ở `test/hieu-nang/do-200k.ts` — **không** có `.test.`
 *     trong tên, nên glob mặc định của vitest (`**\/*.{test,spec}.?(c|m)[jt]s`)
 *     không nhặt nó. Hai lớp chắn: tên file, và `include` của config này.
 *
 *  2. **`isolatedStorage: false`.** Config chính bật cô lập để mỗi test có DB
 *     sạch; ở đây ngược lại — dữ liệu phải **sống qua** cả file, vì sinh lại
 *     200.000 ticket cho từng phép đo thì vô nghĩa.
 *
 * Chạy bằng `npm run do-hieu-nang`. **Không gọi `wrangler`** (CLI đó bị chặn,
 * và Miniflare qua `vitest-pool-workers` đã đủ — `quyet-dinh.md` 01/10, Q4).
 */

import path from 'node:path';
import { defineWorkersConfig, readD1Migrations } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig(async () => {
  // Config nằm trong `hieu-nang/`, migration nằm cạnh ở `../migrations`.
  const thuMuc = path.join(import.meta.dirname, '..', 'migrations');
  const migrations = await readD1Migrations(thuMuc);

  // Cùng lý do với `../vitest.config.ts`: `exports` của các package trỏ vào
  // `dist/` để `node` thật chạy được, nên test phải tự ghim về `src/`. Và cùng
  // lý do ở đó: regex neo `^...$`, vì alias dạng chuỗi khớp theo tiền tố nên
  // `'@baton/shared/quyen'` sẽ bị viết lại thành `.../src/index.tsquyen`.
  const goc = path.join(import.meta.dirname, '..', '..');

  return {
    resolve: {
      alias: [
        { find: /^@baton\/shared$/, replacement: path.join(goc, 'shared', 'src', 'index.ts') },
        { find: /^@baton\/client$/, replacement: path.join(goc, 'client', 'src', 'index.ts') },
        { find: /^@baton\/cli$/, replacement: path.join(goc, 'cli', 'src', 'index.ts') },
      ],
    },
    test: {
      include: ['test/hieu-nang/do-200k.ts'],
      setupFiles: ['./test/ap-migration.ts'],
      // Sinh 200.000 ticket rồi đo hơn 20 lượt cho mỗi truy vấn: mặc định
      // 5 giây của vitest không đủ. Không nới thì bộ đo đỏ vì hết giờ chứ
      // không phải vì chậm.
      testTimeout: 15 * 60 * 1000,
      hookTimeout: 15 * 60 * 1000,
      poolOptions: {
        workers: {
          main: './src/index.ts',
          isolatedStorage: false,
          singleWorker: true,
          miniflare: {
            compatibilityDate: '2025-01-15',
            compatibilityFlags: ['nodejs_compat'],
            d1Databases: ['DB'],
            durableObjects: {
              WORKSPACE_GATE: 'WorkspaceGate',
              GIOI_HAN_TOKEN: 'GioiHanToken',
            },
            bindings: {
              TEST_MIGRATIONS: migrations,
              // Token chủ **giả**, y như config chính: không phải secret thật,
              // không rời khỏi Miniflare (CLAUDE.md danh sách cấm mục 2, 5).
              TOKEN_CHU: 'bt_test_token_chu_gia',
              CHO_DUONG_TEST: 'co',
            },
          },
        },
      },
    },
  };
});
