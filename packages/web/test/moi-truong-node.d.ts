/**
 * **Khai tối thiểu `node:fs` / `node:path` — CHỈ cho test của web.**
 *
 * `@types/node` **không** được cài trong repo (cố ý: mã web chạy trong trình
 * duyệt và không được chạm hệ tệp; `packages/web/tsconfig.json` khai
 * `types: ["vite/client"]`). Nhưng một ca test **phải** đọc được `src/kieu.css`
 * dạng chữ, và đường `?raw` của Vite **không dùng được cho `.css`**: dưới vitest
 * `test.css` mặc định là `false` nên mọi import CSS — kể cả `?raw`, kể cả qua
 * `import.meta.glob` — trả về **chuỗi rỗng** (đã đo cả hai cách). Một lưới tương
 * phản đọc chuỗi rỗng là một lưới **xanh vì không có dữ liệu**.
 *
 * Nên file này khai **đúng hai hàm** mà `test/vo-linear.test.tsx` cần, và khai ở
 * `test/`:
 *
 *   * không thêm một dependency nào (brief BAT-6 chặn);
 *   * không nới `types` của cả package sang `node` — làm thế là cho **`src/`**
 *     gọi `node:fs` mà vẫn qua `tsc`, đúng cái `test/doc-spec.ts` đã chọn tránh;
 *   * đủ kiểu để ESLint không phải báo `no-unsafe-call` trên một giá trị `error`.
 *
 * Mã trong `src/` vẫn **không** import được hai module này: Vite sẽ trượt lúc
 * bundle (không có polyfill `node:` cho trình duyệt).
 */

declare module 'node:fs' {
  export function readFileSync(duong: string, ma_hoa: 'utf8'): string;
}

declare module 'node:path' {
  export function dirname(duong: string): string;
  export function join(...doan: string[]): string;
}
