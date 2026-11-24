/**
 * Cấu hình bộ đo hiệu năng cho vế **"chịu thêm 300 dự án"** — BAT-72.
 *
 * SPEC dòng 478 (17.10) = dòng 599 (19.12 câu 1): "Thiết kế còn phải chịu được
 * tiếp **300 dự án** (và mọi tổ hợp nhỏ hơn 200.000 ticket) mà không đổi kiến
 * trúc." 300 dự án thêm **không kèm ticket thêm**, nên cấu hình đo là
 * **500 dự án + 200.000 ticket**.
 *
 * Tái dùng nguyên `./vitest.config.ts` (cùng file đo, cùng migration, cùng
 * `isolatedStorage: false`, cùng timeout) và **chỉ thêm** binding
 * `SO_DU_AN_DO: '500'`. Config cũ không có binding đó nên vẫn đo 200 dự án với
 * đúng bộ dữ liệu cũ.
 *
 * Chạy: `npx vitest run --root packages/api --config hieu-nang/vitest-500.config.ts`
 * (hoặc `npm run do-hieu-nang-500`).
 */

import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';
import cauHinhGoc from './vitest.config.js';

export default defineWorkersConfig(async (moi_truong) => {
  const goc = typeof cauHinhGoc === 'function' ? await cauHinhGoc(moi_truong) : await cauHinhGoc;
  const workers = goc.test?.poolOptions?.workers;
  if (workers === undefined || typeof workers === 'function') {
    throw new Error('vitest-500.config.ts: config gốc đổi dạng poolOptions.workers — sửa lại cách tái dùng.');
  }
  const miniflare = workers.miniflare ?? {};

  return {
    ...goc,
    test: {
      ...goc.test,
      poolOptions: {
        ...goc.test?.poolOptions,
        workers: {
          ...workers,
          miniflare: {
            ...miniflare,
            bindings: {
              ...miniflare.bindings,
              SO_DU_AN_DO: '500',
            },
          },
        },
      },
    },
  };
});
