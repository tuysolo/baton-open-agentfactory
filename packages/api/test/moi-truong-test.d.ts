import type { Env } from '../src/index.js';

declare module 'cloudflare:test' {
  interface ProvidedEnv extends Env {
    /** Migration D1 nhúng vào binding bởi `vitest.config.ts`. */
    TEST_MIGRATIONS: D1Migration[];
    /** Văn bản thô từng file `migrations/*.sql`, cũng do `vitest.config.ts` nhúng. */
    TEST_VAN_BAN_MIGRATION: { ten: string; noi_dung: string }[];
    /** Văn bản thô từng file `migrations/rollback/*.sql` (BAT-16) — **không** được áp. */
    TEST_VAN_BAN_ROLLBACK: { ten: string; noi_dung: string }[];
    /**
     * DB **thứ hai, chỉ có trong test**: `migration-d1-chu-thich.test.ts` áp 18
     * migration ở dạng đã qua bộ tiền xử lý của D1 remote lên đây rồi so lược đồ
     * với `DB`. Không đường chạy sản phẩm nào dùng nó.
     */
    DB_TIEN_XU_LY: D1Database;
    /**
     * Số dự án của **bộ đo hiệu năng** (BAT-72, SPEC 17.10 / 19.12 câu 1). Chỉ
     * `hieu-nang/vitest-500.config.ts` đặt (`'500'`); vắng thì bộ đo dùng 200.
     * Không đường chạy sản phẩm nào đọc.
     */
    SO_DU_AN_DO?: string;
  }
}
