#!/usr/bin/env node
/**
 * Thực thi `baton` — **chỗ duy nhất** biết tới tiến trình thật.
 *
 * Mọi logic nằm ở `chayCli`, và dây nối với `process` nằm ở `noiDay`
 * (`noi-day.ts`) — tách ra để một ca test ghim được nó bằng một `process` giả.
 * Nhờ vậy phần **không** có test ở file này là đúng mấy dòng cuối.
 *
 * `process` được **khai tại chỗ** (`TienTrinhNode`) thay vì thêm `@types/node`:
 * phần 5 không thêm phụ thuộc mới, và CLI chỉ dùng những trường trong khai đó.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { noiDay, type TienTrinhNode } from './noi-day.js';
import type { ChayGit } from './git-cuc-bo.js';

declare const process: TienTrinhNode;

/**
 * Chạy `git <đối số>` **chỉ đọc**, trả mã thoát + đầu ra — SPEC mục 7 d.206, xem
 * `git-cuc-bo.ts` cho đủ lý lẽ.
 *
 * Ba điều của hàm này là cố ý:
 *   * **`execFile`, không `exec`** — tham số đi thành mảng, không qua shell, nên
 *     một hash do người gõ truyền vào không bao giờ thành một dòng lệnh.
 *   * **Hạn 5 giây** — `git` trên một repo lạ có thể treo; một lệnh `baton
 *     evidence` không được treo theo.
 *   * **Không ném** — lỗi (không có `git`, không phải repo) về thành một mã thoát
 *     khác 0, và `daMergeCucBo` đọc nó là "không khai gì".
 */
const chayGit: ChayGit = async (doi_so) =>
  await new Promise((xong) => {
    execFile(
      'git',
      doi_so,
      { encoding: 'utf8', timeout: 5_000, windowsHide: true },
      (loi, ra) => {
        if (loi === null) {
          xong({ ma: 0, ra });
          return;
        }
        xong({ ma: typeof loi.code === 'number' ? loi.code : 1, ra });
      },
    );
  });

/*
 * `baton export <file>` (BAT-8): cờ `wx` — file đã có thì **lỗi**, không ghi đè. Ghi
 * đè một file của chủ là xoá dữ liệu của chủ (danh sách cấm `CLAUDE.md` mục 4).
 */
await noiDay(
  process,
  async (duong) => await readFile(duong, 'utf8'),
  chayGit,
  async (duong, noi_dung) => {
    await writeFile(duong, noi_dung, { encoding: 'utf8', flag: 'wx' });
  },
);
