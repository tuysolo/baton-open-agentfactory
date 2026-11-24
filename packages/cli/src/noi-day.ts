/**
 * **Dây nối** giữa `chayCli` và một tiến trình Node — tách khỏi `bin.ts` để ghim
 * được bằng một ca test.
 *
 * `bin.ts` là một module **chạy ngay khi nhập** (nó có `await` ở tầng ngoài
 * cùng), nên không ca test nào nhập được nó mà không chạy cả CLI. Phần đáng ghim
 * lại chính là ba việc của dây nối: `argv.slice(2)`, hai luồng ra **có `\n`**, và
 * **`exitCode`** (không `exit()`). Nên nó nằm ở đây, nhận một đối tượng hình
 * `process`, và ca test truyền một bản giả.
 *
 * Sau khi tách, phần không có test của `bin.ts` là **một** dòng gọi hàm này — và
 * `node dist/bin.js` thì môi trường của dự án chặn, nên đây là cách duy nhất
 * hiện có để kiểm chứng dây nối.
 */

import { chayCli } from './chay.js';
import type { ChayGit } from './git-cuc-bo.js';

/**
 * Phần của `process` mà CLI dùng — khai **hẹp**, đúng những trường cần.
 *
 * Khai tại chỗ thay vì thêm `@types/node`: phần 5 không thêm phụ thuộc mới. Khai
 * hẹp cũng là một hàng rào — không có đường nào đọc cả bảng `env` để in ra.
 */
export interface TienTrinhNode {
  argv: string[];
  env: Record<string, string | undefined>;
  stdout: { write: (chu: string) => unknown };
  stderr: { write: (chu: string) => unknown };
  /** Đặt mã thoát; tiến trình tự thoát khi hết việc. */
  exitCode: number;
}

/**
 * Chạy CLI trên một tiến trình và **đặt** mã thoát.
 *
 * Dùng `exitCode` chứ **không** `process.exit()`: khi `stdout` là một ống
 * (`baton list --json | jq`), `write` của Node là **bất đồng bộ**, nên
 * `exit()` ngay sau `write` có thể cắt mất đoạn cuối đầu ra. Đặt `exitCode` rồi
 * để tiến trình tự thoát thì Node xả hết hai luồng trước.
 */
export async function noiDay(
  tien_trinh: TienTrinhNode,
  /**
   * Đọc một file văn bản — `bin.ts` truyền `readFile` của Node. Tham số chứ
   * không `import 'node:fs'` ở đây: file này phải chạy được trong test, nơi
   * không có đĩa và không nên có.
   */
  docFile?: (duong: string) => Promise<string>,
  /**
   * Chạy một lệnh `git` **chỉ đọc** — `bin.ts` truyền một bản dựng trên
   * `execFile`. Cùng lý do với `docFile`: file này phải chạy được trong test, nơi
   * không có tiến trình con và không nên có.
   */
  chayGit?: ChayGit,
  /**
   * Ghi một file **mới** — `bin.ts` truyền `writeFile` của Node với cờ `wx` (không
   * ghi đè). Chỉ `baton export` dùng (SPEC mục 15 d.429, BAT-8).
   */
  ghiFile?: (duong: string, noi_dung: string) => Promise<void>,
): Promise<void> {
  tien_trinh.exitCode = await chayCli(tien_trinh.argv.slice(2), {
    env: tien_trinh.env,
    viet: (dong) => void tien_trinh.stdout.write(`${dong}\n`),
    vietLoi: (dong) => void tien_trinh.stderr.write(`${dong}\n`),
    ...(docFile === undefined ? {} : { docFile }),
    ...(chayGit === undefined ? {} : { chayGit }),
    ...(ghiFile === undefined ? {} : { ghiFile }),
  });
}
