/**
 * Root vitest **thứ hai** của dự án: cổng kiểm **bản build chạy thật**.
 *
 * ## Vì sao phải có root riêng
 *
 * Mọi test hành vi của CLI nằm ở `packages/api` (xem khối chú thích trong
 * `packages/api/tsconfig.json`): nơi duy nhất có Worker thật là Miniflare của
 * root đó. Root này **không** lặp lại việc ấy và không được lặp lại — nó không
 * nhập một dòng mã nào của `src/`.
 *
 * Nó kiểm đúng một thứ mà root Miniflare **không thể** kiểm: `dist/` có chạy
 * được bằng **`node` thật** hay không. Miniflare/esbuild bundle TypeScript, nên
 * nó xanh ngay cả khi `node` chết. Lỗi thật đã xảy ra: `exports` của
 * `@baton/shared` và `@baton/client` trỏ vào `./src/index.ts`, `npm test` xanh
 * 2326 ca, mà `node packages/cli/dist/bin.js --help` chết với
 * `ERR_MODULE_NOT_FOUND: Cannot find module '.../shared/src/ma-nhan.js'` — các
 * import trong `src/` có đuôi `.js`, đúng cho bản build, sai cho `src/`. Tức
 * `baton` và `baton-mcp`, hai trong "ba đường" của d.351, **không chạy được**,
 * và không một cổng nghiệm thu nào thấy.
 *
 * Nên cổng này chạy tiến trình con thật: `environment: 'node'`, không
 * `vitest-pool-workers`. Chạy bằng `npm run kiem-ban-build` (build trước, rồi
 * root này). **Không** gộp vào `npm test`: `npm test` phải chạy được mà không
 * cần `dist/`.
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // Spawn tiến trình con + chờ stdio: 5 giây mặc định là mỏng trên máy đang
    // tải. Vẫn giữ hữu hạn — một cổng nghiệm thu treo vô hạn thì vô dụng.
    testTimeout: 30_000,
  },
});
