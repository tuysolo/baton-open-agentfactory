/**
 * Test chạy trên Miniflare qua `@cloudflare/vitest-pool-workers`:
 * **không cần wrangler CLI, không cần mạng** (decisions.md 01/10, Q4).
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { defineWorkersConfig, readD1Migrations } from '@cloudflare/vitest-pool-workers/config';
import { defaultExclude } from 'vitest/config';

/*
 * **Đo độ trễ vòng sự kiện của TIẾN TRÌNH NODE chính** (BAT-55, công cụ đo).
 *
 * Mọi runtime workerd của bộ test nói chuyện với một tiến trình Node duy nhất (pool
 * `@cloudflare/vitest-pool-workers` + Vitest): push/pop storage cô lập trước/sau
 * MỖI ca (`handleStorageRequest`, `dist/pool/index.mjs`), nạp module, RPC của
 * runner. Tiến trình đó đứng thì mọi runtime đứng cùng lúc. Nhịp 200 ms; trễ quá
 * 500 ms thì ghi một dòng `[node-tre]` có mốc ISO, đối chiếu được với các dòng
 * `[ca-cham]` của `test/do-ca-cham.ts`. `unref` để không giữ tiến trình sống. Chỉ
 * ghi log, không đổi gì của bộ test.
 */
const KHOA_DO_TRE = Symbol.for('baton.bat55.do-tre-node');
const toanCuc = globalThis as { [KHOA_DO_TRE]?: true };
if (toanCuc[KHOA_DO_TRE] === undefined) {
  toanCuc[KHOA_DO_TRE] = true;
  const NHIP_MS = 200;
  let moc = performance.now();
  setInterval(() => {
    const bay_gio = performance.now();
    const tre = bay_gio - moc - NHIP_MS;
    moc = bay_gio;
    if (tre > 500) {
      console.warn(`[node-tre] ${new Date().toISOString()} vòng sự kiện Node trễ ${String(Math.round(tre))} ms`);
    }
  }, NHIP_MS).unref();
}

