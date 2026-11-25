/**
 * Root vitest **thứ ba** của repo (sau `packages/api` và `packages/cli`).
 *
 * Chạy bằng một lệnh đơn: `npx vitest run --root packages/web`. Cổng `npm test`
 * của repo **cũng** chạy root này (xem `scripts` của `package.json` gốc) — nếu
 * không thì các ca ở đây không được canh ở cổng nào cả.
 *
 * Vì sao không nhồi vào root của `packages/api`: root đó chạy trên Miniflare
 * (`@cloudflare/vitest-pool-workers`) — không có DOM, không có `document`, nên
 * không dựng được một component React nào. Hai hạ tầng khác hẳn nhau, nên hai
 * root. Đổi lại: test của web **không** gọi Worker thật, nó giả lập `fetch` theo
 * đúng hình phản hồi của các đường `/v1/*` (ranh giới Worker có ca riêng ở root
 * `packages/api`).
 */

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],

  /**
   * **`SPEC.md` nằm NGOÀI `packages/web`, nên phải cho phép tường minh.**
   *
   * `test/doc-spec.ts` nhập `'../../../docs/vi/SPEC.md?raw'` — nguồn sự thật của bảng
   * nhãn sidebar. Vite chặn mọi file ngoài "workspace root" mà nó **tự dò**, và
   * phép dò đó phụ thuộc **cách gọi lệnh**: với `--root` là đường **tuyệt đối**
   * thì nó dò ra gốc repo và `?raw` đi qua; với đường **tương đối** thì không, và
   * hai file test chết ngay lúc nạp bằng `Error: Denied ID …/SPEC.md?raw` — **0
   * test chạy**, không phải một ca đỏ.
   *
   * Đó đúng là cái bẫy tệ nhất của một lưới test: 32 ca **im lặng biến mất** tuỳ
   * theo người ta gõ lệnh thế nào. Nên gốc repo được khai **ở đây**, trong file
   * cấu hình, nơi nó không phụ thuộc dòng lệnh nào.
   *
   * `'../..'` là gốc repo (hai cấp trên `packages/web`); `'.'` là chính package
   * này — phải khai lại vì `allow` là **ghi đè**, không cộng thêm.
   */
  server: { fs: { allow: ['.', '../..'] } },

  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./test/don-dep.ts'],
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
  },
});
