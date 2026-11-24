/**
 * Khai **tối thiểu** của `node:fs/promises` — chỉ hai hàm, chỉ chữ ký CLI dùng.
 *
 * Cùng lý do với `TienTrinhNode` ở `noi-day.ts`: phần 5 **không thêm phụ thuộc
 * mới** (`@types/node`), và CLI chỉ cần đúng hai việc của Node ngoài `process`:
 *   * đọc file cho `baton plan <file.json>` và `baton submit <lượt> <file.md>`
 *     (SPEC mục 13 d.364, d.366);
 *   * ghi **một file mới** cho `baton export <file>` (SPEC mục 15 d.429, BAT-8).
 *
 * Khai hẹp cũng là một hàng rào: không có `rm`, `unlink` hay `rename` nào trong tầm
 * với của CLI (danh sách cấm: không xoá file), và `writeFile` chỉ khai với cờ
 * **`wx`** — tức chỉ tạo file mới, **không bao giờ ghi đè** một file đã có. Khai một
 * kiểu cờ hẹp làm một lần gọi `writeFile` không cờ (mặc định `w`, ghi đè) thành lỗi
 * biên dịch.
 *
 * Chỗ **duy nhất** nhập module này là `bin.ts`.
 */

declare module 'node:fs/promises' {
  export function readFile(duong: string, ma_hoa: 'utf8'): Promise<string>;
  export function writeFile(
    duong: string,
    du_lieu: string,
    tuy_chon: { encoding: 'utf8'; flag: 'wx' },
  ): Promise<void>;
}