export default defineWorkersConfig(async () => {
  const thuMuc = path.join(import.meta.dirname, 'migrations');
  const migrations = await readD1Migrations(thuMuc);

  /*
   * **Văn bản thô của mọi file migration**, nhúng vào binding giống
   * `TEST_MIGRATIONS`.
   *
   * Vì sao phải nhúng từ đây: test chạy trong Worker (Miniflare), ở đó
   * `node:fs` không có. Config này chạy trên Node thật nên đọc file được.
   * `readD1Migrations` ở trên đã **tách câu lệnh và bỏ chú thích**, nên nó
   * không dùng được cho `test/migration-d1-chu-thich.test.ts` — bài test đó
   * cần đúng từng ký tự của file, kể cả chú thích.
   *
   * Đọc theo thư mục (không liệt kê tay) để file migration thêm sau cũng
   * tự động bị quét.
   */
  const tenFileSql = (await fs.readdir(thuMuc)).filter((t) => t.endsWith('.sql')).sort();
  const vanBanMigration: { ten: string; noi_dung: string }[] = await Promise.all(
    tenFileSql.map(async (ten) => ({
      ten,
      noi_dung: await fs.readFile(path.join(thuMuc, ten), 'utf8'),
    })),
  );

  /*
   * **File rollback** (BAT-16, `migrations/rollback/`). Nằm ở thư mục con nên
   * `readD1Migrations` ở trên (và `wrangler d1 migrations apply`) **không** đọc
   * chúng; nhúng văn bản thô ở đây chỉ để test ghim đúng điều đó và quét chú thích.
   */
  const thuMucRollback = path.join(thuMuc, 'rollback');
  const vanBanRollback: { ten: string; noi_dung: string }[] = await Promise.all(
    (await fs.readdir(thuMucRollback))
      .filter((t) => t.endsWith('.sql'))
      .sort()
      .map(async (ten) => ({
        ten,
        noi_dung: await fs.readFile(path.join(thuMucRollback, ten), 'utf8'),
      })),
  );

  const goc = path.join(import.meta.dirname, '..');

  /*
   * **Chia file test thành nhóm ≤ `SO_FILE_MOI_NHOM` file, mỗi nhóm MỘT runtime
   * chạy tuần tự** (BAT-51 lượt 2) — xem `singleWorker` ở `poolOptions` dưới.
   *
   * Vì sao: với `isolatedStorage: true` mà không `singleWorker`, pool
   * `@cloudflare/vitest-pool-workers` dựng **một workerd cho MỖI file** và chạy
   * **cả 75 cùng lúc** — nó nhận cả danh sách file một lần từ Vitest và không đọc
   * `maxWorkers`/`fileParallelism` (hai cờ đó chỉ áp cho pool `threads`/`forks` của
   * chính Vitest), nên `--maxWorkers=4` không có tác dụng gì. 75 tiến trình giành
   * CPU làm mỗi câu D1/DO chậm đi hàng chục lần: ca "TRẦN 100 dòng" của
   * `cron-bang-chung.test.ts` chạy riêng 190 ms mà trong cả bộ 2,5–5+ s, chạm trần
   * 5 s của ca.
   *
   * Cờ duy nhất của pool giới hạn song song là `singleWorker` (mọi file của MỘT
   * project chạy tuần tự trong một runtime). Nên chia thành nhiều **project**
   * (workspace của Vitest, `extends: true` = cùng mọi cấu hình ở đây), mỗi project
   * một runtime: 25 runtime cùng lúc thay vì 75.
   *
   * Vì sao nhóm phải NHỎ (đã đo, xem `decisions.md`): một runtime `singleWorker`
   * chậm dần theo số file đã chạy trong nó — bật cho cả bộ (một nhóm 75 file) thì
   * mất ~13 phút, file sau càng chậm, rồi workerd nổ `Maximum call stack size
   * exceeded` trong lớp bọc Durable Object của pool và 45 file đỏ. Nhóm ≤ 5 file:
   * 4/5 lượt xanh, lượt thứ 5 có 4 ca thường chỉ vài trăm ms cùng hết 5 s một lúc ở
   * 4 runtime khác nhau. Nhóm ≤ 3 file: 5/5 lượt liên tiếp xanh. Nên trần là SỐ FILE
   * MỖI NHÓM, không phải số nhóm: thêm file thì thêm nhóm, không làm nhóm dài ra.
   *
   * **"Runtime đứng cùng lúc" (BAT-55, đã đo, gốc cuối CHƯA xác định).** Vẫn xảy ra
   * với nhóm ≤ 3 file: ≥ 15 runtime cùng đứng ~3,5–4 s rồi cùng chạy lại trong vòng
   * < 1 s — cả phần D1 trong thân/`beforeEach` (chạy trong workerd) lẫn push/pop
   * storage (qua Node). Bắt được 2/7 lượt hợp lệ, một lượt KHÔNG có tải ngoài, trong
   * lúc vòng sự kiện Node vẫn thông (`[node-tre]` không ghi gì) — nên không phải một
   * bộ đếm 5 s nào, không phải Node chính bị chặn. Ca > 5 s mà xanh là vì `duration`
   * của Vitest gồm cả push/pop/hook (trần 5 s chỉ áp lên thân), hoặc ca có trần riêng.
   * Số đo và đề xuất: `decisions.md` dòng BAT-55; công cụ đo: `test/do-ca-cham.ts`
   * (`[ca-cham]`) và `[node-tre]` ở đầu file này.
   *
   * Danh sách file đọc từ thư mục (không liệt kê tay) và chia vòng tròn theo tên đã
   * sắp: file thêm sau tự vào một nhóm, và cách chia xác định. `exclude` (bộ đo
   * nặng) vẫn áp lên từng nhóm vì nhóm kế thừa nó.
   */
  const SO_FILE_MOI_NHOM = 3;
  const tepTest = (await fs.readdir(path.join(import.meta.dirname, 'test'), { recursive: true }))
    .map((t) => t.split(path.sep).join('/'))
    .filter((t) => t.endsWith('.test.ts'))
    .sort();
  const SO_NHOM = Math.ceil(tepTest.length / SO_FILE_MOI_NHOM);
  const nhomTest = Array.from({ length: SO_NHOM }, (_, i) =>
    tepTest.filter((_t, j) => j % SO_NHOM === i).map((t) => `test/${t}`),
  ).filter((ds) => ds.length > 0);

  return {
    /*
     * **Vì sao phải có alias.** `package.json` của `@baton/shared`,
     * `@baton/client`, `@baton/cli` khai `exports` trỏ vào `dist/` — bắt buộc,
     * vì `baton` và `baton-mcp` chạy bằng **`node` thật**, và `node` không đọc
     * được `.ts`. (Bản trước trỏ `exports` vào `src/index.ts`; test vẫn xanh vì
     * esbuild của vitest bundle được TS, nhưng `node dist/bin.js --help` chết
     * với `ERR_MODULE_NOT_FOUND` — các import trong `src/` có đuôi `.js`, đúng
     * cho bản build, sai cho `src/`.)
     *
     * Đổi xong thì test ở root này sẽ ăn `dist/` — tức kết quả test phụ thuộc
     * `npm run build` đã chạy chưa và chạy lúc nào. Alias dưới đây ghim test về
     * **mã nguồn**, nên `npm test` độc lập với thứ tự build; bản `dist/` được
     * kiểm riêng bằng root vitest của `packages/cli` (`npm run kiem-ban-build`).
     *
     * **Vì sao regex neo `$` chứ không phải chuỗi.** Alias dạng chuỗi của Vite
     * khớp theo **tiền tố**: `'@baton/shared'` cũng khớp `'@baton/shared/quyen'`
     * và viết lại thành `.../shared/src/index.tsquyen` — một đường dẫn vô nghĩa,
     * lỗi khó lần ra. Các package này chỉ có một cửa duy nhất (`exports` khai
     * đúng `.`), nên neo `^...$` là đúng ý: khớp đúng tên package, còn một lần
     * nhập sâu sai thì đỏ ngay ở chỗ nó sai.
     */
    resolve: {
      alias: [
        { find: /^@baton\/shared$/, replacement: path.join(goc, 'shared', 'src', 'index.ts') },
        { find: /^@baton\/client$/, replacement: path.join(goc, 'client', 'src', 'index.ts') },
        { find: /^@baton\/cli$/, replacement: path.join(goc, 'cli', 'src', 'index.ts') },
      ],
    },
    /*
     * **`SPEC.md` và `AGENT-GUIDE.md` nằm NGOÀI `packages/api`** —
     * `test/bang-lenh.test.ts` (BAT-45) nhập chúng bằng `?raw`. Vite chặn file
     * ngoài "workspace root" nó tự dò, và với `--root packages/api` (đường tương
     * đối, đúng như script `test:api`) phép dò không ra gốc repo: file test chết
     * lúc nạp với `Denied ID …/SPEC.md?raw`. Cùng bẫy và cùng cách chữa như
     * `packages/web/vitest.config.ts`: khai gốc repo ở đây, không phụ thuộc dòng
     * lệnh. `'.'` là chính package này — phải khai lại vì `allow` là ghi đè.
     */
    server: { fs: { allow: ['.', '../..'] } },
    test: {
      /*
       * `do-ca-cham.ts` (BAT-55): chỉ ghi log ca chậm (> 3 s) kèm mốc, project và
       * thời lượng từng chặng — công cụ đo cho các lượt "runtime đứng ~5 s" (xem
       * `SO_FILE_MOI_NHOM` dưới). Không làm đỏ ca, không đổi trần.
       */
      setupFiles: ['./test/ap-migration.ts', './test/do-ca-cham.ts'],
      /*
       * **Lớp thứ hai của lá chắn cho bộ đo nặng** (`test/hieu-nang/`, mốc 200.000
       * ticket của 19.12 câu 1).
       *
       * Lớp thứ nhất là quy ước đặt tên: `include` mặc định của Vitest chỉ nhận
       * file có `.test.` trong tên, và hai file ở đó (`do-200k.ts`,
       * `sinh-du-lieu.ts`) không có. Nợ đã khai trong `decisions.md`: "lá chắn
       * này chỉ có **một** lớp … đặt nhầm tên file là bộ đo lọt vào `npm test`",
       * và một lần lọt là `npm test` chạy hàng phút thay vì ~35 giây — tức một
       * cổng nghiệm thu người ta bắt đầu bỏ qua.
       *
       * Khai `exclude` là **ghi đè**, không cộng thêm, nên mặc định của Vitest phải
       * được mang theo — bỏ chúng đi là mời Vitest đi quét `node_modules`.
       *
       * Mặc định đó lấy bằng **`defaultExclude` nhập từ `vitest/config`**, không
       * chép tay. Bản trước chép tay và **mất hai** phần tử (glob của `cypress` và
       * glob của các file `*.config.*`) trong khi chú thích khai là "giữ cả bốn" rồi liệt kê
       * **năm** tên — tức một lời khai sai. Hậu quả hành vi lúc đó là **không có**
       * (`include` mặc định không khớp `vitest.config.ts`, và repo không có
       * `cypress`), nhưng một mảng chép tay **mất đồng bộ khi Vitest lên phiên
       * bản** — thêm một mặc định mới thì file này lặng lẽ không có nó. Nhập thẳng
       * thì không có chỗ nào để lệch.
       */
      exclude: [...defaultExclude, 'test/hieu-nang/**'],
      // Mỗi nhóm một project, một runtime — xem `SO_NHOM` ở trên (BAT-51).
      workspace: nhomTest.map((ds, i) => ({
        extends: true as const,
        test: { name: `api-${String(i + 1)}`, include: ds },
      })),
      poolOptions: {
        workers: {
          /*
           * Đường TUYỆT ĐỐI: các project nhóm (`workspace` ở trên) không có file
           * config riêng, nên pool giải đường tương đối theo thư mục chạy lệnh (gốc
           * repo) thay vì `packages/api` — `./src/index.ts` thành một file không có.
           */
          main: path.join(import.meta.dirname, 'src', 'index.ts'),
          isolatedStorage: true,
          // Các file của MỘT nhóm chạy tuần tự trong một runtime (BAT-51, `SO_NHOM`).
          singleWorker: true,
          miniflare: {
            compatibilityDate: '2025-01-15',
            compatibilityFlags: ['nodejs_compat'],
            /*
             * `DB_TIEN_XU_LY` là **DB thứ hai, chỉ dùng cho test**: nơi
             * `test/migration-d1-chu-thich.test.ts` áp 18 migration ở dạng **đã
             * qua bộ tiền xử lý của D1 remote** (xoá `-- …` tới hết dòng) rồi so
             * lược đồ với `DB` (bản gốc). Hai DB rời nhau là điều kiện của phép
             * so đó: `DB` đã được `test/ap-migration.ts` áp bản gốc từ `beforeAll`.
             */
            d1Databases: ['DB', 'DB_TIEN_XU_LY'],
            /*
             * **R2 giả lập** cho sao lưu tự động (SPEC mục 15 d.429, BAT-8) — Miniflare
             * dựng bucket trong bộ nhớ, cô lập theo ca như D1 (`isolatedStorage`).
             * Không gọi mạng, không chạm bucket thật.
             */
            r2Buckets: ['SAO_LUU'],
            durableObjects: {
              WORKSPACE_GATE: 'WorkspaceGate',
              GIOI_HAN_TOKEN: 'GioiHanToken',
            },
            bindings: {
              // Migration được nhúng vào binding để test tự áp, không gọi wrangler.
              TEST_MIGRATIONS: migrations,
              // Văn bản thô của migration, cho bài test chú thích khối.
              TEST_VAN_BAN_MIGRATION: vanBanMigration,
              // Văn bản thô của file rollback — chỉ để test, không bao giờ áp.
              TEST_VAN_BAN_ROLLBACK: vanBanRollback,
              // Token chủ **giả** cho test. Không phải secret thật, không nằm
              // trong `.env`, không đi đâu khỏi Miniflare (danh sách cấm
              // CLAUDE.md mục 2, 5).
              TOKEN_CHU: 'bt_test_token_chu_gia',
              // Mở đường `/v1/_loi/:ma` chỉ trong test; deploy thật để trống.
              CHO_DUONG_TEST: 'co',
              /*
               * **Số vòng PBKDF2 hạ xuống cho test** — SPEC mục 15 d.415.
               *
               * Hằng của **sản phẩm** là 100.000 (`SO_VONG_PBKDF2` — **trần của
               * Cloudflare Workers** cho PBKDF2 `iterations`) và nó **không** bị
               * hạ: một hằng sản phẩm hạ cho test nhanh là một hệ thống thật yếu
               * đi mà diff không cho ai thấy. Hạ ở đây vì bộ test đăng nhập băm
               * hàng chục lần, và 100.000 vòng mỗi lần vẫn cộng vào `npm test`
               * nhiều giây.
               *
               * `1000` là **trần dưới của CHECK** trong migration 0017, nên con
               * số này cũng là ca biên của chính CHECK đó.
               */
              PBKDF2_SO_VONG: '1000',
              /*
               * **URL công khai giả** — SPEC mục 12 d.347 ("mỗi tin có link thẳng
               * tới đúng thẻ hoặc ticket"). Không secret (một URL công khai không
               * phải secret), và `baton.test` không phải tên miền thật nên không
               * có cách nào một lần gọi đi tới đâu.
               *
               * `TELEGRAM_BOT_TOKEN` và `TELEGRAM_CHAT_ID` **cố ý KHÔNG đặt**: đó
               * là hình dạng "chưa cấu hình", nên mặc định của bộ test là **không
               * gửi gì** — danh sách cấm CLAUDE.md mục 3. Ca nào cần đường gửi thì
               * tiêm một kênh **giả lập** (`datNguonTelegram` của `test/giup.ts`).
               */
              BATON_URL_CONG_KHAI: 'https://baton.test',
            },
          },
        },
      },
    },
  };
});
