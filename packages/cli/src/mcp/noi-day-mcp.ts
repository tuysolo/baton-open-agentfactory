/**
 * **Dây nối giữa `vongLapMcp` và một tiến trình Node** — đối xứng với `noiDay`
 * của CLI, và tách khỏi `bin-mcp.ts` vì cùng lý do: điểm vào chạy ngay khi nhập,
 * nên phần đáng ghim phải nằm ở một file nhập được.
 *
 * Ba việc của dây nối, cả ba đều có ca test: đặt mã hoá `utf8` cho `stdin`, cắt
 * khúc thành dòng (`catDong`), và ghi **một dòng JSON kèm `\n`** ra `stdout`.
 *
 * `docFile` được truyền vào từ `bin-mcp.ts`, y như `bin.ts` làm cho CLI. Về
 * **quyền**: máy chủ MCP stdio chạy trên **máy của chính agent**, do chính agent
 * khởi động, với đúng quyền của tiến trình đó — cùng ranh giới tin cậy với lệnh
 * `baton` gõ trong terminal. Nó không mở cổng mạng và không phục vụ ai khác, nên
 * `plan`/`submit`/`--brief`/`--context` đọc file ở đây không rộng hơn CLI một
 * chút nào. Môi trường nào không đưa `docFile` vào thì bốn vế đó ra
 * `INVALID_INPUT` có thông điệp rõ (`docFileChu` ở `moi-truong.ts`), không im
 * lặng hỏng.
 */

import { vongLapMcp } from './vao-ra.js';
import { catDong } from './cat-dong.js';

/**
 * Phần của `process` mà máy chủ MCP dùng — khai **hẹp**, đúng những trường cần,
 * cùng lý do với `TienTrinhNode` ở `noi-day.ts` (không thêm `@types/node`).
 */
export interface TienTrinhMcp {
  env: Record<string, string | undefined>;
  stdin: AsyncIterable<string> & { setEncoding: (ma_hoa: 'utf8') => unknown };
  stdout: { write: (chu: string) => unknown };
  stderr: { write: (chu: string) => unknown };
}

export async function noiDayMcp(
  tien_trinh: TienTrinhMcp,
  docFile?: (duong: string) => Promise<string>,
): Promise<void> {
  tien_trinh.stdin.setEncoding('utf8');
  await vongLapMcp(
    {
      env: tien_trinh.env,
      viet: (dong) => void tien_trinh.stdout.write(`${dong}\n`),
      vietLoi: (dong) => void tien_trinh.stderr.write(`${dong}\n`),
      ...(docFile === undefined ? {} : { docFile }),
    },
    catDong(tien_trinh.stdin),
  );
}
