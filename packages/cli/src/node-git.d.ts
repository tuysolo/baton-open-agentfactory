/**
 * Khai **tối thiểu** của `node:child_process` — đúng một hàm, đúng chữ ký CLI
 * dùng, và đúng dạng **không qua shell**.
 *
 * Cùng lý do với `node-fs.d.ts`: phần 5 không thêm `@types/node`, và CLI chỉ cần
 * một việc nữa của Node — chạy `git` **chỉ đọc** trong repo của chủ để kiểm
 * "commit đã vào nhánh mặc định cục bộ chưa" (SPEC mục 7 d.206, xem
 * `git-cuc-bo.ts`).
 *
 * Khai hẹp cũng là một hàng rào, và ở đây là hàng rào quan trọng nhất của file:
 * chỉ `execFile` (nhận **mảng tham số**), **không** `exec` (nhận một dòng shell).
 * `exec` sẽ đưa một hash do người gõ truyền vào một dòng shell — tức một chỗ
 * tiêm lệnh. Với `execFile` thì tham số không bao giờ được shell đọc.
 *
 * Chỗ **duy nhất** nhập module này là `bin.ts`.
 */

declare module 'node:child_process' {
  export function execFile(
    file: string,
    doi_so: readonly string[],
    tuy_chon: { encoding: 'utf8'; timeout: number; windowsHide: true },
    xong: (
      loi: (Error & { code?: number | string }) | null,
      ra: string,
      loi_ra: string,
    ) => void,
  ): void;
}
