/**
 * Kiểu cho `import X from '<file>.md?raw'` — `bang-lenh.test.ts` đọc `SPEC.md` và
 * `HUONG-DAN-AGENT.md` bằng `?raw` của Vite (cùng tiền lệ `packages/web/test/
 * doc-spec.ts`). Root này không nhập `vite/client` (nó là Worker, không phải mã
 * trình duyệt), nên khai đúng một hình dạng cần dùng, không hơn.
 */
declare module '*.md?raw' {
  const van: string;
  export default van;
}
